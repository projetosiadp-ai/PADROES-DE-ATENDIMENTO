# Data Model: Evolução da Biblioteca de Mensagens

## Conventions

- Identificadores são UUIDs.
- Datas são `timestamptz` em UTC e obrigatórias quando representam um evento ocorrido.
- Conteúdo ativo usa `arquivado_em IS NULL`; conteúdo arquivado usa data e ator preenchidos.
- Toda tabela no schema exposto tem RLS, grants explícitos e testes de allow/deny.
- `colaborador` e `superadmin` são os únicos valores de papel após a migração.

## Profile (`profiles`)

Representa a conta interna associada à identidade autenticada.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | PK; referência à identidade autenticada; cascade ao remover a identidade. |
| `nome` | text | Obrigatório; 1–120 caracteres após trim. |
| `email` | text | Obrigatório; normalizado para minúsculas; único. |
| `role` | text | `colaborador` ou `superadmin`; padrão `colaborador`. |
| `ativo` | boolean | Padrão `true`; conta inativa não recebe conteúdo. |
| `created_at` | timestamptz | Imutável; padrão `now()`. |

**Migration**: converter `user` para `colaborador` antes de substituir o constraint.

## Access (`acessos`)

Agrupa conteúdo e liberações de uma equipe.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | PK. |
| `nome` | text | Obrigatório; 1–80 caracteres; único sem diferenciar caixa. |
| `descricao` | text | Até 300 caracteres; padrão vazio. |
| `cor` | text | Cor hexadecimal `#RRGGBB`. |
| `ativo` | boolean | Padrão `true`. |
| `created_at` | timestamptz | Imutável. |

**State transition**: `ativo → inativo → ativo`, somente por superadministrador. Desativar não apaga
categorias, mensagens ou vínculos; remove o acesso das consultas do colaborador.

## Access Membership (`acesso_membros`)

Liberação de uma conta para um acesso.

| Field | Type | Rules |
|-------|------|-------|
| `acesso_id` | uuid | PK composta; FK para `acessos`, cascade. |
| `user_id` | uuid | PK composta; FK para `profiles`, cascade. |
| `is_admin_local` | boolean | Compatibilidade temporária; sempre `false` e ignorado. |

Não existe capacidade administrativa derivada deste vínculo. Superadministradores veem todos os
acessos por papel global; colaboradores veem apenas vínculos com acesso ativo e perfil ativo.

## Category (`categorias`)

Organiza mensagens dentro de um acesso.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | PK. |
| `acesso_id` | uuid | FK para `acessos`, cascade. |
| `nome` | text | Obrigatório; 1–80 caracteres; único por acesso sem diferenciar caixa. |
| `ordem` | integer | Inteiro não negativo; padrão `0`. |
| `arquivado_em` | timestamptz | Nulo quando ativa. |
| `arquivado_por` | uuid | FK para `profiles`; nulo quando ativa. |
| `created_at` | timestamptz | Imutável. |
| `updated_at` | timestamptz | Atualizado em toda mudança editorial. |

**Validation**: `arquivado_em` e `arquivado_por` são ambos nulos ou ambos preenchidos. Categoria com
mensagem ativa não pode entrar no estado arquivado.

**State transition**:

```text
ativa --arquivar (0 mensagens ativas)--> arquivada
arquivada --restaurar-------------------> ativa
```

## Message (`mensagens`)

Padrão de atendimento publicado.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | PK; preservado em arquivamento/restauração. |
| `acesso_id` | uuid | FK para `acessos`, cascade. |
| `categoria_id` | uuid | FK para `categorias`, `ON DELETE RESTRICT`; categoria do mesmo acesso. |
| `categoria` | text | Snapshot legado sincronizado; depreciado durante a transição. |
| `titulo` | text | Obrigatório; 1–100 caracteres após trim. |
| `conteudo` | text | Obrigatório; 1–2.000 caracteres. |
| `tags` | text[] | Sem vazios ou duplicatas após normalização. |
| `frequencia` | integer | Não negativo; padrão `0`; alterado somente pelo registro de uso. |
| `created_by` | uuid | FK para `profiles`; `ON DELETE SET NULL`. |
| `arquivado_em` | timestamptz | Nulo quando ativa. |
| `arquivado_por` | uuid | FK para `profiles`; nulo quando ativa. |
| `created_at` | timestamptz | Imutável. |
| `updated_at` | timestamptz | Atualizado em edição, arquivamento e restauração. |

**Validation**:

- a categoria deve pertencer ao mesmo acesso e estar ativa ao criar ou reclassificar;
- `arquivado_em` e `arquivado_por` são ambos nulos ou ambos preenchidos;
- somente mensagens ativas aparecem na biblioteca, busca, cards, favoritos e recentes.

**State transition**:

```text
ativa --arquivar direto ou aprovação--> arquivada
arquivada --restaurar por superadmin---> ativa
```

## Favorite (`favoritos`)

Preferência do usuário preservada mesmo durante arquivamento.

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | uuid | PK composta; deve ser o usuário autenticado. |
| `mensagem_id` | uuid | PK composta; mensagem de acesso autorizado. |
| `created_at` | timestamptz | Imutável. |

Consultas da biblioteca fazem join com mensagem ativa. Ao restaurar a mensagem, o favorito volta a
aparecer sem recriação.

## Recent Use (`recentes`)

Último uso de uma mensagem por usuário.

| Field | Type | Rules |
|-------|------|-------|
| `user_id` | uuid | PK composta. |
| `mensagem_id` | uuid | PK composta. |
| `used_at` | timestamptz | Atualizado atomicamente a cada uso. |

O registro é preservado durante arquivamento, mas somente mensagens ativas compõem a lista exibida.

## Message Request (`solicitacoes_mensagem`)

Proposta de colaborador que não altera conteúdo publicado até aprovação.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid | PK. |
| `idempotency_key` | uuid | Obrigatório; único com `solicitado_por`. |
| `acesso_id` | uuid | FK para `acessos`. |
| `mensagem_id` | uuid | Nulo em criação; obrigatório em edição/arquivamento. |
| `tipo` | text | `criacao`, `edicao`, `arquivamento`; `exclusao` apenas em histórico legado. |
| `status` | text | `pendente`, `aprovada`, `rejeitada`. |
| `categoria_id` | uuid | Categoria proposta em criação/edição. |
| `titulo`, `conteudo`, `tags` | mixed | Snapshot proposto; mesmos limites de mensagem. |
| campos `_anterior` | mixed | Snapshot imutável anterior para edição/arquivamento. |
| `solicitado_por` | uuid | FK para `profiles`; obrigatório. |
| `criado_em` | timestamptz | Imutável. |
| `revisado_por` | uuid | Superadministrador; nulo enquanto pendente. |
| `revisado_em` | timestamptz | Nulo enquanto pendente. |
| `motivo_rejeicao` | text | Obrigatório e 1–500 caracteres quando rejeitada. |

**State transition**:

```text
pendente --aprovar--> aprovada
pendente --rejeitar--> rejeitada
```

Estados finais são imutáveis. Aprovação bloqueia a linha e exige `status = 'pendente'`; uma segunda
decisão retorna conflito. Solicitações legadas pendentes de `exclusao` são convertidas para
`arquivamento`; registros finais de exclusão permanecem somente como histórico.

## Activity Record (`registros_atividade`)

Registro append-only de ações administrativas.

| Field | Type | Rules |
|-------|------|-------|
| `id` | bigint identity | PK. |
| `ator_id` | uuid | FK para `profiles`; pode ser nulo apenas para migração/sistema. |
| `acesso_id` | uuid | Acesso afetado quando aplicável. |
| `entidade_tipo` | text | `mensagem`, `categoria`, `acesso`, `liberacao`, `conta`, `solicitacao`. |
| `entidade_id` | text | Identificador estável do alvo. |
| `acao` | text | Ação normalizada: criar, editar, arquivar, restaurar, aprovar, rejeitar etc. |
| `detalhes` | jsonb | Metadados mínimos; nunca senha, token ou conteúdo integral. |
| `created_at` | timestamptz | Imutável; padrão `now()`. |

Somente superadministrador pode ler. Nenhum cliente pode inserir, editar ou excluir diretamente;
triggers e funções autorizadas escrevem os registros.

## Relationships

```text
Profile 1---N AccessMembership N---1 Access
Access 1---N Category 1---N Message
Profile N---N Message (Favorite)
Profile N---N Message (RecentUse)
Profile 1---N MessageRequest N---1 Access
MessageRequest N---0..1 Message
Profile 1---N ActivityRecord
```

## Required Indexes

- `profiles(lower(email))` unique.
- `acessos(lower(nome))` unique.
- `categorias(acesso_id, lower(nome))` unique.
- `categorias(acesso_id, ordem) WHERE arquivado_em IS NULL`.
- `mensagens(acesso_id, categoria_id) WHERE arquivado_em IS NULL`.
- `mensagens(acesso_id, updated_at DESC) WHERE arquivado_em IS NULL`.
- GIN em `mensagens.tags` para consultas administrativas futuras.
- `recentes(user_id, used_at DESC)`.
- `solicitacoes_mensagem(status, criado_em)`.
- `solicitacoes_mensagem(solicitado_por, idempotency_key)` unique.
- `registros_atividade(acesso_id, created_at DESC)`.
