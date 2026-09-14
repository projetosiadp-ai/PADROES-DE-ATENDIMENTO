# Research: Nova identidade visual DentalPlus (Design 2.0)

Decisões técnicas da fase 0 do plano. Cada item registra a decisão, o motivo e as alternativas avaliadas. As decisões
de produto vêm da entrevista registrada em [spec.md](spec.md) (`Clarifications`) e da entrevista do plano (2026-09-11):
prévia na Vercel com aprovação do responsável, fotos de referência automáticas, horário das mudanças de banco combinado
a cada etapa, aviso de novidades por etapa, adaptação própria das telas sem desenho (celular, históricos, aviso) com
aprovação na prévia e categorias somente nas cores da marca.

## R1. Onde ficam as definições visuais

- **Decision**: criar uma folha de estilo única, `styles/design-system.css`, com tokens em propriedades CSS
  personalizadas (cores, tipografia, espaçamentos, raios e sombras do Design 2.0) e classes de componente
  (`dp-band`, `dp-pill`, `dp-btn-*`, `dp-field`, `dp-list-item`, `dp-reading`, `dp-panel`, `dp-dialog`). As views passam a
  usar classes; estilos em linha ficam restritos a valores realmente dinâmicos (largura de barra de uso, por exemplo).
  O método `theme()` de `app.js` perde as variantes escuras e, durante a migração, lê os mesmos valores dos tokens para
  que as telas ainda não migradas continuem coerentes.
- **Rationale**: FR-003 exige um único conjunto de definições. Hoje cada tela repete cores em estilos em linha, o que
  gerou o bug `rodape-cartao-botoes`. Classes deixam as fotos de referência estáveis e reduzem o tamanho do HTML gerado.
- **Alternatives considered**: manter o objeto `theme()` e estilos em linha (menor mudança, mas mantém duplicação e
  impede estados `:hover`/`:focus-visible` consistentes); adotar framework CSS ou pré-processador (viola a restrição de
  não ter etapa de build e acrescenta dependência sem ganho proporcional).

## R2. Fontes da marca sem serviço externo

- **Decision**: servir Sora e Manrope pelo próprio sistema, em `vendor/fonts/`, a partir das versões variáveis
  `@fontsource-variable/sora` 5.3.0 e `@fontsource-variable/manrope` 5.3.0 (licença OFL-1.1), apenas o subconjunto
  latino em WOFF2, com `font-display: swap`. As duas fontes entram como dependências de desenvolvimento fixadas; os
  arquivos copiados são versionados e protegidos por teste de integridade no mesmo modelo de
  `tests/dependency-pin.test.mjs`. Somente a Manrope é pré-carregada.
- **Rationale**: a CSP atual (`font-src 'self'`) bloqueia o Google Fonts, e hoje o sistema já cai nas fontes do sistema
  operacional. FR-042 exige recursos servidos pelo próprio sistema. As versões variáveis usam 2 arquivos em vez de 8
  (um por peso).
- **Alternatives considered**: Google Fonts (exige abrir a CSP para terceiros e expõe o acesso dos usuários a um serviço
  externo); fontes do sistema (não seguem a identidade); arquivos estáticos por peso (mais requisições e mais bytes).

## R3. Logos, selo e favicon

- **Decision**: substituir `assets/dentalplus-logo.png`, `assets/dentalplus-logo-dark.png` e `assets/favicon.png` pelas
  versões de `DESIGN - 2.0/assets/` e incluir `assets/dentalplus-selo.png` reduzido para 192×192 px (uso máximo de 168 px
  no login), otimizado uma vez com as bibliotecas de imagem do próprio Windows. O arquivo original (447 px, 164 KB) não
  entra no site. O logo claro aparece no login e o logo para fundo escuro aparece na faixa da marca.
- **Rationale**: o desenho usa esses arquivos; o selo original sozinho consumiria um terço do orçamento de transferência.
- **Alternatives considered**: servir o selo original (peso excessivo); converter para WebP (exige ferramenta ausente na
  máquina e não traz ganho relevante após a redução).

## R4. Cache antes da Etapa 1

- **Decision**: como Etapa 0, alterar `vercel.json` para que HTML, JavaScript, CSS e módulos (`/`, `/domain/`, `/ui/`,
  `/views/`, `/styles/`) usem `public, max-age=0, must-revalidate`; `vendor/` e `assets/` mantêm cache de 1 hora
  somente porque mudam com nome novo quando mudam de versão; fontes e imagens trocadas nesta feature ganham nomes novos
  para não reaproveitar cache antigo.
- **Rationale**: incidente `rodape-cartao-botoes` e avaliação `site-antigo-apos-migracao`: com 1 hora de cache em
  `views/`, o navegador combinou `app.js` novo com a view antiga. Revalidar custa uma resposta 304 por arquivo.
- **Alternatives considered**: versionar URLs com parâmetro de consulta (exige reescrever todos os imports sem etapa de
  build); service worker (complexidade e risco de ficar preso em versão antiga).

## R5. Publicação por etapas com prévia

- **Decision**: cada etapa é desenvolvida em um ramo próprio (`002-etapa-N-<nome>`) enviado ao repositório pessoal. A
  Vercel gera a prévia; o responsável aprova navegando nela; só então o ramo é integrado ao `main` e vai para produção.
  O repositório da Dental Plus recebe o mesmo `main` depois da integração.
- **Consequência obrigatória**: `config.js` aponta qualquer endereço que não seja local para o banco de produção, então a
  prévia usa dados reais. Na prévia, a conferência se limita a navegar, buscar e copiar; fluxos que gravam dados
  (solicitar, aprovar, arquivar, criar conta) são validados no ambiente local. Nas Etapas 5 e 6, a migração de banco é
  aplicada **antes** da prévia e precisa ser compatível com o frontend que está no ar.
- **Alternatives considered**: projeto Supabase separado para prévias (custo e manutenção de dados de teste); envio
  direto ao `main` com prints locais (o responsável preferiu aprovar navegando).

## R6. Biblioteca em lista com leitura ao lado

- **Decision**: lista semântica (`<ul>` com um `<button>` por mensagem, `aria-current="true"` na selecionada) e painel de
  leitura como região nomeada ("Leitura da mensagem") ao lado, em grade de duas colunas a partir de 900 px. Abaixo
  disso, o painel abre como diálogo modal usando o gerenciamento de foco existente (`ui/focus.mjs`). A seleção fica no
  estado da aplicação (`selectedMessageId`), e a primeira mensagem visível é selecionada no computador quando nada foi
  escolhido ou a selecionada saiu da lista. O `dom-morph` existente preserva foco e rolagem da lista ao trocar a seleção.
- **Rationale**: FR-005 a FR-007; botões nativos dão teclado e nome acessível sem ARIA complexa; o diálogo no celular
  reaproveita um padrão já testado.
- **Alternatives considered**: `role="listbox"` com `aria-activedescendant` (mais ARIA para manter, e cada item tem ações
  internas); rota separada para a leitura (quebra o estado de busca e filtro).

## R7. Fotos de referência automáticas

- **Decision**: usar `expect(page).toHaveScreenshot()` do Playwright já instalado, em uma suíte própria
  (`tests/e2e/visual.spec.mjs`, marcada `@visual`), nos projetos `desktop-light` e `mobile-360-light`, com os dados
  determinísticos de `supabase/seed.sql`, animações desligadas, relógio fixo (saudação e datas estáveis) e máscara em
  valores voláteis. Tolerância `maxDiffPixelRatio: 0.01`. As fotos ficam versionadas em
  `tests/e2e/visual.spec.mjs-snapshots/`, geradas no Windows, que é a plataforma de execução do projeto. Mudança
  intencional exige `npx playwright test --grep @visual --update-snapshots` e revisão das imagens no commit.
- **Rationale**: o responsável pediu proteção contra regressões visuais; as fontes próprias (R2) tornam a renderização
  reproduzível.
- **Alternatives considered**: serviço externo de comparação visual (dependência e envio de telas internas a terceiros);
  apenas testes de geometria (não detectam cor, fonte ou ícone errados).

## R8. Remoção do tema escuro

- **Decision**: remover o estado `darkMode`, o botão "Alternar tema", a leitura de `dp_darkmode` e os projetos
  Playwright `desktop-dark` e `mobile-360-dark`. A chave antiga no navegador é ignorada e removida na primeira carga.
  O teste de contrato de armazenamento local passa a esperar `dp_active_acesso` e `dp_novidades`.
- **Rationale**: FR-012 e constituição v3.0.0 (princípio IV).
- **Alternatives considered**: esconder o botão e manter o código (código morto e testes inúteis).

## R9. Contraste das cores do desenho

Cálculo pela fórmula WCAG de luminância relativa (2026-09-11):

| Combinação do desenho | Contraste | Mínimo | Decisão |
|---|---|---|---|
| Branco sobre ciano `#0E93D8` (botão Copiar) | 3,40:1 | 4,5:1 | Botões com texto usam `#09679F` (6,08:1); `#0E93D8` fica para bordas, foco e detalhes |
| Estrela inativa `#B7C6DE` sobre branco | 1,73:1 | 3:1 | Estrela inativa usa tom com ≥ 3:1, validado no teste de tokens |
| Borda de campo `#DCE5F3` sobre branco | 1,27:1 | 3:1 | Campos de formulário ganham contorno com ≥ 3:1; divisórias decorativas continuam claras |
| Subtítulo `#CFE0F4` sobre a ponta ciano da faixa | 2,53:1 | 4,5:1 | Textos da faixa ficam sobre a área azul-marinho; o degradê ciano só ocupa a parte sem texto |
| Demais pares (texto principal, secundário, links, botões navy, ciano claro com texto escuro) | 5,49 a 14,22:1 | 4,5:1 | Mantidos |

- **Rationale**: a constituição v3.0.0 fixou 4,5:1 para texto comum e 3:1 para texto grande, ícones e contornos.
- **Alternatives considered**: manter as cores exatas do desenho (reprova na auditoria automática e na constituição).

## R10. Variáveis nas mensagens

- **Decision**: módulo puro `domain/variables.mjs` com três funções: extrair variáveis distintas na ordem de aparição
  (`/\[([\p{Lu}\p{N}_]+)\]/gu`), gerar rótulo legível (`[DATA_VENCIMENTO]` → "Data vencimento") e preencher o texto
  mantendo as vazias. Os valores ficam só no estado em memória da tela, limpos ao trocar de mensagem, fechar ou sair.
  A cópia preenchida e a original chamam o mesmo registro de uso existente.
- **Rationale**: FR-016 a FR-019 sem banco; lógica pura testável com `node --test`.
- **Alternatives considered**: sintaxe `{{nome}}` (conflita com o conteúdo existente e com o desenho).

## R11. Atalhos e contadores

- **Decision**: o manipulador global de teclado de `app.js` (já usado para Ctrl K e Escape) recebe ↑, ↓, Enter e E, ativo
  somente com a Biblioteca visível, sem diálogo aberto e sem foco em `input`, `textarea`, `select` ou área editável. Os
  contadores usam `maxlength` nativo com texto "N / limite caracteres" associado ao campo por `aria-describedby`;
  o anúncio para leitores de tela só ocorre ao atingir 90% e 100% do limite.
- **Alternatives considered**: biblioteca de atalhos (dependência nova sem benefício).

## R12. Revisão com ajustes, retorno e históricos (Etapa 5)

- **Decision**: ampliar `solicitacoes_mensagem` com a versão publicada (`*_publicado`), `comentario_revisao` e
  `ajustada`; manter `status` com os mesmos três valores ("Aprovada com ajustes" = `aprovada` + `ajustada = true`).
  `aprovar_solicitacao` passa a aceitar ajustes e comentário opcionais com valores padrão, de modo que o frontend antigo,
  que chama só com `p_id`, continua funcionando durante a prévia. `rejeitar_solicitacao` mantém a assinatura e grava o
  motivo também em `comentario_revisao`. Aprovações antigas recebem a versão publicada igual à proposta e
  `ajustada = false`; rejeições antigas copiam o motivo para o comentário. Históricos usam leitura paginada com filtros,
  protegida pelas políticas de linha existentes (colaborador lê só as próprias; superadministrador lê todas).
- **Rationale**: novo valor de `status` quebraria contagens, rótulos e constraints atuais; compatibilidade é exigida
  por R5.
- **Alternatives considered**: tabela separada de revisões (junção extra em todas as leituras sem ganho); editar a
  solicitação antes de aprovar em duas chamadas (perde a atomicidade e abre janela para conflito).

## R13. Registro de cópias e estatísticas (Etapa 6)

- **Decision**: tabela `registros_copia` preenchida dentro de `registrar_uso_mensagem`, na mesma transação que já
  incrementa `frequencia` e atualiza `recentes`. Leitura direta liberada só para o próprio registro (colaborador) e para o
  superadministrador. Números agregados (média da equipe, totais) saem de funções `SECURITY DEFINER` que calculam no
  servidor e devolvem apenas agregados, aplicando a regra de mínimo de 3 pessoas ativas. "Hoje" e "semana" são
  calculados com `America/Sao_Paulo` e semana começando na segunda-feira. A retenção de 12 meses usa um job diário do
  `pg_cron` (disponível no ambiente local na versão 1.6.4 e oferecido pela plataforma de banco).
- **Rationale**: FR-031 a FR-037 e SC-010: o cliente nunca recebe linhas de outras pessoas.
- **Alternatives considered**: calcular médias no navegador (exigiria expor cópias alheias); guardar contadores diários
  agregados (perde a "última cópia" e complica correções).

## R14. Aviso de novidades

- **Decision**: módulo `domain/release-notes.mjs` com o identificador e 2 ou 3 frases por etapa; após o login, se
  `localStorage.dp_novidades` for diferente da etapa atual, abre um diálogo "Novidades" com "Entendi", que grava a
  etapa vista. Sem banco, conforme a entrevista.
- **Alternatives considered**: registrar a leitura no banco (mudança de banco sem necessidade).

## R15. Orçamento de desempenho

- **Decision**: manter os orçamentos atuais de `lighthouserc.cjs` (256 KiB de script, 512 KiB no total transferido) e as
  metas de SC-004 (não piorar mais de 10%). O acréscimo esperado é de cerca de 120 KiB (duas fontes variáveis latinas,
  selo reduzido e folha de estilo), compensado pela redução de estilos em linha. A folha de estilo é carregada no
  `<head>` sem bloquear o registro das marcas de desempenho existentes (`dp-library-ready`, `dp-search-ready`,
  `dp-copy-ready`).

## R16. Cores das categorias

- **Decision**: a borda de destaque e o rótulo das categorias alternam entre azul-marinho (`#16336E`) e ciano escuro
  (`#09679F`) pela ordem da categoria no acesso; a paleta multicolorida atual (`categoryColor`) é removida.
- **Rationale**: decisão da entrevista; ambas as cores passam de 4,5:1 sobre branco.
