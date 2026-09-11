import { ICONS } from '../ui/icons.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const actionButton = (icon, label, handler, theme, register) => `<button data-click="${register(handler)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:transparent;color:${theme.textSecondary};">${icon}</button>`;

function messageCard(message, model, theme, register) {
  const title = message.titleSegments
    .map(segment => `<span style="${segment.style}">${escapeHtml(segment.text)}</span>`)
    .join('');
  const tags = message.tagChips
    .map(tag => `<button data-click="${register(tag.onClick)}" style="border:0;background:${theme.accentSoft};color:${theme.accent};border-radius:999px;padding:3px 10px;">#${escapeHtml(tag.label)}</button>`)
    .join('');

  return `
    <article aria-label="${escapeHtml(message.titleText)}" tabindex="0"
      data-testid="message-card-${escapeHtml(message.id)}" data-key="${escapeHtml(message.id)}"
      data-click="${register(message.onCardClick)}" data-keydown="${register(message.onCardKeyDown)}"
      class="dp-card" style="cursor:pointer;background:${theme.cardBg};border:1px solid ${message.borderColor};border-radius:${theme.radiusLg};padding:${model.cardPadding};display:flex;flex-direction:column;gap:10px;box-shadow:${theme.shadowMd};break-inside:avoid;margin-bottom:${model.cardGap}px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:${theme.textSecondary};">${escapeHtml(message.categoria)}</span>
        <span style="flex:1"></span>
        <button data-click="${register(message.onToggleFav)}" aria-label="${message.isFav ? 'Remover dos favoritos' : 'Favoritar'}" aria-pressed="${message.isFav}" style="border:0;background:transparent;color:${message.favColor};font-size:20px;">${message.isFav ? '★' : '☆'}</button>
      </div>
      <div style="font-size:15.5px;font-weight:700;color:${theme.text};">${title}</div>
      <div style="font-size:13.5px;color:${theme.textSecondary};line-height:1.55;white-space:pre-line;overflow-wrap:anywhere;">${escapeHtml(message.displayContent)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${tags}</div>
      <div class="dp-card-actions" style="border-top:1px solid ${theme.border};padding-top:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11.5px;color:${theme.textTertiary};font-weight:700;">usada ${escapeHtml(message.frequencia)}x</span>
        <span style="flex:1"></span>
        ${actionButton(ICONS.eye, 'Visualizar', message.onPreview, theme, register)}
        ${actionButton(ICONS.edit, message.editLabel, message.onEdit, theme, register)}
        ${actionButton(ICONS.archive, message.archiveLabel, message.onArchive, theme, register)}
        <button data-click="${register(message.onCopy)}" style="display:flex;align-items:center;gap:6px;flex-shrink:0;white-space:nowrap;border:0;background:${message.copyBtnBg};color:#fff;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:${theme.radiusSm};">${message.copied ? ICONS.check : ICONS.clipboard}${escapeHtml(message.copyLabel)}</button>
      </div>
    </article>`;
}

export function renderLibraryView(model, theme, register) {
  const controls = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="font-weight:800;font-size:14px;color:${theme.textSecondary};">${escapeHtml(model.resultsCountLabel)}</div>
      <span style="flex:1"></span>
      <select aria-label="Filtrar por categoria" data-change="${register(model.onCategoryFilterChange)}">
        <option value="" ${model.categoryFilter ? '' : 'selected'}>Todas as categorias</option>
        ${model.categoryOptions.map(category => `<option value="${escapeHtml(category.id)}" ${category.id === model.categoryFilter ? 'selected' : ''}>${escapeHtml(category.nome)}</option>`).join('')}
      </select>
      <select aria-label="Ordenar mensagens" data-change="${register(model.onLibrarySortChange)}">
        <option value="relevance" ${model.librarySort === 'relevance' ? 'selected' : ''}>Favoritas primeiro</option>
        <option value="used" ${model.librarySort === 'used' ? 'selected' : ''}>Mais usadas</option>
        <option value="az" ${model.librarySort === 'az' ? 'selected' : ''}>A → Z</option>
      </select>
    </div>`;

  const content = model.hasResults
    ? `<div style="${model.gridStyle}">${model.cardList.map(message => messageCard(message, model, theme, register)).join('')}</div>`
    : `<div style="text-align:center;padding:70px 20px;color:${theme.textTertiary};">
        <div style="font-weight:800;font-size:17px;color:${theme.textSecondary};">${model.libraryIsTrulyEmpty ? 'Nenhuma mensagem cadastrada ainda' : 'Nenhuma mensagem encontrada'}</div>
        <div style="font-size:14px;margin-top:5px;">${model.libraryIsTrulyEmpty ? 'A biblioteca deste acesso ainda está vazia.' : 'Ajuste a busca ou o filtro de categoria.'}</div>
      </div>`;

  const loadMore = model.hasMoreMessages
    ? `<div style="display:flex;justify-content:center;padding:20px 0 4px;"><button data-click="${register(model.onLoadMore)}" style="padding:10px 18px;">${escapeHtml(model.loadMoreLabel)}</button></div>`
    : '';

  return `<main data-testid="library-ready" data-key="view-library" class="dp-view-enter" style="padding:22px 28px 60px;">${controls}${content}${loadMore}</main>`;
}

function overviewItem(message, theme, register) {
  return `<button data-click="${register(message.onCopy)}" title="Clique para copiar" style="display:flex;align-items:center;gap:10px;border:1px solid ${theme.border};background:${theme.inputBg};border-radius:${theme.radiusMd};padding:11px 13px;text-align:left;">
    <span style="flex:1;min-width:0;"><span style="display:block;font-weight:800;color:${theme.text};">${escapeHtml(message.titulo)}</span><span style="font-size:11px;color:${theme.textTertiary};">${escapeHtml(message.categoria)}</span></span>
    <span aria-hidden="true">${message.copied ? '✓' : '⧉'}</span>
  </button>`;
}

export function renderLibraryOverview(model, theme, register) {
  const emptyFavorite = `<div style="color:${theme.textTertiary};">Marque mensagens com a estrela para vê-las aqui.</div>`;
  const emptyRecent = `<div style="color:${theme.textTertiary};">Copie uma mensagem e ela aparece aqui.</div>`;
  return `
    <main data-key="view-visaogeral" class="dp-view-enter" style="padding:22px 28px 60px;display:flex;flex-direction:column;gap:18px;">
      <div style="background:${theme.brandGradient};border-radius:${theme.radiusXl};padding:24px 28px;color:#fff;box-shadow:${theme.glow};">
        <div style="font-family:${theme.fontDisplay};font-weight:800;font-size:22px;">${escapeHtml(model.heroGreeting)}</div>
        <div style="font-size:13.5px;opacity:.85;margin-top:4px;">Copie sua mensagem em segundos.</div>
      </div>
      <section role="region" aria-label="Favoritas" style="background:${theme.cardBg};border:1px solid ${theme.border};border-radius:${theme.radiusXl};padding:22px;box-shadow:${theme.shadowMd};">
        <h2 style="margin-top:0">Favoritas</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">${model.hasFav ? model.favList.map(message => overviewItem(message, theme, register)).join('') : emptyFavorite}</div>
      </section>
      <section role="region" aria-label="Recentes" style="background:${theme.cardBg};border:1px solid ${theme.border};border-radius:${theme.radiusXl};padding:22px;box-shadow:${theme.shadowMd};">
        <h2 style="margin-top:0">Recentes</h2>
        <div style="display:flex;flex-direction:column;gap:10px;">${model.hasRecent ? model.recentList.map(message => overviewItem(message, theme, register)).join('') : emptyRecent}</div>
      </section>
    </main>`;
}

export function renderNoAccessView(model, theme, register) {
  return `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:${theme.pageBg};padding:24px;">
      <section aria-labelledby="no-access-title" style="width:100%;max-width:420px;background:${theme.cardBg};border:1px solid ${theme.border};border-radius:${theme.radiusXl};padding:40px 36px;text-align:center;box-shadow:${theme.shadowMd};">
        <h1 id="no-access-title" style="font-size:17px;color:${theme.text};margin:0 0 10px;">Sem acesso a nenhum departamento</h1>
        <p style="font-size:14px;color:${theme.textSecondary};line-height:1.5;margin:0 0 24px;">Olá, ${escapeHtml(model.noAcessoNome)}. Sua conta ainda não está vinculada a nenhum Acesso. Fale com um administrador para liberar seu acesso.</p>
        <button data-click="${register(model.logout)}" style="padding:12px 20px;border:0;border-radius:${theme.radiusSm};background:${theme.brandGradient};color:#fff;font-weight:700;">Sair</button>
      </section>
    </main>`;
}
