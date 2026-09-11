# Bug Fix: botões do rodapé do cartão sem estilo e "Copiar" fora do cartão

- **Slug**: rodape-cartao-botoes
- **Fixed**: 2026-09-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Restaurado o padrão visual do frontend anterior no rodapé do cartão da biblioteca. As ações secundárias voltam a
ser botões de ícone de 30×30px, com nome acessível e `title`. "Copiar" ganha ícone, tamanho fixo e não quebra
linha. O rodapé passa a quebrar linha em qualquer largura. A opção escolhida pelo usuário para a pergunta 1 do
assessment foi a de botões só com ícone.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `ui/icons.mjs` | added | `ICONS` congelado (`clipboard`, `check`, `eye`, `edit`, `archive`); SVG com `aria-hidden="true" focusable="false"` |
| `views/library-view.mjs` | modified | helper `actionButton`; ações Visualizar / Sugerir edição·Editar / Solicitar arquivamento·Arquivar só com ícone; "Copiar" com ícone, `font-size:12.5px`, `flex-shrink:0`, `white-space:nowrap`; `.dp-card-actions` com `flex-wrap:wrap` |
| `app.js` | modified | importa `ICONS`; `static icons(t)` reutiliza `clipboard`, `check`, `eye`, `edit` em vez de duplicar o SVG |
| `index.html` | modified | `modulepreload` de `ui/icons.mjs`; no `@media (max-width: 720px)`, botões de ícone do rodapé com 36×36px |
| `tests/library-view.test.mjs` | added test | contrato da view para colaborador e superadmin |
| `tests/e2e/card-layout.spec.mjs` | added test | geometria real do rodapé nos 4 projetos Playwright |

## Diff Highlights (optional)

```js
// views/library-view.mjs
const actionButton = (icon, label, handler, theme, register) => `<button data-click="${register(handler)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:transparent;color:${theme.textSecondary};">${icon}</button>`;

${actionButton(ICONS.eye, 'Visualizar', message.onPreview, theme, register)}
${actionButton(ICONS.edit, message.editLabel, message.onEdit, theme, register)}
${actionButton(ICONS.archive, message.archiveLabel, message.onArchive, theme, register)}
<button … style="display:flex;align-items:center;gap:6px;flex-shrink:0;white-space:nowrap;…font-size:12.5px;…">${message.copied ? ICONS.check : ICONS.clipboard}${escapeHtml(message.copyLabel)}</button>
```

## Tests Added or Updated

- `tests/library-view.test.mjs` › `ações secundárias do cartão (colaborador|superadmin) são botões de ícone com nome acessível`: exige nomes acessíveis na ordem Visualizar / edição / arquivamento, `title` igual ao nome, tamanho fixo de 30×30 e conteúdo só com SVG decorativo.
- `tests/library-view.test.mjs` › `rodapé do cartão quebra linha em qualquer largura`: `flex-wrap:wrap` no rodapé.
- `tests/library-view.test.mjs` › `Copiar não encolhe nem quebra e troca o ícone ao copiar`: `flex-shrink:0;white-space:nowrap`; ícone `clipboard` → `check` com "Copiado".
- `tests/e2e/card-layout.spec.mjs` › `rodapé dos cartões cabe no cartão para colaborador|superadmin`: em todos os cartões visíveis, nenhum botão do rodapé passa das bordas do cartão nem tem mais de 44px de altura (não quebra em duas linhas). Roda em desktop-light, desktop-dark, mobile-360-light e mobile-360-dark.

## Local Verification

- Commands run:
  - `npm run test:unit` → 52 passed, 0 failed (inclui os 4 testes novos da view).
  - `npx playwright test tests/e2e/card-layout.spec.mjs tests/e2e/collaborator.spec.mjs tests/e2e/superadmin.spec.mjs tests/e2e/accessibility.spec.mjs` → 39 passed, 8 failed, 9 skipped. Causas das 8 falhas:
    - `superadmin.spec.mjs:209` (criar conta), 4 projetos: o container local `supabase_edge_runtime_padroes-de-atendimento` estava `Exited (255)` desde a reinicialização do Docker; a tela mostrou "Não foi possível criar a conta". Não tem relação com a correção. Religado com `docker start`, o teste passou: `npx playwright test tests/e2e/superadmin.spec.mjs -g "cria conta"` → 4 passed.
    - `card-layout.spec.mjs` (superadmin), 4 projetos: defeito no teste novo. O superadmin abria num acesso vazio criado por outra jornada ("Acesso estrutural …"), sem cartões. Corrigido: o teste seleciona `TEST_IDS.accessAlpha` antes de medir.
  - `npx playwright test tests/e2e/card-layout.spec.mjs` (após o ajuste) → 8 passed.
  - Os fluxos existentes que clicam nos botões pelo nome (`collaborator.spec.mjs` "Sugerir edição" / "Solicitar arquivamento", `superadmin.spec.mjs` "Arquivar") e a auditoria axe de `accessibility.spec.mjs` passaram na mesma execução.
- Manual checks: nenhum no navegador. A validação visual em produção fica para `/speckit-bug-test`.

## Deviations from Assessment

- Ícone de arquivar: o frontend antigo usava lixeira (`trash`) em vermelho para "Excluir". Como a ação agora é
  arquivar (reversível), usei um ícone de caixa de arquivo (`archive`) na cor neutra `theme.textSecondary`, igual às
  outras ações. `trash` continua em `app.js` para os usos existentes.
- Ícones: extraídos para `ui/icons.mjs` e importados diretamente pela view, em vez de passados pelo modelo. Assim o
  contrato entre `app.js` e `views/library-view.mjs` não muda, o que reduz o risco de mistura de versões apontado
  no assessment (`views/` e `ui/` ficam até 1 h no cache do navegador).
- O ajuste de 36×36px no celular foi feito em `index.html`, dentro da media query já existente, com `!important`
  porque os estilos em linha da view têm precedência.

## Follow-ups

- Depois de publicar, `views/library-view.mjs` pode continuar no cache do navegador por até 1 h, e parte dos usuários
  verá o rodapé antigo nesse período (sem erro de execução, porque o contrato não mudou). Considerar o endurecimento
  de cache de `vercel.json` descrito em `.specify/bugs/site-antigo-apos-migracao/assessment.md`.
- O container local `edge_runtime` não volta sozinho depois de reiniciar o Docker. Antes das suítes E2E, conferir com
  `docker ps` ou reiniciar a stack com `npx supabase stop` + `npx supabase start`.
- Rodar `/speckit-bug-test slug=rodape-cartao-botoes` depois do deploy para registrar a verificação em produção.
