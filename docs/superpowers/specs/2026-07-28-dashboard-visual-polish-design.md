# Dashboard — Polimento visual e microinterações

## Contexto

O dashboard (tela de uso diário das atendentes) já tem uma base funcional sólida: busca sticky, chips de categoria, dark mode, cards com hover/copy-on-click. O pedido não é reestruturar o fluxo, e sim elevar o acabamento visual para um padrão "clean/minimalista" consistente, atacando inconsistências de espaçamento/sombra/raio que hoje fazem a tela parecer montada com valores ad-hoc em vez de um sistema.

Fora de escopo: mudança de layout/estrutura, novas features de busca/filtro, redesign do Admin ou do Login (podem ser propostas separadamente).

## 1. Tokens visuais (`theme()` em app.js)

Adicionar ao objeto retornado por `theme()`:
- `radiusSm: '8px'` — botões, chips de ação, badges.
- `radiusLg: '16px'` — cards de mensagem, painéis, modais.
- `shadowSm` — sombra de repouso (chips, botões elevados).
- `shadowMd` — cards em repouso.
- `shadowLg` — hover de card, dropdowns, modais.

Esses valores substituem os literais espalhados em `viewDashboard`, `viewHeader` e afins. Não alteram comportamento, só centralizam o valor.

## 2. Cards de mensagem

- Cor do ícone de categoria: função `categoryColor(nome)` — hash simples do nome da categoria mapeado para uma paleta fixa de 6 tons (cyan, indigo, âmbar, verde, rosa, roxo), aplicada ao invés do cyan fixo atual. Objetivo: escanear categorias diferentes visualmente na grade sem ler o texto.
- Ícone de favorito: substituir glifos `★/☆` por SVG inline (estrela contorno / preenchida), com uma transição de `transform: scale` no toggle para dar feedback de clique.
- Botão "Copiar": ícone de clipboard SVG antes do texto do botão.
- Hover do card: usa `shadowMd` → `shadowLg` do token (comportamento já existe, só troca a sombra por variável).

## 3. Painéis de destaque (Mais usadas / Recentes / Favoritas)

- Emojis 🔥 🕒 ★ trocados por ícones SVG inline no mesmo peso visual dos ícones de card.
- Título de cada painel ganha uma faixa de fundo `accent` a 8% de opacidade atrás do texto (em vez de só cor no texto), para reforçar a separação visual dos 3 blocos.

## 4. Header

- Aplicar os tokens `radiusSm`/`shadowSm` aos elementos existentes (botão de dark mode, menu de usuário, chips).
- Nenhuma mudança estrutural: busca, chips de categoria e dark mode continuam onde estão.

## Testes / verificação

- Verificação manual via preview local (`python -m http.server`) nos dois temas (claro/escuro), conferindo contraste e alinhamento.
- Sem mudança de lógica de dados/estado — não requer novos testes unitários.
