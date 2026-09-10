# Contract: Frontend Data Access

`api.js` is the only module allowed to import the remote client, and it does not export the client.
UI and domain modules consume the functions below and never issue table, RPC, auth or function calls
directly. The exported surface of `api.js` is exactly the set of functions in this document plus the
re-exported `AppError`, `APP_ERROR_CODES` and `normalizeApiError`; `tests/data-access-contract.test.mjs`
fails on any alias, legacy name or undocumented export.

## Shared result and errors

Successful functions return the documented value. Failures throw `AppError`:

```js
class AppError extends Error {
  constructor(code, message, options = { details, status, cause }) {}
}
```

Allowed `code` values: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`,
`NETWORK`, `UNKNOWN`. Messages are safe for UI display; `cause` is never rendered or persisted.
The UI reaction to each code is defined once in `domain/error-policy.mjs` (see
[ui-behavior.md](ui-behavior.md), "Errors and progress").

## Authentication and bootstrap

```js
signIn(email, password) -> Promise<void>
signOut() -> Promise<void>
expireSession() -> Promise<void>
consumeSessionExpiredNotice() -> boolean
getSession() -> Promise<Session|null>
onAuthChange(callback) -> unsubscribe()
fetchSessionContext(userId) -> Promise<{
  profile: Profile,
  accesses: Access[],
  memberships: AccessMembership[]
}>
```

`fetchSessionContext` returns active accesses only for collaborators and all accesses for a
superadministrator. It does not load messages or administration data. `expireSession` signs out and
leaves a one-shot notice that `consumeSessionExpiredNotice` reads (and clears) for the login screen;
it is used both for the local 5-day session cap and for `AUTH_REQUIRED` failures.

## Active library

```js
fetchAccessLibrary(userId, accessId) -> Promise<{
  categories: Category[],
  messages: Message[],
  favoriteIds: string[],
  recentIds: string[]
}>
fetchAccessLibraryCore(accessId) -> Promise<{ categories: Category[], messages: Message[] }>
fetchAccessPersonalization(userId, accessId) -> Promise<{ favoriteIds: string[], recentIds: string[] }>

toggleFavorite(userId, messageId, isFavorite) -> Promise<void>
recordMessageUse(userId, messageId) -> Promise<void>
```

Only active categories/messages are returned. `fetchAccessLibraryCore` and
`fetchAccessPersonalization` are the two halves of `fetchAccessLibrary`, exposed so the library can
render before per-user favorites/recents arrive. `recordMessageUse` is invoked after clipboard
success; its rejection is observable for diagnostics but does not reverse or hide a successful copy.

## Message requests

```js
submitMessageRequest({
  idempotencyKey,
  accessId,
  type,              // "criacao" | "edicao" | "arquivamento"
  messageId,         // null only for creation
  categoryId,
  title,
  tags,
  content,
  previous           // null for creation; snapshot otherwise
}) -> Promise<{ id, status }>

listPendingRequests() -> Promise<MessageRequest[]>
approveMessageRequest(requestId) -> Promise<{ requestId, status, messageId }>
rejectMessageRequest(requestId, reason) -> Promise<{ requestId, status }>
```

Retries reuse `idempotencyKey`. `CONFLICT` means the request was already reviewed; the caller reloads
the pending list instead of retrying approval.

## Superadministrator content operations

```js
saveMessage({ id, accessId, categoryId, title, tags, content }) -> Promise<Message>
archiveMessage(messageId) -> Promise<Message>
restoreMessage(messageId) -> Promise<Message>
saveCategory({ id, accessId, name, order }) -> Promise<Category>
archiveCategory(categoryId) -> Promise<Category>
restoreCategory(categoryId) -> Promise<Category>
listArchivedContent(accessId) -> Promise<{
  categories: Category[],
  messages: Message[]
}>
```

`saveMessage`/`saveCategory` create when `id` is null and update an active row otherwise; updating an
item archived in the meantime throws `NOT_FOUND`. There is no delete operation: archive and restore
are the only removal path. `archiveCategory` throws `CONFLICT` with the active-message count when the
category is not empty.

## Superadministrator access and account operations

```js
createAccess({ name, description, color }) -> Promise<Access>
setAccessActive(accessId, active) -> Promise<Access>
listProfiles() -> Promise<Profile[]>
listAccessUsers(accessId) -> Promise<AccessUser[]>
setAccessMembership(userId, accessId, linked) -> Promise<void>
adminCreateUser({ name, email, temporaryPassword, accessIds, role }) -> Promise<{ userId }>
adminResetPassword(userId) -> Promise<{ temporaryPassword }>
```

`role` is `colaborador` (default) or `superadmin`. No function accepts or returns `isAdminLocal`.
Temporary passwords are shown once and never logged.

## Cache behavior

- Session context is replaced on every auth change.
- Library data is cached in memory by `accessId` for the current session and is never persisted to
  `localStorage` or `sessionStorage`.
- A successful mutation invalidates only its affected access and administration collection.
- Sign-out clears all in-memory data and local session-age metadata.
