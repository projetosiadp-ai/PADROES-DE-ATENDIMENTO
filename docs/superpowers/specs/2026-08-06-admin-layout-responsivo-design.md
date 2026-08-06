# Painel de Administração — correção de layout e responsividade

## Contexto

O painel de Administração (`viewAdmin()` em app.js) fica "cortado" em resoluções e níveis de zoom comuns (laptops ~1366px com zoom >100%, janelas lado a lado, monitores menores). Diagnóstico feito com o app rodando em harness local, medindo `getBoundingClientRect()` da área de conteúdo em várias larguras:

- Em ≥1366px: sem problema, tudo cabe.
- Em ~760–1150px (faixa comum com zoom do navegador a 110–125%, ou janela em metade da tela): a área de conteúdo do Admin fica espremida a **182px** de largura em 760px de viewport.

Causa raiz: três larguras fixas competindo pelo mesmo espaço horizontal, sem nenhum breakpoint intermediário entre "desktop largo" e o stack mobile (que só ativa em ≤720px):

1. Sidebar principal do app (`.dp-sidebar`): 262px (ou 72px colapsada).
2. Sub-sidebar interna do Admin (`.dp-admin-sidebar`): 236px fixos, `flex-shrink:0`.
3. Tabela de Mensagens: `min-width:760px` dentro de `.dp-table-scroll`.

Fora de escopo: qualquer mudança em regras de permissão do Admin (Mensagens/Categorias sempre visíveis, Acessos/Solicitações só superadmin — inalterado), fluxo de aprovação de solicitações, schema/API.

## 1. Sub-sidebar do Admin → abas horizontais

Substitui `.dp-admin-sidebar` (coluna vertical de 236px, `position:sticky`) por uma barra de abas horizontal no topo do conteúdo do Admin, ocupando 100% da largura disponível. Elimina uma das três larguras fixas em qualquer resolução — sem precisar de breakpoint dedicado para essa parte.

- Visual: pills lado a lado (mesmo `border-radius:999px` e paleta já usados nos tabs atuais), com o rótulo "Operando em: `<Acesso>`" absorvido para dentro dessa mesma faixa (hoje solto acima do conteúdo, com espaçamento próprio inconsistente).
- `role="tablist"`/`role="tab"`/`aria-selected` mantidos (só muda o container de `flex-direction:column` para `row`, com `flex-wrap:wrap` para telas bem estreitas).
- O badge de contagem de solicitações pendentes (hoje um número dentro do próprio tab) continua igual.

## 2. Tabela de Mensagens → cards em telas menores

Novo breakpoint em **900px** (via `matchMedia` + listener de resize, guardado em `state.viewportNarrow` e lido em `renderVals()` — não CSS puro, porque a escolha de qual template renderizar já é feita em JS, não em CSS):

- **≥900px**: mantém a tabela atual (grid 5 colunas, `min-width:760px` removido — o grid agora usa unidades `fr` puras sem piso mínimo, já que não compete mais com a sub-sidebar de 236px).
- **<900px**: cada linha vira um card empilhado (`dp-row-card`, mesmo padrão visual de Categorias/Acessos): categoria + título no topo, conteúdo truncado em 2 linhas abaixo, frequência e ações (Editar/Excluir) no rodapé do card.
- A tabela de Solicitações (4 colunas, mais estreita) recebe o mesmo tratamento por consistência, com breakpoint próprio em 700px (ela já é mais compacta).

## 3. Sidebar principal — refino de colapsar/expandir

- Transição: `width .2s ease` → `width .15s cubic-bezier(0.4,0,0.2,1)` (mais rápida, easing "ease-out" percebido como mais sólido/responsivo).
- Tooltip customizado: span posicionado (`position:absolute; left:100%`) com fade-in via `transition:opacity .1s` no `:hover`/`:focus-visible` do item, substituindo o `title` nativo (delay ~1s, visual não estilizado) nos itens colapsados (nav, categorias, avatar, botões do rodapé).
- Estado (`sidebarCollapsed`) já persiste via `localStorage` desde a leva anterior — mantido, sem mudança.
- Conteúdo principal já se redimensiona automaticamente (grid `${sidebarW} 1fr`) — mantido, sem mudança.

## 4. Ícones

- Toggle de tema: troca os glifos unicode `☀`/`☾` por SVG outline (sol com raios / lua crescente), `stroke-width:2`, mesmo padrão de `App.icons()`.
- Toggle de colapsar sidebar: mantém o chevron SVG atual (já é outline moderno) — só refina hover (mudança de `background` mais perceptível) e adiciona `:active { transform:scale(0.92) }` para feedback de clique, mesmo padrão dos outros botões do app.

## 5. Padronização geral do Admin

- Espaçamento de cabeçalho de seção (título + botão de criar) unificado — hoje cada bloco (`isAdminMsgs`/`isAdminCats`/`isAdminAcessos`/`isAdminSolicitacoes`) repete `margin-bottom:16px` ad-hoc; passa a usar uma constante local única no método.
- Linhas da tabela (Mensagens e Solicitações) ganham hover (`background:${t.chipBgHover}`, transição `.2s ease` — mesmo timing já unificado na leva anterior) — hoje não têm nenhum feedback visual, inconsistente com cards/rows do resto do app que já têm hover.
- Confirma que tabela/cards do Admin usam os mesmos tokens de sombra/borda (`shadowMd`, `radiusLg`) já padronizados — ajustar qualquer divergência encontrada durante a implementação.

## Arquivos afetados

- `app.js` — `viewAdmin()` (abas horizontais, tabela→cards, hover), `viewSidebar()` (tooltip customizado, ícones de tema), `renderVals()` (novo estado computado para o breakpoint de 900px/700px do Admin).
- `index.html` — ajuste de transição da sidebar (`.15s cubic-bezier`), CSS do tooltip customizado, remoção do `.dp-admin-sidebar { width: 236px }` (não existe mais como sidebar fixa).
- Não toca `api.js`, `supabase/schema.sql`, `search-utils.mjs`.

## Verificação

- Testar Admin em 1920px, 1366px, 1150px, 900px, 760px e 375px (mobile) — confirmar que a área de conteúdo nunca fica abaixo de ~280px de largura útil sem scroll horizontal desnecessário.
- Confirmar que as 4 abas (Mensagens/Categorias/Acessos/Solicitações) funcionam como pills horizontais, com a contagem de pendências visível.
- Confirmar tabela↔cards trocando corretamente no breakpoint de 900px (Mensagens) e 700px (Solicitações), sem duplicar conteúdo.
- Confirmar tooltip customizado aparece ao passar o mouse sobre item colapsado da sidebar principal, com delay curto.
- Confirmar ícones de tema (sol/lua) renderizam corretamente em ambos os temas, com hover/active consistentes com os demais botões.
- Repetir os testes de dark mode e responsividade mobile já cobertos na leva anterior, para garantir que nada regrediu.
