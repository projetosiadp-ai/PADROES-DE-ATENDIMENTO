import { ICONS } from '../ui/icons.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const eyeIcon = (visible) => (visible
  ? `<svg aria-hidden="true" focusable="false" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
  : `<svg aria-hidden="true" focusable="false" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`);

const searchIcon = `<svg aria-hidden="true" focusable="false" class="dp-search__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`;

function navButton(item, register) {
  const badge = item.badge
    ? `<span class="dp-nav-count">${escapeHtml(item.badge)}</span><span class="sr-only">${escapeHtml(item.badgeLabel)}</span>`
    : '';
  return `<button data-click="${register(item.onClick)}"${item.current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}${badge}</button>`;
}

function accountMenu(model, register) {
  if (!model.userMenuOpen) return '';
  return `
    <div class="dp-menu" role="menu" aria-label="Conta">
      <div class="dp-menu__name">${escapeHtml(model.currentUser.nome)}</div>
      <div class="dp-menu__role">${escapeHtml(model.currentUser.perfilLabel)}</div>
      <button class="dp-btn-secondary" role="menuitem" data-click="${register(model.logout)}">${ICONS.logout}Sair</button>
    </div>`;
}

function searchField(model, register) {
  const results = model.showSearchDropdown
    ? `<div class="dp-search__results">${model.searchDropdownResults.length
      ? model.searchDropdownResults.map(result => `
        <button class="dp-search__result" data-mousedown="${register(result.onPick)}">
          <span class="dp-list-item__title">${escapeHtml(result.titulo)}</span>
          <span class="dp-list-item__meta">${escapeHtml(result.categoria)} · ${escapeHtml(result.snippet)}</span>
        </button>`).join('')
      : `<div class="dp-empty">Nenhuma mensagem encontrada</div>`}</div>`
    : '';

  return `
    <div class="dp-search">
      ${searchIcon}
      <input class="dp-search__input" aria-label="Buscar mensagens" data-ref="${register(model.searchInputRef)}" data-focus="search"
        type="search" placeholder="Buscar mensagem, tag ou categoria…" value="${escapeHtml(model.searchQueryDraft)}"
        data-input="${register(model.onSearchChange)}" data-focusin="${register(model.onSearchFocus)}"
        data-focusout="${register(model.onSearchBlur)}" autocomplete="off" />
      ${results}
    </div>`;
}

export function renderBrandBand(model, register) {
  const tools = model.showLibraryTools
    ? `<div class="dp-band__tools">
        ${searchField(model, register)}
        <button class="dp-btn-accent" data-click="${register(model.openCreateMsg)}">${ICONS.plus}${escapeHtml(model.createMessageLabel)}</button>
      </div>`
    : '';

  return `
    <header class="dp-band" data-key="brand-band">
      <span class="dp-band__rings" aria-hidden="true">
        <span class="dp-band__ring dp-band__ring--outer"></span>
        <span class="dp-band__ring dp-band__ring--inner"></span>
      </span>
      <div class="dp-band__top">
        <span class="dp-band__brand">
          <img class="dp-band__selo" src="assets/dp2-selo-192.png" alt="DentalPlus" width="192" height="192" />
          <img class="dp-band__logo" src="assets/dp2-logo-on-brand.png" alt="" width="595" height="100" />
        </span>
        <nav class="dp-nav" aria-label="Seções">
          ${model.navItems.map(item => navButton(item, register)).join('')}
        </nav>
        <span class="dp-band__spacer"></span>
        <span class="dp-access-label" aria-hidden="true">${escapeHtml(model.accessSelectLabel ?? 'Acesso')}</span>
        <select class="dp-access-select" aria-label="Acesso ativo" data-change="${register(model.onChangeActiveAcesso)}">
          ${model.userAcessosOptions.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === model.activeAcessoId ? 'selected' : ''}>${escapeHtml(option.nome)}</option>`).join('')}
        </select>
        <span style="position:relative;">
          <button class="dp-account" data-click="${register(model.onToggleUserMenu)}" aria-expanded="${model.userMenuOpen}"
            aria-label="Conta de ${escapeHtml(model.currentUser.nome)}">${escapeHtml(model.currentUser.iniciais)}</button>
          ${accountMenu(model, register)}
        </span>
      </div>
      <div class="dp-band__headline">
        <div style="min-width:0;">
          <h1>${escapeHtml(model.bandTitle)}</h1>
          <div class="dp-band__summary" data-volatile>${escapeHtml(model.bandSummary)}</div>
        </div>
        ${model.bandActions?.length ? `<div class="dp-band__actions">${model.bandActions.map(item => `<button type="button" class="${item.primary ? 'dp-btn-on-brand' : 'dp-btn-outline-brand'}" data-click="${register(item.onClick)}">${item.primary ? ICONS.plus : ''}${escapeHtml(item.label)}</button>`).join('')}</div>` : ''}
      </div>
      ${tools}
    </header>`;
}

export function renderCategoryPills(model, register) {
  const pill = (item) => `<button class="dp-pill" data-click="${register(item.onClick)}" aria-pressed="${item.active}">${escapeHtml(item.label)} <span data-volatile>${escapeHtml(item.count)}</span></button>`;
  return `
    <div class="dp-pills" role="group" aria-label="Filtrar por categoria">
      ${pill({ label: 'Todas', count: model.chipAllCount, active: model.chipAllActive, onClick: model.setCategoryAll })}
      ${model.categoriaChips.map(chip => pill({ label: chip.nome, count: chip.count, active: chip.active, onClick: chip.onClick })).join('')}
      ${pill({ label: '★ Favoritas', count: model.favoritesCount, active: model.favoritesOnly, onClick: model.toggleFavoritesOnly })}
    </div>`;
}

export function renderLoginView(model, register) {
  const help = model.showPasswordHelp
    ? `<p class="dp-note" id="login-password-help">A senha é redefinida por um superadministrador, que gera uma senha temporária e entrega a você. Procure a pessoa responsável pelo seu acesso.</p>`
    : '';

  return `
    <main class="dp-login" data-key="view-login">
      <section class="dp-login__brand">
        <span class="dp-login__ring" aria-hidden="true"></span>
        <span class="dp-login__ring dp-login__ring--inner" aria-hidden="true"></span>
        <div style="position:relative;">
          <h1>Padrões de<br>atendimento</h1>
          <p>A resposta certa, com as palavras aprovadas pela DentalPlus, pronta para copiar em um clique.</p>
        </div>
      </section>
      <section class="dp-login__form">
        <div class="dp-login__card">
          <img class="dp-login__selo" src="assets/dp2-selo-192.png" alt="DentalPlus — plano odontológico" width="192" height="192" />
          <h2>Entrar</h2>
          <div class="dp-login__hint dp-menu__role">Use sua conta interna DentalPlus.</div>
          <div style="display:flex; flex-direction:column; gap:16px; margin-top:24px;">
            ${model.loginError ? `<div class="dp-alert" role="alert" aria-live="assertive">${escapeHtml(model.loginError)}</div>` : ''}
            <div>
              <label class="dp-label" for="login-email">E-mail</label>
              <input class="dp-field" id="login-email" name="email" type="email" autocomplete="username" autocapitalize="off"
                autocorrect="off" spellcheck="false" ${model.loggingIn ? 'disabled' : ''} data-focus="loginEmail"
                placeholder="seuemail@empresa.com" value="${escapeHtml(model.loginEmail)}"
                data-input="${register(model.onLoginEmailChange)}" data-keydown="${register(model.onLoginKeyDown)}" />
            </div>
            <div>
              <label class="dp-label" for="login-password">Senha</label>
              <div class="dp-password">
                <input class="dp-field" id="login-password" name="password" autocomplete="current-password"
                  type="${model.showLoginPassword ? 'text' : 'password'}" ${model.loggingIn ? 'disabled' : ''} data-focus="loginPassword"
                  placeholder="••••••••" value="${escapeHtml(model.loginPassword)}" style="padding-right:46px;"
                  data-input="${register(model.onLoginPasswordChange)}" data-keydown="${register(model.onLoginKeyDown)}" />
                <button class="dp-password__toggle" type="button" data-click="${register(model.onToggleLoginPassword)}"
                  aria-pressed="${model.showLoginPassword}" aria-label="Mostrar senha">${eyeIcon(model.showLoginPassword)}</button>
              </div>
            </div>
            <button class="dp-btn-primary" style="justify-content:center; padding:15px;" data-click="${register(model.handleLogin)}"
              ${model.loggingIn ? 'disabled' : ''}>${escapeHtml(model.loginBtnLabel)}</button>
            <div>
              <button class="dp-btn-ghost" style="padding:0;" data-click="${register(model.onTogglePasswordHelp)}"
                aria-expanded="${model.showPasswordHelp}" aria-controls="login-password-help">Esqueceu a senha? Fale com um administrador</button>
              ${help}
            </div>
          </div>
        </div>
      </section>
    </main>`;
}

export function renderNoAccessView(model, register) {
  return `
    <main class="dp-login__form" style="min-height:100vh;" data-key="view-no-access">
      <section class="dp-panel" style="max-width:420px; text-align:center;" aria-labelledby="no-access-title">
        <h1 id="no-access-title" style="font-size:18px;">Sem acesso a nenhum departamento</h1>
        <p style="color:var(--dp-text-muted); line-height:1.55;">Olá, ${escapeHtml(model.noAcessoNome)}. Sua conta ainda não está vinculada a nenhum Acesso. Fale com um administrador para liberar seu acesso.</p>
        <button class="dp-btn-primary" data-click="${register(model.logout)}">${ICONS.logout}Sair</button>
      </section>
    </main>`;
}

export function renderReleaseNotesDialog(model, register) {
  if (!model?.open) return '';
  return `
    <div class="dp-backdrop" role="presentation">
      <div class="dp-dialog dp-dialog--notes" role="dialog" aria-modal="true" aria-label="${escapeHtml(model.title)}">
        <div class="dp-dialog__header">
          <h2>${escapeHtml(model.title)}</h2>
          <div class="dp-dialog__subtitle">O que mudou nesta versão</div>
        </div>
        <div class="dp-dialog__body">
          <ul class="dp-notes-list">${model.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <div class="dp-dialog__actions">
            <button class="dp-btn-primary" data-click="${register(model.onConfirm)}">${escapeHtml(model.confirmLabel)}</button>
          </div>
        </div>
      </div>
    </div>`;
}
