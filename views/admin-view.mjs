const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const actionButton = (label, handler, register, theme, danger = false) =>
  `<button type="button" data-click="${register(handler)}" aria-label="${escapeHtml(label)}" style="border:1px solid ${danger ? theme.danger : theme.border};background:${danger ? theme.dangerSoft : 'transparent'};color:${danger ? theme.danger : theme.textSecondary};font-size:12px;font-weight:700;padding:7px 12px;border-radius:${theme.radiusSm};">${escapeHtml(label)}</button>`;

function tabs(model, theme, register) {
  const items = [
    ['Mensagens', model.isAdminMsgs, model.setAdminTabMsgs],
    ['Categorias', model.isAdminCats, model.setAdminTabCats],
    ['Solicitações', model.isAdminSolicitacoes, model.setAdminTabSolicitacoes, model.solicitacoesCount],
    ['Arquivados', model.isAdminArchived, model.setAdminTabArchived],
    ['Acessos', model.isAdminAcessos, model.setAdminTabAcessos],
    ['Contas', model.isAdminAccounts, model.setAdminTabAccounts],
  ];
  return `<div role="tablist" aria-label="Seções do painel administrativo" style="display:flex;gap:6px;flex-wrap:wrap;">
    ${items.map(([label, active, onClick, count]) => `<button type="button" role="tab" aria-selected="${active}" data-click="${register(onClick)}" style="border:0;border-radius:999px;padding:10px 16px;background:${active ? theme.navy : 'transparent'};color:${active ? '#fff' : theme.text};font-weight:700;">${label}${count ? ` (${count})` : ''}</button>`).join('')}
  </div>`;
}

function messages(model, theme, register) {
  return `<section aria-labelledby="admin-messages-title">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px;">
      <h2 id="admin-messages-title" style="margin:0;">Mensagens</h2>
      <button type="button" data-click="${register(model.openCreateMsg)}">Nova mensagem</button>
    </div>
    <label style="display:block;margin-bottom:14px;">Buscar mensagens
      <input aria-label="Buscar mensagens na administração" value="${escapeHtml(model.adminSearchQueryDraft)}" data-input="${register(model.onAdminSearchChange)}" />
    </label>
    <div role="table" aria-label="Mensagens ativas">
      ${model.adminMsgRows.map(row => `<div role="row" class="dp-admin-card" data-message-id="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;">
        <div role="cell"><strong>${escapeHtml(row.titulo)}</strong><div style="color:${theme.textTertiary};font-size:12px;">${escapeHtml(row.categoria)}</div></div>
        <div role="cell" style="color:${theme.textSecondary};">${escapeHtml(row.conteudo)}</div>
        <div role="cell" style="display:flex;gap:7px;">${actionButton('Editar', row.onEdit, register, theme)}${actionButton('Arquivar', row.onArchive, register, theme, true)}</div>
      </div>`).join('') || '<div role="row"><div role="cell"><p>Nenhuma mensagem ativa.</p></div></div>'}
    </div>
  </section>`;
}

function categories(model, theme, register) {
  return `<section aria-labelledby="admin-categories-title">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px;">
      <h2 id="admin-categories-title" style="margin:0;">Categorias</h2>
      <button type="button" data-click="${register(model.openCreateCat)}">Nova categoria</button>
    </div>
    <div role="table" aria-label="Categorias ativas">
      ${model.catRows.map(row => `<div role="row" class="dp-admin-card" data-category-id="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:1fr auto;gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;">
        <div role="cell"><strong>${escapeHtml(row.nome)}</strong><div style="color:${theme.textTertiary};font-size:12px;">${escapeHtml(row.countLabel)}</div></div>
        <div role="cell" style="display:flex;gap:7px;">${actionButton('Editar', row.onEdit, register, theme)}${actionButton('Arquivar', row.onArchive, register, theme, true)}</div>
      </div>`).join('') || '<div role="row"><div role="cell"><p>Nenhuma categoria ativa.</p></div></div>'}
    </div>
  </section>`;
}

function requests(model, theme, register) {
  return `<section aria-labelledby="admin-requests-title">
    <h2 id="admin-requests-title">Solicitações de Aprovação</h2>
    <div role="table" aria-label="Solicitações pendentes">
      ${model.solicitacaoRows.map(row => `<div role="row" class="dp-admin-card" data-request-id="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;">
        <div role="cell"><strong>${escapeHtml(row.titulo)}</strong><div style="font-size:12px;color:${theme.textTertiary};">${escapeHtml(row.departamento)}</div></div>
        <div role="cell">${escapeHtml(row.usuario)}</div><div role="cell">${escapeHtml(row.tipoLabel)}</div>
        <div role="cell">${actionButton('Analisar', row.onOpen, register, theme)}</div>
      </div>`).join('') || '<div role="row"><div role="cell"><p>Nenhuma solicitação pendente.</p></div></div>'}
    </div>
  </section>`;
}

function archived(model, theme, register) {
  if (model.archivedLoading) return '<p role="status">Carregando conteúdo arquivado…</p>';
  const archivedRows = (label, rows, idAttribute) => `<section><h3>${label}</h3><div role="table" aria-label="${label} arquivadas">
    ${rows.map(row => `<div role="row" class="dp-admin-card" ${idAttribute}="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:1fr auto;gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;">
      <div role="cell"><strong>${escapeHtml(row.nome || row.titulo)}</strong>${row.categoria ? `<div style="font-size:12px;color:${theme.textTertiary};">${escapeHtml(row.categoria)}</div>` : ''}</div>
      <div role="cell">${actionButton('Restaurar', row.onRestore, register, theme)}</div>
    </div>`).join('') || '<div role="row"><div role="cell"><p>Nenhum item arquivado.</p></div></div>'}</div></section>`;
  return `<section aria-labelledby="admin-archived-title"><h2 id="admin-archived-title">Conteúdo arquivado</h2>
    ${archivedRows('Mensagens', model.archivedMessageRows, 'data-message-id')}
    ${archivedRows('Categorias', model.archivedCategoryRows, 'data-category-id')}
  </section>`;
}

function accesses(model, theme, register) {
  return `<section aria-labelledby="admin-access-title"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><h2 id="admin-access-title">Acessos</h2><button type="button" data-click="${register(model.openCreateAcesso)}">Novo acesso</button></div>
    <div role="table" aria-label="Acessos cadastrados">${model.acessoRows.map(row => `<div role="row" class="dp-admin-card" data-access-id="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;"><div role="cell"><strong>${escapeHtml(row.nome)}</strong><div style="font-size:12px;color:${theme.textSecondary};">${escapeHtml(row.statsLabel)} · ${escapeHtml(row.statusLabel)}</div></div><div role="cell" style="display:flex;gap:7px;flex-wrap:wrap;">${actionButton('Gerenciar vínculos', row.onUsers, register, theme)} ${actionButton(row.toggleLabel, row.onToggleStatus, register, theme, row.toggleLabel === 'Desativar')}</div></div>`).join('') || '<div role="row"><div role="cell"><p>Nenhum acesso cadastrado.</p></div></div>'}</div>
  </section>`;
}

function accounts(model, theme, register) {
  return `<section aria-labelledby="admin-accounts-title">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><h2 id="admin-accounts-title">Contas</h2><button type="button" data-click="${register(model.openCreateAccount)}">Nova conta</button></div>
    ${model.accountsLoading ? '<p role="status">Carregando contas…</p>' : `<div role="table" aria-label="Contas internas">
      ${model.accountRows.map(row => `<div role="row" class="dp-admin-card" data-user-id="${escapeHtml(row.id)}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px;padding:13px;border-top:1px solid ${theme.border};align-items:center;">
        <div role="cell"><strong>${escapeHtml(row.name)}</strong><div style="font-size:12px;color:${theme.textSecondary};overflow-wrap:anywhere;">${escapeHtml(row.email)}</div></div>
        <div role="cell" style="font-size:12px;color:${theme.textSecondary};">${escapeHtml(row.roleLabel)} · ${escapeHtml(row.membershipLabel)}</div>
        <div role="cell" style="display:flex;gap:7px;flex-wrap:wrap;">${actionButton('Gerenciar acessos', row.onMemberships, register, theme)}${actionButton('Redefinir senha', row.onResetPassword, register, theme, true)}</div>
      </div>`).join('') || '<div role="row"><div role="cell"><p>Nenhuma conta cadastrada.</p></div></div>'}</div>`}
  </section>`;
}

export function renderAdminView(model, theme, register) {
  let content = '';
  if (model.isAdminMsgs) content = messages(model, theme, register);
  else if (model.isAdminCats) content = categories(model, theme, register);
  else if (model.isAdminSolicitacoes) content = requests(model, theme, register);
  else if (model.isAdminArchived) content = archived(model, theme, register);
  else if (model.isAdminAccounts) content = accounts(model, theme, register);
  else content = accesses(model, theme, register);

  return `<main data-key="view-admin" class="dp-admin-layout dp-view-enter" style="padding:22px 28px 60px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;background:${theme.cardBg};border:1px solid ${theme.border};border-radius:${theme.radiusLg};padding:10px 14px;margin-bottom:20px;">
      ${tabs(model, theme, register)}
      <div style="font-size:12px;color:${theme.textTertiary};">Operando em: <strong>${escapeHtml(model.activeAcesso.nome)}</strong></div>
    </div>
    <div style="background:${theme.cardBg};border:1px solid ${theme.border};border-radius:${theme.radiusLg};padding:20px;overflow:auto;">${content}</div>
  </main>`;
}
