// Ícones SVG compartilhados por app.js e pelas views. Decorativos: o nome acessível fica no botão.
const svg = (paths, extra = '') => `<svg aria-hidden="true" focusable="false" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export const ICONS = Object.freeze({
  clipboard: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 'stroke-width="2" style="flex-shrink:0;"'),
  check: svg('<path d="M20 6L9 17l-5-5"/>', 'stroke-width="2.6" style="flex-shrink:0;"'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 'stroke-width="2"'),
  edit: svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', 'stroke-width="2"'),
  archive: svg('<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>', 'stroke-width="2"'),
});
