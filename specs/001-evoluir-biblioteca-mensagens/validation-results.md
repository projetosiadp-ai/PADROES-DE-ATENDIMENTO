# Resultados da validação local

Data: 2026-09-09 (America/Sao_Paulo)

## Ambiente

- Node.js: 24.18.0.
- npm: 10.9.8.
- Supabase CLI: 2.116.0.
- Playwright: 1.62.1; Chromium 1234 instalado.
- Docker Desktop: 29.5.3; Supabase local em `127.0.0.1:54421`.

## Comandos do quickstart

| Comando | Resultado local |
|---|---|
| `npm ci` | Passou; 424 pacotes instalados do lockfile. |
| `npx playwright install chromium` | A checagem ficou sem saída e foi interrompida após 90 s; `npx playwright install --list` confirmou Chromium, headless shell e FFmpeg instalados. |
| `npx supabase start` | Passou; API, Auth, REST e banco locais disponíveis. Edge Functions foram iniciadas separadamente para os testes administrativos. |
| `npx supabase db reset` | Não executado: a aprovação para a operação destrutiva local havia sido recusada. Migrações aplicadas foram verificadas por lista, dry-run, dump consolidado e 72 testes pgTAP. |
| `npm run test:unit` | Passou, incluindo escala, segurança de headers e auditoria do snapshot. |
| `npm run test:db` | Passou: 4 arquivos, 72 testes pgTAP. |
| `npm run serve` | Passou em `http://127.0.0.1:4173`. |
| `npm run test:e2e` | Passou no gate final: 37 cenários executados e 15 combinações intencionalmente ignoradas. |
| `npm run test:a11y` | Passou: 9 cenários aplicáveis; 15 combinações intencionalmente ignoradas pela matriz canônica. |
| `npm run seed:scale` | Passou: 100 contas, 10 acessos e 1.000 mensagens. |
| `npm run test:perf` | Passou: cinco medições Playwright e três auditorias Lighthouse. |
| `node tests/lighthouse-runner.mjs` | Passou: JavaScript 92.978 bytes; total 117.587 bytes; limites 262.144/524.288 bytes. |
| `node --test tests/security-headers.test.mjs` | Passou; configuração Vercel e meta robots validadas. |
| `npx supabase migration list --local` | Passou; seis migrações locais alinhadas. |
| `npx supabase db push --local --dry-run` | Passou; banco local atualizado, nenhuma migração pendente. |
| `npm run test:all` | Passou integralmente após os desvios corrigidos abaixo. |
| `npx supabase stop` | Passou; stack local encerrada com backup dos volumes (`backup: true`). |

## Desvios corrigidos

- O servidor estático de desenvolvimento não interpreta `vercel.json`; o quickstart agora valida a
  configuração localmente e reserva a inspeção HTTP dos headers para o preview Vercel.
- Os comandos de lista e dry-run agora usam `--local`, evitando contato implícito com o projeto vinculado.
- O LHCI 0.15.1/Lighthouse 12.6.1 não consegue limpar o processo/perfil temporário do Chrome neste
  Windows. `tests/lighthouse-runner.mjs` executa o mesmo Lighthouse três vezes via Chromium do
  Playwright e aplica os mesmos orçamentos de transferência.
- As Edge Functions locais não permaneceram no conjunto restaurado pelo Docker; foram servidas com
  `npx supabase functions serve` durante as jornadas administrativas.

## Limites de desempenho observados

- Carga autenticada p75: 1.292 ms (limite 2.000 ms).
- Busca p95: 258 ms (limite 500 ms).
- Confirmação de cópia p95: 144 ms (limite 1.000 ms).
- Lighthouse: JavaScript 92.978 bytes e total 117.587 bytes.

## Revalidação da Fase 9 (2026-09-10)

Ambiente idêntico ao acima, com `@supabase/supabase-js` 2.112.4. O banco local **não** foi recriado
(`db reset` segue sem aprovação) e acumula dados de execuções anteriores (≈50 acessos, ≈250 contas,
23 solicitações pendentes), o que torna as jornadas administrativas mais lentas.

| Verificação | Resultado |
|---|---|
| `npm run test:unit` | Passou: 46 testes (inclui contrato de dados, política de erros, modais, foco e versão fixada). |
| `npm run test:db` | Passou: 4 arquivos, 72 asserções pgTAP (nenhuma mudança de SQL nesta fase). |
| `npm run test:e2e` | Passou: 42 cenários, 18 combinações intencionalmente ignoradas (inclui os 2 cenários novos). |
| `npm run test:a11y` (desktop) | Passou: 3 auditorias axe sem violação crítica/séria, incluindo o novo diálogo de vínculos do acesso. |
| `npm run test:a11y` (360 px) | **Não conclusivo por ambiente.** No primeiro gate passaram as 6 execuções a 360 px exceto 1; o teste de teclado passou 3/3 isoladamente. Na repetição 2× × 2 temas, 7 de 12 falharam por tempo: 5 presas em “Entrando…” (Auth local sem resposta ao login) e 2 com “Carregando contas…” por mais de 5 s. Nenhuma falha de asserção de acessibilidade, foco ou overflow. Medição direta: `/auth/v1/health` levou 10,6 s na primeira chamada; RAM livre 345 MB de 7,9 GB, com uma segunda stack Supabase (`MDC`, outro projeto) ativa. Revalidar com a stack de outro projeto parada e banco recriado. |
| `npm run seed:scale` + `npm run test:perf` | Passou: carga p75 1.738 ms, busca p95 484 ms, cópia p95 256 ms; Lighthouse JS 111.409 bytes e total 136.024 bytes (limites 262.144/524.288). |

Desvios e correções desta rodada:

- A massa de escala havia sumido do banco local; `seed:scale` (upsert local) foi executado antes de `test:perf`.
- Auditorias axe de diálogos passaram a cobrir somente o diálogo (`aria-modal` torna o fundo inerte);
  a página de Contas ganhou auditoria própria sem diálogo. Antes, cada diálogo reauditava a página
  inteira sob o overlay e estourava o tempo com o volume acumulado. O orçamento do arquivo subiu para 120 s.
- `loadStructuralAdmin` passou a compartilhar a carga em andamento e buscar perfis em paralelo; a lista
  de Contas ficava em “Carregando contas…” por mais de 5 s a 360 px.
- Uma execução a 360 px ficou presa em “Entrando…”: o `POST /auth/v1/token` local não respondeu
  (status -1 no trace). Repetido 3 vezes, passou; tratado como instabilidade do Auth local.
- Busca p95 subiu de 258 ms para 484 ms, ainda abaixo de 500 ms, com margem pequena; a busca continua
  em memória e não foi alterada nesta fase. Recomenda-se nova medição com banco recriado.
- O JavaScript transferido subiu ≈18 KB pela atualização do supabase-js.

## Pendências externas

- Teste moderado com 20 participantes (SC-001/SC-010).
- Validação dos headers no preview Vercel.
- Backup, comparação/dry-run remotos e identificadores de deploy, condicionados à autorização de release.
