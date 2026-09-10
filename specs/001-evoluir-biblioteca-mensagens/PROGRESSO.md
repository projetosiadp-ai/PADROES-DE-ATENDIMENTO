# Progresso da implementação

Atualizado em: 2026-09-08

## Resumo

A infraestrutura, a fundação e as User Stories 1 a 5 foram implementadas. No `tasks.md`, as tarefas T001 a T057 estão marcadas como concluídas.

## O que já foi feito

### Infraestrutura e ambiente local — T001 a T007

- Toolchain determinística com Node 24, npm 10, Supabase CLI, Playwright, axe, Lighthouse CI e servidor estático.
- Configuração local do Supabase e arquivo `config.local.js` sem `service_role`.
- Portas locais remapeadas de `5432x` para `5442x`, pois o Windows reservou dinamicamente o intervalo que continha as portas padrão.
- Projetos Playwright para desktop/mobile 360 px e temas claro/escuro.
- Fixtures locais de autenticação, dados e reset.
- Configuração de ambiente, `.gitignore`, `.dockerignore` e Lighthouse.

### Banco, autorização e domínio — T008 a T020

- Baseline remoto reconciliado em `20260902000100_remote_baseline.sql`, incluindo o trigger de criação de perfil.
- Migração aditiva `20260902000200_evolve_library_schema.sql` com:
  - papel `colaborador`;
  - normalização de `is_admin_local=false`;
  - relação `categoria_id` e backfill;
  - arquivamento de mensagens/categorias;
  - idempotência de solicitações;
  - registros de atividade;
  - índices e compatibilidade temporária com campos legados.
- Migração `20260902000300_authorization_and_usage.sql` com grants explícitos, RLS, helpers privados, auditoria e RPC `registrar_uso_mensagem`.
- Seed local determinístico com quatro contas, acessos isolados, mensagens, favoritos, recentes e conteúdo arquivado.
- Testes pgTAP para autorização, arquivamento e auditoria.
- Módulos puros de permissões, seleção da biblioteca e estados de solicitações.
- Erros estáveis de API em `domain/api-errors.mjs`.
- Reconciliação do DOM e gerenciamento de foco extraídos para `ui/dom-morph.mjs` e `ui/focus.mjs`.

### User Story 1 — T021 a T028

- Cópia literal e fallback manual em `ui/clipboard.mjs`, com telemetria não bloqueante.
- Jornada Playwright do colaborador cobrindo:
  - biblioteca autorizada;
  - busca por conteúdo e tag;
  - filtro de categoria;
  - ordenação;
  - favoritos;
  - recentes;
  - cópia exata.
- Cenário de desempenho com cinco medições autenticadas para carga 3G, busca p95 e confirmação de cópia p95.
- API seletiva em `api.js`:
  - `fetchAccessLibrary`;
  - `toggleFavorite`;
  - `recordMessageUse`.
- Cache em memória por acesso e troca seletiva de biblioteca no `app.js`.
- Filtros reutilizando `domain/library.mjs`.
- Renderização extraída para `views/library-view.mjs`, incluindo estados vazio/sem resultado, cartões, favoritos e recentes.
- Cliente Supabase 2.57.4 instalado e distribuído localmente em `vendor/supabase.js`; a aplicação não depende mais de `esm.sh` para iniciar.
- Shell crítico otimizado com `preload`/`modulepreload`, metadados e live region permanente para confirmação de cópia.

### User Story 2 — T029 a T034

- Criado `tests/e2e/authentication.spec.mjs` com cinco cenários:
  - login válido;
  - credenciais inválidas;
  - sessão expirada;
  - conta sem acesso;
  - isolamento entre duas contas.
- Matriz pgTAP ampliada para negar ao colaborador publicação, aprovação, promoção de conta, criação de acesso e criação de vínculo.
- Implementado `fetchSessionContext`, mantendo o bootstrap separado da biblioteca e da administração.
- Corrigido possível deadlock: consultas Supabase não são mais iniciadas dentro do lock do callback de autenticação.
- Adicionado retry único para o desvio de relógio local que podia gerar `JWT issued at future` entre Auth e PostgREST.
- Removidos da camada de dados e da interface:
  - `toggleUserAdminLocal`;
  - `isAdminLocal`/`is_admin_local` como capacidade;
  - rótulos, botões e decisões de “admin local”.
- Interface agora usa apenas `colaborador` e `superadmin`.
- Sessão expirada apresenta mensagem específica.
- Tela de conta sem acesso foi movida para `views/library-view.mjs`.
- Política de leitura de acessos foi ajustada para o superadministrador listar também acessos inativos, necessários para gestão, enquanto colaboradores continuam vendo somente acessos ativos autorizados.

### User Story 3 — T035 a T040

- Submissão de propostas de criação, edição e arquivamento com formato validado por tipo e RLS.
- Chave idempotente reutilizada em retry após resposta incerta; conflito recupera a solicitação já criada.
- Snapshots anterior/proposto preservados e conteúdo publicado inalterado enquanto pendente.
- Formulários acessíveis de proposta e confirmação de arquivamento.
- Clique duplo bloqueado e feedback “Proposta enviada para revisão”.

### User Story 4 — T041 a T049

- RPCs transacionais de aprovação/rejeição com bloqueio de linha e aplicação única.
- Aprovação dos três tipos, rejeição motivada e conflito de snapshot obsoleto.
- RPCs de arquivamento/restauração de mensagens e categorias, preservando IDs, favoritos e recentes.
- Bloqueio orientado de categoria que ainda contém mensagens ativas.
- Auditoria transacional de criar, editar, arquivar, restaurar, aprovar e rejeitar.
- Nova `views/admin-view.mjs` com coleções semânticas de mensagens, categorias, solicitações e arquivados.
- Diálogos administrativos movidos para `views/modal-view.mjs`, com estado em andamento e tratamento de conflito concorrente.

### User Story 5 — T050 a T057

- Jornadas E2E de criação de acesso e conta, múltiplas liberações, remoção de vínculo, senha temporária, categoria, arquivamento, restauração e ativação/desativação.
- Edge Functions restritas a superadministrador ativo, com validação do alvo, papéis permitidos, vários `accessIds`, rollback de criação parcial e nenhum `isAdminLocal`.
- Senhas temporárias retornadas apenas na resposta de sucesso e descartadas pela interface ao fechar, sem logs de senha ou token.
- API estrutural alinhada ao contrato: `createAccess`, `setAccessActive`, `listProfiles`, `listAccessUsers`, `setAccessMembership`, `adminCreateUser` e `adminResetPassword`.
- Painel e formulários responsivos de acessos, contas, vínculos, categorias e arquivados, com confirmação, atualização seletiva e falhas acionáveis.

## Validações já executadas

- `npm run test:unit`: passou; 19 testes do runner, incluindo 22 verificações internas de lógica.
- `npm run test:db`: passou com 67 asserções em quatro arquivos pgTAP.
- `npm run test:e2e`: passou nos quatro projetos da jornada do colaborador.
- Jornada administrativa desktop-light: 5 de 5 cenários passaram, incluindo concorrência real, ciclo editorial e gestão estrutural.
- Cenário de desempenho: passou com cinco medições autenticadas após a otimização do carregamento crítico.
- `node --check app.js` e verificações dos módulos extraídos passaram nas últimas execuções.

## Onde parou exatamente

A validação funcional da User Story 5 foi concluída até a T057. O próximo ponto de implementação é T058, início da fase de acabamento e gates transversais.

## Próximos passos recomendados

1. Iniciar T058 com as jornadas de acessibilidade e foco.
2. Prosseguir com responsividade, temas, indexação e performance (T059–T063).
3. Executar os gates de release e registrar evidências (T064–T067).

## Validação mais recente

- `npm run test:db`: 4 arquivos e 72 asserções, sem falhas.
- `npm run test:unit`: 19 testes do runner e 22 verificações internas, sem falhas.
- `tests/e2e/superadmin.spec.mjs` desktop-light: 5 de 5 cenários passaram.
- Jornadas estruturais em mobile 360 px claro: 2 de 2 cenários passaram.
- Regressão funcional desktop-light: 11 de 11 cenários passaram em autenticação, colaboração e administração.
- Jornada de autenticação desktop-light: 5 de 5 cenários passaram.
- `npm run test:e2e`: 9 testes executados, 15 variações intencionalmente ignoradas, sem falhas.
- Cenário Playwright `@perf`: passou nas cinco medições autenticadas.
- Lighthouse CI: bloqueado ambientalmente após a auditoria pela falha `EPERM` ao encerrar o Chrome e remover o perfil temporário no Windows; não houve reprovação de orçamento da aplicação registrada nessa execução.

## Arquivos principais alterados ou criados

- `api.js`
- `app.js`
- `index.html`
- `config.local.js`
- `package.json` e `package-lock.json`
- `domain/api-errors.mjs`
- `domain/library.mjs`
- `domain/permissions.mjs`
- `domain/requests.mjs`
- `ui/clipboard.mjs`
- `ui/dom-morph.mjs`
- `ui/focus.mjs`
- `views/library-view.mjs`
- `views/admin-view.mjs`
- `views/modal-view.mjs`
- `vendor/supabase.js`
- `tests/e2e/collaborator.spec.mjs`
- `tests/e2e/performance.spec.mjs`
- `tests/e2e/authentication.spec.mjs`
- `tests/e2e/superadmin.spec.mjs`
- `tests/fixtures/auth.mjs`
- `tests/fixtures/data.mjs`
- `supabase/config.toml`
- `supabase/seed.sql`
- `supabase/migrations/20260902000100_remote_baseline.sql`
- `supabase/migrations/20260902000200_evolve_library_schema.sql`
- `supabase/migrations/20260902000300_authorization_and_usage.sql`
- `supabase/migrations/20260904164137_message_request_submission.sql`
- `supabase/migrations/20260904164449_grant_request_tag_validation.sql`
- `supabase/migrations/20260904170254_content_review_and_lifecycle.sql`
- `supabase/tests/database/authorization.test.sql`
- `supabase/tests/database/archiving.test.sql`
- `supabase/tests/database/audit.test.sql`

## Observações

- Não foi criado commit.
- O worktree contém diversos arquivos não rastreados e alterações anteriores; nenhum arquivo alheio foi apagado ou revertido.
- A instalação de dependências reportou 13 vulnerabilidades do ecossistema npm (2 baixas, 4 moderadas e 7 altas). Não foi executado `npm audit fix`, pois isso poderia introduzir mudanças fora do escopo ou incompatibilidades.
- Não executar comandos Supabase com `--linked` durante a validação local.

## Continuação — T058 a T068

- T058–T061 concluídas com axe, teclado/foco modal, temas, responsividade a 360 px e correções semânticas.
- T062–T063 concluídas com massa determinística de 100 contas, 10 acessos e 1.000 mensagens,
  carregamento seletivo, cache de sessão revalidado e renderização incremental.
- T064 concluída com `vercel.json`, CSP, anti-indexação, `nosniff`, referrer policy, anti-framing e cache.
- T065 concluída com snapshot regenerado de `public` e `private` e auditoria automatizada contra
  exclusão física, papel `user` e administração local.
- T068 concluída com checklist de preview, backup, dry-run, smoke e rollback.
- T066 permanece aberta somente porque o `db reset` local destrutivo teve aprovação recusada; todas
  as demais verificações locais e o gate `npm run test:all` passaram e estão documentados em
  `validation-results.md`.
- T067 permanece aberta por depender de estudo moderado com 20 participantes reais; o protocolo e a
  tabela agregada estão prontos em `usability-results.md`, sem resultados fabricados.

## Fase 9 — Convergência (T069 a T074), 2026-09-10

- T069: `api.js` passou a exportar exatamente o contrato `contracts/data-access.md` (cliente Supabase
  não exportado; removidos `fetchAppData`, aliases em português e funções legadas). `saveMessage` e
  `saveCategory` substituem criar/editar separados. `app.js` perdeu o renderizador administrativo
  inalcançável, os modais `if (false && …)`, o ramo de colaborador em `saveMsg` e o modal legado de
  usuários; editor de mensagem e vínculos do acesso foram para `views/modal-view.mjs`. Regras únicas:
  papel/acesso via `domain/permissions.mjs`, tags via `normalizeTags`, rótulo de solicitação via
  `requestTypeLabel`. Regressão: `tests/data-access-contract.test.mjs`.
- T070: “Arquivar” da biblioteca usa `archiveMessage` com confirmação que nomeia o item e explica a
  restauração; `deleteMensagem`/`deleteCategoria`, desfazer-exclusão e `pendingDeleteIds` removidos.
  E2E novo em `superadmin.spec.mjs` (biblioteca → arquivar → Arquivados → restaurar).
- T071: confirmação com estado `saving` (`aria-busy`, Confirmar/Cancelar desabilitados, overlay e
  Escape bloqueados); `ui/focus.mjs` aceita predicado em `escapeCloses`. Regressão unitária
  (`modal-view.test.mjs`, `focus.test.mjs`) e E2E de clique duplo com uma única chamada RPC.
- T072: política única por código em `domain/error-policy.mjs`, executada por `App.handleError`;
  `AUTH_REQUIRED` usa `api.expireSession()`; campos inválidos recebem `aria-invalid` e foco; recargas
  após mutação limitadas ao acesso/coleção afetados. Corrigido: JWT expirado do PostgREST
  (`PGRST301/302/303`) era classificado como `UNKNOWN`. E2E novo em `authentication.spec.mjs`.
- T073: biblioteca somente em memória (promessa por acesso); chaves legadas `dp_library_cache:*` são
  apagadas no boot. SC-002/SC-003 revalidados com a massa de escala (ver `validation-results.md`).
- T074: `@supabase/supabase-js` fixado em `2.112.4` (versão exata) no manifesto/lockfile e
  `vendor/supabase.js` substituído pelo UMD dessa versão. Regressão: `dependency-pin.test.mjs`.
- T075 permanece aberta: depende de autorização explícita para preview/release.
- Pendência de verificação: o gate a 360 px (`mobile.spec.mjs`) ficou não conclusivo por falta de
  recursos na máquina (Auth local sem resposta, 345 MB de RAM livre, outra stack Supabase ativa).
  Unidade, banco, E2E funcional, a11y desktop e desempenho passaram. Repetir `npm run test:a11y`
  depois de liberar memória e, idealmente, após `npx supabase db reset` local autorizado (T066).

### Gate consolidado mais recente

- Unidade: 24 testes do runner, além de 23 verificações internas, sem falhas.
- Banco: 72 asserções pgTAP, sem falhas.
- E2E: 37 cenários executados, 15 combinações intencionalmente ignoradas, sem falhas.
- Acessibilidade/mobile: 9 cenários executados, 15 combinações canônicas ignoradas, sem falhas.
- Performance: carga p75 1.292 ms, busca p95 258 ms e cópia p95 144 ms.
- Lighthouse (3 execuções): performance 0,98; JavaScript 92.978 bytes; total 117.587 bytes.
