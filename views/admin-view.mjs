const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const disabled = (value) => value ? 'disabled aria-disabled="true"' : '';

const action = (label, handler, register, { variant = 'secondary', ariaLabel = '', saving = false } = {}) =>
  `<button type="button" class="dp-btn-${variant} dp-btn-sm" data-click="${register(handler)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''} ${disabled(saving)}>${escapeHtml(label)}</button>`;

/* Tabelas reais (<table>) no computador; abaixo de 720 px o CSS as transforma em cartões,
 * e cada célula mostra o próprio cabeçalho a partir de data-label. */
function table({ label, columns, rows, empty }) {
  const head = columns.map(column => `<th scope="col"${column.align ? ` class="dp-table__${column.align}"` : ''}>${escapeHtml(column.label)}</th>`).join('');
  const body = rows.length
    ? rows.join('')
    : `<tr><td colspan="${columns.length}" class="dp-table__empty">${escapeHtml(empty)}</td></tr>`;
  return `<div class="dp-table-wrap"><table class="dp-table dp-table--cards" aria-label="${escapeHtml(label)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const cell = (label, content, { align = '' } = {}) =>
  `<td data-label="${escapeHtml(label)}"${align ? ` class="dp-table__${align}"` : ''}>${content}</td>`;

function tabs(model, register) {
  const items = [
    ['Solicitações', model.isAdminSolicitacoes, model.setAdminTabSolicitacoes, model.solicitacoesCount],
    ['Mensagens', model.isAdminMsgs, model.setAdminTabMsgs, model.adminMsgRows.length],
    ['Categorias', model.isAdminCats, model.setAdminTabCats, model.catRows.length],
    ['Arquivados', model.isAdminArchived, model.setAdminTabArchived, null],
    ['Acessos', model.isAdminAcessos, model.setAdminTabAcessos, model.acessoRows.length],
    ['Contas', model.isAdminAccounts, model.setAdminTabAccounts, model.accountsLoading ? null : model.accountRows.length],
  ];
  return `<div class="dp-pills" role="tablist" aria-label="Seções do painel administrativo">
    ${items.map(([label, active, onClick, count]) => `<button type="button" class="dp-pill" role="tab" aria-selected="${active}" data-click="${register(onClick)}">${label}${count != null ? ` <span data-volatile>${count}</span>` : ''}</button>`).join('')}
  </div>`;
}

function requestPanel(panel, register) {
  if (!panel) {
    return `<aside class="dp-panel dp-admin__aside" aria-label="Solicitação selecionada"><div class="dp-empty"><div class="dp-empty__title">Nenhuma solicitação pendente</div><div>Quando um colaborador sugerir uma mudança, ela aparece aqui.</div></div></aside>`;
  }
  const compare = (label, before, after) => `
    <div class="dp-compare">
      <span class="dp-label">${escapeHtml(label)}</span>
      <div class="dp-compare__grid${after == null ? ' dp-compare__grid--single' : ''}">
        <div class="dp-compare__cell"><span class="dp-compare__tag">Antes</span>${escapeHtml(before || (panel.isCreation ? 'Não existe — mensagem nova.' : '—'))}</div>
        ${after != null ? `<div class="dp-compare__cell dp-compare__cell--new"><span class="dp-compare__tag">Proposto</span>${escapeHtml(after)}</div>` : ''}
      </div>
    </div>`;

  const fields = panel.isArchive
    ? `${compare('Título', panel.previousTitle, null)}${compare('Conteúdo', panel.previousContent, null)}`
    : `${compare('Categoria', panel.previousCategory, panel.category)}${compare('Título', panel.previousTitle, panel.title)}${compare('Conteúdo', panel.previousContent, panel.content)}`;

  const reject = panel.rejectMode
    ? `<label class="dp-form-field"><span class="dp-label">Motivo da rejeição</span><textarea class="dp-field" aria-label="Motivo da rejeição" maxlength="500" rows="3" data-input="${register(panel.onReasonChange)}" ${panel.invalid?.includes('reason') ? 'aria-invalid="true" aria-describedby="review-error"' : ''} ${disabled(panel.saving)}>${escapeHtml(panel.reason)}</textarea></label>`
    : '';

  const buttons = panel.rejectMode
    ? `${action('Cancelar', panel.onCancelReject, register, { saving: panel.saving })}<span class="dp-band__spacer"></span>${action(panel.saving ? 'Rejeitando…' : 'Confirmar rejeição', panel.onReject, register, { variant: 'danger', saving: panel.saving })}`
    : `${action('Rejeitar com motivo', panel.onStartReject, register, { variant: 'danger', saving: panel.saving })}<span class="dp-band__spacer"></span>${action(panel.saving ? 'Aprovando…' : 'Aprovar e publicar', panel.onApprove, register, { variant: 'primary', saving: panel.saving })}`;

  return `
    <aside class="dp-panel dp-admin__aside dp-request" aria-label="Solicitação selecionada"${panel.saving ? ' aria-busy="true"' : ''}>
      <div class="dp-kicker">${escapeHtml(panel.typeLabel)} · ${escapeHtml(panel.department)}</div>
      <h2 class="dp-request__title">${escapeHtml(panel.title || panel.previousTitle || 'Mensagem')}</h2>
      <div class="dp-hint" data-volatile>Enviada por ${escapeHtml(panel.user)}${panel.dateLabel ? ` · ${escapeHtml(panel.dateLabel)}` : ''}</div>
      ${fields}
      ${panel.tags.length ? `<div class="dp-reading__tags">${panel.tags.map(tag => `<span class="dp-chip">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      ${reject}
      ${panel.error ? `<p id="review-error" role="alert" class="dp-alert">${escapeHtml(panel.error)}</p>` : ''}
      <div class="dp-request__actions">${buttons}</div>
    </aside>`;
}

function requests(model, register) {
  const list = model.solicitacaoRows.length
    ? `<ul class="dp-list" aria-label="Solicitações pendentes">${model.solicitacaoRows.map(row => `
        <li data-key="request-${escapeHtml(row.id)}">
          <button type="button" class="dp-list-item" data-request-id="${escapeHtml(row.id)}" data-click="${register(row.onOpen)}"${row.selected ? ' aria-current="true"' : ''}>
            <span style="min-width:0;">
              <span class="dp-list-item__title">${escapeHtml(row.titulo)}</span>
              <span class="dp-list-item__meta" data-volatile>${escapeHtml(row.tipoLabel)} · ${escapeHtml(row.departamento)} · ${escapeHtml(row.usuario)}</span>
            </span>
            <span class="dp-status">Pendente</span>
          </button>
        </li>`).join('')}</ul>`
    : '<div class="dp-empty">Nenhuma solicitação pendente.</div>';

  return `
    <div class="dp-admin__split">
      <section class="dp-admin__main" aria-labelledby="admin-requests-title">
        <h2 id="admin-requests-title" class="sr-only">Solicitações de aprovação</h2>
        ${list}
      </section>
      ${requestPanel(model.requestPanel, register)}
    </div>`;
}

function categoriesAside(model) {
  return `
    <aside class="dp-panel dp-admin__aside" aria-label="Categorias deste acesso">
      <div class="dp-kicker">Categorias deste acesso</div>
      <ul class="dp-side-list">
        ${model.catRows.map((row, index) => `<li class="${index % 2 ? 'dp-side-list__alt' : ''}"><strong>${escapeHtml(row.nome)}</strong><span data-volatile>${escapeHtml(row.countLabel)}</span></li>`).join('') || '<li>Nenhuma categoria ativa.</li>'}
      </ul>
      <p class="dp-hint">Arquivar uma categoria mantém as mensagens, mas elas saem da biblioteca até serem movidas.</p>
    </aside>`;
}

function messages(model, register) {
  const rows = model.adminMsgRows.map(row => `
    <tr data-message-id="${escapeHtml(row.id)}">
      ${cell('Mensagem', `<strong>${escapeHtml(row.titulo)}</strong><span class="dp-hint dp-clamp">${escapeHtml(row.conteudo)}</span>`)}
      ${cell('Categoria', escapeHtml(row.categoria))}
      ${cell('Uso', `<span data-volatile>${escapeHtml(row.usageLabel)}</span>`)}
      ${cell('Ações', `<span class="dp-inline dp-inline--end">${action('Editar', row.onEdit, register)}${action('Arquivar', row.onArchive, register, { variant: 'danger' })}</span>`, { align: 'end' })}
    </tr>`);

  return `
    <div class="dp-admin__split dp-admin__split--narrow">
      <section class="dp-panel dp-admin__main" aria-labelledby="admin-messages-title">
        <div class="dp-admin__toolbar">
          <h2 id="admin-messages-title">Mensagens</h2>
          <label class="dp-search dp-search--compact">
            <span class="sr-only">Buscar mensagens</span>
            <input class="dp-field" aria-label="Buscar mensagens na administração" placeholder="Buscar no conteúdo…" value="${escapeHtml(model.adminSearchQueryDraft)}" data-input="${register(model.onAdminSearchChange)}" />
          </label>
        </div>
        ${table({ label: 'Mensagens ativas', columns: [{ label: 'Mensagem' }, { label: 'Categoria' }, { label: 'Uso' }, { label: 'Ações', align: 'end' }], rows, empty: 'Nenhuma mensagem ativa.' })}
      </section>
      ${categoriesAside(model)}
    </div>`;
}

function categories(model, register) {
  const rows = model.catRows.map(row => `
    <tr data-category-id="${escapeHtml(row.id)}">
      ${cell('Categoria', `<strong>${escapeHtml(row.nome)}</strong>`)}
      ${cell('Mensagens', `<span data-volatile>${escapeHtml(row.countLabel)}</span>`)}
      ${cell('Ações', `<span class="dp-inline dp-inline--end">${action('Editar', row.onEdit, register)}${action('Arquivar', row.onArchive, register, { variant: 'danger' })}</span>`, { align: 'end' })}
    </tr>`);
  return `
    <section class="dp-panel" aria-labelledby="admin-categories-title">
      <div class="dp-admin__toolbar"><h2 id="admin-categories-title">Categorias</h2></div>
      ${table({ label: 'Categorias ativas', columns: [{ label: 'Categoria' }, { label: 'Mensagens' }, { label: 'Ações', align: 'end' }], rows, empty: 'Nenhuma categoria ativa.' })}
    </section>`;
}

function archived(model, register) {
  if (model.archivedLoading) return '<section class="dp-panel"><p role="status" class="dp-empty">Carregando conteúdo arquivado…</p></section>';
  const archivedTable = (label, rows, idAttribute, detailLabel) => table({
    label: `${label} arquivadas`,
    columns: [{ label: label === 'Mensagens' ? 'Mensagem' : 'Categoria' }, { label: detailLabel }, { label: 'Ações', align: 'end' }],
    rows: rows.map(row => `
      <tr ${idAttribute}="${escapeHtml(row.id)}">
        ${cell(label === 'Mensagens' ? 'Mensagem' : 'Categoria', `<strong>${escapeHtml(row.nome || row.titulo)}</strong>`)}
        ${cell(detailLabel, escapeHtml(row.categoria || '—'))}
        ${cell('Ações', action('Restaurar', row.onRestore, register, { variant: 'primary' }), { align: 'end' })}
      </tr>`),
    empty: 'Nenhum item arquivado.',
  });
  return `
    <section class="dp-panel dp-stack" aria-labelledby="admin-archived-title">
      <div class="dp-admin__toolbar"><h2 id="admin-archived-title">Conteúdo arquivado</h2></div>
      <h3>Mensagens</h3>
      ${archivedTable('Mensagens', model.archivedMessageRows, 'data-message-id', 'Categoria')}
      <h3>Categorias</h3>
      ${archivedTable('Categorias', model.archivedCategoryRows, 'data-category-id', 'Observação')}
    </section>`;
}

const statusChip = (active) => `<span class="dp-status${active ? ' dp-status--on' : ''}">${active ? 'Ativo' : 'Inativo'}</span>`;

function accesses(model, register) {
  const rows = model.acessoRows.map(row => `
    <tr data-access-id="${escapeHtml(row.id)}">
      ${cell('Acesso', `<strong>${escapeHtml(row.nome)}</strong>`)}
      ${cell('Situação', statusChip(row.ativo))}
      ${cell('Uso', `<span data-volatile>${escapeHtml(row.statsLabel)}</span>`)}
      ${cell('Ações', `<span class="dp-inline dp-inline--end">${action('Gerenciar vínculos', row.onUsers, register)}${action(row.toggleLabel, row.onToggleStatus, register, { variant: row.ativo ? 'danger' : 'primary' })}</span>`, { align: 'end' })}
    </tr>`);
  return `
    <section class="dp-panel" aria-labelledby="admin-access-title">
      <div class="dp-admin__toolbar"><h2 id="admin-access-title">Acessos</h2></div>
      ${table({ label: 'Acessos cadastrados', columns: [{ label: 'Acesso' }, { label: 'Situação' }, { label: 'Uso' }, { label: 'Ações', align: 'end' }], rows, empty: 'Nenhum acesso cadastrado.' })}
    </section>`;
}

function accessesAside(model) {
  return `
    <aside class="dp-panel dp-admin__aside" aria-label="Situação dos acessos">
      <div class="dp-kicker">Acessos</div>
      <ul class="dp-side-list">
        ${model.acessoRows.map((row, index) => `<li class="${row.ativo ? (index % 2 ? 'dp-side-list__alt' : '') : 'dp-side-list__off'}"><strong>${escapeHtml(row.nome)}</strong>${statusChip(row.ativo)}<span class="dp-side-list__detail" data-volatile>${escapeHtml(row.statsLabel)}</span></li>`).join('') || '<li>Nenhum acesso cadastrado.</li>'}
      </ul>
    </aside>`;
}

function accounts(model, register) {
  const rows = model.accountRows.map(row => {
    const actions = row.withoutAccess
      ? `${action('Conceder acesso', row.onMemberships, register, { variant: 'primary', ariaLabel: `Conceder acesso a ${row.name}` })}${action('Senha', row.onResetPassword, register, { ariaLabel: `Redefinir senha de ${row.name}` })}`
      : `${action('Acessos', row.onMemberships, register, { ariaLabel: `Gerenciar acessos de ${row.name}` })}${action('Senha', row.onResetPassword, register, { ariaLabel: `Redefinir senha de ${row.name}` })}`;
    return `
      <tr data-user-id="${escapeHtml(row.id)}">
        ${cell('Conta', `<span class="dp-person"><span class="dp-initials${row.withoutAccess ? ' dp-initials--alert' : ''}" aria-hidden="true">${escapeHtml(row.initials)}</span><span style="min-width:0;"><strong>${escapeHtml(row.name)}</strong><span class="dp-hint">${escapeHtml(row.email)}</span></span></span>`)}
        ${cell('Acessos', row.withoutAccess ? '<span class="dp-danger-text">Sem vínculo</span>' : `<span data-volatile>${escapeHtml(row.accessLabel)}</span>`)}
        ${cell('Perfil', `<span class="dp-status${row.isSuperadmin ? ' dp-status--on' : ''}">${escapeHtml(row.roleLabel)}</span>`)}
        ${cell('Ações', `<span class="dp-inline dp-inline--end">${actions}</span>`, { align: 'end' })}
      </tr>`;
  });

  return `
    <div class="dp-admin__split dp-admin__split--narrow">
      <section class="dp-panel dp-admin__main" aria-labelledby="admin-accounts-title">
        <div class="dp-admin__toolbar"><h2 id="admin-accounts-title">Contas</h2></div>
        ${model.accountsLoading
          ? '<p role="status" class="dp-empty">Carregando contas…</p>'
          : table({ label: 'Contas internas', columns: [{ label: 'Conta' }, { label: 'Acessos' }, { label: 'Perfil' }, { label: 'Ações', align: 'end' }], rows, empty: 'Nenhuma conta cadastrada.' })}
      </section>
      ${accessesAside(model)}
    </div>`;
}

export function renderAdminView(model, register) {
  let content = '';
  if (model.isAdminSolicitacoes) content = requests(model, register);
  else if (model.isAdminMsgs) content = messages(model, register);
  else if (model.isAdminCats) content = categories(model, register);
  else if (model.isAdminArchived) content = archived(model, register);
  else if (model.isAdminAccounts) content = accounts(model, register);
  else content = accesses(model, register);

  return `${tabs(model, register)}
    <main data-key="view-admin" class="dp-admin" data-testid="admin-ready">${content}</main>`;
}
