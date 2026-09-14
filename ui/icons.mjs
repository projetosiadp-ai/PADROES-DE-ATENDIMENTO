// Ícones SVG compartilhados por app.js e pelas views. Decorativos: o nome acessível fica no botão.
const svg = (paths, extra = '') => `<svg aria-hidden="true" focusable="false" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export const ICONS = Object.freeze({
  clipboard: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 'stroke-width="2" style="flex-shrink:0;"'),
  check: svg('<path d="M20 6L9 17l-5-5"/>', 'stroke-width="2.6" style="flex-shrink:0;"'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 'stroke-width="2"'),
  edit: svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', 'stroke-width="2"'),
  archive: svg('<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>', 'stroke-width="2"'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', 'stroke-width="2.1"'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>', 'stroke-width="2.1"'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 'stroke-width="2.1"'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', 'stroke-width="2.2"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.6"'),
  starOn: svg('<polygon points="12 2.5 14.9 9.1 22 9.8 16.6 14.5 18.3 21.5 12 17.6 5.7 21.5 7.4 14.5 2 9.8 9.1 9.1"/>', 'stroke-width="1.8" fill="currentColor"'),
  starOff: svg('<polygon points="12 2.5 14.9 9.1 22 9.8 16.6 14.5 18.3 21.5 12 17.6 5.7 21.5 7.4 14.5 2 9.8 9.1 9.1"/>', 'stroke-width="1.8"'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.2"'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', 'stroke-width="2"'),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>', 'stroke-width="2.2"'),
  send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>', 'stroke-width="2"'),
});
