# Polimento de UX v2 — dark mode, logo, sidebar retrátil, mensagens longas

## Contexto

O redesign "DentalPlus Moderno v2" (spec anterior, já em produção) estabeleceu a base visual atual: sidebar de navegação, tokens de tema, cards, command palette. Este spec cobre uma segunda leva de polimento pedida diretamente pelo usuário, focada em quatro pontos que ficaram ásperos na primeira leva:

1. Dark mode pouco confortável para uso prolongado (poucas camadas de elevação, texto/glow muito contrastados).
2. Logo sem variante para fundo escuro — hoje "resolvido" com um filtro CSS de glow que borra o texto em vez de recolorir de verdade.
3. Sidebar sempre expandida (262px fixos), sem opção de ganhar espaço de tela.
4. Mensagens longas só visíveis por inteiro no modal de preview — sem forma rápida de expandir o card na própria grade.

Fora de escopo (confirmado com o usuário): mudança de comportamento em dropdowns/menus existentes (Acesso, ordenação, abas do Admin) — essas ficam como estão, só herdam os novos tokens de cor onde já usam `theme()`.

## 1. Dark mode — camadas de elevação (`theme()`)

Hoje `pageBg` (`#080F22`) e `cardBg`/`chipBg`/`inputBg` (`#101B38`/`#0C152E`) formam só 2 níveis efetivos de contraste, com bordas fortes (`#213155`) fazendo o trabalho de separação. Nova escala de 4 camadas, cada uma um degrau mais clara, para a hierarquia vir da própria cor de fundo:

| Token | Valor atual | Novo valor | Uso |
|---|---|---|---|
| `pageBg` | `#080F22` | `#0B1428` | Fundo da página, sidebar |
| `cardBg` / `chipBg` / `inputBg` | `#101B38` / `#0C152E` | `#141F3D` | Cards, campos, chips |
| `elevatedBg` (novo token) | — (reusa cardBg) | `#1A2748` | Modais, popovers, command palette |
| `border` | `#213155` | `#243456` | Divisórias |

- `text` (dark): `#E9EFFB` → `#DCE4F5` (leve redução de contraste, menos cansativo em uso prolongado; ainda dentro de contraste AA sobre `#0B1428`).
- `glow` (dark): opacidade do `box-shadow` de botões primários cai de ~0.35 para ~0.22 — acento sutil em vez de brilho chamativo.
- Modo claro não muda (só o branch `dark ? … : …` dentro de cada token existente).
- `modalSolidBg`, `panel` (usado no header/sidebar com glass effect) passam a referenciar `elevatedBg` no dark mode, mantendo o valor claro como está.

## 2. Logo — variante para dark mode

- Gerar `assets/dentalplus-logo-dark.png` a partir do PNG atual: recolorir os pixels navy do "Dental" para `#E9EFFB` (branco suave), mantendo o "Plus" ciano (`#38BDF8`-ish) inalterado. Geração via script Python/Pillow (recolorir por proximidade de cor, preservando alpha), não depende de ferramenta externa.
- `theme()` ganha `logoSrc: dark ? 'assets/dentalplus-logo-dark.png' : 'assets/dentalplus-logo.png'`; as 3 tags `<img>` que hoje usam `assets/dentalplus-logo.png` fixo passam a usar `${t.logoSrc}`.
- Remover o token `logoGlow` e seu uso nas 3 tags — não é mais necessário com a variante clara de verdade.

## 3. Sidebar retrátil

- Novo estado persistido (`localStorage`, mesma chave-pattern de `darkMode`): `sidebarCollapsed` (boolean, default `false`).
- Botão de toggle no rodapé da sidebar (ícone de seta/chevron), ao lado do toggle de tema.
- Estado colapsado (largura muda de `262px` para `72px` no grid `dp-app-shell`):
  - Logo vira só o símbolo: reaproveita `assets/favicon.png` (já existe, "D" branco sobre quadrado navy arredondado) — sem gerar asset novo para este caso.
  - Itens de navegação (Biblioteca/Visão geral/Administração) e categorias mostram só o ícone, centralizados; o texto é removido do fluxo (não só escondido com `opacity:0`, para não deixar espaço vazio).
  - `title="…"` nativo do HTML em cada item colapsado funciona como tooltip (sem componente novo).
  - Rodapé (avatar, toggle de tema, sair) mantém os ícones, empilhados verticalmente se necessário.
- Transição: `width` e opacidade do texto animados com `transition: width .2s ease, opacity .15s ease` — mesma família de easing já usada em outras transições do app.
- Mobile: o toggle de colapsar fica oculto (a sidebar já colapsa para barra horizontal por media query; os dois mecanismos não se combinam).

## 4. Expansão inline de mensagens longas

- Novo estado: `expandedCardIds` (Set, em memória — não persiste entre sessões, mesmo padrão que `copiedId`).
- No card da Biblioteca (grid e list), o texto truncado em 3 linhas (`-webkit-line-clamp:3`) ganha um botão "ver mais" quando o conteúdo excede esse limite (checagem simples por tamanho de string, mesma heurística que hoje decide truncamento).
- Clicar em "ver mais" remove o `line-clamp` daquele card (mostra o `conteudo` inteiro) e troca o botão para "ver menos". Como os cards ficam em CSS grid, o próprio grid re-flui os cards vizinhos automaticamente — não precisa de lógica de layout adicional.
- O modal de preview ("Visualizar") continua existindo sem mudanças — serve para leitura focada em tela cheia; a expansão inline é um atalho rápido sem sair do contexto da grade.
- Transição suave de altura via `transition: max-height .25s ease` no bloco de texto (troca de um `max-height` pequeno para um valor grande/`none` ao expandir).

## 5. Polimento geral (itens pontuais, baixo risco)

- Unificar timing de transição (`.2s ease`) em hovers de card, botões e no toggle da sidebar — hoje inconsistente entre elementos.
- Hover de card ganha leve elevação (`translateY(-2px)` + troca de `shadowSm`→`shadowMd`), reaproveitando os tokens de sombra já existentes.
- Estados de foco por teclado (`:focus-visible`) com contorno na cor `accent` em botões e links — hoje dependem só do outline padrão do navegador, inconsistente entre browsers.

Fora desta leva (não citado pelo usuário como problema concreto, fica como oportunidade futura se necessário): skeleton de loading, animações de página inteira, customização de densidade.

## Arquivos afetados

- `app.js` — `theme()`, `viewSidebar()`, `viewLibrary()` (card/row templates), `mount()`/state inicial (`sidebarCollapsed`, `expandedCardIds`).
- `assets/dentalplus-logo-dark.png` — novo arquivo, gerado localmente (não versionado manualmente, script descartável).
- Não toca `api.js`, `supabase/schema.sql`, `search-utils.mjs`.

## Verificação

- Alternar dark/light em todas as telas (Biblioteca, Visão geral, Admin) conferindo contraste e a nova logo.
- Colapsar/expandir a sidebar, confirmar persistência após reload (localStorage) e que o Admin (sidebar interna própria) não é afetado.
- Expandir/recolher um card com mensagem longa na grade e na lista, confirmar reflow dos cards vizinhos.
- Verificar responsivo mobile (sidebar em barra horizontal, sem o toggle de colapsar).
