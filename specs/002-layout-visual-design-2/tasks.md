---

description: "Task list for feature 002 — Nova identidade visual DentalPlus (Design 2.0)"
---

# Tasks: Nova identidade visual DentalPlus (Design 2.0)

**Input**: Design documents from `/specs/002-layout-visual-design-2/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluídos. A constituição v3.0.0 (princípio V) exige testes automatizados para lógica pura, regressões,
RLS/funções, responsividade e acessibilidade, e o plano definiu fotos de referência (`@visual`), pgTAP e E2E por etapa.

**Organization**: tarefas agrupadas por história de usuário. Cada fase de história termina com a publicação da etapa
correspondente (ramo → prévia na Vercel → aprovação do responsável → `main`), conforme [quickstart.md](quickstart.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história de usuário da [spec.md](spec.md) (US1 a US7)
- Caminhos relativos à raiz do repositório (aplicação estática sem `src/`)

## Mapa história → etapa de publicação

| História | Prioridade | Etapa | Banco |
|---|---|---|---|
| Setup + Foundational | — | 0 Preparação | Não |
| US1 Biblioteca, faixa, login, Visão geral | P1 | 1 | Não |
| US2 Janelas | P1 | 2 | Não |
| US3 Administração | P2 | 3 | Não |
| US4 Variáveis | P2 | 4 | Não |
| US5 Revisão com ajustes, retorno e históricos | P2 | 5 | Sim |
| US6 Estatísticas | P3 | 6 | Sim |
| US7 Atalhos e contadores | P3 | 4 (junto com US4 quando pronta) | Não |

---

## Phase 1: Setup (Etapa 0 — Preparação)

**Purpose**: base medida e insumos da identidade (fontes, imagens, cache) sem mudança visível

- [X] T001 Criar o ramo `002-etapa-0-preparacao` a partir de `master`; rodar `npm run test:perf` na versão atual e registrar em `specs/002-layout-visual-design-2/validation-results.md` (arquivo novo) os valores de `dp-library-ready`, `dp-search-ready` e `dp-copy-ready` como linha de base do SC-004
- [X] T002 [P] Adicionar `@fontsource-variable/sora@5.3.0` e `@fontsource-variable/manrope@5.3.0` como `devDependencies` com versão exata em `package.json` e atualizar `package-lock.json` com `npm install --save-dev --save-exact`
- [X] T003 Copiar `node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2` e `node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2` para `vendor/fonts/` com os mesmos nomes (depende de T002)
- [X] T004 [P] Criar `assets/dp2-logo.png` (de `DESIGN - 2.0/assets/dentalplus-logo.png`), `assets/dp2-logo-on-brand.png` (de `dentalplus-logo-dark.png`), `assets/dp2-favicon.png` (de `favicon.png`) e `assets/dp2-selo-192.png` (selo de `DESIGN - 2.0/assets/dentalplus-selo.png` reduzido a 192×192 px com `System.Drawing` em alta qualidade); não remover os arquivos atuais nesta etapa
- [X] T005 [P] Alterar `vercel.json`: `Cache-Control: public, max-age=0, must-revalidate` para `/(.*)`, `/domain/(.*)`, `/ui/(.*)`, `/views/(.*)` e `/styles/(.*)`; manter `public, max-age=3600, stale-while-revalidate=86400` só para `/vendor/(.*)` e `/assets/(.*)` (R4)
- [X] T006 [P] Estender `tests/security-headers.test.mjs` para exigir revalidação (`max-age=0, must-revalidate`) em código raiz, `/domain/`, `/ui/`, `/views/` e `/styles/`, e cache longo somente em `/vendor/` e `/assets/`
- [X] T007 Estender `tests/dependency-pin.test.mjs` para verificar que as versões das duas fontes em `package.json` são exatas e que `vendor/fonts/*.woff2` tem o mesmo SHA-256 dos arquivos em `node_modules` (depende de T003)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: fonte única de tokens e infraestrutura de fotos de referência, usadas por todas as histórias visuais

**⚠️ CRITICAL**: nenhuma história visual começa antes desta fase

- [X] T008 Criar `styles/design-system.css` com `@font-face` de `vendor/fonts/` (`font-display: swap`), todos os tokens de `specs/002-layout-visual-design-2/contracts/design-tokens.md` (fixando `--dp-control-border`, `--dp-star-off` e `--dp-success-ink` em tons que atinjam os limites do contrato), estilos base (`body`, títulos, `:focus-visible` com `--dp-cyan-500`, `prefers-reduced-motion`) e as classes `dp-band`, `dp-nav`, `dp-pill`, `dp-btn-primary`, `dp-btn-accent`, `dp-btn-secondary`, `dp-btn-ghost`, `dp-btn-icon`, `dp-btn-danger`, `dp-field`, `dp-list`, `dp-list-item`, `dp-reading`, `dp-panel`, `dp-table`, `dp-dialog`, `dp-chip`, `dp-highlight`, `dp-kicker`; os estilos base (tipografia, cor e fundo do corpo) ficam sob a classe `.dp-app`, aplicada ao contêiner raiz somente na Etapa 1, para que a Etapa 0 não mude nada na tela
- [X] T009 [P] Criar `tests/design-tokens.test.mjs`: ler `styles/design-system.css`, calcular contraste WCAG de todos os pares do contrato (≥ 4,5:1 texto; ≥ 3:1 para `--dp-control-border`, `--dp-star-off` e foco sobre `--dp-surface`), falhar se houver seletor/token de tema escuro e, para os arquivos da lista `MIGRATED_FILES` (inicialmente vazia), falhar se houver literal hexadecimal de cor
- [X] T010 Incluir em `index.html` `<link rel="stylesheet" href="styles/design-system.css">` (o `preload` da Manrope entra na Etapa 1, com T027, porque na Etapa 0 a fonte ainda não é usada e o download antecipado atrasa a carga em 3G) e conferir na prévia, com as ferramentas do navegador, que o CSS e as fontes carregam sem nenhuma mudança visível (a folha só aplica estilos sob `.dp-app`) (depende de T008)
- [X] T011 [P] Acrescentar em `ui/icons.mjs` os ícones do Design 2.0 usados nas próximas etapas: `grid`, `clock`, `lock`, `search`, `plus`, `starOn`, `starOff`, `close`, `logout`, `chevronDown`, `send`, todos com `aria-hidden="true" focusable="false"`
- [X] T012 Configurar em `playwright.config.mjs` `expect.toHaveScreenshot` com `maxDiffPixelRatio: 0.01` e `animations: 'disabled'`; criar `tests/e2e/helpers/visual.mjs` com `prepareVisual(page)` (relógio fixo em 2026-09-11 14:00 America/Sao_Paulo via `page.clock.setFixedTime`, espera de fontes com `document.fonts.ready`, máscara para contagens voláteis)
- [X] T013 Adicionar ao `package.json` o script `test:visual` (`playwright test --grep @visual`) e mudar `test:e2e` para `--grep-invert "@a11y|@perf|@visual"`; incluir `npm run test:visual` em `test:all`
- [ ] T014 Publicar a Etapa 0: `npm run test:unit` verde, enviar o ramo, conferir na prévia os cabeçalhos de `/views/library-view.mjs` e `/styles/design-system.css`, obter aprovação do responsável, integrar ao `main`, enviar aos dois repositórios e confirmar os cabeçalhos em `https://padroes-de-atendimento.vercel.app` (quickstart, Etapa 0); em seguida ensaiar a reversão — Instant Rollback na Vercel, cronometrar, promover de volta o deploy da etapa — e registrar o tempo em `validation-results.md` (SC-011), aproveitando que esta etapa não muda nada na tela

**Checkpoint**: tokens, fontes, imagens e cache prontos em produção, sem mudança visível

---

## Phase 3: User Story 1 - Colaborador encontra e copia mensagens na nova Biblioteca (Priority: P1) 🎯 MVP

**Goal**: faixa da marca, pílulas, login, Biblioteca em lista com leitura ao lado e Visão geral no Design 2.0, sem tema escuro nem barra lateral, com aviso de novidades (Etapa 1)

**Independent Test**: com as etapas seguintes não publicadas, entrar como colaborador, trocar acesso, buscar, filtrar por pílula, ordenar, favoritar, selecionar, ler e copiar; entrar como superadmin e abrir Administração pelo novo menu; repetir a 360 px

### Tests for User Story 1 ⚠️

- [X] T015 [P] [US1] Criar `tests/greeting.test.mjs` para `domain/greeting.mjs`: "Bom dia" de 05:00 a 11:59, "Boa tarde" de 12:00 a 17:59, "Boa noite" nos demais horários, sempre no fuso America/Sao_Paulo, com o primeiro nome da pessoa
- [X] T016 [P] [US1] Reescrever `tests/library-view.test.mjs`: lista `<ul>` com um `<button>` por mensagem e `aria-current="true"` só na selecionada; região "Leitura da mensagem" com Copiar e as ações por papel; item da lista liga ao manipulador de seleção, e não ao de cópia; estado vazio com orientação
- [X] T017 [P] [US1] Criar `tests/e2e/library-layout.spec.mjs` (substitui `tests/e2e/card-layout.spec.mjs`, que deve ser removido): a partir de 900 px lista e painel lado a lado e ações dentro do painel; a 360 px o painel abre como diálogo e devolve o foco ao item; sem rolagem horizontal da página
- [X] T018 [P] [US1] Atualizar `tests/data-access-contract.test.mjs`: chaves `localStorage` esperadas `['dp_active_acesso', 'dp_novidades']`; nenhuma escrita de `dp_darkmode` ou `dp_sidebar_collapsed`

### Implementation for User Story 1

- [X] T019 [P] [US1] Criar `domain/greeting.mjs` com `greetingFor(date, fullName)` usando `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`
- [X] T020 [P] [US1] Criar `domain/release-notes.mjs` exportando `CURRENT_RELEASE` (`'etapa-1'`) e `RELEASE_NOTES` com 2 a 3 frases da Etapa 1 (novo visual; clicar na mensagem abre a leitura; copiar pelo botão Copiar)
- [X] T021 [US1] Em `app.js`, reescrever `theme()` com paleta clara única espelhando os tokens de `styles/design-system.css`; remover `darkMode`, `toggleDarkMode`, `darkModeIcon`, `sidebarCollapsed`, `toggleSidebarCollapsed` e a leitura de `dp_darkmode`/`dp_sidebar_collapsed` em `mount()` (apagando essas chaves com `try/catch`); trocar `categoryColor()` pela alternância `#16336E`/`#09679F` pela ordem da categoria no acesso (R16)
- [X] T022 [US1] Criar `views/shell-view.mjs` com `renderBrandBand(model, register)` (selo `assets/dp2-selo-192.png`, logo `assets/dp2-logo-on-brand.png`, navegação com `aria-current="page"`, contagem de pendentes com texto acessível, seletor "Acesso ativo", botão de iniciais abrindo menu com nome, papel e Sair), `renderCategoryPills(model, register)` ("Todas", categorias ativas, "Favoritas", com `aria-pressed` e contagem), `renderLoginView(model, register)` (tela 01, com campo de senha com botão mostrar/ocultar usando `aria-pressed` e nome acessível, e a explicação expansível de "Esqueceu a senha? Fale com um administrador"), `renderNoAccessView(model, register)` (movida de `views/library-view.mjs`) e `renderReleaseNotesDialog(model, register)`
- [X] T023 [US1] Em `app.js`, substituir `viewSidebar()` e `viewTopHeader()` por chamadas a `views/shell-view.mjs` dentro de `view(v)`, usar `renderLoginView` na tela de login, remover `viewSidebar()` e acrescentar em `renderVals()` o modelo da faixa, das pílulas (incluindo o filtro de favoritas) e da saudação (`domain/greeting.mjs`); aplicar a classe `dp-app` ao contêiner raiz em `view(v)`, ativando os estilos base do design system
- [X] T024 [US1] Em `app.js`, criar o estado `selectedMessageId` e os manipuladores de seleção: a partir de 900 px, selecionar a primeira mensagem visível quando nada estiver escolhido ou a escolhida sair do resultado; abaixo de 900 px, abrir o painel como diálogo com `activateDialogFocus` de `ui/focus.mjs`; remover a cópia por clique no item (`onCardClick`/`onCardKeyDown`) e expor ao modelo os dados completos da mensagem selecionada
- [X] T025 [US1] Reescrever `renderLibraryView()` em `views/library-view.mjs` com classes de `styles/design-system.css`: resumo e controles de ordenação, lista `dp-list` com `dp-list-item`, região "Leitura da mensagem" (`dp-reading`) com categoria, título, texto, etiquetas, usos, favorito, Copiar e ações por papel, orientação de estado vazio e "Carregar mais"; sem literais de cor
- [X] T026 [US1] Reescrever `renderLibraryOverview()` em `views/library-view.mjs` no formato da tela 02 (seções "Favoritas" e "Copiadas recentemente" em linhas que copiam ao clicar), com classes do design system
- [X] T027 [US1] Em `index.html`, acrescentar `<link rel="preload" href="vendor/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`, trocar favicon para `assets/dp2-favicon.png`, manter `theme-color` `#16336E` e remover do `<style>` embutido somente as regras da barra lateral (`.dp-sidebar*`) e as de tema; manter `.dp-card*`, `.dp-admin-card`, `.dp-table-row` e `.dp-tooltip*` até a Etapa 3, porque `views/admin-view.mjs` ainda depende delas; preservar `.sr-only` e `#copy-status`
- [X] T028 [US1] Em `app.js`, abrir `renderReleaseNotesDialog` depois do login (após o aviso de solicitações pendentes, se houver) quando `localStorage.dp_novidades !== CURRENT_RELEASE`, e gravar `CURRENT_RELEASE` em "Entendi"
- [X] T029 [US1] Em `app.js`, aplicar as classes do design system à paleta Ctrl K e às notificações (toasts), mantendo o comportamento atual
- [X] T030 [US1] Adaptar à nova interface `tests/e2e/authentication.spec.mjs`, `tests/e2e/collaborator.spec.mjs`, `tests/e2e/superadmin.spec.mjs` (trechos da Biblioteca), `tests/e2e/performance.spec.mjs` (cópia pelo botão do painel, marcas `dp-*` inalteradas), `tests/e2e/mobile.spec.mjs` (remover o teste de alternância de tema; manter o de ausência de rolagem) e `tests/e2e/accessibility.spec.mjs` (login, Biblioteca com painel, leitura no celular, Visão geral, aviso de novidades), incluindo um caso que alterna mostrar/ocultar a senha pelo teclado
- [X] T031 [US1] Remover os projetos `desktop-dark` e `mobile-360-dark` de `playwright.config.mjs`
- [X] T032 [US1] Criar `tests/e2e/visual.spec.mjs` (`@visual`, projetos `desktop-light` e `mobile-360-light`) com fotos de login, Biblioteca com mensagem selecionada, Biblioteca vazia, leitura no celular, Visão geral e aviso de novidades; gerar as fotos com `--update-snapshots` e revisá-las contra `DESIGN - 2.0/Biblioteca DentalPlus - 8 telas.dc.html`
- [X] T033 [US1] Incluir `app.js`, `views/shell-view.mjs` e `views/library-view.mjs` em `MIGRATED_FILES` de `tests/design-tokens.test.mjs` e remover os literais de cor restantes nesses arquivos
- [X] T034 [US1] Executar a verificação local completa do quickstart (`test:unit`, `test:db`, `test:e2e`, `test:a11y`, `test:visual`, `test:perf`), comparar com a linha de base de T001 (≤ 10% de piora) e registrar em `specs/002-layout-visual-design-2/validation-results.md`
- [ ] T035 [US1] Publicar a Etapa 1: ramo `002-etapa-1-biblioteca`, revisão lado a lado na prévia (SC-002, somente navegar, buscar e copiar), aprovação do responsável, integração ao `main`, envio aos dois repositórios, verificação em produção, conferência manual por teclado (constituição, portão 4) e aviso à equipe sobre a nova forma de copiar

**Checkpoint**: nova identidade na Biblioteca, faixa, login e Visão geral em produção (MVP)

---

## Phase 4: User Story 2 - Janelas de copiar, solicitar e confirmar com o novo visual (Priority: P1)

**Goal**: todas as janelas com cabeçalho da marca e o mesmo comportamento (Etapa 2)

**Independent Test**: abrir cada janela a partir da Biblioteca e da Administração, preencher, enviar, cancelar e fechar com Escape; foco inicial e de retorno corretos

### Tests for User Story 2 ⚠️

- [X] T036 [P] [US2] Estender `tests/modal-view.test.mjs`: todo diálogo tem cabeçalho `dp-dialog` com título que é o nome acessível, ação principal à direita, "Fechar"/"Cancelar" presente, estados ocupados e campos inválidos inalterados

### Implementation for User Story 2

- [X] T037 [US2] Reescrever em `views/modal-view.mjs` `renderMessageRequestModal`, `renderMessageEditorModal`, `renderAdminConfirmationModal`, `renderRequestReviewModal` e `renderStructuralModals` no padrão das telas 04 e 05 (cabeçalho `--dp-band-gradient`, corpo claro, ações à direita), sem literais de cor
- [X] T038 [US2] Em `app.js` (`viewModals()`), aplicar o mesmo padrão à janela "Visualizar" (categoria e usos no cabeçalho, "Copiar mensagem"), ao aviso de solicitações pendentes e à janela de senha temporária
- [X] T039 [US2] Atualizar `RELEASE_NOTES`/`CURRENT_RELEASE` em `domain/release-notes.mjs` para a Etapa 2
- [X] T040 [US2] Acrescentar fotos de cada janela em `tests/e2e/visual.spec.mjs`, auditorias axe das janelas em `tests/e2e/accessibility.spec.mjs` e `views/modal-view.mjs` em `MIGRATED_FILES` de `tests/design-tokens.test.mjs`
- [ ] T041 [US2] Verificação local completa e publicação da Etapa 2 (ramo `002-etapa-2-janelas`, prévia, aprovação, `main`, verificação em produção)

**Checkpoint**: US1 e US2 funcionando juntas

---

## Phase 5: User Story 3 - Superadministrador usa a Administração redesenhada (Priority: P2)

**Goal**: seções administrativas com cabeçalho na faixa, pílulas e lista/tabela com painel lateral; "Conceder acesso" (Etapa 3)

**Independent Test**: como superadmin, aprovar e rejeitar, criar/editar/arquivar/restaurar mensagem e categoria, criar acesso e conta, ajustar vínculos, redefinir senha e usar "Conceder acesso"

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Criar `tests/admin-view.test.mjs`: pílulas "Solicitações", "Mensagens", "Categorias", "Arquivados", "Acessos" e "Contas" com a ativa marcada; painel da solicitação com antes/proposto, "Rejeitar com motivo" e "Aprovar e publicar"; "Conceder acesso" apenas para contas sem vínculo e ligado ao manipulador de vínculos

### Implementation for User Story 3

- [X] T043 [US3] Em `app.js`, criar o estado `selectedRequestId` e o modelo do painel lateral de solicitações em `renderVals()`, reutilizando `approveReviewedRequest()` e `rejectReviewedRequest()`; abaixo de 720 px o painel fica abaixo da lista
- [X] T044 [US3] Reescrever `renderAdminView()` em `views/admin-view.mjs` (telas 06, 07 e 08): título e resumo da seção no cabeçalho, pílulas de seção, Solicitações em lista + painel, Mensagens em tabela + painel de categorias com contagem, Categorias, Arquivados, Acessos e Contas em tabela + painel de acessos com situação, "Sem vínculo" e "Conceder acesso" (abre `openMembershipModal(userId)`), tabelas viram cartões abaixo de 720 px; remover de `index.html` as regras `.dp-card*`, `.dp-admin-card`, `.dp-table-row` e `.dp-tooltip*`, agora substituídas pelo design system
- [X] T045 [US3] Adaptar `tests/e2e/superadmin.spec.mjs` e `tests/e2e/mobile.spec.mjs` (Contas a 360 px) à nova Administração; acrescentar fotos das seções em `tests/e2e/visual.spec.mjs`, auditorias em `tests/e2e/accessibility.spec.mjs` e `views/admin-view.mjs` em `MIGRATED_FILES`
- [ ] T046 [US3] Atualizar `domain/release-notes.mjs` para a Etapa 3, verificação local completa e publicação da Etapa 3 (ramo `002-etapa-3-administracao`, prévia sem gravar dados, aprovação, `main`)

**Checkpoint**: todas as telas existentes no Design 2.0

---

## Phase 6: User Story 4 - Colaborador preenche variáveis antes de copiar (Priority: P2)

**Goal**: campos para `[VARIÁVEIS]`, texto destacado, "Copiar preenchida" e "Texto original", atalhos de inserção (Etapa 4)

**Independent Test**: selecionar mensagem com `[NOME]` e `[DATA]`, preencher, copiar preenchida e colar sem colchetes; "Texto original" intacto; vazias mantidas com aviso

### Tests for User Story 4 ⚠️

- [X] T047 [P] [US4] Criar `tests/variables.test.mjs` para `domain/variables.mjs`: reconhece `[NOME]`, `[DATA_VENCIMENTO]`, `[ENDEREÇO]`; ignora `[ver anexo]`; um campo por variável repetida na ordem de aparição; rótulo "Data vencimento"; preenchimento substitui todas as ocorrências e mantém as vazias; contagem de preenchidas e vazias
- [X] T048 [P] [US4] Acrescentar em `supabase/seed.sql` e `tests/fixtures/data.mjs` uma mensagem de teste com `[NOME]` duas vezes e `[DATA]` uma vez no acesso do colaborador de teste
- [X] T049 [P] [US4] Criar `tests/e2e/variables.spec.mjs`: preencher, "Copiar preenchida", ler a área de transferência (permissão `clipboard-read`), conferir substituição e aviso de vazias, "Texto original" intacto e valores descartados ao trocar de mensagem

### Implementation for User Story 4

- [X] T050 [P] [US4] Criar `domain/variables.mjs` com `extractVariables(content)`, `variableLabel(name)` e `fillVariables(content, values)` usando `/\[([\p{Lu}\p{N}_]+)\]/gu`
- [X] T051 [US4] Em `app.js`, criar o estado em memória `variableValues` limpo ao trocar `selectedMessageId`, fechar a janela "Visualizar" e em `logout()`; estender `copyMessage(msg, text = msg.conteudo)` para copiar o texto informado mantendo o mesmo registro de uso
- [X] T052 [US4] Em `views/library-view.mjs` (painel de leitura) e `views/modal-view.mjs` (janela "Visualizar"), renderizar um campo por variável, o texto com variáveis e valores em `dp-highlight`, "Copiar preenchida", "Texto original" e o estado "N variáveis preenchidas · M sem preencher"
- [X] T053 [US4] Em `views/modal-view.mjs` e `app.js`, acrescentar às janelas de solicitar e editar os botões "Inserir variável" `[NOME]`, `[DATA]` e `[VALOR]`, inserindo na posição do cursor do conteúdo
- [ ] T054 [US4] Acrescentar foto de mensagem com variáveis em `tests/e2e/visual.spec.mjs`, atualizar `domain/release-notes.mjs` para a Etapa 4, verificação local completa e publicação da Etapa 4 (incluindo a US7 se estiver concluída)

**Checkpoint**: variáveis em produção, sem mudança de banco

---

## Phase 7: User Story 5 - Administrador ajusta a sugestão e colaborador acompanha o retorno e o histórico (Priority: P2)

**Goal**: "Editar e aprovar", comentário da decisão, "Aprovada com ajustes", "Suas solicitações" e histórico com filtros (Etapa 5, com banco)

**Independent Test**: três pedidos de colaborador; aprovar sem ajuste com comentário, ajustar e aprovar, rejeitar com motivo; conferir retorno do colaborador e localizar os três no histórico com filtros

### Tests for User Story 5 ⚠️

- [ ] T055 [P] [US5] Criar `supabase/tests/database/request_review.test.sql` com os casos de `contracts/database-rpcs.md` (aprovar com e sem ajustes, comentário opcional/obrigatório, ajuste em arquivamento recusado, categoria arquivada recusada, `CONFLICT:REQUEST_STALE`, dupla decisão, backfill, colaborador lendo só as próprias linhas e comentários, chamada antiga só com `p_id` ainda válida)
- [ ] T056 [P] [US5] Estender `tests/logic.test.mjs` para `domain/requests.mjs`: rótulo "Aprovada com ajustes" para `aprovada` + `ajustada`, conversão do filtro `aprovada_com_ajustes` e rótulos de pedidos antigos sem versão publicada
- [ ] T057 [P] [US5] Criar `tests/e2e/requests.spec.mjs`: jornada completa do teste independente, incluindo rejeição sem motivo bloqueada, "Você enviou" x "Publicado", filtros do histórico e colaborador sem acesso a pedidos alheios

### Implementation for User Story 5

- [ ] T058 [US5] Criar `supabase/migrations/<AAAAMMDDHHMMSS>_request_review_adjustments.sql` conforme `data-model.md` e `contracts/database-rpcs.md`: colunas, constraints, FK, backfill, `drop function public.aprovar_solicitacao(uuid)` + nova versão com `p_ajustes jsonb default null` e `p_comentario text default null`, `rejeitar_solicitacao` gravando `comentario_revisao`, `revoke`/`grant`
- [ ] T059 [US5] Regenerar `supabase/schema.sql` a partir das migrações locais e ajustar `tests/schema-snapshot.test.mjs` às novas colunas (depende de T058)
- [ ] T060 [US5] Em `api.js`, estender `approveMessageRequest(requestId, { adjustments, comment })` e criar `listMyRequests`, `listRequestHistory` e `getRequestDetail` conforme `contracts/data-access.md`; atualizar as exportações esperadas em `tests/data-access-contract.test.mjs`
- [ ] T061 [P] [US5] Em `domain/requests.mjs`, acrescentar o rótulo por `status` + `ajustada` e a normalização de filtros; em `domain/api-errors.mjs`, mensagens para `VALIDATION:ADJUSTMENTS_NOT_ALLOWED` e `VALIDATION:REVIEW_COMMENT`
- [ ] T062 [US5] No painel de solicitações (`views/admin-view.mjs`) e em `app.js`, acrescentar o campo "Comentário" (obrigatório para rejeitar, até 500) e "Editar e aprovar" para criação/edição, com formulário editável validado como o editor de mensagens e chamada única a `approveMessageRequest`
- [ ] T063 [US5] Criar `views/requests-view.mjs` com `renderMyRequests` (lista paginada; detalhe com comentário e "Você enviou" x "Publicado") e `renderRequestHistory` (filtros de situação, tipo, acesso, solicitante e período; paginação); em `app.js`, item de navegação "Suas solicitações" para colaboradores, pílula "Histórico" na Administração, estados e carregamentos; texto das janelas de solicitação apontando para "Suas solicitações"
- [ ] T064 [US5] Acrescentar fotos de "Suas solicitações" com pedido ajustado e do histórico filtrado em `tests/e2e/visual.spec.mjs`, auditorias em `tests/e2e/accessibility.spec.mjs`, `views/requests-view.mjs` em `MIGRATED_FILES` e atualizar `domain/release-notes.mjs` para a Etapa 5
- [ ] T065 [US5] Ensaio com backup novo de produção (quickstart, "Etapas com banco"): backup com assinaturas no `LEIA-ME.md`, carga local, `migration up`, contagens e verificação por conta; registrar em `validation-results.md`
- [ ] T066 [US5] Com autorização explícita do responsável e regras exatas em `.claude/settings.local.json`: `db push --linked --dry-run`, revisão, `db push --linked --yes`; depois prévia do ramo `002-etapa-5-solicitacoes`, aprovação, `main`, verificação em produção e remoção das regras de produção do `settings.local.json`

**Checkpoint**: revisão com ajustes e históricos em produção

---

## Phase 8: User Story 6 - Estatísticas de uso na Visão geral, na Biblioteca e na Administração (Priority: P3)

**Goal**: registro de cada cópia, números próprios, média da equipe (≥ 3 pessoas), totais do superadmin, retenção de 12 meses (Etapa 6, com banco)

**Independent Test**: cópias com contas do mesmo acesso; cada uma vê só os próprios números; média só com ≥ 3 colaboradores ativos; totais do superadmin batem

### Tests for User Story 6 ⚠️

- [ ] T067 [P] [US6] Criar `supabase/tests/database/usage_stats.test.sql` com os casos de `contracts/database-rpcs.md` (inserção pela função de uso, sem escrita direta, sem leitura de linhas alheias, média nula com < 3 colaboradores, virada do dia em São Paulo, estatísticas de admin negadas a colaborador, job de retenção agendado)
- [ ] T068 [P] [US6] Garantir em `supabase/seed.sql` e `tests/fixtures/data.mjs` um acesso com 3 colaboradores ativos e outro com menos de 3, com credenciais de teste para o roteiro de duas contas
- [ ] T069 [P] [US6] Criar `tests/e2e/usage-stats.spec.mjs`: "Copiadas hoje" após cópias, média presente/ausente conforme o acesso, números da mensagem no painel e totais do superadmin (SC-009)

### Implementation for User Story 6

- [ ] T070 [US6] Criar `supabase/migrations/<AAAAMMDDHHMMSS>_usage_statistics.sql`: `registros_copia` com índices e RLS, `registrar_uso_mensagem` recriada com a inserção, `estatisticas_uso`, `estatisticas_mensagem`, `estatisticas_admin`, `create extension if not exists pg_cron` e job `dp_purge_registros_copia`
- [ ] T071 [US6] Regenerar `supabase/schema.sql` e ajustar `tests/schema-snapshot.test.mjs` (depende de T070)
- [ ] T072 [US6] Em `api.js`, criar `getUsageStats`, `getMessageUsage` e `getAdminStats` conforme `contracts/data-access.md` e atualizar `tests/data-access-contract.test.mjs`
- [ ] T073 [US6] Em `app.js`, carregar estatísticas em paralelo à Biblioteca sem bloquear lista nem cópia, com estado de erro e "Tentar de novo"; atualizar "Copiadas hoje" após cada cópia
- [ ] T074 [US6] Em `views/library-view.mjs`, renderizar os cartões "Copiadas hoje", "Padrões no seu acesso" e "Suas solicitações" na Visão geral e a linha de uso no painel de leitura; em `views/admin-view.mjs`, os resumos de Solicitações (pendentes, tempo médio, decididas em 30 dias) e de Contas e Acessos
- [ ] T075 [US6] Atualizar fotos em `tests/e2e/visual.spec.mjs` (valores mascarados), `domain/release-notes.mjs` para a Etapa 6, ensaio com backup novo (como T065) e registro em `validation-results.md`
- [ ] T076 [US6] Com autorização explícita do responsável: dry-run e `db push` da migração, prévia do ramo `002-etapa-6-estatisticas`, aprovação, `main`, verificação em produção (inclusive o job de retenção agendado) e remoção das regras de produção do `settings.local.json`

**Checkpoint**: estatísticas em produção

---

## Phase 9: User Story 7 - Atalhos de teclado e contadores de caracteres (Priority: P3)

**Goal**: ↑ ↓ Enter E na Biblioteca e contadores de título/conteúdo (vai ao ar junto com a Etapa 4 quando pronta)

**Independent Test**: navegar e copiar só pelo teclado; atalhos inativos em campos e diálogos; limites de 100 e 2000 caracteres

### Tests for User Story 7 ⚠️

- [X] T077 [P] [US7] Criar `tests/e2e/keyboard.spec.mjs`: ↓ ↓ Enter copia a terceira mensagem; E abre "Solicitar edição" (colaborador) e "Editar" (superadmin); setas e E sem efeito com foco na busca ou com diálogo aberto
- [X] T078 [P] [US7] Estender `tests/modal-view.test.mjs`: campos de título e conteúdo com `maxlength` 100/2000 e contador "N / limite caracteres" ligado por `aria-describedby`

### Implementation for User Story 7

- [X] T079 [US7] No manipulador global de teclado de `app.js` (o mesmo do Ctrl K), tratar ↑/↓ (mover seleção e foco), Enter (copiar a selecionada) e E (abrir sugestão ou edição) somente com a Biblioteca visível, sem diálogo ativo e sem foco em `input`, `textarea`, `select` ou área editável; renderizar a dica "↑ ↓ navegar · ⏎ copiar · E solicitar edição" em `views/library-view.mjs`
- [X] T080 [US7] Em `views/modal-view.mjs`, acrescentar os contadores de título e conteúdo com anúncio para leitores de tela só em 90% e 100% do limite
- [ ] T081 [US7] Incluir a dica de atalhos nas notas da etapa em `domain/release-notes.mjs` e publicar junto com a Etapa 4 ou em publicação própria (ramo, prévia, aprovação, `main`)

**Checkpoint**: todas as histórias concluídas

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: limpeza, evidências finais e critérios de sucesso que dependem do conjunto

- [ ] T082 [P] Remover `assets/dentalplus-logo.png`, `assets/dentalplus-logo-dark.png` e `assets/favicon.png` depois de confirmar com busca no repositório que nada mais os referencia; rodar `npm run test:perf` (Lighthouse) e registrar o resultado
- [ ] T083 [P] Conduzir o teste moderado com pelo menos 5 colaboradores (SC-003: localizar e copiar em menos de 15 s sem ajuda) e registrar em `specs/002-layout-visual-design-2/usability-results.md`
- [ ] T084 [P] Executar a revisão de privacidade (SC-010) com uma conta de colaborador chamando diretamente as leituras de solicitações, `registros_copia` e as funções de estatística, e registrar em `validation-results.md`
- [ ] T085 Rodar a validação completa de [quickstart.md](quickstart.md) na versão final, atualizar `specs/002-layout-visual-design-2/validation-results.md` com SC-001 a SC-011 — incluindo a medição do SC-008 (encontrar, com os filtros, um pedido decidido nos últimos 90 dias em menos de 30 segundos) — e marcar as tarefas concluídas neste arquivo

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias visuais. T014 publica a Etapa 0.
- **US1 (Phase 3)**: depende da Etapa 0 publicada. Base visual das demais histórias.
- **US2 (Phase 4)** e **US3 (Phase 5)**: dependem da US1 (faixa, tokens e padrões de painel); podem ser feitas em
  paralelo entre si, mas publicadas em etapas separadas.
- **US4 (Phase 6)** e **US7 (Phase 9)**: dependem da US1 (painel de leitura) e da US2 (janelas); independentes entre si.
- **US5 (Phase 7)**: depende da US3 (painel de solicitações) e da US2 (janelas de solicitação).
- **US6 (Phase 8)**: depende da US1 (Visão geral e painel) e da US3 (resumos da Administração); independe da US5,
  exceto o cartão "Suas solicitações", que usa só contagem de pendentes (disponível antes da US5).
- **Polish (Phase 10)**: depois das histórias desejadas.

### Within Each User Story

- Testes da história escritos antes da implementação e falhando pelo motivo esperado.
- Módulos puros (`domain/`) antes de `app.js`; `app.js` (estado) antes das views; migração antes de `api.js`.
- Publicação só depois da verificação local completa e da aprovação na prévia.

### Parallel Opportunities

- Setup: T002, T004, T005, T006 em paralelo; T003 e T007 depois de T002.
- Foundational: T009 e T011 em paralelo com T008; T010 depois de T008.
- US1: T015–T018 (testes) e T019–T020 (módulos puros) em paralelo; T021–T029 em sequência (mesmos arquivos `app.js` e views).
- US4: T047, T048, T049 e T050 em paralelo.
- US5: T055, T056, T057 em paralelo; T061 em paralelo com T060.
- US6: T067, T068, T069 em paralelo.
- US7: T077 e T078 em paralelo; a US7 inteira pode andar em paralelo com a US4.
- Polish: T082, T083 e T084 em paralelo.

---

## Parallel Example: User Story 1

```text
Task: "T015 [US1] tests/greeting.test.mjs"
Task: "T016 [US1] tests/library-view.test.mjs"
Task: "T017 [US1] tests/e2e/library-layout.spec.mjs"
Task: "T018 [US1] tests/data-access-contract.test.mjs"
Task: "T019 [US1] domain/greeting.mjs"
Task: "T020 [US1] domain/release-notes.mjs"
```

## Parallel Example: User Story 5

```text
Task: "T055 [US5] supabase/tests/database/request_review.test.sql"
Task: "T056 [US5] tests/logic.test.mjs (domain/requests.mjs)"
Task: "T057 [US5] tests/e2e/requests.spec.mjs"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2 → publicar a Etapa 0 (sem mudança visível).
2. Phase 3 (US1) → verificar localmente → prévia → aprovação → publicar a Etapa 1.
3. **Parar e validar**: jornadas de colaborador e superadmin, 360 px, fotos, desempenho contra a linha de base.

### Incremental Delivery

1. Etapa 0 → Etapa 1 (US1, MVP) → Etapa 2 (US2) → Etapa 3 (US3).
2. Etapa 4: US4 e, se pronta, US7 na mesma publicação.
3. Etapa 5 (US5) e Etapa 6 (US6), cada uma com backup, ensaio, dry-run e janela combinada com o responsável.
4. Cada etapa pode ser revertida pelo Instant Rollback da Vercel sem perda de dados (SC-011).

---

## Notes

- Comandos contra o Supabase de produção só com pedido explícito do responsável e regras exatas no
  `.claude/settings.local.json`, removidas depois do uso.
- Na prévia da Vercel, os dados são reais: apenas navegar, buscar e copiar.
- Antes de qualquer suíte E2E, confirmar que o contêiner `supabase_edge_runtime_padroes-de-atendimento` está no ar.
- Mudança visual intencional exige atualizar as fotos com `--update-snapshots` e revisá-las no commit.
- Toda publicação inclui conferência manual em computador, celular e por teclado, conforme o portão 4 da constituição.
- Commit ao fim de cada tarefa ou grupo lógico, com mensagem em português.
