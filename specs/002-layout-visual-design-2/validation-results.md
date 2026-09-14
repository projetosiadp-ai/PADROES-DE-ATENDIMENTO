# Resultados de validação — Design 2.0

## Etapa 0 (preparação) — 2026-09-14

### Linha de base de desempenho (T001)

Método: `npm run test:perf` (5 medições autenticadas por execução, rede 3G emulada, massa de escala de
`tests/fixtures/scale.mjs` com 1.000 mensagens) e `tests/lighthouse-runner.mjs` (3 execuções no shell público, perfil
móvel). "Antes" = código anterior à Etapa 0, obtido guardando as alterações com `git stash`; "depois" = Etapa 0
aplicada. As execuções foram alternadas (depois → antes → depois) para separar o efeito da mudança do ruído da máquina.

| Medida | Antes (mediana) | Depois (mediana) | Limite | Situação |
|---|---|---|---|---|
| Carga da Biblioteca, p75 em 3G | ~1.435 ms | ~1.455 ms | 2.000 ms | dentro |
| Busca, p95 | ~218 ms | ~249 ms | 500 ms | dentro |
| Confirmação de cópia, p95 | ~172 ms | ~189 ms | 1.000 ms | dentro |
| Transferência total por carga | 5.400 B | 5.700 B | — | +300 B |
| Lighthouse: scripts | 113.145 B | 113.071 B | 262.144 B | dentro |
| Lighthouse: total | 137.835 B | 165.718 B | 524.288 B | dentro |

Amostras (5 por execução, em ms) em `scratchpad`: `perf-antes*.txt`, `perf-depois*.txt`, `v2-*.txt`. A máquina de
medição é compartilhada com o Docker e apresenta variação alta: no mesmo lote, a versão **anterior** registrou de
1.349 ms a 2.455 ms de carga e de 92 ms a 610 ms de cópia. Por isso a comparação usa medianas de 20 a 25 amostras, e
não o p95 de uma execução isolada.

### Achado corrigido durante a etapa

As primeiras medições mostraram a Etapa 0 cerca de 35% mais lenta na busca e na cópia. Causa: o `preload` da fonte
Manrope baixava 25 KB no início, embora a fonte só passe a ser usada na Etapa 1 (os estilos base ficam sob `.dp-app`).
O `preload` foi movido para a Etapa 1 (T027). Depois disso, a diferença voltou para dentro da variação da máquina e o
acréscimo de transferência caiu para 300 B, apenas a folha de estilo.

O aumento de 28 KB no total do Lighthouse é o download das duas fontes no shell público, que já ficam em cache para a
Etapa 1; o orçamento de 512 KB continua com folga de três vezes.

### Testes automatizados

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 60 de 60 |
| `npm run test:e2e` | 34 de 34 (2ª execução); 6 pulados (projetos móveis com testes só de desktop) |
| `npm run test:a11y` | 6 de 6; 6 pulados |
| `npm run test:perf` | dentro de todos os limites (2ª execução) |

Na primeira execução em lote (as três suítes seguidas, com o Docker e o navegador disputando a mesma
máquina) três cenários falharam por tempo esgotado — `superadmin.spec.mjs:120`, `collaborator.spec.mjs:58`
e `collaborator.spec.mjs:88` — e o teste de desempenho registrou p75 de 2.281 ms por causa de uma medição
isolada de 4.448 ms. Ao repetir os mesmos arquivos isoladamente, os 18 cenários passaram e o desempenho
ficou em p75 de 1.649 ms. Nenhuma das falhas envolve código da Etapa 0 (que não altera comportamento nem
tela); são instabilidades da máquina de medição. A margem do limite de 2.000 ms é estreita neste
equipamento: vale repetir a suíte de desempenho isolada, sem o restante rodando junto.

### Publicação (T014)

Aprovada pelo responsável em 2026-09-14 e integrada ao `main` dos dois repositórios (`e8f12ca`, avanço direto a partir
de `9a91ff6`). Conferido em `https://padroes-de-atendimento.vercel.app`: código (`/`, `app.js`, `views/`, `styles/`) com
`public, max-age=0, must-revalidate`; `vendor/`, fontes e `assets/` com `max-age=3600, stale-while-revalidate=86400`;
HTML com a folha `styles/design-system.css` e sem o `preload` da Manrope; `X-Robots-Tag` e CSP (`font-src 'self'`)
mantidos.

### Ensaio de reversão (SC-011) — dispensado

O responsável dispensou o ensaio cronometrado de Instant Rollback, porque o sistema tem pouquíssimo uso pela equipe
neste momento. Consequências registradas: o tempo de reversão não foi medido, e não foi confirmado que "Promote"
reativa a publicação automática depois de um Instant Rollback. A reversão continua disponível na Vercel; se for usada,
conferir em seguida se o painel ainda mostra "Production · Staged".

## Etapa 1 (Biblioteca, faixa, login e Visão geral) — 2026-09-14

### Desempenho (T034)

Mesmo método da Etapa 0: três execuções de `@perf` com a massa de escala recém-semeada. A segunda execução foi
descartada por ruído da máquina (carga de 9.728 ms numa amostra e cópia de 1.830 ms, com transferência idêntica às
demais); a comparação usa as 10 amostras das execuções 1 e 3.

| Medida | Etapa 0 (mediana) | Etapa 1 (mediana) | Variação | Limite | Situação |
|---|---|---|---|---|---|
| Carga da Biblioteca em 3G | ~1.455 ms | ~1.575 ms | +8% (+10% sobre a versão anterior à Etapa 0) | p75 ≤ 2.000 ms | dentro (p75 1.762 e 1.681 ms) |
| Busca | ~249 ms | ~173 ms | −31% | p95 ≤ 500 ms | dentro |
| Confirmação de cópia | ~189 ms | ~205 ms | +8% | p95 ≤ 1.000 ms | dentro |
| Transferência por recarga | 5.700 B | ~41.450 B | +35,8 KB | 512 KB | dentro |
| Lighthouse: scripts | 113.071 B | 116.130 B | +3 KB | 256 KB | dentro |
| Lighthouse: total | 165.718 B | 253.875 B | +88 KB | 512 KB | dentro |

Leitura dos números:

- A carga ficou no limite da regra de "até 10% de piora" (T034) em relação à versão anterior à Etapa 0 e abaixo dela
  em relação à Etapa 0. A Etapa 1 passa a usar de fato as fontes, o selo e o logo novos na primeira pintura.
- A cópia não é comparável um a um: a medição agora inclui o clique de seleção (uma renderização a mais) antes do botão
  Copiar, porque selecionar deixou de copiar (FR-007).
- A busca ficou mais rápida porque a lista renderiza um item compacto por mensagem, no lugar do cartão com o texto
  inteiro.
- O acréscimo do Lighthouse no shell público são as imagens da tela de login (selo de 192 px e logo) e as duas fontes.

### Testes automatizados

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 72 de 72 |
| `npm run test:db` | 72 de 72 (4 arquivos pgTAP; a etapa não altera o banco) |
| `npm run test:e2e` | 30 de 30; 8 pulados (cenários restritos a um dos dois projetos) |
| `npm run test:a11y` | 9 de 9 — 7 na bateria e 2 na repetição isolada (ver abaixo) |
| `npm run test:visual` | 13 de 13 fotos geradas e revisadas contra `DESIGN - 2.0/Biblioteca DentalPlus - 8 telas.dc.html` |
| `npm run test:perf` | dentro de todos os limites (execuções 1 e 3) |

Na bateria, dois cenários de acessibilidade estouraram tempo de espera, sem nenhuma violação axe: a janela "Vínculos
de" não abriu em 5 s, e o segundo navegador (360 px) não terminou o login em 15 s. Repetidos isoladamente, passaram em
18,7 s e 2,9 s. É a mesma instabilidade do Supabase local já registrada na Etapa 0; durante esta etapa o banco local
chegou a reiniciar sozinho, depois de uma tentativa de `supabase db reset` falhar porque o contêiner de storage estava
indisponível.

### Decisões tomadas durante a implementação

- As fotos de referência não zeram o banco: cada tela é levada a um estado determinístico (busca que devolve uma única
  mensagem conhecida). A Visão geral usa a conta beta, que nenhuma jornada favorita ou copia, e por isso a foto mostra as
  duas seções em estado de orientação.
- Busca, botão "Solicitar mensagem" e pílulas ficam só na Biblioteca; a Visão geral segue a tela 02, só com saudação e
  resumo. As listas da Visão geral ignoram o filtro de categoria.
- No celular, a leitura em diálogo sai da tela enquanto outra janela está aberta (um único `aria-modal`) e é desfeita
  ao trocar de seção.
- As cores ainda usadas por Administração e janelas (etapas 2 e 3) saíram de `app.js` para `ui/legacy-theme.mjs`, que
  espelha os tokens; `app.js`, `views/shell-view.mjs` e `views/library-view.mjs` já estão em `MIGRATED_FILES`.
- Defeitos encontrados e corrigidos antes da entrega: a faixa da marca recortava os resultados da busca; a leitura em
  diálogo sobrevivia à navegação e bloqueava o menu; a busca ficava espremida a 360 px.

## Etapa 2 (janelas) — 2026-09-14

### Testes automatizados (T041, verificação local)

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 76 de 76 (4 testes novos de anatomia das janelas) |
| `npm run test:e2e` | 30 de 30; 8 pulados |
| `npm run test:a11y` | 9 de 9 (a primeira tentativa não chegou a rodar: o servidor local não subiu em 30 s) |
| `npm run test:visual` | 21 de 21, e 21 de 21 na conferência seguinte contra as fotos salvas |

### Decisões

- Todas as janelas usam a mesma casca (`renderDialog` em `views/modal-view.mjs`): cabeçalho azul com o título como nome
  acessível (`aria-labelledby`), corpo claro e ação principal por último, à direita.
- O ✕ do cabeçalho existe nas janelas comuns e fica por último na ordem de foco, para não mudar o foco inicial (primeiro
  campo). Alertas de confirmação não têm ✕: saem por "Cancelar", como antes.
- O aviso de solicitações pendentes continua sem fechar ao clicar fora.
- As fotos de janelas fotografam só o diálogo: a página por trás acumula dados a cada bateria.
- As notas de novidades repetem a mudança da forma de copiar, porque a Etapa 1 ainda não foi publicada.

### Publicação

Pendente de aprovação do responsável (prévia do ramo `002-etapa-2-janelas`).

## Etapa 3 (Administração) — 2026-09-14

### Testes automatizados (T046, verificação local)

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 83 de 83 (7 testes novos em `tests/admin-view.test.mjs`) |
| `npm run test:e2e` | 30 de 30 — 29 na bateria e 1 depois da correção do menu da conta (ver abaixo) |
| `npm run test:a11y` | 9 de 9, com auditoria nova da seção Solicitações |
| `npm run test:visual` | 27 de 27 (8 fotos novas: quatro seções × dois tamanhos) |

### Defeitos encontrados e corrigidos na verificação

- No celular, o menu da conta abria por baixo dos botões da faixa ("Novo acesso" cobria "Sair"). A barra superior da
  faixa passou a ficar acima do título, das ações e da busca.
- A pílula da seção ativa não ficava destacada: o estilo só reconhecia `aria-pressed`, e as seções são abas com
  `aria-selected`.
- O cabeçalho "Ações" das tabelas não acompanhava o alinhamento à direita dos botões.
- A comparação de fotos não acusou a pílula sem destaque, porque a diferença ficou abaixo da tolerância de 1% dos pixels.
  As fotos da Administração foram apagadas e geradas de novo depois das correções.

### Decisões

- A decisão sobre solicitações acontece no painel ao lado da lista (tela 06); a janela de revisão deixou de existir e o
  histórico `renderRequestReviewModal` foi removido. A solicitação mais antiga fica selecionada por padrão.
- Conta de colaborador sem nenhum acesso mostra "Sem vínculo" e "Conceder acesso" (abre a janela de vínculos). A ação
  "Senha" continua disponível nessa linha, embora o desenho mostre só "Conceder acesso", para não perder a redefinição de
  senha (FR-014). Superadministrador sem vínculo mostra "Todos os acessos".
- As fotos da Administração cobrem só a área visível e mascaram linhas, listas e painéis de dados, que crescem a cada
  bateria.
- `ui/legacy-theme.mjs` foi removido: nenhuma tela monta mais estilo com cores embutidas, e as views deixaram de receber o
  parâmetro de tema. A cor inicial sugerida ao criar um acesso (dado gravado no banco) foi para
  `domain/access-defaults.mjs`.

### Publicação

Pendente de aprovação do responsável (prévia do ramo `002-etapa-3-administracao`, sem gravar dados).

## Etapa 4 (variáveis, atalhos e contadores, com a US7) — 2026-09-14

### Testes automatizados (T054, verificação local)

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 96 de 96 (novos: `tests/variables.test.mjs` e contadores/atalhos em `tests/modal-view.test.mjs`) |
| `npm run test:e2e` | 38 de 38 — 37 na bateria e 1 (criar acesso e categoria) na repetição isolada, em 18,7 s |
| `npm run test:a11y` | 9 de 9 |
| `npm run test:visual` | 29 de 29, e 29 de 29 na conferência seguinte |
| `npm run test:perf` | dentro dos limites nas duas execuções |

Cenários novos: `tests/e2e/variables.spec.mjs` (preencher, copiar preenchida e original, valores descartados e fora do
armazenamento do navegador, inserir variável no cursor) e `tests/e2e/keyboard.spec.mjs` (↓ ↓ Enter, ↑, E por papel,
atalhos inativos com foco na busca e com janela aberta).

### Desempenho

| Medida | Etapa 1 (mediana) | Etapa 4 (mediana de 10 amostras) | Limite | Situação |
|---|---|---|---|---|
| Carga da Biblioteca em 3G | ~1.575 ms | ~1.616 ms | p75 ≤ 2.000 ms | dentro (p75 1.676 e 1.619 ms) |
| Busca | ~173 ms | ~172 ms | p95 ≤ 500 ms | dentro |
| Confirmação de cópia | ~205 ms | ~171 ms | p95 ≤ 1.000 ms | dentro |
| Transferência por recarga | ~41.450 B | ~41.150 B | 512 KB | dentro |

A carga está 2,6% acima da Etapa 1 e cerca de 12,6% acima da linha de base anterior à Etapa 0 (~1.435 ms), acima da
referência de "até 10% de piora" do SC-004, embora dentro do limite absoluto de 2.000 ms. A variação da máquina de
medição é da mesma ordem (amostras isoladas de 1.542 a 2.094 ms); convém repetir a medição em outro equipamento antes da
publicação. O Lighthouse não foi repetido nesta etapa.

### Defeitos encontrados e corrigidos na verificação

- "Copiar preenchida" copiava o texto original: o atalho interno de cópia descartava o texto preenchido.
- O grupo de atalhos se chamava "Inserir variável no conteúdo" e era encontrado junto com o campo "Conteúdo" por quem
  procura o campo pelo nome; passou a se chamar "Atalhos de variável".
- 18 arquivos tinham ganhado marca de ordem de bytes (BOM) nas edições feitas por PowerShell; foram regravados em UTF-8
  sem BOM.

### Decisões

- A mensagem de teste com variáveis está em `supabase/seed.sql` (só o banco local) e é garantida por
  `tests/fixtures/variables.mjs`, porque `supabase db reset` falha nesta máquina.
- Atalhos só no computador (≥ 900 px) e só com o foco na página ou num item da lista: Enter sobre outro botão continua
  ativando esse botão. Enter copia a versão preenchida quando a mensagem tem variáveis.
- Contadores: o texto visível muda a cada tecla, mas o aviso ao leitor de tela só aparece a 90% e 100% do limite.
- Com variáveis vazias, "Copiar preenchida" mantém os colchetes e o estado mostra quantas ficaram sem preencher.

### Publicação

Pendente de aprovação do responsável (prévia do ramo `002-etapa-4-variaveis`).

## Etapa 5 (revisão com ajustes, Suas solicitações e histórico) — 2026-09-14

Implementada e verificada **somente no banco local**. Nenhum comando foi executado contra o Supabase de produção.

### Banco (T055, T058, T059)

- Migração `supabase/migrations/20260914120000_request_review_adjustments.sql`: colunas da versão publicada,
  `comentario_revisao` e `ajustada`; regras de consistência (as que podem esbarrar em linhas antigas como `NOT VALID`);
  backfill; índices para as listas; `aprovar_solicitacao(p_id, p_ajustes, p_comentario)` substituindo a versão de um
  argumento; `rejeitar_solicitacao` gravando também o comentário.
- Regra nova `solicitacoes_mensagem_pendente_sem_revisao_check`: um pedido pendente não pode chegar com comentário,
  versão publicada ou "ajustada". Sem ela, o colaborador conseguiria enviar um retorno falso, porque a política de
  inserção existente não conhece as colunas novas.
- `grant execute on function private.request_tags_are_valid(text[]) to service_role`: as regras de etiquetas chamam essa
  função e recusavam gravações feitas pelo `service_role` (encontrado pelo fixture das fotos).
- Ensaio local: as três regras `NOT VALID` foram validadas contra os dados locais numa transação desfeita, sem violação
  (16 aprovadas ganharam versão publicada e 8 rejeitadas ganharam comentário no backfill).
- pgTAP `request_review.test.sql`: 35 casos; `supabase test db` com 107 de 107.
- `supabase/schema.sql` regenerado do banco local, mantido o cabeçalho anterior (o dump do CLI acrescentava extensões e
  a publicação do Realtime, que não fazem parte do schema versionado).

### Aplicação (T056, T057, T060–T064)

- `api.js`: `approveMessageRequest(requestId, { adjustments, comment })`, `listMyRequests`, `listRequestHistory` e
  `getRequestDetail`; o contrato de exportações passou a incluir a seção da Etapa 5.
- `domain/requests.mjs`: rótulo "Aprovada com ajustes", filtros, período em dias de São Paulo, comentário, resumo e
  detalhe. Mensagens de erro específicas em `domain/error-policy.mjs`, onde já existia o mapa por motivo.
- Painel de decisão: campo "Comentário" (opcional ao aprovar, vira "Motivo da rejeição" ao rejeitar), "Editar e aprovar"
  em criação e edição, com categoria, título, etiquetas e conteúdo editáveis e validados.
- `views/requests-view.mjs`: "Suas solicitações" (colaborador) e "Histórico" (pílula da Administração), com
  paginação, carregamento, erro com "Tentar de novo" e estado vazio. Atalho na Visão geral e aviso nas janelas de
  solicitação.

### Testes automatizados (verificação local)

| Suíte | Resultado |
|---|---|
| `npm run test:db` | 107 de 107 (35 novos em `request_review.test.sql`) |
| `npm run test:unit` | 112 de 112 (novos: `tests/requests-view.test.mjs`, painel de decisão, domínio e contrato) |
| `npm run test:e2e` | 43 de 43 — 42 na bateria e 1 (jornada da Etapa 5 a 360 px) na repetição isolada; a falha foi tempo esgotado ao abrir a Biblioteca |
| `npm run test:a11y` | 9 de 9 — 7 na bateria e 2 na repetição isolada (mesmo tempo esgotado e a tabela do histórico demorando mais de 5 s) |
| `npm run test:visual` | 33 de 33 gerados; conferência com 32 de 33 e a 33ª ("administração — contas") aprovada na repetição isolada |

Fotos novas: "Suas solicitações" com pedido ajustado e histórico filtrado. Regeradas por mudança intencional: aviso de
novidades, Visão geral (atalho), janelas de solicitar e de arquivamento (texto) e as quatro seções da Administração
(pílula "Histórico"). O contador de pendentes da navegação passou a ser mascarado, porque cresce a cada jornada.
Desempenho não foi medido nesta etapa.

### Defeitos encontrados e corrigidos na verificação

- Colaborador poderia enviar pedido já com comentário ou "ajustada" (corrigido com a regra de pedido pendente).
- `service_role` sem permissão na função de etiquetas (corrigido na migração).
- No celular, a situação espremia o título da lista de "Suas solicitações"; agora desce para a linha de baixo.
- Localizadores de teste que dependiam da primeira mensagem da lista ou do botão "Aprovar" por trecho do nome.

### Pendente de autorização

- T065: ensaio com backup **novo** de produção (quickstart, "Etapas com banco").
- T066: `db push --linked --dry-run`, revisão e `db push --linked` em produção, com regras exatas no
  `.claude/settings.local.json`. A migração é aditiva e mantém a chamada antiga de aprovação, então pode ir ao banco
  antes da publicação do frontend.
