# Implementation Plan: Nova identidade visual DentalPlus (Design 2.0)

**Branch**: `002-layout-visual-design-2` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-layout-visual-design-2/spec.md`

**Note**: Este documento encerra a fase de design do `/speckit-plan`. A decomposição executável será gerada pelo
`/speckit-tasks`.

## Summary

Trocar a interface da aplicação pela identidade DentalPlus do Design 2.0 (direção 2b: faixa da marca, pílulas de
categoria, Biblioteca em lista com leitura ao lado) e acrescentar os recursos que o desenho e a entrevista pediram:
variáveis preenchíveis, atalhos, contadores, edição da sugestão pelo administrador com retorno ao colaborador,
históricos e estatísticas de uso. A abordagem preserva a arquitetura atual (frontend estático sem build, `api.js` como
única fronteira, Supabase como autoridade de dados e permissões) e entrega em sete publicações pequenas e reversíveis,
cada uma aprovada pelo responsável em prévia da Vercel. As Etapas 0 a 4 não tocam o banco; as Etapas 5 e 6 trazem
migrações aditivas, compatíveis com o frontend em produção, aplicadas com backup e ensaio.

## Technical Context

**Language/Version**: JavaScript ES2022 em módulos nativos no navegador; CSS com propriedades personalizadas; Node.js
24.18.0 para ferramentas e testes; SQL PostgreSQL 17; TypeScript nas Edge Functions existentes (sem mudança).

**Primary Dependencies**: `@supabase/supabase-js` 2.112.4 (inalterado, servido em `vendor/supabase.js`); novas
dependências de desenvolvimento fixadas `@fontsource-variable/sora` 5.3.0 e `@fontsource-variable/manrope` 5.3.0
(OFL-1.1), apenas como origem dos arquivos de fonte copiados para `vendor/fonts/`; ferramentas existentes: Supabase CLI
2.116.0, `@playwright/test` 1.62.1, `@axe-core/playwright` 4.13.0, `@lhci/cli` 0.15.1, `serve` 14.2.6. Nenhuma dependência
nova de runtime. Extensão `pg_cron` (1.6.4) no banco a partir da Etapa 6.

**Storage**: PostgreSQL gerenciado (Supabase) com RLS; Etapa 5 amplia `solicitacoes_mensagem`; Etapa 6 cria
`registros_copia`. Preferência `dp_novidades` em `localStorage` (não sensível).

**Testing**: `node --test` (variáveis, tokens e contraste, saudação e fuso, contrato de dados); pgTAP via
`supabase test db` (revisão com ajustes, estatísticas e RLS); Playwright (jornadas, teclado, 360 px, geometria) com
`toHaveScreenshot` para fotos de referência (`@visual`); axe (WCAG 2.2 AA automatizável); Lighthouse CI (orçamento).

**Target Platform**: navegadores modernos em computador e celular; frontend estático na Vercel (prévia por ramo);
backend no Supabase.

**Project Type**: aplicação web interna de página única, frontend estático e backend gerenciado.

**Performance Goals**: não piorar mais de 10% as marcas `dp-library-ready`, `dp-search-ready` e `dp-copy-ready` em
relação à versão atual (SC-004); manter Biblioteca utilizável em até 2 s (p75, perfil 3G), busca em até 500 ms (p95) e
confirmação de cópia em até 1 s (p95), metas herdadas da spec 001.

**Constraints**: sem etapa de build; tema claro único com contraste mínimo 4,5:1/3:1 (constituição v3.0.0); CSP atual
(`font-src 'self'`, `img-src 'self' data:`) sem abertura para terceiros; prévias usam o banco de produção; migrações
aditivas e compatíveis com o frontend em produção; orçamento Lighthouse 256 KiB de script e 512 KiB no total.

**Scale/Scope**: até 100 contas, 10 acessos e 1.000 mensagens; 8 telas de referência mais celular, janelas, "Suas
solicitações", histórico e aviso de novidades; `app.js` com 1.918 linhas e views com cerca de 430 linhas a migrar.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate (constituição v3.0.0) | Antes da pesquisa | Evidência do desenho |
|---|---|---|
| I. Utilidade operacional e integridade | PASS — a spec aprovada redefine o gatilho de cópia na Biblioteca (FR-007) | Cópia continua em uma ação (botão ou Enter); Visão geral mantém clique para copiar; versão enviada preservada na revisão com ajustes. |
| II. Autorização no servidor e menor privilégio | PASS | Ajuste e decisão só por função de superadministrador; estatísticas agregadas no servidor; `registros_copia` sem escrita de cliente; colaborador lê só as próprias solicitações. |
| III. Arquitetura simples e fronteiras explícitas | PASS | `api.js` segue única fronteira; uma folha de estilo única; fontes como arquivos estáticos; nenhuma dependência de runtime nova. |
| IV. Experiência inclusiva, responsiva e consistente | PASS | Tema claro único (v3.0.0); quatro cores do desenho ajustadas por contraste (R9); 360–1440 px; teclado e foco; teste automático de tokens. |
| V. Mudanças verificáveis e operação confiável | PASS | Sete publicações reversíveis; fotos de referência; pgTAP para cada mudança de banco; backup, ensaio, dry-run e rollback nas Etapas 5 e 6. |
| Plataforma, dados e descoberta | PASS | Vercel + Supabase; CSP sem terceiros; `noindex` preservado; valores de variáveis nunca persistidos. |

Não há violação nem exceção de governança.

## Project Structure

### Documentation (this feature)

```text
specs/002-layout-visual-design-2/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ui-behavior.md
│   ├── design-tokens.md
│   ├── data-access.md
│   └── database-rpcs.md
├── checklists/requirements.md
└── tasks.md                        # Criado somente por /speckit-tasks
```

### Source Code (repository root)

```text
index.html                          # Carrega styles/design-system.css; preload da Manrope; favicon novo
app.js                              # Estado (selectedMessageId, novidades, filtros de histórico); sem darkMode/sidebar
api.js                              # Etapa 5: approve com ajustes, listas e detalhe; Etapa 6: estatísticas
styles/
└── design-system.css               # NOVO: tokens e classes de componente (fonte única)
vendor/fonts/
├── sora-latin-wght-normal.woff2    # NOVO (cópia fixada de @fontsource-variable/sora)
└── manrope-latin-wght-normal.woff2 # NOVO (cópia fixada de @fontsource-variable/manrope)
assets/                             # Logos e favicon do Design 2.0; selo reduzido a 192 px
domain/
├── variables.mjs                   # NOVO: extrair, rotular e preencher variáveis
├── release-notes.mjs               # NOVO: texto do aviso de novidades por etapa
├── greeting.mjs                    # NOVO: saudação por período no fuso de São Paulo
└── requests.mjs                    # Rótulo "Aprovada com ajustes"
ui/
├── icons.mjs                       # Ícones adicionais do desenho
└── focus.mjs                       # Reutilizado pelo painel de leitura no celular
views/
├── shell-view.mjs                  # NOVO: faixa da marca, pílulas, login, sem acesso, novidades
├── library-view.mjs                # Lista + painel de leitura; variáveis; Visão geral
├── requests-view.mjs               # NOVO: Suas solicitações e histórico do superadministrador
├── admin-view.mjs                  # Seções com lista/tabela + painel lateral
└── modal-view.mjs                  # Janelas no padrão da marca; revisão com ajustes e comentário
supabase/
├── migrations/…_request_review_adjustments.sql   # Etapa 5
├── migrations/…_usage_statistics.sql             # Etapa 6
└── tests/database/{request_review,usage_stats}.test.sql
tests/
├── design-tokens.test.mjs          # NOVO: contraste e ausência de tema escuro
├── variables.test.mjs              # NOVO
├── greeting.test.mjs               # NOVO
├── dependency-pin.test.mjs         # Acrescenta integridade das fontes
├── data-access-contract.test.mjs   # Novas exportações e chaves localStorage
├── library-view.test.mjs           # Lista, painel e ações
└── e2e/
    ├── visual.spec.mjs             # NOVO: fotos de referência (@visual)
    ├── library-layout.spec.mjs     # NOVO: substitui card-layout.spec.mjs (geometria lista/painel)
    ├── requests.spec.mjs           # NOVO: Etapa 5
    └── (specs existentes adaptados à nova interface)
playwright.config.mjs               # Remove projetos escuros; configura toHaveScreenshot
vercel.json                         # Etapa 0: revalidação de código
package.json / package-lock.json    # Fontes como dependências de desenvolvimento fixadas
```

**Structure Decision**: manter a aplicação estática sem framework nem build. O visual passa a vir de uma folha de estilo
única; `app.js` continua orquestrador e perde responsabilidades de apresentação para `views/shell-view.mjs` e
`views/requests-view.mjs`. Regras puras novas ficam em `domain/`. `api.js` continua sendo o único módulo que importa o
cliente remoto.

## Delivery Stages

| Etapa | Entrega | Banco | Portão específico |
|---|---|---|---|
| 0 Preparação | `vercel.json` com revalidação de código; `styles/design-system.css` com tokens; fontes e assets; teste de tokens; infraestrutura `@visual` | Não | Cabeçalhos em produção; unit verde; nenhuma mudança visível (estilos base só entram na Etapa 1, sob a classe `.dp-app`); ensaio de reversão cronometrado |
| 1 Faixa, login, Biblioteca, Visão geral | Faixa, pílulas, login, lista + leitura, Visão geral, sem tema escuro, aviso de novidades | Não | Fotos aprovadas; jornadas existentes adaptadas; SC-003/SC-004 |
| 2 Janelas | Todas as janelas no padrão da marca | Não | Foco/Escape; fotos |
| 3 Administração | Seções redesenhadas, "Conceder acesso" | Não | Jornadas de superadmin; fotos |
| 4 Variáveis, atalhos, contadores | `domain/variables.mjs`, teclado, contadores | Não | SC-006; testes de teclado |
| 5 Revisão com ajustes e históricos | Migração + funções; `api.js`; "Suas solicitações"; histórico | Sim | Ensaio com backup; pgTAP; SC-007/SC-008/SC-010 |
| 6 Estatísticas | Migração `registros_copia`, funções, `pg_cron`; cartões e números | Sim | Ensaio com backup; pgTAP; SC-009/SC-010 |

Cada etapa segue o fluxo de [quickstart.md](quickstart.md): verificação local, ramo e prévia, aprovação do responsável,
integração ao `main`, deploy e verificação rápida em produção. O aviso de novidades de cada etapa é escrito em
`domain/release-notes.mjs` e aprovado junto com a prévia.

## Phase 0: Research Decisions

Consolidadas em [research.md](research.md):

1. folha de estilo única com tokens e classes (R1);
2. fontes variáveis próprias, sem serviço externo (R2);
3. logos do Design 2.0 e selo reduzido (R3);
4. revalidação de código antes da Etapa 1 (R4);
5. ramos por etapa com prévia da Vercel sobre dados reais e migrações compatíveis (R5);
6. lista semântica com painel de leitura e diálogo no celular (R6);
7. fotos de referência com Playwright (R7);
8. remoção completa do tema escuro (R8);
9. ajustes de contraste em quatro cores do desenho (R9);
10. variáveis por expressão Unicode em módulo puro (R10);
11. atalhos no manipulador global existente e contadores nativos (R11);
12. versão publicada, comentário e `ajustada` na própria solicitação, com função compatível (R12);
13. registro de cópias na função de uso, agregados no servidor e retenção com `pg_cron` (R13);
14. aviso de novidades local por etapa (R14);
15. orçamento de desempenho mantido (R15);
16. categorias em navy e ciano escuro (R16).

Todas as incógnitas técnicas foram resolvidas; não resta `NEEDS CLARIFICATION`.

## Phase 1: Design

### Data and authorization

[data-model.md](data-model.md) descreve as colunas novas de `solicitacoes_mensagem` (versão publicada,
`comentario_revisao`, `ajustada`, backfill), a tabela `registros_copia` com RLS de leitura própria e sem escrita de
cliente, as estatísticas derivadas e as chaves locais. Nenhuma coluna ou política existente é removida.

### Interfaces

- [ui-behavior.md](contracts/ui-behavior.md): estrutura, Biblioteca, janelas, Administração, variáveis, históricos,
  aviso de novidades, responsividade e cobertura de fotos.
- [design-tokens.md](contracts/design-tokens.md): tokens, tipografia, forma e regras verificáveis de contraste.
- [data-access.md](contracts/data-access.md): mudanças em `api.js` por etapa.
- [database-rpcs.md](contracts/database-rpcs.md): funções alteradas e novas, migrações e matriz de permissões.

### Data flow

1. Bootstrap igual ao atual; após o login, aviso de pendentes (superadmin) e depois aviso de novidades, se não visto.
2. Biblioteca: busca, filtro por pílula e ordenação em memória sobre o acesso ativo; seleção atualiza só o painel.
3. Cópia (botão, Enter ou Visão geral): área de transferência primeiro, confirmação imediata, registro de uso em segundo
   plano; na Etapa 6 o mesmo registro alimenta `registros_copia`.
4. Variáveis: extraídas do conteúdo ao selecionar; valores só em memória; cópia preenchida usa o mesmo registro de uso.
5. Revisão (Etapa 5): o painel envia ajustes e comentário em uma única chamada transacional; o colaborador lê o
   resultado em "Suas solicitações".
6. Estatísticas (Etapa 6): carregadas em paralelo à Biblioteca, sem bloquear a lista nem a cópia.

### Error handling

Mantém a política por código de `domain/error-policy.mjs`. Novos códigos de detalhe (`VALIDATION:ADJUSTMENTS_NOT_ALLOWED`,
`VALIDATION:REVIEW_COMMENT`) recebem mensagens em `domain/api-errors.mjs`. Falha em estatísticas mostra estado de erro nos
cartões com "Tentar de novo". Nenhuma mensagem de sucesso aparece antes da confirmação do servidor.

### Requirements traceability

| Requisitos | Cobertura no desenho | Evidência |
|---|---|---|
| FR-001–FR-004, FR-008 | `shell-view.mjs`, tokens, login, saudação | Fotos; `greeting.test.mjs`; E2E de navegação |
| FR-005–FR-007 | Lista + painel, seleção, diálogo no celular | `library-view.test.mjs`; `library-layout.spec.mjs`; E2E de cópia |
| FR-009–FR-011 | `modal-view.mjs`, `admin-view.mjs` | Fotos; E2E de janelas e superadmin; axe |
| FR-012–FR-015 | Remoção de tema/sidebar; jornadas preservadas; sem migração até a Etapa 4 | `design-tokens.test.mjs`; suíte E2E adaptada; revisão de migrações |
| FR-016–FR-020 | `domain/variables.mjs` e UI de variáveis | `variables.test.mjs`; E2E de cópia preenchida |
| FR-021–FR-022 | Manipulador de teclado; contadores | E2E de teclado; unit de contadores |
| FR-023–FR-030 | Migração e `aprovar_solicitacao` estendida; `requests-view.mjs` | `request_review.test.sql`; `requests.spec.mjs` |
| FR-031–FR-037 | `registros_copia`, funções de estatística, `pg_cron` | `usage_stats.test.sql`; roteiro de duas contas |
| FR-038–FR-040 | Semântica, foco, tokens de contraste | axe; `design-tokens.test.mjs`; `mobile.spec.mjs` |
| FR-041 | Etapas independentes e migrações compatíveis | Rollback ensaiado; prévia sobre produção |
| FR-042 | Fontes e imagens locais; CSP sem terceiros | `dependency-pin.test.mjs`; `security-headers.test.mjs` |
| FR-043 | `domain/release-notes.mjs` e diálogo de novidades no `shell-view` | Foto de referência e auditoria axe do diálogo |

SC-002 usa a revisão lado a lado na prévia; SC-003 usa teste moderado com 5 colaboradores; SC-004 compara a suíte de
desempenho com a medição da versão anterior; SC-005 usa `mobile.spec.mjs`, `library-layout.spec.mjs` e axe; SC-006 a
SC-010 usam os roteiros de [quickstart.md](quickstart.md); SC-011 usa o Instant Rollback da Vercel.

## Post-Design Constitution Check

**Result**: PASS. O desenho mantém a arquitetura sem build e a fronteira única de dados, centraliza o visual em uma
fonte, corrige as cores do desenho que não atingiam o contraste mínimo, mantém toda autorização e agregação no servidor,
preserva a versão enviada pelo colaborador e cria evidência automática para aparência, acessibilidade, banco e
desempenho. As mudanças de banco são aditivas, ensaiadas com backup e reversíveis.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa. Acréscimos com custo, registrados para revisão:

| Acréscimo | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| Extensão `pg_cron` (Etapa 6) | Retenção automática de 12 meses dos registros de cópia | Limpeza manual periódica (depende de lembrar; dados cresceriam sem limite) |
| Fotos de referência versionadas | Pedido do responsável; evitaria o bug `rodape-cartao-botoes` | Apenas testes de geometria (não detectam cor, fonte ou ícone) |
| Duas dependências de desenvolvimento de fontes | Origem rastreável e licenciada dos arquivos servidos | Baixar arquivos manualmente (sem versão nem integridade verificável) |
