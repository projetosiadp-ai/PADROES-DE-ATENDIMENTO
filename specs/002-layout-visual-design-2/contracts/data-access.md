# Contract: Data Access Layer Changes (`api.js`)

`api.js` continua sendo a única fronteira com o serviço remoto (constituição, princípio III). Todas as funções de
`specs/001-evoluir-biblioteca-mensagens/contracts/data-access.md` permanecem com a mesma assinatura e os mesmos erros
normalizados, exceto as alteradas abaixo. Erros seguem `AppError` com os códigos `AUTH_REQUIRED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `VALIDATION`, `NETWORK` e `UNKNOWN`.

## Etapas 0 a 4

Nenhuma mudança em `api.js`. A cópia preenchida e a original usam `recordMessageUse(userId, messageId)` como hoje.

## Etapa 5 — revisão, retorno e históricos

```js
approveMessageRequest(requestId, { adjustments = null, comment = null } = {})
  // adjustments: null | { categoryId, title, tags, content } (somente criação/edição)
  // comment: null | string 1–500 após trim
  // → { requestId, status: 'aprovada', messageId, adjusted: boolean }
  // Erros: VALIDATION (campos, comentário, ajuste em arquivamento), FORBIDDEN,
  //        CONFLICT (já revisada, mensagem mudou), NOT_FOUND
```

- Chamada sem o segundo argumento se comporta exatamente como a versão atual.
- Validações locais antes da chamada: título 1–100, conteúdo 1–2000, etiquetas normalizadas e sem repetição, categoria
  informada; comentário vazio vira `null`.

```js
rejectMessageRequest(requestId, comment)   // assinatura atual; o texto passa a ser exibido como comentário
```

```js
listMyRequests({ page = 0, pageSize = 20 } = {})
  // → { items: RequestSummary[], total }
  // Somente solicitações do usuário atual, ordenadas por criado_em desc.

listRequestHistory({ status, type, accessId, requesterId, from, to, page = 0, pageSize = 25 } = {})
  // Somente superadministrador. status ∈ 'pendente' | 'aprovada' | 'aprovada_com_ajustes' | 'rejeitada' | undefined
  // 'aprovada_com_ajustes' filtra status = 'aprovada' e ajustada = true; 'aprovada' filtra ajustada = false.
  // from/to: datas (YYYY-MM-DD) interpretadas em America/Sao_Paulo sobre criado_em.
  // → { items: RequestSummary[], total }

getRequestDetail(requestId)
  // → RequestDetail com versão anterior, proposta, publicada, comentário, revisor e datas.
  // Colaborador só obtém as próprias (NOT_FOUND para as demais, pela RLS).
```

`RequestSummary`: `{ id, type, status, adjusted, title, accessName, requesterName, createdAt, reviewedAt, reviewerName,
comment }`. `requesterName` e `reviewerName` são omitidos (nulos) na leitura do colaborador.

## Etapa 6 — estatísticas

```js
getUsageStats(accessId)
  // → { copiedToday, teamAverageToday: number|null, activeMessages, activeCategories, myPendingRequests }

getMessageUsage(messageId)
  // → { totalCopies, myCopiesThisWeek, myLastCopyAt: string|null }

getAdminStats()
  // Somente superadministrador.
  // → { pendingRequests, avgResponseHours30d: number|null,
  //     decided30d: { approved, approvedWithAdjustments, rejected },
  //     activeAccounts, accountsWithoutAccess,
  //     accesses: [{ id, name, active, activeMessages, activeCollaborators, copies30d }] }
```

- Falha ao carregar estatísticas não bloqueia a Biblioteca nem a cópia: os cartões mostram estado de erro com
  "Tentar de novo", seguindo a política `NETWORK`/`UNKNOWN`.

## Testes de contrato

`tests/data-access-contract.test.mjs` passa a verificar as novas exportações e que nenhuma view importa o cliente
remoto; a lista de chaves `localStorage` esperada muda para `dp_active_acesso` e `dp_novidades`.
