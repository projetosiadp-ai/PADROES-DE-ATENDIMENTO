/* Etapa 5: "Suas solicitações" (colaborador) e histórico de solicitações (superadministrador).
 * Mesmos padrões de lista, painel lateral e tabela da Administração; sem cor literal. */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const disabled = (value) => value ? 'disabled aria-disabled="true"' : '';

const STATUS_CLASS = Object.freeze({
  aprovada: ' dp-status--on',
  rejeitada: ' dp-status--rejected',
  pendente: '',
});

const statusChip = (status, label) =>
  `<span class="dp-status${STATUS_CLASS[status] ?? ''}">${escapeHtml(label)}</span>`;

const button = (label, handler, register, { variant = 'secondary', isDisabled = false } = {}) =>
  `<button type="button" class="dp-btn-${variant} dp-btn-sm" data-click="${register(handler)}" ${disabled(isDisabled)}>${escapeHtml(label)}</button>`;

function loadState(model, register, loadingText) {
  if (model.loading) return `<p role="status" class="dp-empty">${escapeHtml(loadingText)}</p>`;
  if (model.error) {
    return `<div class="dp-empty"><p role="alert" class="dp-alert">${escapeHtml(model.error)}</p>${button('Tentar de novo', model.onRetry, register, { variant: 'primary' })}</div>`;
  }
  return '';
}

function pager(model, register, label) {
  if (!model.hasPrevious && !model.hasNext) return '';
  return `
    <nav class="dp-pager" aria-label="Paginação de ${escapeHtml(label)}">
      ${button('Anterior', model.onPrevious, register, { isDisabled: !model.hasPrevious })}
      <span data-volatile>${escapeHtml(model.pageLabel)}</span>
      ${button('Próxima', model.onNext, register, { isDisabled: !model.hasNext })}
    </nav>`;
}

function versionCell(tag, version, modifier = '') {
  const tags = version.tags?.length ? `<span class="dp-hint">${version.tags.map(item => `#${escapeHtml(item)}`).join(' ')}</span>` : '';
  return `<div class="dp-compare__cell${modifier}"><span class="dp-compare__tag">${escapeHtml(tag)}</span>${escapeHtml(version.content)}
      <span class="dp-hint">${escapeHtml(version.category ?? '')} · ${escapeHtml(version.title)}</span>${tags}</div>`;
}

function requestDetail(model) {
  if (model.detailLoading) {
    return '<p role="status" class="dp-empty">Carregando a solicitação…</p>';
  }
  if (model.detailError) return `<p role="alert" class="dp-alert">${escapeHtml(model.detailError)}</p>`;
  const detail = model.detail;
  if (!detail) {
    return '<div class="dp-empty"><div class="dp-empty__title">Escolha uma solicitação</div><div>O retorno do superadministrador aparece aqui.</div></div>';
  }

  const comment = detail.comment
    ? `<div class="dp-review-comment"><span class="dp-label">Comentário do administrador</span><p>${escapeHtml(detail.comment)}</p></div>`
    : detail.status === 'pendente'
      ? '<p class="dp-hint">Aguardando a revisão do superadministrador.</p>'
      : '<p class="dp-hint">A decisão não teve comentário.</p>';

  let versions = '';
  if (detail.isArchive) {
    versions = detail.previous
      ? `<div class="dp-compare"><span class="dp-label">Mensagem</span><div class="dp-compare__grid dp-compare__grid--single">${versionCell('Pedido de arquivamento', detail.previous)}</div></div>`
      : '';
  } else if (detail.showComparison && detail.proposed && detail.published) {
    versions = `<div class="dp-compare"><span class="dp-label">Versões</span><div class="dp-compare__grid">${versionCell('Você enviou', detail.proposed)}${versionCell('Publicado', detail.published, ' dp-compare__cell--new')}</div></div>`;
  } else if (detail.proposed) {
    versions = `<div class="dp-compare"><span class="dp-label">Versão</span><div class="dp-compare__grid dp-compare__grid--single">${versionCell('Você enviou', detail.proposed)}</div></div>`;
  }

  return `
    <div class="dp-kicker">${escapeHtml(detail.typeLabel)} · ${escapeHtml(detail.accessName ?? '')}</div>
    <h2 class="dp-request__title">${escapeHtml(detail.title)}</h2>
    <div class="dp-inline">${statusChip(detail.status, detail.statusLabel)}</div>
    <div class="dp-hint" data-volatile>Enviada em ${escapeHtml(detail.createdLabel)}${detail.reviewedLabel ? ` · decidida em ${escapeHtml(detail.reviewedLabel)}` : ''}</div>
    ${comment}
    ${versions}`;
}

export function renderMyRequests(model, register) {
  const state = loadState(model, register, 'Carregando suas solicitações…');
  const list = state || (model.rows.length
    ? `<ul class="dp-list" aria-label="Suas solicitações">${model.rows.map(row => `
        <li data-key="my-request-${escapeHtml(row.id)}">
          <button type="button" class="dp-list-item dp-list-item--wrap" data-request-id="${escapeHtml(row.id)}" data-click="${register(row.onOpen)}"${row.selected ? ' aria-current="true"' : ''}>
            <span style="min-width:0;">
              <span class="dp-list-item__title">${escapeHtml(row.title)}</span>
              <span class="dp-list-item__meta" data-volatile>${escapeHtml(row.typeLabel)} · ${escapeHtml(row.accessName ?? '')} · enviada em ${escapeHtml(row.createdLabel)}${row.reviewedLabel ? ` · decidida em ${escapeHtml(row.reviewedLabel)}` : ''}</span>
            </span>
            ${statusChip(row.status, row.statusLabel)}
          </button>
        </li>`).join('')}</ul>${pager(model, register, 'Suas solicitações')}`
    : '<div class="dp-empty"><div class="dp-empty__title">Você ainda não enviou solicitações.</div><div>Use "Solicitar mensagem" ou "Sugerir edição" na Biblioteca; o resultado aparece aqui.</div></div>');

  return `
    <main class="dp-admin" data-testid="my-requests-ready" data-key="view-solicitacoes">
      <div class="dp-admin__split">
        <section class="dp-admin__main" aria-labelledby="my-requests-title">
          <h2 id="my-requests-title" class="sr-only">Suas solicitações</h2>
          ${list}
        </section>
        <aside class="dp-panel dp-admin__aside dp-request" aria-label="Detalhe da solicitação">
          ${requestDetail(model)}
        </aside>
      </div>
    </main>`;
}

function filterSelect(id, label, field, value, options, model, register) {
  return `
    <div class="dp-form-field">
      <label for="${id}" class="dp-label">${escapeHtml(label)}</label>
      <select class="dp-field" id="${id}" data-change="${register(model.onFilter(field))}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${optionValue === value ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`).join('')}
      </select>
    </div>`;
}

function filterDate(id, label, field, value, model, register) {
  return `
    <div class="dp-form-field">
      <label for="${id}" class="dp-label">${escapeHtml(label)}</label>
      <input class="dp-field" id="${id}" type="date" value="${escapeHtml(value)}" data-change="${register(model.onFilter(field))}" />
    </div>`;
}

const cell = (label, content) => `<td data-label="${escapeHtml(label)}">${content}</td>`;

export function renderRequestHistory(model, register) {
  const filters = model.filters;
  const filterBar = `
    <div class="dp-filters" role="group" aria-label="Filtros do histórico">
      ${filterSelect('history-status', 'Situação', 'status', filters.status, model.statusOptions, model, register)}
      ${filterSelect('history-type', 'Tipo', 'type', filters.type, model.typeOptions, model, register)}
      ${filterSelect('history-access', 'Acesso', 'accessId', filters.accessId, model.accessOptions, model, register)}
      ${filterSelect('history-requester', 'Solicitante', 'requesterId', filters.requesterId, model.requesterOptions, model, register)}
      ${filterDate('history-from', 'De', 'from', filters.from, model, register)}
      ${filterDate('history-to', 'Até', 'to', filters.to, model, register)}
      <div class="dp-filters__actions">${button('Limpar filtros', model.onClearFilters, register)}</div>
    </div>`;

  const columns = ['Solicitação', 'Acesso', 'Solicitante', 'Enviada', 'Situação', 'Decisão', 'Comentário'];
  const rows = model.rows.map(row => `
    <tr data-request-id="${escapeHtml(row.id)}">
      ${cell('Solicitação', `<strong>${escapeHtml(row.title)}</strong><span class="dp-hint">${escapeHtml(row.typeLabel)}</span>`)}
      ${cell('Acesso', escapeHtml(row.accessName ?? '—'))}
      ${cell('Solicitante', escapeHtml(row.requesterName ?? '—'))}
      ${cell('Enviada', `<span data-volatile>${escapeHtml(row.createdLabel)}</span>`)}
      ${cell('Situação', statusChip(row.status, row.statusLabel))}
      ${cell('Decisão', escapeHtml(row.decisionLabel || '—'))}
      ${cell('Comentário', escapeHtml(row.comment || '—'))}
    </tr>`).join('');

  const state = loadState(model, register, 'Carregando o histórico…');
  const table = state || `
    <p role="status" class="dp-hint" data-volatile>${escapeHtml(model.totalLabel)}</p>
    <div class="dp-table-wrap"><table class="dp-table dp-table--cards" aria-label="Histórico de solicitações">
      <thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${columns.length}" class="dp-table__empty">Nenhuma solicitação corresponde aos filtros.</td></tr>`}</tbody>
    </table></div>
    ${pager(model, register, 'Histórico de solicitações')}`;

  return `
    <section class="dp-panel dp-stack" aria-labelledby="admin-history-title">
      <div class="dp-admin__toolbar"><h2 id="admin-history-title">Histórico de solicitações</h2></div>
      ${filterBar}
      ${table}
    </section>`;
}
