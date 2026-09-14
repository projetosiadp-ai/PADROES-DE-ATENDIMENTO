import { ICONS } from '../ui/icons.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const disabled = (value) => value ? 'disabled aria-disabled="true"' : '';
// A dialog marked busy blocks Escape and overlay dismissal until its operation settles.
const busy = (value) => value ? ' aria-busy="true"' : '';
const invalid = (model, field, errorId) => model.invalid?.includes(field)
  ? `aria-invalid="true" aria-describedby="${errorId}"`
  : '';
const errorMessage = (message, id) => message
  ? `<p id="${id}" role="alert" class="dp-alert">${escapeHtml(message)}</p>`
  : '';

// Campo com contador (FR-022): o contador descreve o campo, e o erro, quando existe, vem junto.
const describedBy = (model, field, errorId, counterId) => {
  const isInvalid = model.invalid?.includes(field);
  const ids = [counterId, isInvalid ? errorId : null].filter(Boolean).join(' ');
  return `${isInvalid ? 'aria-invalid="true" ' : ''}aria-describedby="${ids}"`;
};

/* "N / limite caracteres". O texto visível muda a cada tecla, mas só é anunciado ao leitor de
 * tela quando o campo chega a 90% e a 100% do limite (R11). */
const counter = (id, label, value, max) => {
  const length = String(value ?? '').length;
  const warning = length >= max
    ? `${label}: limite de ${max} caracteres atingido.`
    : length >= Math.ceil(max * 0.9) ? `${label}: perto do limite de ${max} caracteres.` : '';
  return `<span id="${id}" class="dp-counter${length >= max ? ' dp-counter--full' : ''}">${length} / ${max} caracteres</span>`
    + `<span class="sr-only" aria-live="polite">${escapeHtml(warning)}</span>`;
};

// Atalhos "Inserir variável" (FR-020): inserem o marcador na posição do cursor do conteúdo.
const VARIABLE_SHORTCUTS = ['[NOME]', '[DATA]', '[VALOR]'];
const insertVariables = (model, register) => model.onInsertVariable
  ? `<div class="dp-insert-variables" role="group" aria-label="Atalhos de variável">
      <span class="dp-label">Inserir variável</span>
      ${VARIABLE_SHORTCUTS.map(token => `<button type="button" data-insert-variable="${token}" data-click="${register(model.onInsertVariable)}" ${disabled(model.saving)}>${token}</button>`).join('')}
    </div>`
  : '';

let dialogSequence = 0;

/* Casca única das janelas (telas 04 e 05): cabeçalho azul da marca com o título, que é o nome
 * acessível, contexto opcional, corpo claro e ações alinhadas à direita. Enquanto ocupada, a
 * janela fica aria-busy e o botão de fechar do cabeçalho também é desabilitado. */
export function renderDialog({
  role = 'dialog', name, kicker = '', context = '', size = 'md', saving = false,
  onClose, closeButton = role === 'dialog', backdropCloses = true, body, note = '', actions, register, layer = 120,
}) {
  const stop = register(event => event.stopPropagation());
  const titleId = `dp-dialog-title-${++dialogSequence}`;
  // O ✕ fica por último no DOM (posicionado no canto do cabeçalho): assim o foco inicial e a
  // ordem de tabulação continuam começando pelo primeiro campo, como antes da Etapa 2.
  const close = closeButton && onClose
    ? `<button type="button" class="dp-dialog__close" data-click="${register(onClose)}" aria-label="Fechar" ${disabled(saving)}>${ICONS.close}</button>`
    : '';
  const bar = kicker ? `<div class="dp-dialog__kicker">${escapeHtml(kicker)}</div>` : '';

  return `
    <div class="dp-backdrop" role="presentation"${backdropCloses && onClose ? ` data-click="${register(onClose)}"` : ''} style="z-index:${layer};">
      <section class="dp-dialog dp-dialog--${size}" role="${role}" aria-modal="true" aria-labelledby="${titleId}"${busy(saving)} data-click="${stop}">
        <header class="dp-dialog__header">
          <span class="dp-dialog__ring" aria-hidden="true"></span>
          ${bar}
          <h2 id="${titleId}">${escapeHtml(name)}</h2>
          ${context ? `<p class="dp-dialog__subtitle">${escapeHtml(context)}</p>` : ''}
        </header>
        <div class="dp-dialog__body">
          ${body}
          <div class="dp-dialog__actions">
            ${note ? `<span class="dp-dialog__note">${escapeHtml(note)}</span>` : ''}
            ${actions}
          </div>
        </div>
        ${close}
      </section>
    </div>`;
}

const button = (label, handler, register, { variant = 'secondary', saving = false, extra = '' } = {}) =>
  `<button type="button" class="dp-btn-${variant}" data-click="${register(handler)}" ${disabled(saving)} ${extra}>${label}</button>`;

const field = (label, control, { hint = '' } = {}) => `
  <label class="dp-form-field">
    <span class="dp-label">${escapeHtml(label)}</span>
    ${control}
    ${hint ? `<span class="dp-hint">${hint}</span>` : ''}
  </label>`;

function requestForm(model, register) {
  const form = model.form;
  const errorId = 'request-form-error';
  const categoryOptions = model.categories
    .map(category => `<option value="${escapeHtml(category.id)}" ${category.id === form.categoryId ? 'selected' : ''}>${escapeHtml(category.nome)}</option>`)
    .join('');

  const body = `
    <div class="dp-form-grid">
      ${field('Categoria', `<select class="dp-field" aria-label="Categoria" data-change="${register(model.onCategoryChange)}" ${invalid(model, 'categoryId', errorId)} ${disabled(model.saving)}>${categoryOptions}</select>`)}
      ${field('Tags', `<input class="dp-field" aria-label="Tags" value="${escapeHtml(form.tagsText)}" data-input="${register(model.onTagsChange)}" ${disabled(model.saving)} placeholder="ex.: cobrança, retorno" />`)}
    </div>
    ${field('Título', `<input class="dp-field" aria-label="Título" maxlength="100" value="${escapeHtml(form.title)}" data-input="${register(model.onTitleChange)}" ${describedBy(model, 'title', errorId, 'request-title-counter')} ${disabled(model.saving)} />` + counter('request-title-counter', 'Título', form.title, 100))}
    ${insertVariables(model, register)}
    ${field('Conteúdo', `<textarea class="dp-field" aria-label="Conteúdo" data-variable-target maxlength="2000" rows="7" data-input="${register(model.onContentChange)}" ${describedBy(model, 'content', errorId, 'request-content-counter')} ${disabled(model.saving)}>${escapeHtml(form.content)}</textarea>` + counter('request-content-counter', 'Conteúdo', form.content, 2000))}
    ${errorMessage(model.error, errorId)}`;

  return renderDialog({
    name: model.accessibleName,
    context: 'Vai para revisão do superadministrador. A biblioteca só muda depois da aprovação.',
    size: 'lg', saving: model.saving, onClose: model.onClose, register, body,
    actions: button('Cancelar', model.onClose, register, { saving: model.saving })
      + button(model.saving ? 'Enviando…' : 'Enviar para revisão', model.onSubmit, register, { variant: 'primary', saving: model.saving }),
  });
}

function archiveConfirmation(model, register) {
  return renderDialog({
    role: 'alertdialog', name: model.accessibleName, size: 'sm', saving: model.saving, onClose: model.onClose, register,
    body: `<p class="dp-dialog__text">A mensagem continuará publicada até a revisão do superadministrador. Se aprovada, poderá ser restaurada depois.</p>
      ${errorMessage(model.error, 'archive-request-error')}`,
    actions: button('Cancelar', model.onClose, register, { saving: model.saving })
      + button(model.saving ? 'Enviando…' : 'Enviar solicitação', model.onSubmit, register, { variant: 'primary', saving: model.saving }),
  });
}

export function renderMessageRequestModal(model, register) {
  if (!model?.open) return '';
  return model.type === 'arquivamento'
    ? archiveConfirmation(model, register)
    : requestForm(model, register);
}

// Superadministrator create/edit form for published messages.
export function renderMessageEditorModal(model, register) {
  if (!model?.open) return '';
  const errorId = 'message-editor-error';
  const categoryOptions = model.categories
    .map(category => `<option value="${escapeHtml(category.id)}" ${category.id === model.form.categoryId ? 'selected' : ''}>${escapeHtml(category.nome)}</option>`)
    .join('');
  const tagChips = model.tagChips
    .map(tag => `<span class="dp-chip dp-chip--removable">${escapeHtml(tag.label)}<button type="button" aria-label="Remover tag ${escapeHtml(tag.label)}" data-click="${register(tag.onRemove)}" ${disabled(model.saving)}>×</button></span>`)
    .join('');

  const body = `
    ${field('Categoria', `<select class="dp-field" aria-label="Categoria" data-change="${register(model.onCategoryChange)}" ${invalid(model, 'categoryId', errorId)} ${disabled(model.saving)}>${categoryOptions}</select>`)}
    ${field('Título', `<input class="dp-field" aria-label="Título" type="text" maxlength="100" value="${escapeHtml(model.form.title)}" data-input="${register(model.onTitleChange)}" ${describedBy(model, 'title', errorId, 'editor-title-counter')} ${disabled(model.saving)} />` + counter('editor-title-counter', 'Título', model.form.title, 100))}
    <div class="dp-form-field">
      <span class="dp-label">Tags</span>
      ${tagChips ? `<div class="dp-chips">${tagChips}</div>` : ''}
      <div class="dp-inline">
        <input class="dp-field" aria-label="Nova tag" type="text" placeholder="adicionar tag e Enter" value="${escapeHtml(model.form.tagInput)}" data-input="${register(model.onTagInputChange)}" data-keydown="${register(model.onTagKeyDown)}" ${disabled(model.saving)} />
        ${button('Adicionar', model.onAddTag, register, { saving: model.saving, extra: 'aria-label="Adicionar tag"' })}
      </div>
    </div>
    ${insertVariables(model, register)}
    ${field('Conteúdo', `<textarea class="dp-field" aria-label="Conteúdo" data-variable-target maxlength="2000" rows="6" data-input="${register(model.onContentChange)}" ${describedBy(model, 'content', errorId, 'editor-content-counter')} ${disabled(model.saving)}>${escapeHtml(model.form.content)}</textarea>` + counter('editor-content-counter', 'Conteúdo', model.form.content, 2000))}
    ${errorMessage(model.error, errorId)}`;

  return renderDialog({
    name: model.title, context: 'Publicação direta na biblioteca do acesso ativo.',
    size: 'lg', saving: model.saving, onClose: model.onClose, register, body, layer: 100,
    actions: button('Cancelar', model.onClose, register, { saving: model.saving })
      + button(model.saving ? 'Salvando…' : 'Salvar', model.onSubmit, register, { variant: 'primary', saving: model.saving }),
  });
}

// While `saving`, both actions are disabled and the dialog is busy, so neither a second click,
// Cancelar, the overlay nor Escape can interrupt the confirmed operation.
export function renderAdminConfirmationModal(model, register) {
  if (!model?.open) return '';
  const saving = Boolean(model.saving);
  return renderDialog({
    role: 'alertdialog', name: model.title, size: 'sm', saving, onClose: model.onClose, register, layer: 130,
    body: `<p class="dp-dialog__text">${escapeHtml(model.message)}</p>`,
    actions: button('Cancelar', model.onClose, register, { saving })
      + button(saving ? 'Processando…' : 'Confirmar', model.onConfirm, register, { variant: 'danger', saving }),
  });
}

export function renderStructuralModals(model, register) {
  if (!model) return '';
  let output = '';
  const formActions = (onClose, onSubmit, submitLabel, saving) =>
    button('Cancelar', onClose, register, { saving })
    + button(saving ? 'Salvando…' : escapeHtml(submitLabel), onSubmit, register, { variant: 'primary', saving });
  const structural = (options) => renderDialog({ layer: 135, register, ...options });

  if (model.access?.open) {
    const access = model.access;
    const errorId = 'access-form-error';
    output += structural({
      name: 'Novo acesso', context: 'Departamento com biblioteca própria de mensagens.', onClose: access.onClose, saving: access.saving,
      body: `
        ${field('Nome do acesso', `<input class="dp-field" aria-label="Nome do acesso" value="${escapeHtml(access.form.name)}" data-input="${register(access.onNameChange)}" ${invalid(access, 'name', errorId)} ${disabled(access.saving)}>`)}
        ${field('Descrição', `<input class="dp-field" aria-label="Descrição" value="${escapeHtml(access.form.description)}" data-input="${register(access.onDescriptionChange)}" ${disabled(access.saving)}>`)}
        ${field('Cor', `<input class="dp-field dp-field--color" aria-label="Cor" type="color" value="${escapeHtml(access.form.color)}" data-input="${register(access.onColorChange)}" ${disabled(access.saving)}>`)}
        ${errorMessage(access.error, errorId)}`,
      actions: formActions(access.onClose, access.onSubmit, 'Criar acesso', access.saving),
    });
  }

  if (model.category?.open) {
    const category = model.category;
    const errorId = 'category-form-error';
    output += structural({
      name: category.title, size: 'sm', onClose: category.onClose, saving: category.saving,
      body: `
        ${field('Nome da categoria', `<input class="dp-field" aria-label="Nome da categoria" value="${escapeHtml(category.name)}" data-input="${register(category.onNameChange)}" ${invalid(category, 'name', errorId)} ${disabled(category.saving)}>`)}
        ${errorMessage(category.error, errorId)}`,
      actions: formActions(category.onClose, category.onSubmit, 'Salvar', category.saving),
    });
  }

  if (model.account?.open) {
    const account = model.account;
    const errorId = 'account-form-error';
    const accesses = account.accesses
      .map(access => `<label class="dp-check"><input type="checkbox" aria-label="${escapeHtml(access.name)}" ${access.checked ? 'checked' : ''} data-change="${register(access.onChange)}" ${disabled(account.saving)}>${escapeHtml(access.name)}</label>`)
      .join('') || '<p class="dp-dialog__text">Nenhum acesso cadastrado.</p>';
    output += structural({
      name: 'Criar conta', context: 'A pessoa troca a senha temporária no primeiro acesso.', size: 'lg', onClose: account.onClose, saving: account.saving,
      body: `
        <div class="dp-form-grid">
          ${field('Nome', `<input class="dp-field" aria-label="Nome" value="${escapeHtml(account.form.name)}" data-input="${register(account.onNameChange)}" ${invalid(account, 'name', errorId)} ${disabled(account.saving)}>`)}
          ${field('E-mail', `<input class="dp-field" aria-label="E-mail" type="email" value="${escapeHtml(account.form.email)}" data-input="${register(account.onEmailChange)}" ${invalid(account, 'email', errorId)} ${disabled(account.saving)}>`)}
          ${field('Senha temporária', `<input class="dp-field" aria-label="Senha temporária" type="text" value="${escapeHtml(account.form.temporaryPassword)}" data-input="${register(account.onPasswordChange)}" ${invalid(account, 'temporaryPassword', errorId)} ${disabled(account.saving)}>`)}
          ${field('Papel', `<select class="dp-field" aria-label="Papel" data-change="${register(account.onRoleChange)}" ${disabled(account.saving)}><option value="colaborador" ${account.form.role === 'colaborador' ? 'selected' : ''}>Colaborador</option><option value="superadmin" ${account.form.role === 'superadmin' ? 'selected' : ''}>Superadministrador</option></select>`)}
        </div>
        <fieldset class="dp-fieldset"><legend class="dp-label">Acessos iniciais</legend>${accesses}</fieldset>
        ${errorMessage(account.error, errorId)}`,
      actions: formActions(account.onClose, account.onSubmit, 'Criar conta', account.saving),
    });
  }

  if (model.membership?.open) {
    const membership = model.membership;
    output += structural({
      name: `Acessos de ${membership.name}`, context: 'Marque os departamentos que esta conta pode usar.', onClose: membership.onClose, saving: membership.saving,
      body: `
        <fieldset class="dp-fieldset"><legend class="dp-label">Liberações</legend>${membership.accesses.map(access => `<label class="dp-check"><input type="checkbox" aria-label="${escapeHtml(access.name)}" ${access.checked ? 'checked' : ''} data-change="${register(access.onChange)}" ${disabled(membership.saving)}>${escapeHtml(access.name)}${access.active ? '' : ' (inativo)'}</label>`).join('')}</fieldset>
        ${errorMessage(membership.error, 'membership-form-error')}`,
      actions: formActions(membership.onClose, membership.onSubmit, 'Concluir', membership.saving),
    });
  }

  if (model.accessUsers?.open) {
    const links = model.accessUsers;
    const rows = links.loading
      ? '<p role="status" class="dp-dialog__text">Carregando…</p>'
      : links.rows.length === 0
        ? '<p class="dp-dialog__text">Nenhuma conta vinculada a este acesso ainda.</p>'
        : `<ul class="dp-link-list" aria-label="Contas vinculadas">${links.rows.map(row => `
            <li data-user-id="${escapeHtml(row.userId)}">
              <span style="min-width:0;"><strong>${escapeHtml(row.name)}</strong><span class="dp-hint">${escapeHtml(row.email)} · ${escapeHtml(row.roleLabel)}</span></span>
              <span class="dp-inline">
                ${button('Redefinir senha', row.onResetPassword, register, { saving: links.saving, extra: `aria-label="Redefinir senha de ${escapeHtml(row.name)}"` })}
                ${button('Remover vínculo', row.onUnlink, register, { variant: 'danger', saving: links.saving, extra: `aria-label="Remover vínculo de ${escapeHtml(row.name)}"` })}
              </span>
            </li>`).join('')}</ul>`;
    const addSection = links.loading ? '' : `
      <div class="dp-form-field dp-divided">
        <span class="dp-label">Conta a vincular</span>
        <div class="dp-inline">
          <select class="dp-field" aria-label="Conta a vincular" data-change="${register(links.onSelect)}" ${disabled(links.saving)}><option value="">Selecione…</option>${links.options.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === links.selectedId ? 'selected' : ''}>${escapeHtml(option.nome)}</option>`).join('')}</select>
          ${button(links.saving ? 'Salvando…' : 'Vincular', links.onAdd, register, { variant: 'primary', saving: links.saving })}
        </div>
      </div>`;
    output += structural({
      name: `Vínculos de ${links.accessName}`, context: 'Contas que usam a biblioteca deste acesso.', size: 'lg', onClose: links.onClose, saving: links.saving,
      body: `${rows}${addSection}${errorMessage(links.error, 'access-users-error')}`,
      actions: button('Concluir', links.onClose, register, { variant: 'primary', saving: links.saving }),
    });
  }

  if (model.temporaryPassword?.open) {
    const password = model.temporaryPassword;
    output += structural({
      name: 'Senha temporária criada', size: 'sm', onClose: password.onClose,
      body: `
        <p class="dp-dialog__text">Copie agora. Por segurança, ela desaparecerá ao fechar esta janela.</p>
        <div class="dp-secret" data-temporary-password>${escapeHtml(password.value)}</div>`,
      actions: button(`${password.copied ? ICONS.check : ICONS.clipboard}${password.copied ? 'Copiada' : 'Copiar'}`, password.onCopy, register)
        + button('Concluir', password.onClose, register, { variant: 'primary' }),
    });
  }
  return output;
}
