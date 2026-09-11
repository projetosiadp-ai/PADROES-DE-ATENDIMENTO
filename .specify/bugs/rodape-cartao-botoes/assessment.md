# Bug Assessment: botões do rodapé do cartão sem estilo e "Copiar" fora do cartão

- **Slug**: rodape-cartao-botoes
- **Created**: 2026-09-11
- **Source**: pasted text (captura de tela da Biblioteca de mensagens em produção, deploy `a21002c`, perfil colaborador, acesso Relacionamento)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Captura de tela enviada pelo usuário, sem texto. Na grade da biblioteca, o rodapé de cada cartão mostra "usada Nx" e os
botões "Visualizar", "Sugerir edição" e "Solicitar arquivamento" com a aparência nativa do navegador (borda cinza,
fundo claro, fonte do sistema, texto quebrando em duas linhas). O botão "Copiar" passa da borda direita do cartão e
cobre o texto do cartão vizinho (ex.: sobre "Cirurgias/Extrações" e "Digite a opção desejada").

## Symptom

No computador, as ações do cartão aparecem sem o visual do sistema e o botão principal "Copiar" transborda o cartão e
se sobrepõe à coluna ao lado. Esperado: ações compactas no padrão visual do sistema e "Copiar" sempre dentro do cartão,
como no frontend anterior.

## Reproduction

1. Entrar em produção (deploy `a21002c`) como colaborador ou superadmin, em tela de computador (largura > 720px).
2. Abrir a Biblioteca: a grade usa colunas de 300px (densidade confortável) ou 260px (compacta).
3. Observar o rodapé dos cartões: três botões sem estilo e "Copiar" fora da borda do cartão.

## Suspected Code Paths

- `views/library-view.mjs:31-33` — os botões Visualizar, Sugerir edição/Editar e Solicitar arquivamento/Arquivar são
  `<button>` sem `class` nem `style`; o único CSS global para `button` (`index.html:39-41`) trata só cursor, hover e
  clique, então o navegador aplica a aparência nativa.
- `views/library-view.mjs:28` — `.dp-card-actions` é `display:flex` **sem** `flex-wrap`; com rótulos longos
  ("Solicitar arquivamento") a soma das larguras passa da largura da coluna.
- `views/library-view.mjs:34` — "Copiar" sem `flex-shrink:0` e sem `font-size` próprio (herda o tamanho maior da página).
- `index.html:124-125` — `flex-wrap: wrap` para `.dp-card-actions` só existe dentro de `@media (max-width: 720px)`;
  no computador não há quebra de linha.
- `app.js:811` — `column-width: 300px` (ou 260px) define a largura do cartão; o rodapé não cabe nessa largura.
- Referência do comportamento anterior: `538f00c:app.js`, helper `actionBtn` (botões de 30×30px só com ícone, `title`
  e `aria-label`, borda `t.border`, cor `t.textSecondary`, variante `danger`) e "Copiar" com ícone, `font-size:12.5px`,
  `display:flex`. Os ícones continuam disponíveis em `app.js:1921-1936` (`static icons(t)`: `eye`, `edit`, `trash`,
  `clipboard`, `check`), mas não chegam a `views/library-view.mjs`.

## Root Cause Hypothesis

Regressão da extração da view da biblioteca para `views/library-view.mjs` (spec 001): os botões de ação perderam o
helper `actionBtn` com ícones e estilos em linha, e os rótulos passaram a ser texto longo ("Solicitar arquivamento").
Sem estilo, com texto maior e sem quebra de linha no computador, o rodapé fica mais largo que a coluna de 300px e o
último item ("Copiar") transborda. Os testes E2E encontram os botões pelo nome acessível e não verificam aparência
nem se eles cabem no cartão, por isso não perceberam. Confiança: **alta**.

## Proposed Remediation

**Preferred**: restaurar o padrão visual do frontend anterior dentro de `views/library-view.mjs`:

- Botões secundários só com ícone, de 30×30px, com `title` e `aria-label` iguais ao rótulo atual (os nomes acessíveis
  "Visualizar", "Sugerir edição" / "Editar", "Solicitar arquivamento" / "Arquivar" continuam iguais, e os testes E2E
  que usam `getByRole('button', { name })` seguem válidos). Borda `theme.border`, fundo transparente, cor
  `theme.textSecondary`.
- Ícones: passar os SVG já existentes (`eye`, `edit`, e um ícone de arquivar) para a view, via `model` ou um módulo
  `ui/icons.mjs` compartilhado com `app.js`, sem duplicar SVG.
- "Copiar": `display:flex; align-items:center; gap:6px; font-size:12.5px; flex-shrink:0; white-space:nowrap`, com o
  ícone `clipboard`/`check`, como antes.
- `.dp-card-actions`: adicionar `flex-wrap:wrap` também no computador (ou `min-width:0` e quebra controlada), para que
  nenhuma combinação de rótulos passe da borda.

**Alternatives**:
- Manter botões com texto, só estilizados (classe `dp-btn-secondary` em `index.html`) e com `flex-wrap:wrap`. Mais
  simples, mas o rodapé fica com duas linhas na maioria dos cartões e ocupa mais espaço vertical que o antigo.
- Menu "⋯" com as ações secundárias. Esconde as ações e exige mais trabalho de acessibilidade (menu, foco, Escape).

**Files likely to change**:
- `views/library-view.mjs`
- `app.js` (fornecer ícones ao modelo, ou importar de um módulo novo)
- `ui/icons.mjs` (novo, se os ícones forem extraídos)
- `index.html` (regra `.dp-card-actions` fora da media query, se preferido ao estilo em linha)
- `tests/e2e/…` (novo teste de layout) e/ou `tests/…library-view…` (teste unitário da view)

**Tests to add or update**:
- E2E (desktop-light e desktop-dark): em cada cartão visível, o `boundingBox` de todos os botões de
  `.dp-card-actions` fica dentro do `boundingBox` do cartão; nenhum botão tem mais de uma linha.
- E2E (mobile-360): a mesma verificação, com a quebra de linha ativa.
- Unitário da view: botões de ação têm `aria-label` e `title` com os rótulos esperados e contêm `<svg>`; "Copiar" tem
  `flex-shrink:0`.
- Rodar a auditoria axe existente (`tests/e2e/accessibility.spec.mjs`) para confirmar que os botões só com ícone
  mantêm nome acessível e contraste de foco.

## Risks & Considerations

- Botões só com ícone dependem de `aria-label`/`title`; é preciso manter nomes acessíveis idênticos para não quebrar
  os testes E2E nem os leitores de tela.
- Alvo de toque: 30×30px é menor que 44×44px; no celular (`@media (max-width: 720px)`) vale aumentar para 36–44px.
- `vercel.json` guarda `views/` e `ui/` no navegador por até 1 h (`max-age=3600, stale-while-revalidate=86400`),
  enquanto `app.js` usa `max-age=0`. Se a correção mudar a assinatura entre `app.js` e `views/library-view.mjs`
  (ex.: novo campo de ícones no modelo), usuários podem receber `app.js` novo com view antiga por até 1 h. Mitigar
  mantendo a view compatível com os dois formatos, ou aplicar antes o endurecimento de cache descrito em
  `.specify/bugs/site-antigo-apos-migracao/assessment.md`.
- Mudança só visual: não afeta banco, RLS nem Edge Functions.

## Open Questions

- [NEEDS CLARIFICATION: preferência entre botões só com ícone (padrão antigo, recomendado) e botões com texto
  estilizados em duas linhas.]
- [NEEDS CLARIFICATION: o mesmo problema aparece no modo compacto e no tema escuro? A captura mostra só o tema claro,
  densidade confortável.]
