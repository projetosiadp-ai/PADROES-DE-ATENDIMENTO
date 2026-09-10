const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const disabled = (value) => value ? 'disabled aria-disabled="true"' : '';
// A dialog marked busy blocks Escape and overlay dismissal until its operation settles.
const busy = (value) => value ? 'aria-busy="true"' : '';
const invalid = (model, field, errorId) => model.invalid?.includes(field)
  ? `aria-invalid="true" aria-describedby="${errorId}"`
  : '';
const errorMessage = (message, id, theme) => message
  ? `<p id="${id}" role="alert" style="margin:0;color:${theme.danger};">${escapeHtml(message)}</p>`
  : '';

function requestForm(model, theme, register) {
  const form = model.form;
  const stop = register(event => event.stopPropagation());
  const errorId = 'request-form-error';
  const categoryOptions = model.categories
    .map(category => `<option value="${escapeHtml(category.id)}" ${category.id === form.categoryId ? 'selected' : ''}>${escapeHtml(category.nome)}</option>`)
    .join('');

  return `
    <div role="presentation" data-click="${register(model.onClose)}" style="position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);">
      <section role="dialog" aria-modal="true" aria-label="${escapeHtml(model.accessibleName)}" ${busy(model.saving)} data-click="${stop}" style="width:100%;max-width:560px;max-height:90vh;overflow:auto;background:${theme.modalSolidBg};color:${theme.text};border-radius:${theme.radiusXl};padding:26px;box-shadow:${theme.shadowLg};">
        <h2 style="margin:0 0 18px;font-size:19px;">${escapeHtml(model.title)}</h2>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;">
            Categoria
            <select aria-label="Categoria" data-change="${register(model.onCategoryChange)}" ${invalid(model, 'categoryId', errorId)} ${disabled(model.saving)} style="padding:10px 12px;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:${theme.inputBg};color:${theme.text};">
              ${categoryOptions}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;">
            Título
            <input aria-label="Título" maxlength="100" value="${escapeHtml(form.title)}" data-input="${register(model.onTitleChange)}" ${invalid(model, 'title', errorId)} ${disabled(model.saving)} style="padding:10px 12px;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:${theme.inputBg};color:${theme.text};" />
          </label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;">
            Tags
            <input aria-label="Tags" value="${escapeHtml(form.tagsText)}" data-input="${register(model.onTagsChange)}" ${disabled(model.saving)} placeholder="ex.: cobrança, retorno" style="padding:10px 12px;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:${theme.inputBg};color:${theme.text};" />
          </label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;">
            Conteúdo
            <textarea aria-label="Conteúdo" maxlength="2000" rows="7" data-input="${register(model.onContentChange)}" ${invalid(model, 'content', errorId)} ${disabled(model.saving)} style="padding:10px 12px;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:${theme.inputBg};color:${theme.text};resize:vertical;">${escapeHtml(form.content)}</textarea>
          </label>
          ${errorMessage(model.error, errorId, theme)}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
          <button type="button" data-click="${register(model.onClose)}" ${disabled(model.saving)}>Cancelar</button>
          <button type="button" data-click="${register(model.onSubmit)}" ${disabled(model.saving)} style="border:0;border-radius:${theme.radiusSm};padding:10px 16px;background:${theme.brandGradient};color:#fff;font-weight:700;">${model.saving ? 'Enviando…' : 'Enviar para revisão'}</button>
        </div>
      </section>
    </div>`;
}

function archiveConfirmation(model, theme, register) {
  const stop = register(event => event.stopPropagation());
  return `
    <div role="presentation" data-click="${register(model.onClose)}" style="position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);">
      <section role="alertdialog" aria-modal="true" aria-label="${escapeHtml(model.accessibleName)}" ${busy(model.saving)} data-click="${stop}" style="width:100%;max-width:430px;background:${theme.modalSolidBg};color:${theme.text};border-radius:${theme.radiusXl};padding:26px;box-shadow:${theme.shadowLg};">
        <h2 style="margin:0 0 10px;font-size:19px;">Solicitar arquivamento</h2>
        <p style="line-height:1.5;color:${theme.textSecondary};">A mensagem continuará publicada até a revisão do superadministrador. Se aprovada, poderá ser restaurada depois.</p>
        ${errorMessage(model.error, 'archive-request-error', theme)}
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
          <button type="button" data-click="${register(model.onClose)}" ${disabled(model.saving)}>Cancelar</button>
          <button type="button" data-click="${register(model.onSubmit)}" ${disabled(model.saving)} style="border:0;border-radius:${theme.radiusSm};padding:10px 16px;background:${theme.navy};color:#fff;font-weight:700;">${model.saving ? 'Enviando…' : 'Enviar solicitação'}</button>
        </div>
      </section>
    </div>`;
}

export function renderMessageRequestModal(model, theme, register) {
  if (!model?.open) return '';
  return model.type === 'arquivamento'
    ? archiveConfirmation(model, theme, register)
    : requestForm(model, theme, register);
}

// Superadministrator create/edit form for published messages.
export function renderMessageEditorModal(model, theme, register) {
  if (!model?.open) return '';
  const stop = register(event => event.stopPropagation());
  const errorId = 'message-editor-error';
  const field = `width:100%;padding:10px 12px;border-radius:${theme.radiusSm};border:1px solid ${theme.border};background:${theme.inputBg};color:${theme.text};font-size:13px;font-family:inherit;`;
  const label = `font-size:12px;font-weight:700;color:${theme.textSecondary};display:block;margin-bottom:6px;`;
  const categoryOptions = model.categories
    .map(category => `<option value="${escapeHtml(category.id)}" ${category.id === model.form.categoryId ? 'selected' : ''}>${escapeHtml(category.nome)}</option>`)
    .join('');
  const tagChips = model.tagChips
    .map(tag => `<span style="font-size:11px;font-weight:700;color:${theme.text};background:${theme.pageBg};padding:4px 6px 4px 10px;border-radius:999px;display:inline-flex;align-items:center;gap:4px;">${escapeHtml(tag.label)}<button type="button" aria-label="Remover tag ${escapeHtml(tag.label)}" data-click="${register(tag.onRemove)}" ${disabled(model.saving)} style="border:0;background:transparent;color:${theme.textSecondary};padding:0 4px;font-size:14px;line-height:1;">×</button></span>`)
    .join('');

  return `
    <div role="presentation" data-click="${register(model.onClose)}" style="position:fixed;inset:0;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;">
      <section role="dialog" aria-modal="true" aria-label="${escapeHtml(model.title)}" ${busy(model.saving)} data-click="${stop}" style="width:100%;max-width:520px;max-height:90vh;overflow:auto;background:${theme.modalSolidBg};color:${theme.text};border-radius:16px;padding:28px;animation:dp-modal-in .18s ease-out;">
        <h2 style="font-size:18px;font-weight:800;margin:0 0 18px;">${escapeHtml(model.title)}</h2>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label style="${label}">Categoria / Situação
            <select aria-label="Categoria" data-change="${register(model.onCategoryChange)}" ${invalid(model, 'categoryId', errorId)} ${disabled(model.saving)} style="${field}margin-top:6px;">${categoryOptions}</select>
          </label>
          <label style="${label}">Título (máx. 100 caracteres)
            <input aria-label="Título" type="text" maxlength="100" value="${escapeHtml(model.form.title)}" data-input="${register(model.onTitleChange)}" ${invalid(model, 'title', errorId)} ${disabled(model.saving)} style="${field}margin-top:6px;" />
          </label>
          <div>
            <span style="${label}">Tags</span>
            ${tagChips ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${tagChips}</div>` : ''}
            <div style="display:flex;gap:8px;">
              <input aria-label="Nova tag" type="text" placeholder="adicionar tag e Enter" value="${escapeHtml(model.form.tagInput)}" data-input="${register(model.onTagInputChange)}" data-keydown="${register(model.onTagKeyDown)}" ${disabled(model.saving)} style="${field}flex:1;" />
              <button type="button" aria-label="Adicionar tag" data-click="${register(model.onAddTag)}" ${disabled(model.saving)} style="border:1px solid ${theme.border};background:transparent;color:${theme.text};font-size:12px;font-weight:700;padding:0 14px;border-radius:${theme.radiusSm};">Adicionar</button>
            </div>
          </div>
          <label style="${label}">Conteúdo (${escapeHtml(model.form.content.length)}/2000)
            <textarea aria-label="Conteúdo" maxlength="2000" rows="5" data-input="${register(model.onContentChange)}" ${invalid(model, 'content', errorId)} ${disabled(model.saving)} style="${field}margin-top:6px;resize:vertical;">${escapeHtml(model.form.content)}</textarea>
          </label>
          ${errorMessage(model.error, errorId, theme)}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
          <button type="button" data-click="${register(model.onClose)}" ${disabled(model.saving)} style="padding:10px 18px;border-radius:8px;border:1px solid ${theme.border};background:transparent;color:${theme.text};font-size:13px;font-weight:700;">Cancelar</button>
          <button type="button" data-click="${register(model.onSubmit)}" ${disabled(model.saving)} style="padding:10px 18px;border-radius:8px;border:none;background:${theme.navy};color:#fff;font-size:13px;font-weight:700;opacity:${model.saving ? '0.7' : '1'};">${model.saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </section>
    </div>`;
}

// While `saving`, both actions are disabled and the dialog is busy, so neither a second click,
// Cancelar, the overlay nor Escape can interrupt the confirmed operation.
export function renderAdminConfirmationModal(model, theme, register) {
  if (!model?.open) return '';
  const stop = register(event => event.stopPropagation());
  const saving = Boolean(model.saving);
  return `<div role="presentation" data-click="${register(model.onClose)}" style="position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);">
    <section role="alertdialog" aria-modal="true" aria-label="${escapeHtml(model.title)}" ${busy(saving)} data-click="${stop}" style="width:100%;max-width:430px;background:${theme.modalSolidBg};color:${theme.text};border-radius:${theme.radiusXl};padding:26px;box-shadow:${theme.shadowLg};">
      <h2 style="margin:0 0 10px;">${escapeHtml(model.title)}</h2>
      <p style="color:${theme.textSecondary};line-height:1.5;">${escapeHtml(model.message)}</p>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button type="button" data-click="${register(model.onClose)}" ${disabled(saving)}>Cancelar</button><button type="button" data-click="${register(model.onConfirm)}" ${disabled(saving)} style="background:${theme.danger};color:#fff;border:0;border-radius:${theme.radiusSm};padding:9px 16px;font-weight:700;opacity:${saving ? '0.7' : '1'};">${saving ? 'Processando…' : 'Confirmar'}</button></div>
    </section>
  </div>`;
}

export function renderRequestReviewModal(model, theme, register) {
  if (!model?.open || !model.request) return '';
  const request = model.request;
  const stop = register(event => event.stopPropagation());
  const comparison = (label, before, after) => `<div style="margin-bottom:12px;"><strong style="display:block;font-size:12px;margin-bottom:5px;">${escapeHtml(label)}</strong><div style="display:grid;grid-template-columns:${request.isCreation ? '1fr' : '1fr 1fr'};gap:9px;">${request.isCreation ? '' : `<div style="background:${theme.pageBg};padding:9px;border-radius:${theme.radiusSm};white-space:pre-wrap;">${escapeHtml(before || '—')}</div>`}${after != null ? `<div style="background:${theme.pageBg};padding:9px;border-radius:${theme.radiusSm};white-space:pre-wrap;">${escapeHtml(after)}</div>` : ''}</div></div>`;
  return `<div role="presentation" data-click="${register(model.onClose)}" style="position:fixed;inset:0;z-index:125;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);">
    <section role="dialog" aria-modal="true" aria-label="Solicitação de ${escapeHtml(request.typeLabel)}" ${busy(model.saving)} data-click="${stop}" style="width:100%;max-width:600px;max-height:88vh;overflow:auto;background:${theme.modalSolidBg};color:${theme.text};border-radius:${theme.radiusXl};padding:26px;box-shadow:${theme.shadowLg};">
      <h2 style="margin:0 0 5px;">Solicitação de ${escapeHtml(request.typeLabel)}</h2><p style="margin:0 0 18px;color:${theme.textSecondary};">${escapeHtml(request.department)} · ${escapeHtml(request.user)}</p>
      ${request.isArchive ? `${comparison('Título', request.previousTitle, null)}${comparison('Conteúdo', request.previousContent, null)}` : `${comparison('Categoria', request.previousCategory, request.category)}${comparison('Título', request.previousTitle, request.title)}${comparison('Conteúdo', request.previousContent, request.content)}`}
      ${model.rejectMode ? `<label style="display:flex;flex-direction:column;gap:6px;font-weight:700;">Motivo da rejeição<textarea aria-label="Motivo da rejeição" maxlength="500" rows="3" data-input="${register(model.onReasonChange)}" ${invalid(model, 'reason', 'review-error')} ${disabled(model.saving)}>${escapeHtml(model.reason)}</textarea></label>` : ''}
      ${errorMessage(model.error, 'review-error', theme)}
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        ${model.rejectMode ? `<button type="button" data-click="${register(model.onCancelReject)}" ${disabled(model.saving)}>Cancelar</button><button type="button" data-click="${register(model.onReject)}" ${disabled(model.saving)}>${model.saving ? 'Rejeitando…' : 'Confirmar rejeição'}</button>` : `<button type="button" data-click="${register(model.onClose)}" ${disabled(model.saving)}>Fechar</button><button type="button" data-click="${register(model.onStartReject)}" ${disabled(model.saving)}>Rejeitar</button><button type="button" data-click="${register(model.onApprove)}" ${disabled(model.saving)}>${model.saving ? 'Aprovando…' : 'Aprovar'}</button>`}
      </div>
    </section>
  </div>`;
}

function structuralDialog({ name, title, body, actions, onClose, saving }, theme, register) {
  const stop = register(event => event.stopPropagation());
  return `<div role="presentation" data-click="${register(onClose)}" style="position:fixed;inset:0;z-index:135;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);">
    <section role="dialog" aria-modal="true" aria-label="${escapeHtml(name)}" ${busy(saving)} data-click="${stop}" style="width:100%;max-width:540px;max-height:90vh;overflow:auto;background:${theme.modalSolidBg};color:${theme.text};border-radius:${theme.radiusXl};padding:26px;box-shadow:${theme.shadowLg};">
      <h2 style="margin:0 0 18px;">${escapeHtml(title)}</h2>${body}${actions}
    </section></div>`;
}

const fieldStyle = theme => `width:100%;padding:10px 12px;border:1px solid ${theme.border};border-radius:${theme.radiusSm};background:${theme.inputBg};color:${theme.text};`;
const labelStyle = 'display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;';

export function renderStructuralModals(model, theme, register) {
  if (!model) return '';
  let output = '';
  const actions = (onClose, onSubmit, submitLabel, saving) => `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;"><button type="button" data-click="${register(onClose)}" ${disabled(saving)}>Cancelar</button><button type="button" data-click="${register(onSubmit)}" ${disabled(saving)}>${saving ? 'Salvando…' : escapeHtml(submitLabel)}</button></div>`;

  if (model.access?.open) {
    const access = model.access;
    const errorId = 'access-form-error';
    output += structuralDialog({
      name: 'Novo acesso', title: 'Novo acesso', onClose: access.onClose, saving: access.saving,
      body: `<div style="display:flex;flex-direction:column;gap:14px;"><label style="${labelStyle}">Nome do acesso<input aria-label="Nome do acesso" value="${escapeHtml(access.form.name)}" data-input="${register(access.onNameChange)}" ${invalid(access, 'name', errorId)} ${disabled(access.saving)} style="${fieldStyle(theme)}"></label><label style="${labelStyle}">Descrição<input aria-label="Descrição" value="${escapeHtml(access.form.description)}" data-input="${register(access.onDescriptionChange)}" ${disabled(access.saving)} style="${fieldStyle(theme)}"></label><label style="${labelStyle}">Cor<input aria-label="Cor" type="color" value="${escapeHtml(access.form.color)}" data-input="${register(access.onColorChange)}" ${disabled(access.saving)} style="${fieldStyle(theme)}height:42px;"></label>${errorMessage(access.error, errorId, theme)}</div>`,
      actions: actions(access.onClose, access.onSubmit, 'Criar acesso', access.saving),
    }, theme, register);
  }

  if (model.category?.open) {
    const category = model.category;
    const errorId = 'category-form-error';
    output += structuralDialog({
      name: category.title, title: category.title, onClose: category.onClose, saving: category.saving,
      body: `<label style="${labelStyle}">Nome da categoria<input aria-label="Nome da categoria" value="${escapeHtml(category.name)}" data-input="${register(category.onNameChange)}" ${invalid(category, 'name', errorId)} ${disabled(category.saving)} style="${fieldStyle(theme)}"></label>${errorMessage(category.error, errorId, theme)}`,
      actions: actions(category.onClose, category.onSubmit, 'Salvar', category.saving),
    }, theme, register);
  }

  if (model.account?.open) {
    const account = model.account;
    const errorId = 'account-form-error';
    output += structuralDialog({
      name: 'Criar conta', title: 'Criar conta', onClose: account.onClose, saving: account.saving,
      body: `<div style="display:flex;flex-direction:column;gap:14px;"><label style="${labelStyle}">Nome<input aria-label="Nome" value="${escapeHtml(account.form.name)}" data-input="${register(account.onNameChange)}" ${invalid(account, 'name', errorId)} ${disabled(account.saving)} style="${fieldStyle(theme)}"></label><label style="${labelStyle}">E-mail<input aria-label="E-mail" type="email" value="${escapeHtml(account.form.email)}" data-input="${register(account.onEmailChange)}" ${invalid(account, 'email', errorId)} ${disabled(account.saving)} style="${fieldStyle(theme)}"></label><label style="${labelStyle}">Senha temporária<input aria-label="Senha temporária" type="text" value="${escapeHtml(account.form.temporaryPassword)}" data-input="${register(account.onPasswordChange)}" ${invalid(account, 'temporaryPassword', errorId)} ${disabled(account.saving)} style="${fieldStyle(theme)}"></label><label style="${labelStyle}">Papel<select aria-label="Papel" data-change="${register(account.onRoleChange)}" ${disabled(account.saving)} style="${fieldStyle(theme)}"><option value="colaborador" ${account.form.role === 'colaborador' ? 'selected' : ''}>Colaborador</option><option value="superadmin" ${account.form.role === 'superadmin' ? 'selected' : ''}>Superadministrador</option></select></label><fieldset style="border:1px solid ${theme.border};border-radius:${theme.radiusSm};padding:12px;"><legend style="font-weight:700;font-size:13px;">Acessos iniciais</legend>${account.accesses.map(access => `<label style="display:flex;gap:9px;align-items:center;margin:8px 0;"><input type="checkbox" aria-label="${escapeHtml(access.name)}" ${access.checked ? 'checked' : ''} data-change="${register(access.onChange)}" ${disabled(account.saving)}>${escapeHtml(access.name)}</label>`).join('') || '<p>Nenhum acesso cadastrado.</p>'}</fieldset>${errorMessage(account.error, errorId, theme)}</div>`,
      actions: actions(account.onClose, account.onSubmit, 'Criar conta', account.saving),
    }, theme, register);
  }

  if (model.membership?.open) {
    const membership = model.membership;
    output += structuralDialog({
      name: `Acessos de ${membership.name}`, title: `Acessos de ${membership.name}`, onClose: membership.onClose, saving: membership.saving,
      body: `<fieldset style="border:1px solid ${theme.border};border-radius:${theme.radiusSm};padding:12px;"><legend style="font-weight:700;font-size:13px;">Liberações</legend>${membership.accesses.map(access => `<label style="display:flex;gap:9px;align-items:center;margin:9px 0;"><input type="checkbox" aria-label="${escapeHtml(access.name)}" ${access.checked ? 'checked' : ''} data-change="${register(access.onChange)}" ${disabled(membership.saving)}>${escapeHtml(access.name)}${access.active ? '' : ' (inativo)'}</label>`).join('')}</fieldset>${errorMessage(membership.error, 'membership-form-error', theme)}`,
      actions: actions(membership.onClose, membership.onSubmit, 'Concluir', membership.saving),
    }, theme, register);
  }

  if (model.accessUsers?.open) {
    const links = model.accessUsers;
    const rows = links.loading
      ? `<p role="status" style="color:${theme.textSecondary};">Carregando…</p>`
      : links.rows.length === 0
        ? `<p style="color:${theme.textSecondary};">Nenhuma conta vinculada a este acesso ainda.</p>`
        : `<ul aria-label="Contas vinculadas" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;">${links.rows.map(row => `<li data-user-id="${escapeHtml(row.userId)}" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;background:${theme.pageBg};border:1px solid ${theme.border};border-radius:${theme.radiusSm};padding:10px 12px;"><span style="min-width:0;"><strong style="display:block;font-size:13px;">${escapeHtml(row.name)}</strong><span style="font-size:12px;color:${theme.textSecondary};overflow-wrap:anywhere;">${escapeHtml(row.email)} · ${escapeHtml(row.roleLabel)}</span></span><span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" aria-label="Redefinir senha de ${escapeHtml(row.name)}" data-click="${register(row.onResetPassword)}" ${disabled(links.saving)}>Redefinir senha</button><button type="button" aria-label="Remover vínculo de ${escapeHtml(row.name)}" data-click="${register(row.onUnlink)}" ${disabled(links.saving)} style="color:${theme.danger};">Remover vínculo</button></span></li>`).join('')}</ul>`;
    const addSection = links.loading ? '' : `<div style="border-top:1px solid ${theme.border};margin-top:14px;padding-top:12px;"><label style="${labelStyle}">Conta a vincular<span style="display:flex;gap:8px;"><select aria-label="Conta a vincular" data-change="${register(links.onSelect)}" ${disabled(links.saving)} style="${fieldStyle(theme)}flex:1;"><option value="">Selecione…</option>${links.options.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === links.selectedId ? 'selected' : ''}>${escapeHtml(option.nome)}</option>`).join('')}</select><button type="button" data-click="${register(links.onAdd)}" ${disabled(links.saving)}>${links.saving ? 'Salvando…' : 'Vincular'}</button></span></label></div>`;
    output += structuralDialog({
      name: `Vínculos de ${links.accessName}`, title: `Vínculos de ${links.accessName}`, onClose: links.onClose, saving: links.saving,
      body: `${rows}${addSection}${errorMessage(links.error, 'access-users-error', theme)}`,
      actions: `<div style="display:flex;justify-content:flex-end;margin-top:18px;"><button type="button" data-click="${register(links.onClose)}" ${disabled(links.saving)}>Concluir</button></div>`,
    }, theme, register);
  }

  if (model.temporaryPassword?.open) {
    const password = model.temporaryPassword;
    output += structuralDialog({
      name: 'Senha temporária criada', title: 'Senha temporária criada', onClose: password.onClose,
      body: `<p style="color:${theme.textSecondary};">Copie agora. Por segurança, ela desaparecerá ao fechar esta janela.</p><div data-temporary-password style="padding:12px;background:${theme.pageBg};border:1px solid ${theme.border};border-radius:${theme.radiusSm};font-family:monospace;font-weight:800;user-select:all;overflow-wrap:anywhere;">${escapeHtml(password.value)}</div>`,
      actions: `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;"><button type="button" data-click="${register(password.onCopy)}">${password.copied ? 'Copiada' : 'Copiar'}</button><button type="button" data-click="${register(password.onClose)}">Concluir</button></div>`,
    }, theme, register);
  }
  return output;
}
