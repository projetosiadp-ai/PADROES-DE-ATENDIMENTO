# Contract: Design Tokens (Design 2.0)

Fonte única: `styles/design-system.css`. Nomes em propriedades CSS personalizadas; nenhum valor de cor, raio ou sombra
fora desta lista pode aparecer nas views, exceto valores dinâmicos calculados. Valores de referência:
`DESIGN - 2.0/Biblioteca DentalPlus - 8 telas.dc.html`, com os ajustes de contraste de [research.md](../research.md) (R9).

## Cores

| Token | Valor | Uso |
|---|---|---|
| `--dp-navy-900` | `#0E2350` | Texto principal; início do degradê da faixa |
| `--dp-navy-800` | `#16336E` | Faixa da marca; botões principais; pílula ativa |
| `--dp-navy-950` | `#0B1E45` | Texto sobre ciano claro |
| `--dp-cyan-500` | `#0E93D8` | Bordas de destaque, foco, detalhes decorativos; nunca fundo de texto |
| `--dp-cyan-400` | `#29ABE2` | Fundo de botão de destaque com texto `--dp-navy-950`; sublinhado da navegação ativa |
| `--dp-cyan-700` | `#09679F` | Botões com texto branco (Copiar), links, rótulos de categoria |
| `--dp-text` | `#0E2350` | Texto principal |
| `--dp-text-muted` | `#4A5F8C` | Texto secundário |
| `--dp-on-brand` | `#FFFFFF` | Texto principal sobre a faixa |
| `--dp-on-brand-muted` | `#BFD3EE` | Navegação inativa e subtítulos sobre a faixa |
| `--dp-bg` | `#F4F7FC` | Fundo da página |
| `--dp-surface` | `#FFFFFF` | Cartões, painéis, janelas |
| `--dp-surface-soft` | `#F4F9FE` | Área de leitura; campo em foco |
| `--dp-divider` | `#DCE5F3` | Divisórias decorativas |
| `--dp-divider-soft` | `#EEF3FA` | Separadores internos |
| `--dp-control-border` | tom com ≥ 3:1 sobre `--dp-surface` | Contorno de campos, selects e botões secundários |
| `--dp-star-off` | tom com ≥ 3:1 sobre `--dp-surface` | Estrela de favorito desmarcada |
| `--dp-highlight-bg` / `--dp-highlight-ink` | `#E6F4FC` / `#0B5C8A` | Variáveis e valores destacados |
| `--dp-danger-ink` / `--dp-danger-bg` / `--dp-danger-border` | `#B82D2D` / `#FBF1F1` / `#E3C2C2` | Rejeitar, erros |
| `--dp-success-ink` | tom verde com ≥ 4,5:1 sobre `--dp-surface` | Confirmação "Copiado" |
| `--dp-band-gradient` | `linear-gradient(115deg, #0E2350 0%, #16336E 48%, #0E93D8 140%)` | Faixa da marca e cabeçalho de janelas |

Os tons marcados como "tom com ≥ N:1" são fixados na implementação e verificados pelo teste de tokens.

## Tipografia

| Token | Valor |
|---|---|
| `--dp-font-display` | `"Sora Variable", "Manrope Variable", system-ui, sans-serif` |
| `--dp-font-body` | `"Manrope Variable", system-ui, sans-serif` |
| Títulos de tela | Sora 800, 28–30 px, espaçamento −0,6 px |
| Título de mensagem | Sora 700, 16–21 px |
| Corpo | Manrope 500–600, 13,5–15 px, altura de linha 1,6 |
| Rótulos em caixa alta | Manrope 800, 11–12 px, espaçamento 0,9–1,4 px |

## Forma e elevação

| Token | Valor |
|---|---|
| `--dp-radius-sm` / `-md` / `-lg` / `-xl` / `-2xl` | 9 / 12 / 14 / 16 / 20 px |
| `--dp-radius-pill` | 999 px |
| `--dp-shadow-card` | `0 10px 26px -24px rgba(14,35,80,.35)` |
| `--dp-shadow-panel` | `0 14px 34px -26px rgba(14,35,80,.45)` |
| `--dp-shadow-dialog` | `0 40px 80px -40px rgba(11,30,69,.7)` |
| `--dp-backdrop` | `rgba(14,35,80,.55)` |

## Categorias

Rótulo e borda de destaque alternam `--dp-navy-800` e `--dp-cyan-700` pela ordem da categoria no acesso.

## Regras verificáveis

- `tests/design-tokens.test.mjs` lê `styles/design-system.css` e confere que: todos os pares texto/fundo desta tabela
  atingem 4,5:1; `--dp-control-border`, `--dp-star-off` e o foco atingem 3:1 sobre `--dp-surface`; não existe token com
  sufixo ou seletor de tema escuro.
- Nenhum arquivo em `views/` ou `app.js` contém literal de cor hexadecimal fora de uma lista de exceções documentada no
  próprio teste.
