# Contract: Database Functions and Policies

All UUID inputs reject null. Exposed functions grant execution only to `authenticated`; each function
checks the caller or relies on operation-specific RLS. Table names are schema-qualified and every
`SECURITY DEFINER` function fixes an empty `search_path`.

## Role helpers

```sql
private.is_superadmin() returns boolean stable
private.can_use_access(p_access_id uuid) returns boolean stable
```

These helpers are not directly executable through the data API. `can_use_access` returns true when
the active caller is a superadministrator or an active collaborator linked to an active access.

## Message use

```sql
public.registrar_uso_mensagem(p_message_id uuid) returns void
```

Atomic effects:

1. validate authenticated caller can use the message access;
2. reject archived or missing message;
3. increment `frequencia` once;
4. upsert `recentes(user_id, mensagem_id, used_at)`.

Errors: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`.

## Content archiving

```sql
public.arquivar_mensagem(p_message_id uuid) returns public.mensagens
public.restaurar_mensagem(p_message_id uuid) returns public.mensagens
public.arquivar_categoria(p_category_id uuid) returns public.categorias
public.restaurar_categoria(p_category_id uuid) returns public.categorias
```

Only superadministrators may execute. Archive sets actor/date and restore clears both. Repeating the
same transition returns `CONFLICT`. Category archive returns `CONFLICT:CATEGORY_NOT_EMPTY:<count>`
when active messages exist. Triggers append an activity record in the same transaction.

## Request review

```sql
public.aprovar_solicitacao(p_id uuid)
returns table(request_id uuid, status text, message_id uuid)

public.rejeitar_solicitacao(p_id uuid, p_motivo text)
returns table(request_id uuid, status text)
```

Only superadministrators may execute. Both lock the request row and require `pendente`.

Approval behavior:

- `criacao`: insert active message from proposed snapshot;
- `edicao`: update the existing active message and preserve its identifier;
- `arquivamento`: set archive actor/date on the existing message;
- append activity and mark the request approved in the same transaction.

Rejection validates a trimmed reason of 1–500 characters, appends activity and marks the request
rejected. A reviewed or missing request returns `CONFLICT`; no operation is reapplied.

## Request insertion idempotency

Direct insert into `solicitacoes_mensagem` is allowed only when:

- `solicitado_por = auth.uid()`;
- caller can use `acesso_id`;
- type is creation, edit or archive and shape matches the type;
- target message is active and belongs to the access for edit/archive;
- `(solicitado_por, idempotency_key)` is unique.

On a duplicate key, the data layer fetches and returns the existing request instead of creating a
second row.

## RLS permission matrix

| Resource | Collaborator | Superadministrator |
|----------|--------------|--------------------|
| Own profile | read | read/update all |
| Active linked access | read | read/write all |
| Own memberships | read | read/write all |
| Active categories/messages in linked access | read | read/write all states |
| Own favorites/recent use | read/write | read/write own |
| Requests in linked access | insert/read own | read/review all |
| Activity records | none | read |

No `anon` grant may expose application tables or RPCs.
