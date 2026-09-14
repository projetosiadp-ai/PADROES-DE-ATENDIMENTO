# Contract: Database Changes (Etapas 5 e 6)

Complementa `specs/001-evoluir-biblioteca-mensagens/contracts/database-rpcs.md`. Todas as funções expostas concedem
`EXECUTE` somente a `authenticated` (e `service_role`), revogam de `public`/`anon`, usam `SECURITY DEFINER` apenas quando
precisam agregar dados que o chamador não pode ler, e fixam `search_path = ''`. Migrações são aditivas e compatíveis com o
frontend em produção no momento da aplicação.

## Etapa 5 — revisão com ajustes

### Migração `…_request_review_adjustments.sql`

- Adiciona as colunas de [data-model.md](../data-model.md) em `solicitacoes_mensagem`, com constraints de tamanho e
  consistência, FK de `categoria_id_publicada` e backfill das linhas decididas.
- Não altera políticas de linha nem permissões de escrita direta.

### `aprovar_solicitacao`

```sql
public.aprovar_solicitacao(
  p_id uuid,
  p_ajustes jsonb default null,     -- {"categoria_id": uuid, "titulo": text, "tags": text[], "conteudo": text}
  p_comentario text default null
) returns table(request_id uuid, status text, message_id uuid, ajustada boolean)
```

- Substitui a versão de um argumento (`drop function public.aprovar_solicitacao(uuid)` na mesma migração); chamadas
  existentes com apenas `p_id` continuam válidas pelos valores padrão.
- Somente superadministrador; bloqueia a linha e exige `pendente` (`CONFLICT:REQUEST_ALREADY_REVIEWED`).
- `p_ajustes` em arquivamento → `VALIDATION:ADJUSTMENTS_NOT_ALLOWED`.
- Versão final = proposta sobrescrita pelas chaves presentes em `p_ajustes`; valida título (1–100), conteúdo (1–2000),
  etiquetas (`private.request_tags_are_valid`) e categoria ativa no mesmo acesso (`VALIDATION:*`).
- Criação insere a mensagem com a versão final; edição aplica a versão final com a mesma checagem de "estado anterior"
  atual (`CONFLICT:REQUEST_STALE`); arquivamento sem mudança.
- Grava `*_publicado`, `ajustada` (versão final ≠ proposta), `comentario_revisao` (trim; vazio → nulo; > 500 →
  `VALIDATION:REVIEW_COMMENT`), `revisado_por`, `revisado_em` e o registro de atividade com
  `{tipo, mensagem_id, ajustada, comentario_tamanho}` (sem conteúdo).

### `rejeitar_solicitacao`

Assinatura inalterada. Passa a gravar o motivo também em `comentario_revisao`.

### Leitura de solicitações

Leituras de lista e detalhe usam a tabela diretamente, protegidas pelas políticas existentes
(`solicitacoes_select_own_or_superadmin`). Nomes de solicitante e revisor vêm de `profiles`, que o colaborador só lê
para o próprio perfil; por isso a interface do colaborador não exibe esses nomes.

## Etapa 6 — cópias e estatísticas

### Migração `…_usage_statistics.sql`

- Cria `public.registros_copia` ([data-model.md](../data-model.md)) com RLS: `select` para `user_id = auth.uid()` ou
  `private.is_superadmin()`; nenhum `insert`/`update`/`delete` para clientes.
- Recria `public.registrar_uso_mensagem(p_message_id uuid)` com a mesma assinatura e os mesmos erros, acrescentando a
  inserção em `registros_copia` na mesma transação.
- Habilita `pg_cron` e agenda `dp_purge_registros_copia`, diário às 03:00 de São Paulo, apagando linhas com mais de
  12 meses.

### Funções de estatística

```sql
public.estatisticas_uso(p_access_id uuid) returns jsonb
  -- {copiadas_hoje, media_equipe_hoje|null, mensagens_ativas, categorias_ativas, minhas_solicitacoes_pendentes}
  -- exige private.can_use_access(p_access_id) (FORBIDDEN); média nula com < 3 colaboradores ativos vinculados.

public.estatisticas_mensagem(p_message_id uuid) returns jsonb
  -- {total_copias, minhas_copias_semana, minha_ultima_copia|null}; mesma checagem de acesso da mensagem.

public.estatisticas_admin() returns jsonb
  -- somente superadministrador (FORBIDDEN); campos de getAdminStats em contracts/data-access.md.
```

"Hoje" = `(now() at time zone 'America/Sao_Paulo')::date`; semana a partir de segunda-feira 00:00 do mesmo fuso.

## Testes de banco (pgTAP)

- `supabase/tests/database/request_review.test.sql`: aprovar com e sem ajustes, comentário opcional/obrigatório,
  ajuste em arquivamento recusado, categoria arquivada recusada, conflito de estado anterior, dupla decisão,
  backfill de linhas antigas, colaborador lendo só as próprias linhas e comentários.
- `supabase/tests/database/usage_stats.test.sql`: inserção em `registros_copia` pela função de uso, ausência de acesso
  direto de escrita, colaborador sem leitura de linhas alheias, média nula com menos de 3 colaboradores, fuso de
  São Paulo na virada do dia, estatísticas de administrador negadas a colaborador.

## Matriz de permissões (acréscimos)

| Recurso | Colaborador | Superadministrador |
|---|---|---|
| Comentário e versão publicada das próprias solicitações | ler | ler todas |
| `registros_copia` | ler as próprias | ler todas |
| `estatisticas_uso` / `estatisticas_mensagem` | acessos vinculados | todos |
| `estatisticas_admin` | negado | executar |
