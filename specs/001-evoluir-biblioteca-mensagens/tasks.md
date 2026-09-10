---

description: "Tarefas de implementação da evolução da biblioteca de mensagens"
---

# Tasks: Evolução da Biblioteca de Mensagens

**Input**: Artefatos em `/specs/001-evoluir-biblioteca-mensagens/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: A especificação exige testes automatizados de lógica, banco, navegador, acessibilidade e desempenho. Em cada história, as tarefas de teste precedem a implementação correspondente e devem falhar pelo motivo esperado antes do código de produção.

**Organization**: As tarefas são agrupadas por história de usuário para permitir implementação, validação e entrega incrementais. Os caminhos são relativos à raiz do repositório.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode ser executada em paralelo com outras tarefas marcadas no mesmo bloco, pois altera arquivos diferentes e não depende de trabalho incompleto.
- **[Story]**: associa a tarefa a uma história da especificação (`US1` a `US5`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tornar ferramentas, ambiente local e execução dos testes reproduzíveis sem adicionar dependências ao runtime do navegador.

- [X] T001 Criar `package.json` e `package-lock.json` com Node 24, scripts `serve`, `test:unit`, `test:db`, `test:e2e`, `test:a11y`, `test:perf`, `seed:scale` e `test:all`, fixando Supabase CLI 2.116.0, Playwright 1.62.1, axe 4.13.0, LHCI 0.15.1 e serve 14.2.6
- [X] T002 [P] Criar `supabase/config.toml` e ajustar `config.local.js` para o ambiente local documentado, sem incluir `service_role` ou outro segredo
- [X] T003 Capturar e reconciliar o schema remoto vigente em `supabase/migrations/20260902000100_remote_baseline.sql`, confirmando que a reconstrução local representa `supabase/schema.sql` antes das migrações da feature
- [X] T004 [P] Criar `playwright.config.mjs` com projetos desktop, mobile 360 px, tema claro e tema escuro, usando somente contas e URLs locais
- [X] T005 [P] Criar `lighthouserc.cjs` para validar o shell público e os orçamentos de JavaScript e transferência definidos no plano
- [X] T006 [P] Criar helpers determinísticos de autenticação, dados e limpeza em `tests/fixtures/auth.mjs` e `tests/fixtures/data.mjs`
- [X] T007 Adicionar `.env.example` com apenas nomes de variáveis públicas/locais e documentar exclusões de credenciais e artefatos de teste em `.gitignore`

**Checkpoint**: `npm ci`, a inicialização local e a descoberta dos quatro tipos de suíte funcionam de modo reproduzível.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Criar o modelo compatível, a autorização central, as fronteiras de domínio/UI e a infraestrutura que bloqueiam todas as histórias.

**⚠️ CRITICAL**: Nenhuma história começa antes de a migração aditiva, a matriz básica de RLS e os módulos compartilhados estarem disponíveis.

- [X] T008 [P] Escrever testes pgTAP inicialmente falhos para os papéis `colaborador`/`superadmin`, isolamento entre acessos, conta/acesso inativos e negação anônima em `supabase/tests/database/authorization.test.sql`
- [X] T009 [P] Escrever testes pgTAP inicialmente falhos para campos, transições e preservação de vínculos no arquivamento em `supabase/tests/database/archiving.test.sql`
- [X] T010 [P] Escrever testes pgTAP inicialmente falhos para registros append-only, conteúdo permitido e bloqueio de mutações do cliente em `supabase/tests/database/audit.test.sql`
- [X] T011 [P] Ampliar `tests/logic.test.mjs` com testes inicialmente falhos para capacidades dos dois papéis, filtragem de arquivados, ordenações e estados de solicitação
- [X] T012 Criar a migração aditiva `supabase/migrations/20260902000200_evolve_library_schema.sql` para converter `user` em `colaborador`, normalizar `is_admin_local=false`, adicionar `categoria_id`, backfill por acesso/nome, campos de arquivamento, idempotência e `registros_atividade`, preservando colunas legadas durante o rollout
- [X] T013 Criar `supabase/migrations/20260902000300_authorization_and_usage.sql` com grants por operação, políticas RLS `TO authenticated`, helpers privados com `search_path=''`, triggers de auditoria e `registrar_uso_mensagem`, sem capacidade derivada de `is_admin_local`
- [X] T014 Criar `supabase/seed.sql` com perfis, vínculos, categorias, mensagens, favoritos, recentes e estados arquivados determinísticos para os testes funcionais
- [X] T015 [P] Implementar capacidades puras `canViewAdministration`, `canPublishContent` e `canUseAccess` em `domain/permissions.mjs`
- [X] T016 [P] Implementar seleção, busca, filtro por categoria, ordenação e exclusão de arquivados em `domain/library.mjs`, reutilizando `search-utils.mjs`
- [X] T017 [P] Implementar tipos, rótulos, validação de transições e geração/reuso de chave idempotente em `domain/requests.mjs`
- [X] T018 Implementar `AppError`, os códigos contratuais e a normalização de erros Auth/PostgREST/RPC/Functions em `api.js`
- [X] T019 [P] Extrair a reconciliação atual do DOM para `ui/dom-morph.mjs`, preservando valor, seleção, caret e o contrato usado pelo orquestrador em `app.js`
- [X] T020 [P] Implementar abertura, contenção, Escape e restauração de foco de diálogos em `ui/focus.mjs`

**Checkpoint**: `npx supabase db reset`, `npm run test:unit` e `npm run test:db` demonstram a base de dois papéis, preservação de dados e isolamento antes das telas de história.

---

## Phase 3: User Story 1 - Encontrar e copiar uma mensagem (Priority: P1) 🎯 MVP

**Goal**: Entregar a biblioteca inicial, busca/filtros/ordenação, favoritos, recentes e cópia literal em uma ação.

**Independent Test**: Com uma sessão autenticada e um acesso contendo 1.000 mensagens, buscar por título, conteúdo e tag, filtrar por categoria, abrir favoritos/recentes e copiar exatamente o texto armazenado; a confirmação deve surgir em até 1 segundo mesmo se a telemetria falhar.

### Tests for User Story 1

- [X] T021 [P] [US1] Escrever testes inicialmente falhos de cópia nativa, fallback manual, texto literal e telemetria não bloqueante em `tests/clipboard.test.mjs`
- [X] T022 [P] [US1] Escrever a jornada inicialmente falha de biblioteca, busca, categoria, ordenação, favoritos, recentes e cópia em `tests/e2e/collaborator.spec.mjs`
- [X] T023 [P] [US1] Criar o cenário inicialmente falho de cinco medições autenticadas para carga 3G, busca p95 e confirmação de cópia p95 em `tests/e2e/performance.spec.mjs`

### Implementation for User Story 1

- [X] T024 [P] [US1] Implementar `copyExactText` e o fallback selecionável sem transformação de conteúdo em `ui/clipboard.mjs`
- [X] T025 [US1] Implementar `fetchAccessLibrary`, `toggleFavorite` e `recordMessageUse` conforme o contrato, limitados ao acesso ativo, em `api.js`
- [X] T026 [P] [US1] Criar a renderização da biblioteca, estados vazio/sem resultado, controles de busca/ordenação, cartões, favoritos e recentes em `views/library-view.mjs`
- [X] T027 [US1] Integrar carregamento por acesso, cache em memória, filtros puros e cópia seguida de telemetria em segundo plano no orquestrador `app.js`
- [X] T028 [US1] Ajustar metadados, região principal, live region de confirmação e carregamento crítico do shell em `index.html`

**Checkpoint**: A US1 funciona com uma sessão preparada sem depender de solicitações ou administração e atende SC-002, SC-003 e SC-004 na massa de escala.

---

## Phase 4: User Story 2 - Entrar e acessar somente conteúdo autorizado (Priority: P1)

**Goal**: Garantir login obrigatório, bootstrap mínimo, isolamento por acesso e interface estrita para colaborador ou superadministrador.

**Independent Test**: Entrar com duas contas ligadas a acessos diferentes e comprovar que cada uma recebe apenas seus acessos ativos; uma conta sem vínculo vê orientação, e uma sessão inválida não revela dados protegidos.

### Tests for User Story 2

- [X] T029 [P] [US2] Escrever jornadas inicialmente falhas de login válido/inválido, sessão expirada, conta sem acesso e isolamento entre duas contas em `tests/e2e/authentication.spec.mjs`
- [X] T030 [P] [US2] Ampliar a matriz pgTAP com tentativas diretas de publicação, aprovação, conta, acesso e vínculo por colaborador em `supabase/tests/database/authorization.test.sql`

### Implementation for User Story 2

- [X] T031 [US2] Implementar `signIn`, `signOut`, `getSession`, `onAuthChange` e `fetchSessionContext` sem carregar bibliotecas ou administração em `api.js`
- [X] T032 [P] [US2] Remover `toggleUserAdminLocal`, `isAdminLocal` e qualquer capacidade administrativa de vínculo da camada de dados em `api.js`
- [X] T033 [US2] Refatorar bootstrap, troca de acesso, expiração, limpeza de estado e destino inicial da biblioteca em `app.js`, usando apenas `colaborador` e `superadmin`
- [X] T034 [US2] Remover rótulos, controles e decisões de “admin local” e renderizar login, sessão expirada e conta sem acesso em `views/library-view.mjs` e `app.js`

**Checkpoint**: US1 e US2 operam juntas, mas US2 pode ser validada apenas com login e inspeção de isolamento, sem fluxos editoriais.

---

## Phase 5: User Story 3 - Solicitar mudança de conteúdo (Priority: P2)

**Goal**: Permitir que colaboradores proponham criação, edição ou arquivamento sem alterar a biblioteca publicada.

**Independent Test**: Enviar os três tipos de proposta, confirmar snapshots e estado pendente e repetir a mesma tentativa com a mesma chave sem criar outra solicitação nem publicar conteúdo.

### Tests for User Story 3

- [X] T035 [P] [US3] Escrever testes pgTAP inicialmente falhos de formato por tipo, acesso autorizado, snapshots, imutabilidade pendente e unicidade idempotente em `supabase/tests/database/requests.test.sql`
- [X] T036 [P] [US3] Acrescentar jornada inicialmente falha de criação, edição, arquivamento, clique duplo e retry após resposta incerta em `tests/e2e/collaborator.spec.mjs`

### Implementation for User Story 3

- [X] T037 [US3] Criar `supabase/migrations/20260902000400_message_request_submission.sql` com constraints, políticas de insert/read-own e compatibilidade de `exclusao` legado para `arquivamento`
- [X] T038 [US3] Implementar `submitMessageRequest` com snapshots, chave idempotente reutilizável e recuperação da solicitação existente após conflito em `api.js`
- [X] T039 [P] [US3] Criar formulários acessíveis de proposta e confirmação de arquivamento com validação/estado em andamento em `views/modal-view.mjs`
- [X] T040 [US3] Integrar ações de colaborador, preservação de entrada, bloqueio de submissão duplicada e mensagens de “enviado para revisão” em `app.js`

**Checkpoint**: A proposta fica consultável como pendente e a biblioteca publicada permanece idêntica antes da revisão.

---

## Phase 6: User Story 4 - Revisar solicitações e administrar conteúdo (Priority: P2)

**Goal**: Dar ao superadministrador revisão atômica e gestão direta auditável de mensagens e categorias.

**Independent Test**: Aprovar e rejeitar propostas, incluindo duas aprovações concorrentes, depois criar/editar/arquivar/restaurar conteúdo diretamente e verificar estado publicado, identificadores e atividade.

### Tests for User Story 4

- [X] T041 [P] [US4] Ampliar `supabase/tests/database/requests.test.sql` com aprovação única concorrente, rejeição motivada, estados finais imutáveis e aplicação dos três tipos
- [X] T042 [P] [US4] Ampliar `supabase/tests/database/archiving.test.sql` com restauração pelo mesmo ID, favoritos/recentes preservados e bloqueio de categoria não vazia
- [X] T043 [P] [US4] Ampliar `supabase/tests/database/audit.test.sql` com auditoria transacional de criação, edição, arquivamento, restauração, aprovação e rejeição
- [X] T044 [P] [US4] Escrever jornadas inicialmente falhas de revisão, conflito concorrente e gestão editorial em `tests/e2e/superadmin.spec.mjs`

### Implementation for User Story 4

- [X] T045 [US4] Criar `supabase/migrations/20260902000500_content_review_and_lifecycle.sql` com RPCs bloqueantes de aprovação/rejeição, arquivamento/restauração, guarda de categoria e auditoria na mesma transação
- [X] T046 [US4] Implementar `listPendingRequests`, `approveMessageRequest`, `rejectMessageRequest`, operações de mensagem/categoria e `listArchivedContent` em `api.js`
- [X] T047 [P] [US4] Criar abas e coleções de mensagens, categorias, solicitações e conteúdo arquivado em `views/admin-view.mjs`
- [X] T048 [P] [US4] Criar diálogos de revisão, motivo de rejeição, conflito, arquivamento e restauração em `views/modal-view.mjs`
- [X] T049 [US4] Integrar administração exclusiva do superadministrador, invalidação do acesso afetado e recarga após conflito em `app.js`

**Checkpoint**: A US4 é validável com dados seedados e superadministrador, e nenhuma operação editorial depende de um papel intermediário.

---

## Phase 7: User Story 5 - Administrar estrutura, contas e liberações (Priority: P3)

**Goal**: Permitir gestão central de contas, acessos, categorias, vínculos e senhas temporárias, além da recuperação operacional do conteúdo.

**Independent Test**: Criar uma conta, conceder apenas um acesso, entrar como ela, remover o vínculo, desativar/reativar o acesso e validar que a visibilidade acompanha cada transição; redefinir a senha sem registrá-la em logs.

### Tests for User Story 5

- [X] T050 [P] [US5] Ampliar a matriz de acesso, vínculo, ativação e remoção pelo superadministrador em `supabase/tests/database/authorization.test.sql`
- [X] T051 [P] [US5] Ampliar jornadas de conta, senha temporária, acesso, vínculo, categoria e restauração em `tests/e2e/superadmin.spec.mjs`

### Implementation for User Story 5

- [X] T052 [US5] Atualizar `supabase/functions/admin-create-user/index.ts` para aceitar somente colaborador/superadmin, vários `accessIds`, validar o chamador e eliminar `isAdminLocal` do corpo e da gravação
- [X] T053 [P] [US5] Atualizar `supabase/functions/admin-reset-password/index.ts` para validar conta-alvo, retornar a senha temporária uma única vez e impedir que senha/token apareça em logs ou respostas de erro
- [X] T054 [US5] Implementar `createAccess`, `setAccessActive`, `listProfiles`, `listAccessUsers`, `setAccessMembership`, `adminCreateUser` e `adminResetPassword` conforme o contrato em `api.js`
- [X] T055 [P] [US5] Completar as telas responsivas de acessos, contas, vínculos, categorias e arquivados em `views/admin-view.mjs`
- [X] T056 [P] [US5] Completar formulários de conta, senha temporária, acesso, vínculo e categoria em `views/modal-view.mjs`
- [X] T057 [US5] Integrar estados, invalidação seletiva, confirmação e falhas acionáveis da gestão estrutural em `app.js`

**Checkpoint**: Os cinco incrementos funcionam, e somente o superadministrador consegue alterar estrutura, contas ou liberações.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Fechar acessibilidade, responsividade, desempenho, indexação, operação e evidências que atravessam todas as histórias.

- [X] T058 [P] Escrever testes axe inicialmente falhos para login, biblioteca, administração e todos os diálogos exercitados em `tests/e2e/accessibility.spec.mjs`
- [X] T059 [P] Escrever testes inicialmente falhos de teclado, foco modal, temas e ausência de overflow a 360 px em `tests/e2e/mobile.spec.mjs`
- [X] T060 Corrigir semântica, nomes acessíveis, foco visível, live regions e ciclo modal encontrados por T058–T059 em `views/library-view.mjs`, `views/admin-view.mjs`, `views/modal-view.mjs`, `ui/focus.mjs` e `index.html`
- [X] T061 Ajustar layout responsivo, cartões administrativos, temas claro/escuro e redução de movimento em `index.html`, `views/library-view.mjs`, `views/admin-view.mjs` e `views/modal-view.mjs`
- [X] T062 Criar a massa de 100 contas, 10 acessos e 1.000 mensagens em `tests/fixtures/scale.mjs` e completar as asserções de percentil/transferência em `tests/e2e/performance.spec.mjs`
- [X] T063 Otimizar somente regressões comprovadas por T062 no carregamento seletivo e renderização em `api.js`, `app.js`, `domain/library.mjs` e `views/library-view.mjs`
- [X] T064 [P] Criar `vercel.json` com CSP, `X-Robots-Tag`, `nosniff`, referrer policy, proteção contra framing e cache compatível, além da meta `robots` em `index.html`
- [X] T065 Regenerar o snapshot consolidado a partir das migrações em `supabase/schema.sql` e verificar que ele não reintroduz exclusão física, `user` ou capacidade de admin local
- [ ] T066 Executar todos os comandos de `specs/001-evoluir-biblioteca-mensagens/quickstart.md` localmente e registrar resultados, versões e desvios corrigidos em `specs/001-evoluir-biblioteca-mensagens/validation-results.md`
- [ ] T067 Conduzir o teste moderado com 20 colaboradores e registrar somente métricas agregadas de SC-001/SC-010 em `specs/001-evoluir-biblioteca-mensagens/usability-results.md`
- [X] T068 Preparar checklist de preview, backup, `db push --dry-run`, identificador do deploy anterior, smoke test e rollback em `specs/001-evoluir-biblioteca-mensagens/release-checklist.md`

**Checkpoint**: `npm run test:all` passa, o quickstart está evidenciado e o preview satisfaz segurança, desempenho, acessibilidade e não indexação antes de qualquer autorização de produção.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências; T003 depende de T002 e do projeto Supabase vinculado com segurança.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias; testes T008–T011 vêm antes das migrações/módulos que os fazem passar.
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da fundação. Podem avançar em paralelo após T020, mas o MVP implantável requer ambas porque conteúdo interno exige autenticação.
- **US3 (Phase 5)**: depende da autorização da US2 e usa a biblioteca da US1 para selecionar alvos.
- **US4 (Phase 6)**: depende das solicitações da US3 para revisão; a gestão editorial direta pode ser testada com seed independentemente.
- **US5 (Phase 7)**: depende da autorização fundamental e da área administrativa da US4; não depende da aprovação para gerenciar contas/acessos.
- **Polish (Phase 8)**: depende de todas as histórias incluídas no release; T063 só ocorre se T062 comprovar regressão.

### User Story Dependencies

```text
Setup → Foundation ─┬→ US1 (Library & Copy) ─┐
                    └→ US2 (Auth & Access) ──┴→ US3 (Requests) → US4 (Review & Content)
                                             └────────────────→ US5 (Accounts & Accesses)
US1 + US2 + US3 + US4 + US5 → Polish & Release Gate
```

- **US1 (P1)**: testável com sessão/fixture preparada; não exige telas administrativas.
- **US2 (P1)**: testável apenas com login e dados de dois acessos; não exige solicitações.
- **US3 (P2)**: exige US1/US2 para escolher mensagens e impor acesso; não exige que a revisão esteja pronta.
- **US4 (P2)**: revisão exige US3; gestão editorial direta funciona com dados seedados.
- **US5 (P3)**: reutiliza a área exclusiva do superadministrador, mas seus cenários de conta/vínculo são independentes da fila de revisão.

### Within Each User Story

1. Escrever o teste e confirmar que falha pelo comportamento ausente.
2. Aplicar modelo/migração antes da camada de dados que o consome.
3. Implementar camada de dados antes da integração no orquestrador.
4. Implementar módulos/view antes de conectá-los a `app.js`.
5. Executar testes unitários e de banco antes dos testes de navegador.
6. Concluir o critério independente antes de iniciar a próxima prioridade.

### Parallel Opportunities

- T002, T004, T005 e T006 podem avançar em paralelo após T001.
- T008, T009, T010 e T011 escrevem suítes diferentes em paralelo.
- T015, T016, T017, T019 e T020 criam módulos independentes após os contratos da fundação.
- Em US1, T021–T023 podem ser escritos em paralelo; T024 e T026 alteram módulos distintos.
- US1 e US2 podem ser desenvolvidas por pessoas diferentes após a fundação, coordenando somente `api.js`/`app.js` nos pontos de integração.
- Em US4, os três arquivos pgTAP e a jornada E2E podem ser ampliados em paralelo; T047 e T048 criam views distintas.
- Em US5, Edge Function de senha e views administrativas/formulários podem avançar em paralelo.
- T058, T059 e T064 cobrem arquivos de teste/configuração distintos no início do fechamento transversal.

---

## Parallel Examples

### User Story 1

```text
Task T021: testes unitários em tests/clipboard.test.mjs
Task T022: jornada funcional em tests/e2e/collaborator.spec.mjs
Task T023: cenário de desempenho em tests/e2e/performance.spec.mjs
```

### User Story 2

```text
Task T029: jornada de autenticação em tests/e2e/authentication.spec.mjs
Task T030: matriz direta de autorização em supabase/tests/database/authorization.test.sql
```

### User Story 4

```text
Task T041: concorrência/revisão em supabase/tests/database/requests.test.sql
Task T042: ciclo de arquivamento em supabase/tests/database/archiving.test.sql
Task T043: atividade imutável em supabase/tests/database/audit.test.sql
Task T044: jornada do superadministrador em tests/e2e/superadmin.spec.mjs
```

---

## Requirements Traceability

| Requirement range | Primary tasks |
|-------------------|---------------|
| FR-001–FR-005 | T008, T012–T015, T029–T034, T050–T057 |
| FR-006–FR-012 | T016, T021–T028 |
| FR-013–FR-018 | T017, T035–T046 |
| FR-019–FR-023 | T042–T057 |
| FR-024–FR-026 | T008, T018, T030, T035–T040, T045–T057 |
| FR-027–FR-028 | T019–T020, T058–T061 |
| FR-029 | T003, T012–T014, T065–T068 |
| FR-030 | T028, T064, T066, T068 |

---

## Implementation Strategy

### MVP First

O menor release seguro é **Foundation + US1 + US2**. Embora US1 entregue o valor central, ela não deve ser publicada isoladamente porque FR-001 exige autenticação antes de qualquer conteúdo interno.

1. Concluir Setup e Foundation.
2. Entregar US1 com fixture autenticada e validar busca/cópia independentemente.
3. Entregar US2 e validar a matriz de isolamento.
4. Executar o subconjunto transversal de segurança, acessibilidade, 360 px e performance que afeta US1/US2.
5. Parar para revisão antes de preview/deploy.

### Incremental Delivery

1. **MVP**: biblioteca, cópia, autenticação e acessos autorizados.
2. **Incremento 2**: solicitações sem publicação direta.
3. **Incremento 3**: revisão e gestão editorial central.
4. **Incremento 4**: contas, acessos, liberações e recuperação operacional.
5. **Release gate**: suítes completas, teste moderado, preview, backup e rollback.

### Execution Discipline

- Não editar migração já aplicada; criar migração compensatória revisada.
- Não executar `db reset --linked`, exclusão física em produção ou deploy sem autorização explícita.
- Manter `api.js` como única importação do cliente Supabase.
- Não registrar senha temporária, token ou conteúdo integral de mensagem em logs/auditoria.
- Marcar cada checkbox somente após o teste/critério descrito produzir evidência verificável.

---

## Phase 9: Convergence

- [X] T069 CRITICAL Remover os renderizadores administrativos inalcançáveis de `app.js` e consolidar em `api.js`/`app.js` as interfaces vigentes de `contracts/data-access.md`, eliminando aliases e regras duplicadas com testes de regressão, per Constitution III e plan: structure decision (contradicts)
- [X] T070 Corrigir a ação “Arquivar” da biblioteca para usar o ciclo recuperável de mensagem, remover `deleteMensagem`/`deleteCategoria` e qualquer exclusão física do fluxo normal, e cobrir biblioteca e administração em teste E2E, per FR-020 e UI Archive/Restore (contradicts)
- [X] T071 Implementar estado de confirmação em andamento que desabilite confirmação, cancelamento e Escape até a operação terminar, com regressão automatizada de clique duplo, per FR-026 (partial)
- [X] T072 Centralizar no orquestrador os comportamentos seguros para `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`, `NETWORK` e `UNKNOWN`, preservando entrada e recarregando/limpando somente o estado previsto pelo contrato, per FR-025 e UI Errors/Progress (partial)
- [X] T073 Remover a persistência da biblioteca completa em `sessionStorage`, manter o cache de conteúdo somente em memória por acesso e revalidar SC-002/SC-003 com a massa de escala, per plan: active-library cache e data-access contract (unrequested)
- [X] T074 Alinhar e fixar `@supabase/supabase-js` 2.112.4 no manifesto, lockfile e bundle servido localmente, verificando inicialização e suítes de autenticação/biblioteca, per plan: primary dependencies (contradicts)
- [ ] T075 Após autorização explícita, executar e registrar o gate de preview/release de `release-checklist.md`, incluindo ambiente não produtivo, headers/noindex reais, backup confirmado, `migration list --linked`, `db push --linked --dry-run`, identificadores de deploy, smoke e rollback, per plan: verification and release e FR-029/FR-030 (missing)
