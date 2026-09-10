# Implementation Plan: Evolução da Biblioteca de Mensagens

**Branch**: `001-evoluir-biblioteca-mensagens` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-evoluir-biblioteca-mensagens/spec.md`

**Note**: Este documento encerra a fase de design do `$speckit-plan`. A decomposição executável será
gerada posteriormente pelo `$speckit-tasks`.

## Summary

Evoluir incrementalmente a aplicação interna já em produção para priorizar busca e cópia de
mensagens, reduzir o modelo de autorização a colaborador e superadministrador, substituir exclusões
por arquivamento recuperável e tornar mudanças administrativas auditáveis. A solução preserva o
frontend estático, a camada de dados existente, o backend gerenciado e o deploy atual, mas introduz
migrações versionadas, carregamento por acesso, módulos focados e testes automatizados de lógica,
banco, interface, acessibilidade e desempenho.

## Technical Context

**Language/Version**: JavaScript ES2022 em módulos nativos no navegador; Node.js 24.18.0 para
ferramentas e testes; SQL PostgreSQL; TypeScript no runtime gerenciado das funções administrativas.

**Primary Dependencies**: `@supabase/supabase-js` 2.112.4 fixado (versão exata) em `package.json`/`package-lock.json`
e servido localmente como `vendor/supabase.js`, cópia do bundle UMD dessa versão; Supabase CLI
2.116.0 como dependência de desenvolvimento; `@playwright/test` 1.62.1; `@axe-core/playwright`
4.13.0; `@lhci/cli` 0.15.1; `serve` 14.2.6. Nenhuma nova dependência de runtime além do cliente de
dados já utilizado.

**Storage**: PostgreSQL gerenciado com autenticação, Row Level Security, funções transacionais,
triggers de auditoria e migrações em `supabase/migrations/`.

**Testing**: `node --test` para lógica pura; pgTAP via `supabase test db` para schema, funções e RLS;
Playwright para jornadas, teclado e viewports; axe para WCAG 2.2 AA automatizável; Lighthouse CI para
orçamento de carregamento sob perfil móvel/3G.

**Target Platform**: Navegadores modernos com HTTPS em celular e desktop; frontend estático na
Vercel; backend e autenticação no Supabase.

**Project Type**: Aplicação web interna de página única, com frontend estático e backend gerenciado.

**Performance Goals**: Biblioteca utilizável em até 2 segundos no percentil 75 sob perfil 3G;
resultados de busca em até 500 ms no percentil 95; confirmação de cópia em até 1 segundo no
percentil 95.

**Constraints**: Somente `colaborador` e `superadmin`; sem cadastro público; cópia literal em uma
ação; conteúdo autenticado não indexável; dados atuais preservados; nenhuma exclusão física de
mensagem ou categoria no fluxo normal; rollback obrigatório para migração e deploy.

**Scale/Scope**: Até 100 contas, 10 acessos e 1.000 mensagens; biblioteca, favoritos, recentes,
solicitações, aprovações, contas, acessos, categorias, arquivamento e restauração.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate | Before research | Design evidence |
|------|-----------------|-----------------|
| Utilidade operacional e integridade | PASS | Biblioteca inicial, busca por acesso e cópia não bloqueada por telemetria. |
| Autorização no servidor e menor privilégio | PASS | RLS por operação, dois papéis, RPCs restritos e testes de permissão. |
| Arquitetura simples com fronteiras explícitas | PASS | `api.js` permanece como única fronteira remota; módulos são extraídos por responsabilidade. |
| Experiência inclusiva e responsiva | PASS | Contrato de UI, foco modal, teclado, 360 px, temas e testes axe/Playwright. |
| Mudanças verificáveis e operação confiável | PASS | Migrações reversíveis, quatro camadas de teste, preview e smoke test pós-deploy. |
| Plataforma, dados e descoberta | PASS | Vercel + Supabase preservados; segredos fora do cliente; `noindex` e headers versionados. |

Não há violação constitucional nem exceção de governança nesta fase.

## Project Structure

### Documentation (this feature)

```text
specs/001-evoluir-biblioteca-mensagens/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── data-access.md
│   ├── database-rpcs.md
│   └── ui-behavior.md
└── tasks.md                       # Criado somente por $speckit-tasks
```

### Source Code (repository root)

```text
index.html                         # Shell, metadados, carregamento crítico
app.js                             # Bootstrap, estado global e composição das telas
api.js                             # Única fronteira entre frontend e serviços remotos
config.js                          # Configuração pública de produção
config.local.js                    # Configuração pública do ambiente local
search-utils.mjs                   # Normalização e correspondência de busca
domain/
├── permissions.mjs               # Dois papéis e capacidades puras
├── library.mjs                   # Filtro, ordenação e exclusão de arquivados
└── requests.mjs                  # Estados, rótulos e idempotência de solicitações
ui/
├── dom-morph.mjs                 # Reconciliação do DOM e preservação de foco/caret
├── focus.mjs                     # Ciclo de foco, Escape e restauração em modais
└── clipboard.mjs                 # Cópia segura e fallback manual
views/
├── library-view.mjs              # Biblioteca inicial, cartões, filtros e estados vazios
├── admin-view.mjs                # Área exclusiva do superadministrador
└── modal-view.mjs                # Formulários, revisão, confirmação e restauração
tests/
├── logic.test.mjs                # Utilitários existentes e regras puras novas
├── e2e/
│   ├── collaborator.spec.mjs
│   ├── superadmin.spec.mjs
│   ├── accessibility.spec.mjs
│   └── mobile.spec.mjs
└── fixtures/                      # Contas e dados determinísticos do ambiente local
supabase/
├── config.toml                    # Ambiente local reproduzível
├── schema.sql                     # Snapshot consolidado de referência, regenerado das migrações
├── migrations/                   # Baseline remoto e migrações incrementais
├── seed.sql                       # Escala mínima determinística para testes
├── tests/database/
│   ├── authorization.test.sql
│   ├── archiving.test.sql
│   ├── requests.test.sql
│   └── audit.test.sql
└── functions/
    ├── admin-create-user/index.ts
    └── admin-reset-password/index.ts
package.json                       # Scripts e dependências apenas de desenvolvimento
package-lock.json                  # Versões reproduzíveis
playwright.config.mjs              # Desktop, 360 px, claro e escuro
lighthouserc.cjs                   # Shell público e orçamento de transferência
vercel.json                        # Cache, segurança e X-Robots-Tag
```

**Structure Decision**: Manter uma aplicação estática sem framework ou etapa de build. `app.js`
continua como orquestrador, enquanto regras puras, infraestrutura de UI e renderizadores grandes são
extraídos em módulos ES testáveis. `api.js` continua sendo a única camada autorizada a importar o
cliente remoto. A área administrativa pode ser carregada somente para superadministradores, sem
afetar o caminho crítico da biblioteca.

## Phase 0: Research Decisions

As decisões e alternativas estão consolidadas em [research.md](research.md). Os resultados que
orientam o design são:

1. preservar a plataforma e modularizar de forma incremental;
2. capturar o schema remoto antes de criar migrações versionadas;
3. retirar `admin local` das políticas e da UI sem apagar a coluna no primeiro ciclo de rollout;
4. tornar `categoria_id` a relação canônica com migração compatível;
5. representar arquivamento por ator e data e manter favoritos/recentes recuperáveis;
6. serializar aprovações e usar chave de idempotência nas solicitações;
7. carregar somente o acesso ativo e desacoplar cópia de métricas;
8. automatizar banco, jornadas, acessibilidade e desempenho;
9. versionar headers de segurança e bloqueio de indexação.

Todas as questões técnicas foram resolvidas antes do desenho.

## Phase 1: Design

### Data and authorization

O modelo detalhado está em [data-model.md](data-model.md). A migração é aditiva primeiro:

- converter `profiles.role = 'user'` para `colaborador` e atualizar o constraint;
- manter `acesso_membros.is_admin_local` temporariamente, sempre ignorado e normalizado para `false`;
- adicionar `categoria_id` e preencher por acesso/nome, criando categoria recuperada quando necessário;
- adicionar `arquivado_em` e `arquivado_por` a mensagens e categorias;
- adicionar chave de idempotência às solicitações e o tipo `arquivamento`;
- criar registro de atividade imutável e triggers de auditoria;
- trocar políticas de escrita para superadministrador e atualizar funções transacionais.

O rollout aplica primeiro as mudanças compatíveis de banco, depois o frontend e, após o smoke test,
ativa constraints finais. Nenhuma migração destrutiva nem `db reset --linked` será executada em
produção. O rollback usa backup anterior, migração compensatória e o frontend precedente.

### Interfaces

- [data-access.md](contracts/data-access.md) define a interface estável entre UI e `api.js`.
- [database-rpcs.md](contracts/database-rpcs.md) define funções transacionais, autorização e erros.
- [ui-behavior.md](contracts/ui-behavior.md) define estados observáveis, teclado, responsividade e cópia.

### Data flow

1. O bootstrap obtém sessão, perfil e acessos ativos.
2. A biblioteca busca categorias, mensagens ativas, favoritos e recentes somente do acesso ativo.
3. Busca, filtro e ordenação operam em memória sobre esse conjunto limitado.
4. A cópia confirma imediatamente após a área de transferência responder; registro de uso ocorre em
   segundo plano e uma falha de telemetria não invalida a cópia.
5. Colaboradores enviam solicitações idempotentes; o conteúdo publicado não muda.
6. O superadministrador revisa uma solicitação bloqueada para atualização, garantindo aplicação única.
7. Arquivamento retira o item das consultas ativas; restauração recupera o mesmo identificador e
   reativa favoritos e recentes preservados.

### Error handling and observability

Erros remotos são normalizados pela camada de dados em códigos estáveis (`AUTH_REQUIRED`,
`FORBIDDEN`, `CONFLICT`, `VALIDATION`, `NETWORK`, `UNKNOWN`). A UI mapeia cada código para uma ação
clara, nunca fecha formulário nem comunica sucesso antes da confirmação. Solicitações reutilizam a
mesma chave após resposta incerta. Conflitos de aprovação recarregam o estado atual. Registros de
atividade cobrem mudanças administrativas; logs não incluem senha temporária, token ou conteúdo
integral das mensagens.

### Verification and release

O guia executável está em [quickstart.md](quickstart.md). O portão de release exige:

- testes de lógica sem falha;
- reconstrução local das migrações e pgTAP/RLS sem falha;
- jornadas P1, P2 e P3 em Playwright, inclusive 360 px e teclado;
- axe sem violação crítica ou séria nas telas e modais exercitados;
- cinco execuções autenticadas de desempenho, mais Lighthouse no shell público, com cumprimento das metas SC-002 a SC-004;
- teste moderado com 20 colaboradores representativos para as metas SC-001 e SC-010;
- preview sem indexação, com headers e matriz de permissão confirmados;
- backup confirmado, migração `--dry-run`, deploy coordenado e smoke test de produção.

### Requirements traceability

| Requirements | Design coverage | Validation evidence |
|--------------|-----------------|---------------------|
| FR-001–FR-005 | Profile, membership, RLS matrix and two-role migration. | pgTAP authorization + role E2E. |
| FR-006–FR-012 | Active-access loading, library view, search, clipboard and use RPC. | Unit search tests + collaborator E2E + timing. |
| FR-013–FR-018 | Request snapshots, idempotency key and locked review RPCs. | pgTAP request/concurrency + collaborator/admin E2E. |
| FR-019–FR-023 | Superadmin contracts, archive fields, category guard and account/access operations. | Database archive/audit tests + admin E2E. |
| FR-024–FR-026 | Operation-specific policies, normalized errors and in-flight guards. | RLS deny cases + network/conflict E2E. |
| FR-027–FR-028 | UI behavior contract, modal focus, themes and 360 px layout. | Playwright keyboard/mobile + axe. |
| FR-029 | Additive migration, compatibility fields, backup and compensating rollback. | Local reset, dry-run, preview and rollout record. |
| FR-030 | Login-only public shell, robots metadata and versioned response headers. | Header assertions + Lighthouse SEO check. |

SC-001 e SC-010 exigem evidência de teste moderado com 20 colaboradores representativos. SC-002 a
SC-004 e SC-007 usam a massa de escala e a suíte de desempenho. SC-005 e SC-006 usam testes de
permissão e concorrência no banco e no navegador. SC-008 usa Playwright/axe. SC-009 corresponde ao
portão de aceitação completo descrito em `quickstart.md`.

## Post-Design Constitution Check

**Result**: PASS. O desenho mantém o caminho principal simples, reforça autorização no banco,
remove um papel desnecessário, evita perda física, melhora a separação dos módulos e cria evidência
reproduzível para segurança, acessibilidade, responsividade e desempenho. Não há complexidade sem
justificativa ou dependência de runtime nova.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa.
