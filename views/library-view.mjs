import { ICONS } from '../ui/icons.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const titleHtml = (segments) => segments
  .map(segment => (segment.highlight
    ? `<mark class="dp-highlight">${escapeHtml(segment.text)}</mark>`
    : escapeHtml(segment.text)))
  .join('');

function listItem(message, register) {
  const star = message.isFav
    ? `<span class="dp-list-item__star dp-list-item__star--on" aria-hidden="true">${ICONS.starOn}</span><span class="sr-only">Favorita</span>`
    : `<span class="dp-list-item__star" aria-hidden="true">${ICONS.starOff}</span>`;

  return `
    <li data-key="item-${escapeHtml(message.id)}">
      <button class="dp-list-item" data-testid="message-item-${escapeHtml(message.id)}"
        data-click="${register(message.onSelect)}"${message.selected ? ' aria-current="true"' : ''}>
        <span style="min-width:0;">
          <span class="dp-list-item__title">${titleHtml(message.titleSegments)}</span>
          <span class="dp-list-item__meta" data-volatile>${escapeHtml(message.metaLabel)}</span>
        </span>
        ${star}
      </button>
    </li>`;
}

function readingActions(reading, register) {
  return `
    <div class="dp-reading__actions">
      <button class="dp-btn-accent" data-click="${register(reading.onCopy)}">${reading.copied ? ICONS.check : ICONS.clipboard}${escapeHtml(reading.copyLabel)}</button>
      <button class="dp-btn-secondary" data-click="${register(reading.onPreview)}">${ICONS.eye}Visualizar</button>
      <button class="dp-btn-ghost" data-click="${register(reading.onEdit)}">${escapeHtml(reading.editLabel)}</button>
      <button class="dp-btn-ghost" data-click="${register(reading.onArchive)}">${escapeHtml(reading.archiveLabel)}</button>
    </div>`;
}

function readingBody(reading, register, { asDialog = false } = {}) {
  // No celular a leitura abre como diálogo: o foco inicial vai para o título (ui-behavior.md).
  const headingAttrs = asDialog ? ' tabindex="-1" data-initial-focus' : '';
  const tags = reading.tagChips.length
    ? `<div class="dp-reading__tags">${reading.tagChips.map(tag => `<button data-click="${register(tag.onClick)}">#${escapeHtml(tag.label)}</button>`).join('')}</div>`
    : '';

  return `
    <div class="dp-kicker">${escapeHtml(reading.categoria)}</div>
    <h2${headingAttrs}>${escapeHtml(reading.titulo)}</h2>
    <div class="dp-reading__text">${escapeHtml(reading.conteudo)}</div>
    ${tags}
    ${readingActions(reading, register)}
    <div class="dp-reading__footer">
      <span data-volatile>${escapeHtml(reading.usageLabel)}</span>
      <button class="dp-star" style="margin-left:auto;" data-click="${register(reading.onToggleFav)}"
        aria-pressed="${reading.isFav}" aria-label="${reading.isFav ? 'Remover dos favoritos' : 'Favoritar'}">${reading.isFav ? ICONS.starOn : ICONS.starOff}</button>
    </div>`;
}

function emptyPanel(model) {
  return `
    <section class="dp-reading" role="region" aria-label="Leitura da mensagem" data-key="reading">
      <div class="dp-empty">
        <div class="dp-empty__title">${escapeHtml(model.emptyTitle)}</div>
        <div>${escapeHtml(model.emptyHint)}</div>
      </div>
    </section>`;
}

export function renderLibraryView(model, register) {
  const summary = `
    <div class="dp-library__summary">
      <span data-volatile>${escapeHtml(model.resultsCountLabel)}</span>
      <select aria-label="Ordenar mensagens" data-change="${register(model.onLibrarySortChange)}">
        <option value="relevance" ${model.librarySort === 'relevance' ? 'selected' : ''}>Favoritas primeiro</option>
        <option value="used" ${model.librarySort === 'used' ? 'selected' : ''}>Mais usadas</option>
        <option value="az" ${model.librarySort === 'az' ? 'selected' : ''}>A → Z</option>
      </select>
    </div>`;

  const list = model.hasResults
    ? `<ul class="dp-list" aria-label="Mensagens">${model.messageList.map(message => listItem(message, register)).join('')}</ul>`
    : '';

  const loadMore = model.hasMoreMessages
    ? `<div style="display:flex; justify-content:center; padding-top:6px;"><button class="dp-btn-secondary" data-click="${register(model.onLoadMore)}">${escapeHtml(model.loadMoreLabel)}</button></div>`
    : '';

  // Abaixo de 900 px o painel de leitura vira diálogo (renderLibraryReadingDialog),
  // então a coluna lateral só existe no computador.
  const panel = model.showReadingPanel
    ? (model.reading
      ? `<section class="dp-reading" role="region" aria-label="Leitura da mensagem" data-key="reading">${readingBody(model.reading, register)}</section>`
      : emptyPanel(model))
    : '';

  return `
    <main class="dp-library" data-testid="library-ready" data-key="view-library">
      <div class="dp-library__list">
        ${summary}
        ${list}
        ${model.hasResults ? '' : `<div class="dp-empty"><div class="dp-empty__title">${escapeHtml(model.emptyTitle)}</div><div>${escapeHtml(model.emptyHint)}</div></div>`}
        ${loadMore}
      </div>
      ${panel}
    </main>`;
}

export function renderLibraryReadingDialog(model, register) {
  if (!model.readingAsDialog || !model.reading) return '';
  return `
    <div class="dp-backdrop" role="presentation">
      <div class="dp-dialog dp-dialog--reading" role="dialog" aria-modal="true" aria-label="${escapeHtml(model.reading.titulo)}">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="dp-kicker">Leitura da mensagem</span>
          <button class="dp-btn-icon" style="margin-left:auto;" data-click="${register(model.onCloseReading)}" aria-label="Fechar">${ICONS.close}</button>
        </div>
        ${readingBody(model.reading, register, { asDialog: true })}
      </div>
    </div>`;
}

function overviewRow(message, register) {
  return `
    <button class="dp-row ${message.isFav ? 'dp-row--marked' : ''}" data-click="${register(message.onCopy)}" data-key="row-${escapeHtml(message.id)}">
      <span style="min-width:0;">
        <span class="dp-row__title">${escapeHtml(message.titulo)}</span>
        <span class="dp-row__meta" data-volatile>${escapeHtml(message.metaLabel)}</span>
      </span>
      <span class="dp-row__action">${message.copied ? 'COPIADA' : 'COPIAR'}</span>
    </button>`;
}

export function renderLibraryOverview(model, register) {
  const section = (label, hint, items, emptyText) => `
    <section role="region" aria-label="${escapeHtml(label)}">
      <div class="dp-overview__heading">
        <h2>${escapeHtml(label)}</h2>
        ${hint ? `<span class="dp-overview__hint">${escapeHtml(hint)}</span>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${items.length ? items.map(item => overviewRow(item, register)).join('') : `<div class="dp-empty">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>`;

  return `
    <main class="dp-overview" data-testid="overview-ready" data-key="view-visaogeral">
      <div class="dp-overview__columns">
        ${section('Favoritas', 'clique para copiar', model.favList, 'Marque mensagens com a estrela para vê-las aqui.')}
        ${section('Copiadas recentemente', '', model.recentList, 'Copie uma mensagem e ela aparece aqui.')}
      </div>
    </main>`;
}
