# Data Model: Nova identidade visual DentalPlus (Design 2.0)

As Etapas 0 a 4 não alteram o banco. As mudanças abaixo pertencem às Etapas 5 e 6 e são aditivas, compatíveis com o
frontend em produção no momento da aplicação (ver [research.md](research.md), R5, R12 e R13). Estado de interface
guardado no navegador aparece no fim, porque também é contrato.

## Solicitação — `public.solicitacoes_mensagem` (ampliada na Etapa 5)

Campos existentes relevantes: `id`, `acesso_id`, `mensagem_id`, `tipo` (`criacao`, `edicao`, `arquivamento`;
`exclusao` legado), `status` (`pendente`, `aprovada`, `rejeitada`), versão proposta (`categoria_id`, `categoria`, `titulo`,
`conteudo`, `tags`), versão anterior (`*_anterior`), `solicitado_por`, `criado_em`, `revisado_por`, `revisado_em`,
`motivo_rejeicao`, `idempotency_key`.

Campos novos:

| Campo | Tipo | Regra |
|---|---|---|
| `categoria_id_publicada` | uuid, FK `categorias(id)` `on delete restrict`, nulo | Preenchido na aprovação de criação ou edição |
| `categoria_publicada` | text, nulo | Nome da categoria publicada, como o texto legado de `mensagens.categoria` |
| `titulo_publicado` | text, nulo | 1 a 100 caracteres após `btrim` quando preenchido |
| `conteudo_publicado` | text, nulo | 1 a 2000 caracteres após `btrim` quando preenchido |
| `tags_publicadas` | text[], nulo | Mesmas regras de `private.request_tags_are_valid` |
| `comentario_revisao` | text, nulo | 1 a 500 caracteres após `btrim` quando preenchido |
| `ajustada` | boolean, não nulo, padrão `false` | `true` somente quando `status = 'aprovada'` e a versão publicada difere da proposta |

Regras de integridade:

- `ajustada = true` exige `status = 'aprovada'` e `tipo in ('criacao', 'edicao')`.
- `status = 'rejeitada'` exige `comentario_revisao` preenchido para decisões novas (constraint `NOT VALID` para não
  bloquear linhas antigas; o backfill cobre as antigas).
- `status = 'aprovada'` e `tipo in ('criacao', 'edicao')` exige a versão publicada completa (título, conteúdo e categoria).
- Pedidos de arquivamento nunca têm versão publicada nem `ajustada = true`.
- A versão proposta (enviada pelo colaborador) nunca é alterada depois do envio.

Backfill na migração:

- aprovadas de criação/edição: versão publicada = versão proposta, `ajustada = false`;
- rejeitadas: `comentario_revisao = motivo_rejeicao`;
- `motivo_rejeicao` continua sendo gravado nas rejeições novas durante a transição, para o frontend anterior.

Transições de estado:

```text
pendente ──aprovar sem ajuste──▶ aprovada (ajustada=false, comentário opcional)
pendente ──aprovar com ajuste──▶ aprovada (ajustada=true,  comentário opcional)   [só criação/edição]
pendente ──rejeitar──────────────▶ rejeitada (comentário obrigatório)
aprovada | rejeitada ──qualquer decisão──▶ CONFLICT:REQUEST_ALREADY_REVIEWED
```

Rótulos na interface: `pendente` → "Pendente"; `aprovada` + `ajustada=false` → "Aprovada"; `aprovada` + `ajustada=true`
→ "Aprovada com ajustes"; `rejeitada` → "Rejeitada".

Acesso por papel (políticas existentes, sem mudança): colaborador lê apenas as próprias linhas, inclusive o comentário;
superadministrador lê todas. Nenhum papel de cliente atualiza a tabela diretamente; decisões só por função.

## Registro de cópia — `public.registros_copia` (novo na Etapa 6)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | bigint gerado como identidade, PK | — |
| `user_id` | uuid, FK `profiles(id)` `on delete cascade`, não nulo | Quem copiou |
| `mensagem_id` | uuid, FK `mensagens(id)` `on delete cascade`, não nulo | Mensagem copiada |
| `acesso_id` | uuid, FK `acessos(id)` `on delete cascade`, não nulo | Acesso da mensagem no momento da cópia |
| `copiado_em` | timestamptz, não nulo, padrão `now()` | Momento da cópia |

- Índices: `(user_id, copiado_em desc)`, `(acesso_id, copiado_em desc)`, `(mensagem_id, copiado_em desc)`.
- RLS habilitada. Leitura: própria linha (`user_id = auth.uid()`) ou superadministrador. Sem `insert`, `update` ou
  `delete` para papéis de cliente; a inserção acontece só dentro de `registrar_uso_mensagem`.
- Não guarda texto copiado, valores de variáveis nem se a cópia foi preenchida ou original.
- Retenção: job diário apaga linhas com `copiado_em` anterior a 12 meses.

## Estatísticas de uso (derivadas, Etapa 6)

Calculadas no servidor (ver [contracts/database-rpcs.md](contracts/database-rpcs.md)); nunca armazenadas.

| Estatística | Fórmula | Quem vê |
|---|---|---|
| Copiadas hoje | cópias da pessoa no acesso ativo com `copiado_em` no dia corrente de `America/Sao_Paulo` | a própria pessoa |
| Média da equipe hoje | cópias de hoje dos colaboradores ativos vinculados ao acesso ÷ número desses colaboradores; nula se forem menos de 3 | colaboradores do acesso e superadministrador |
| Minhas cópias na semana (por mensagem) | cópias da pessoa naquela mensagem desde segunda-feira 00:00 de São Paulo | a própria pessoa |
| Minha última cópia (por mensagem) | maior `copiado_em` da pessoa naquela mensagem | a própria pessoa |
| Total de cópias da mensagem | `mensagens.frequencia` (já existente) | quem pode ver a mensagem |
| Padrões no acesso | mensagens ativas do acesso; categorias ativas do acesso | quem pode usar o acesso |
| Suas solicitações pendentes | solicitações próprias com `status = 'pendente'` | a própria pessoa |
| Tempo médio de resposta (30 dias) | média de `revisado_em - criado_em` das decididas nos últimos 30 dias | superadministrador |
| Decididas em 30 dias | contagem por aprovada, aprovada com ajustes e rejeitada | superadministrador |
| Contas e acessos | contas ativas; colaboradores ativos sem vínculo; por acesso: situação, mensagens ativas, colaboradores ativos | superadministrador |

## Variável de mensagem (derivada no navegador, Etapa 4)

- Reconhecimento: `[` + uma ou mais letras maiúsculas (inclusive acentuadas), dígitos ou `_` + `]`.
- Identidade: o nome entre colchetes; ocorrências repetidas compartilham o mesmo campo.
- Rótulo: nome em minúsculas com a inicial maiúscula e `_` trocado por espaço.
- Valor: texto digitado, só em memória; descartado ao trocar de mensagem, fechar a janela ou sair.
- Preenchimento: substitui todas as ocorrências de variáveis com valor não vazio (após `trim`); as vazias permanecem.

## Estado de interface guardado no navegador

| Chave `localStorage` | Valor | Observação |
|---|---|---|
| `dp_active_acesso` | id do acesso ativo | Existente, sem mudança |
| `dp_novidades` | identificador da última etapa cujo aviso foi visto | Novo (Etapa 1); preferência não sensível |
| `dp_darkmode`, `dp_sidebar_collapsed` | — | Removidas na primeira carga da Etapa 1 e não gravadas mais |
