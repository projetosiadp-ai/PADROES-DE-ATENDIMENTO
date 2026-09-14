// app.js
import * as api from './api.js';
import { normalize, matchesSearch, titleSegments as titleSegmentsPure, pickActiveAcesso } from './search-utils.mjs';
import { normalizeTags, paginateLibraryMessages, selectLibraryMessages } from './domain/library.mjs';
import { canPublishContent, canUseAccess, canViewAdministration } from './domain/permissions.mjs';
import { getOrCreateIdempotencyKey, isArchiveRequest, requestTypeLabel } from './domain/requests.mjs';
import { resolveErrorPolicy } from './domain/error-policy.mjs';
import { greetingFor } from './domain/greeting.mjs';
import { CURRENT_RELEASE, RELEASE_NOTES } from './domain/release-notes.mjs';
import { copyExactText } from './ui/clipboard.mjs';
import { morphChildren } from './ui/dom-morph.mjs';
import { activateDialogFocus } from './ui/focus.mjs';
import { ICONS } from './ui/icons.mjs';
import { DEFAULT_ACCESS_COLOR, LEGACY_THEME } from './ui/legacy-theme.mjs';
import { renderLibraryOverview, renderLibraryReadingDialog, renderLibraryView } from './views/library-view.mjs';
import { renderBrandBand, renderCategoryPills, renderLoginView, renderNoAccessView, renderReleaseNotesDialog } from './views/shell-view.mjs';
import { renderAdminConfirmationModal, renderDialog, renderMessageEditorModal, renderMessageRequestModal, renderRequestReviewModal, renderStructuralModals } from './views/modal-view.mjs';
import { renderAdminView } from './views/admin-view.mjs';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const CLOSED_CONFIRM = Object.freeze({ open: false, title: '', message: '', action: null, saving: false });
const CLOSED_REQUEST_MODAL = Object.freeze({
  open: false, type: null, messageId: null, idempotencyKey: null,
  form: Object.freeze({ categoryId: '', title: '', tagsText: '', content: '' }),
  previous: null, error: '', invalid: Object.freeze([]),
});
const CLOSED_ACCESS_USERS = Object.freeze({
  open: false, accessId: null, loading: false, saving: false, users: Object.freeze([]),
  profiles: Object.freeze([]), selectedId: '', error: '',
});
const EMPTY_MSG_FORM = Object.freeze({ categoryId: '', title: '', tagInput: '', tags: Object.freeze([]), content: '' });

// Earlier builds persisted whole libraries in sessionStorage. Content now lives only in memory.
function purgeLegacyLibraryCache() {
  try {
    Object.keys(sessionStorage)
      .filter(key => key.startsWith('dp_library_cache:'))
      .forEach(key => sessionStorage.removeItem(key));
  } catch (e) {}
}

class App {
  constructor(root) {
    this.root = root;
    this._reg = {};
    this._regN = 0;
    this.searchEl = null;
    this._toastSeq = 0;
    this.libraryCache = new Map(); // accessId -> Promise<{ categories, messages }>, memory only
    this._searchDebounce = null;
    this._adminSearchDebounce = null;
    this._refreshSequence = 0;
    this._activeDialog = null;
    this._dialogFocusCleanup = null;
    this._dialogOpener = null;
    this.state = this.initialState();
  }

  initialState() {
    return {
      loading: true,
      loadError: '',
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
      density: 'compact',
      currentUser: null,     // { user, profile }
      profileId: null,
      activeAcessoId: null,
      searchQuery: '', searchQueryDraft: '',
      libraryVisibleLimit: 30,
      searchFocused: false,
      adminSearchQuery: '', adminSearchQueryDraft: '',
      categoryFilter: null,
      favoritesOnly: false,
      selectedMessageId: null,
      userMenuOpen: false,
      showPasswordHelp: false,
      releaseNoticeSeen: CURRENT_RELEASE,
      copiedId: null,
      expandedCardIds: new Set(),
      saving: false,
      librarySort: 'relevance',
      libraryViewMode: 'grid',
      showPreviewModal: false, previewingMsgId: null,
      paletteOpen: false, paletteQuery: '', paletteIndex: 0,
      favoriteIds: [],       // mensagem_id[] for the current user
      recentIds: [],         // mensagem_id[] for the current user, most recent first
      toasts: [],
      confirm: CLOSED_CONFIRM,
      showMsgModal: false, editingMsgId: null, msgForm: EMPTY_MSG_FORM, msgError: '', msgInvalid: [],
      messageRequestModal: CLOSED_REQUEST_MODAL,
      requestSaving: false,
      showCatModal: false, editingCatId: null, catForm: { nome: '' }, categoryError: '', categoryInvalid: [],
      showAcessoModal: false, acessoForm: { nome: '', descricao: '', cor: DEFAULT_ACCESS_COLOR }, accessError: '', accessInvalid: [],
      showAccountModal: false,
      accountForm: { name: '', email: '', temporaryPassword: '', role: 'colaborador', accessIds: new Set() },
      accountError: '', accountInvalid: [],
      showMembershipModal: false, membershipUserId: null, membershipDraft: new Set(), membershipError: '',
      temporaryPassword: { open: false, value: '', copied: false },
      adminProfiles: [], adminMemberships: [], structuralLoading: false,
      accessUsersModal: CLOSED_ACCESS_USERS,
      acessos: [],
      acessoMembros: [],
      categorias: [],
      mensagens: [],
      solicitacoesPendentes: [],
      showApprovalPopup: false,
      approvalPopupSeenThisSession: false,
      showSolicitacaoModal: false, viewingSolicitacaoId: null,
      solicitacaoRejectMode: false, rejectMotivo: '',
      reviewSaving: false, reviewError: '', reviewInvalid: [],
      archivedMessages: [], archivedCategories: [], archivedLoading: false,
      loginEmail: '', loginPassword: '', loginError: '', loggingIn: false, showLoginPassword: false
    };
  }

  /* ---------------- render engine ---------------- */

  setState(patch, cb) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    Object.assign(this.state, next);
    this.render();
    if (cb) cb();
  }

  h(fn) {
    const k = 'h' + (this._regN++);
    this._reg[k] = fn;
    return k;
  }

  render() {
    const activeBeforeRender = document.activeElement;
    const previousDialog = this._activeDialog;
    this._reg = {};
    this._regN = 0;
    const v = this.renderVals();
    const container = document.createElement('div');
    container.innerHTML = this.view(v);
    // Morph instead of innerHTML-replace: reuses existing nodes, so the
    // focused input/caret, in-flight CSS animations, and scroll position all
    // survive a render untouched.
    morphChildren(this.root, container);
    if (this.root.querySelector('[data-testid="library-ready"]')) {
      if (!performance.getEntriesByName('dp-library-ready').length) performance.mark('dp-library-ready');
      if (this.state.searchQuery && !performance.getEntriesByName('dp-search-ready').length) performance.mark('dp-search-ready');
    }

    const dialog = this.root.querySelector('[aria-modal="true"]');
    if (dialog !== previousDialog) {
      this._dialogFocusCleanup?.();
      this._dialogFocusCleanup = null;
      this._activeDialog = dialog;
      if (dialog) {
        this._dialogOpener = previousDialog ? this._dialogOpener : activeBeforeRender;
        this._dialogFocusCleanup = activateDialogFocus(dialog, {
          opener: this._dialogOpener,
          initialFocus: dialog.querySelector('[data-initial-focus]'),
          escapeCloses: () => !this.isDialogBusy(dialog),
        });
      } else {
        this._dialogOpener = null;
      }
    }

    this.root.querySelectorAll('[data-ref]').forEach(el => {
      const fn = this._reg[el.getAttribute('data-ref')];
      if (fn) fn(el);
    });
  }

  isDialogBusy(dialog = this._activeDialog) {
    return dialog?.getAttribute('aria-busy') === 'true';
  }

  focusFirstInvalid() {
    const dialog = this._activeDialog;
    const target = (dialog ?? this.root).querySelector('[aria-invalid="true"]:not([disabled])')
      ?? dialog?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    target?.focus();
  }

  /* Delegated listeners, attached once. Each render() only refreshes
   * this._reg and the data-* attribute values (via morph) — never re-attaches
   * per-node listeners. */
  bindDelegatedEvents() {
    const dispatch = (evtName) => (e) => {
      const el = e.target.closest && e.target.closest(`[data-${evtName}]`);
      if (!el) return;
      const fn = this._reg[el.getAttribute(`data-${evtName}`)];
      if (fn) fn(e);
    };
    this.root.addEventListener('click', dispatch('click'));
    this.root.addEventListener('input', dispatch('input'));
    this.root.addEventListener('change', dispatch('change'));
    this.root.addEventListener('keydown', dispatch('keydown'));
    this.root.addEventListener('mousedown', dispatch('mousedown'));
    this.root.addEventListener('focusin', dispatch('focusin'));
    this.root.addEventListener('focusout', dispatch('focusout'));

    // Keyboard activation (Enter/Space) for clickable divs (role="button")
    // that don't define their own data-keydown handler.
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest && e.target.closest('[role="button"][data-click]');
      if (!el || el !== e.target || el.hasAttribute('data-keydown')) return;
      e.preventDefault();
      const fn = this._reg[el.getAttribute('data-click')];
      if (fn) fn(e);
    });
  }

  async mount() {
    purgeLegacyLibraryCache();
    try {
      // O tema escuro e a barra lateral saíram do produto (spec 002): a preferência antiga é apagada.
      localStorage.removeItem('dp_darkmode');
      localStorage.removeItem('dp_sidebar_collapsed');
      const activeAccess = localStorage.getItem('dp_active_acesso'); if (activeAccess) this.state.activeAcessoId = activeAccess;
      this.state.releaseNoticeSeen = localStorage.getItem('dp_novidades') ?? '';
    } catch (e) {}

    this.render();
    this.bindDelegatedEvents();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.state.viewportWidth !== window.innerWidth) this.setState({ viewportWidth: window.innerWidth });
      }, 120);
    });

    api.onAuthChange(async (session) => {
      if (!session) {
        this._refreshSequence++;
        this.libraryCache.clear();
        const { density, releaseNoticeSeen } = this.state;
        this.setState({
          ...this.initialState(), density, releaseNoticeSeen, loading: false,
          loginError: api.consumeSessionExpiredNotice() ? 'Sua sessão expirou. Entre novamente.' : '',
        });
        return;
      }
      await this.refreshAppData(session);
    });

    try {
      const session = await api.getSession();
      if (session) await this.refreshAppData(session);
      else this.setState({ loading: false });
    } catch (e) {
      this.setState({ loading: false, loadError: resolveErrorPolicy(e).message });
    }

    this._keyHandler = (e) => {
      const st = this.state;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (st.currentUser && !this._activeDialog) this.setState({ paletteOpen: true, paletteQuery: '', paletteIndex: 0 });
        else if (st.paletteOpen) this.setState({ paletteOpen: false });
        return;
      }
      if (st.paletteOpen) {
        const rows = this.paletteList();
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState(s => ({ paletteIndex: Math.min(rows.length - 1, s.paletteIndex + 1) })); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState(s => ({ paletteIndex: Math.max(0, s.paletteIndex - 1) })); }
        else if (e.key === 'Enter') { e.preventDefault(); const m = rows[st.paletteIndex]; if (m) { this.copyFromPalette(m); } }
        else if (e.key === 'Escape') { e.preventDefault(); this.setState({ paletteOpen: false }); }
        return;
      }
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
      if (e.key === '/' && !typing && st.currentUser && !this._activeDialog) {
        e.preventDefault();
        if (this.searchEl) this.searchEl.focus();
      } else if (e.key === 'Escape') {
        // A dialog with an operation in flight stays open until the operation settles.
        if (this.isDialogBusy()) { e.preventDefault(); return; }
        if (st.releaseNoticeSeen !== CURRENT_RELEASE && this.shouldShowReleaseNotice()) this.dismissReleaseNotice();
        else if (st.showPreviewModal) this.setState({ showPreviewModal: false });
        else if (st.confirm.open) this.closeConfirm();
        else if (st.temporaryPassword.open) this.closeTemporaryPassword();
        else if (st.messageRequestModal.open) this.closeMessageRequest();
        else if (st.showMsgModal) this.closeMsgModal();
        else if (st.showCatModal) this.closeCatModal();
        else if (st.showAcessoModal) this.closeAccessModal();
        else if (st.showAccountModal) this.closeAccountModal();
        else if (st.showMembershipModal) this.closeMembershipModal();
        else if (st.accessUsersModal.open) this.closeAccessUsers();
        else if (st.showSolicitacaoModal) this.closeReview();
        else if (st.showApprovalPopup) this.setState({ showApprovalPopup: false });
        else if (st.userMenuOpen) this.setState({ userMenuOpen: false });
        else if (this.readingIsDialog()) this.setState({ selectedMessageId: null });
        else if (st.searchQuery || st.searchQueryDraft) { clearTimeout(this._searchDebounce); this.setState({ searchQuery: '', searchQueryDraft: '' }); }
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /* ---------------- roles, accesses and data loading ---------------- */

  role() { return this.state.currentUser?.profile?.role; }
  isSuperAdmin() { return canViewAdministration(this.role()); }

  usableAccesses(profile = this.state.currentUser?.profile, accesses = this.state.acessos, memberships = this.state.acessoMembros) {
    if (!profile) return [];
    return accesses.filter(access => canUseAccess({ profile, access, memberships }));
  }

  activeAccess() {
    return pickActiveAcesso(this.usableAccesses(), this.state.activeAcessoId);
  }

  async refreshAppData(session) {
    const refreshSequence = ++this._refreshSequence;
    const userId = session.user.id;
    try {
      const requestedAccessId = this.state.activeAcessoId;
      const contextPromise = api.fetchSessionContext(userId);
      const prefetchedLibrary = requestedAccessId
        ? this.fetchLibrary(requestedAccessId).then(value => ({ value }), error => ({ error }))
        : null;
      const context = await contextPromise;
      const activeAcesso = pickActiveAcesso(
        this.usableAccesses(context.profile, context.accesses, context.memberships),
        requestedAccessId,
      );
      const activeAcessoId = activeAcesso?.id ?? null;
      let library = { categories: [], messages: [] };
      if (activeAcessoId) {
        if (activeAcessoId === requestedAccessId && prefetchedLibrary) {
          const result = await prefetchedLibrary;
          if (result.error) throw result.error;
          library = result.value;
        } else {
          library = await this.fetchLibrary(activeAcessoId);
        }
      }
      const isSuperAdmin = canViewAdministration(context.profile.role);
      const solicitacoesPendentes = isSuperAdmin ? await api.listPendingRequests() : [];
      const shouldPopup = isSuperAdmin && solicitacoesPendentes.length > 0 && !this.state.approvalPopupSeenThisSession;
      if (refreshSequence !== this._refreshSequence) return;
      const keepPersonalization = this.state.currentUser?.user?.id === userId && this.state.activeAcessoId === activeAcessoId;
      this.setState({
        currentUser: { user: session.user, profile: context.profile },
        profileId: userId,
        acessos: context.accesses,
        acessoMembros: context.memberships,
        categorias: library.categories,
        mensagens: library.messages,
        favoriteIds: keepPersonalization ? this.state.favoriteIds : [],
        recentIds: keepPersonalization ? this.state.recentIds : [],
        activeAcessoId,
        solicitacoesPendentes,
        showApprovalPopup: shouldPopup,
        approvalPopupSeenThisSession: this.state.approvalPopupSeenThisSession || shouldPopup,
        loading: false, loadError: ''
      });
      if (activeAcessoId) setTimeout(() => {
        void this.hydrateLibraryPersonalization(userId, activeAcessoId, refreshSequence);
      }, 2_500);
    } catch (error) {
      if (refreshSequence !== this._refreshSequence) return;
      this.setState({ loading: false, loggingIn: false });
      if (this.state.currentUser) { await this.handleError(error, { refresh: false }); return; }
      const policy = resolveErrorPolicy(error);
      if (policy.clearSession) { await api.expireSession(); return; }
      this.setState({ loadError: policy.message, loginError: policy.message });
    }
  }

  // In-flight requests are shared, so the bootstrap prefetch and later reads never race.
  fetchLibrary(accessId) {
    if (!this.libraryCache.has(accessId)) {
      const pending = api.fetchAccessLibraryCore(accessId);
      this.libraryCache.set(accessId, pending);
      pending.catch(() => {
        if (this.libraryCache.get(accessId) === pending) this.libraryCache.delete(accessId);
      });
    }
    return this.libraryCache.get(accessId);
  }

  // Invalidates one access and, when it is on screen, reloads only its library.
  async reloadLibrary(accessId = this.state.activeAcessoId) {
    if (!accessId) return;
    this.libraryCache.delete(accessId);
    if (accessId !== this.state.activeAcessoId) return;
    try {
      const library = await this.fetchLibrary(accessId);
      if (accessId !== this.state.activeAcessoId) return;
      this.setState({ categorias: library.categories, mensagens: library.messages });
    } catch (error) {
      await this.handleError(error, { refresh: false });
    }
  }

  async reloadPendingRequests() {
    if (!this.isSuperAdmin()) return;
    try {
      this.setState({ solicitacoesPendentes: await api.listPendingRequests() });
    } catch (error) {
      await this.handleError(error, { refresh: false });
    }
  }

  // Default refresh for NOT_FOUND/CONFLICT: the collections currently on screen.
  async reloadActiveContext() {
    const st = this.state;
    const inAdmin = st.appView === 'admin';
    await Promise.all([
      this.reloadLibrary(),
      this.reloadPendingRequests(),
      inAdmin && st.adminTab === 'arquivados' ? this.loadArchivedContent() : null,
      inAdmin && (st.adminTab === 'acessos' || st.adminTab === 'contas') ? this.loadStructuralAdmin() : null,
      st.accessUsersModal.open ? this.loadAccessUsers(st.accessUsersModal.accessId) : null,
    ]);
  }

  async hydrateLibraryPersonalization(userId, accessId, refreshSequence = this._refreshSequence) {
    try {
      const personalization = await api.fetchAccessPersonalization(userId, accessId);
      if (refreshSequence !== this._refreshSequence || accessId !== this.state.activeAcessoId) return;
      this.setState(personalization);
    } catch (error) {
      if (refreshSequence === this._refreshSequence) await this.handleError(error, { refresh: false });
    }
  }

  // Entering Administration and switching tabs both ask for this data; share one load in flight.
  loadStructuralAdmin() {
    if (!this.isSuperAdmin()) return Promise.resolve();
    this._structuralLoad ??= this.fetchStructuralAdmin().finally(() => { this._structuralLoad = null; });
    return this._structuralLoad;
  }

  async fetchStructuralAdmin() {
    this.setState({ structuralLoading: true });
    try {
      const [profiles, accessUsers] = await Promise.all([
        api.listProfiles(),
        Promise.all(this.state.acessos.map(async access => ({
          accessId: access.id,
          users: await api.listAccessUsers(access.id),
        }))),
      ]);
      const memberships = accessUsers.flatMap(({ accessId, users }) => users.map(user => ({
        userId: user.userId,
        accessId,
      })));
      this.setState({ adminProfiles: profiles, adminMemberships: memberships, structuralLoading: false });
    } catch (error) {
      this.setState({ structuralLoading: false });
      await this.handleError(error, { refresh: false });
    }
  }

  async changeActiveAccess(accessId) {
    const currentUser = this.state.currentUser;
    if (!currentUser || accessId === this.state.activeAcessoId) return;
    const refreshSequence = ++this._refreshSequence;
    try { localStorage.setItem('dp_active_acesso', accessId); } catch (e) {}
    this.setState({ activeAcessoId: accessId, categoryFilter: null, libraryVisibleLimit: 30, loading: true });
    try {
      const library = await this.fetchLibrary(accessId);
      if (refreshSequence !== this._refreshSequence) return;
      this.setState({
        categorias: library.categories,
        mensagens: library.messages,
        favoriteIds: [],
        recentIds: [],
        loading: false,
      });
      void this.hydrateLibraryPersonalization(currentUser.user.id, accessId, refreshSequence);
      if (this.state.adminTab === 'arquivados') await this.loadArchivedContent(accessId);
    } catch (error) {
      this.setState({ loading: false });
      await this.handleError(error, { refresh: false });
    }
  }

  /* ---------------- errors and confirmation ---------------- */

  /* Single place that turns an AppError code into UI behavior (domain/error-policy.mjs):
   * AUTH_REQUIRED clears the session; FORBIDDEN keeps data and closes the prompt; NOT_FOUND
   * closes the stale detail and refreshes; CONFLICT keeps the form and refreshes; VALIDATION
   * keeps the form and focuses the first invalid field; NETWORK keeps input and offers retry. */
  async handleError(error, { setFormError = null, closeDetail = null, retry = null, refresh, messages = {} } = {}) {
    const policy = resolveErrorPolicy(error, messages);
    if (policy.clearSession) {
      await api.expireSession();
      return policy;
    }
    if (policy.closePrompt) this.closeConfirm(true);
    if (policy.closeDetail && closeDetail) closeDetail();
    if (setFormError && !(policy.closeDetail && closeDetail)) {
      setFormError(policy.message);
    } else {
      const action = policy.offerRetry && retry ? { label: 'Tentar novamente', onClick: retry } : null;
      this.showToast(policy.message, 'error', '', action);
    }
    if (policy.focusInvalid) this.focusFirstInvalid();
    if (policy.refresh && refresh !== false) {
      try {
        await (refresh ?? (() => this.reloadActiveContext()))();
      } catch (refreshError) {
        console.warn('Falha ao recarregar o estado após erro', refreshError);
      }
    }
    return policy;
  }

  requestConfirmation(title, message, action) {
    this.setState({ confirm: { open: true, title, message, action, saving: false } });
  }

  closeConfirm(force = false) {
    if (!force && this.state.confirm.saving) return;
    if (this.state.confirm.open) this.setState({ confirm: CLOSED_CONFIRM });
  }

  // The prompt stays open, busy and unclickable until the action settles (FR-026).
  async runConfirm() {
    const confirm = this.state.confirm;
    if (!confirm.open || confirm.saving || typeof confirm.action !== 'function') return;
    this.setState({ confirm: { ...confirm, saving: true } });
    try {
      await confirm.action();
    } finally {
      this.closeConfirm(true);
    }
  }

  /* ---------------- search helpers (delegated to search-utils.mjs) ---------------- */

  matchesSearch(msg, query) { return matchesSearch(msg, query); }
  // O destaque da busca é uma marcação do design system (dp-highlight), não um estilo embutido.
  titleSegments(titulo, query) {
    return titleSegmentsPure(titulo, query, 'dp-highlight')
      .map(({ text, style }) => ({ text, highlight: style === 'dp-highlight' }));
  }

  /* Shared by the message cards, the "Visão geral" panels and the command
   * palette, all of which need to copy a message + record usage the same way. */
  getActiveAcessoMsgs() {
    const activeAcesso = this.activeAccess();
    return activeAcesso ? this.state.mensagens.filter(m => m.acesso_id === activeAcesso.id) : [];
  }
  async copyMessage(msg) {
    const profile = this.state.currentUser.profile;
    const result = await copyExactText(msg.conteudo, {
      telemetry: () => api.recordMessageUse(profile.id, msg.id).then(() => {
        this.setState(s => ({
          mensagens: s.mensagens.map(m => m.id === msg.id ? { ...m, frequencia: m.frequencia + 1 } : m),
          recentIds: [msg.id, ...s.recentIds.filter(id => id !== msg.id)].slice(0, 5)
        }));
        this.libraryCache.delete(msg.acesso_id);
      }),
      onTelemetryError: (error) => console.warn('Falha ao registrar uso da mensagem', error),
    });
    if (!result.copied) {
      this.showToast('Selecione o texto e copie manualmente', 'error');
      return;
    }
    this.setState({ copiedId: msg.id });
    performance.clearMarks('dp-copy-ready');
    performance.mark('dp-copy-ready');
    const copyStatus = document.getElementById('copy-status');
    if (copyStatus) {
      copyStatus.textContent = '';
      requestAnimationFrame(() => { copyStatus.textContent = 'Mensagem copiada'; });
    }
    setTimeout(() => this.setState({ copiedId: null }), 1400);
    this.showToast('Mensagem copiada', 'success', '', null, 3000);
  }
  paletteList() {
    const q = this.state.paletteQuery.trim();
    let list = this.getActiveAcessoMsgs();
    if (q) list = list.filter(m => this.matchesSearch(m, q));
    return [...list].sort((a, b) => b.frequencia - a.frequencia).slice(0, 8);
  }
  copyFromPalette(msg) {
    this.copyMessage(msg);
    this.setState({ paletteOpen: false });
  }

  // Administração e janelas ainda montam estilo embutido (etapas 2 e 3): ui/legacy-theme.mjs.
  theme() {
    return LEGACY_THEME;
  }

  // Duas cores da marca alternadas pela ordem da categoria no acesso (R16): sem paleta
  // arbitrária e sempre com contraste suficiente sobre o fundo claro.
  categoryColor(nome) {
    const names = [...new Set(this.state.categorias
      .filter(category => category.acesso_id === this.state.activeAcessoId)
      .map(category => category.nome))];
    const index = names.indexOf(nome);
    return index % 2 === 1 ? LEGACY_THEME.accent : LEGACY_THEME.brand;
  }

  avatarSquare(letter, color, size) {
    const s = size || 26;
    const radius = s <= 30 ? '9px' : '11px';
    const fontSize = s <= 30 ? '12px' : '14px';
    return `<div style="width:${s}px; height:${s}px; border-radius:${radius}; background:linear-gradient(135deg, ${color}2E, ${color}16); color:${color}; font-weight:800; font-size:${fontSize}; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid ${color}40; box-shadow:0 2px 6px -3px ${color}66;">${esc(letter)}</div>`;
  }

  // Ícone temático por palavra-chave no nome da categoria (texto livre, criado
  // pelo usuário — sem tabela de mapeamento no banco). Sem correspondência,
  // cai no ícone de etiqueta genérico em vez de deixar o avatar vazio.
  categoryIcon(nome) {
    const n = normalize(nome);
    const has = (...words) => words.some(w => n.includes(w));
    if (has('financeiro', 'pix', 'pagamento', 'cobranca', 'fatura', 'boleto', 'reembolso'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    if (has('comercial', 'venda', 'proposta', 'orcamento', 'pedido'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`;
    if (has('relacionamento', 'atendimento', 'boas-vindas', 'boas vindas', 'cliente'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
    if (has('qualidade', 'avaliacao', 'pesquisa'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/></svg>`;
    if (has('portal', 'sistema', 'acesso', 'login', 'senha'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>`;
    if (has('empresarial', 'institucional', 'corporativo'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
    if (has('agendamento', 'consulta', 'horario', 'marcacao'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    if (has('resolucao', 'problema', 'suporte', 'duvida'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
    if (has('protocolo', 'documento', 'contrato', 'pendencia', 'encerramento'))
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`;
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1 0-2.8L11.4 3.4A2 2 0 0 1 12.8 3H19a2 2 0 0 1 2 2v6.2a2 2 0 0 1-.4 1.4z"/><circle cx="16" cy="8" r="1"/></svg>`;
  }

  avatarIcon(iconSvg, color, size) {
    const s = size || 26;
    const radius = s <= 30 ? '9px' : '11px';
    return `<div style="width:${s}px; height:${s}px; border-radius:${radius}; background:linear-gradient(135deg, ${color}2E, ${color}16); color:${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid ${color}40; box-shadow:0 2px 6px -3px ${color}66;">${iconSvg}</div>`;
  }

  showToast(msg, type, body, action, duration) {
    const t = this.theme();
    const id = ++this._toastSeq;
    const ms = duration || (body || action ? 6000 : 3000);
    const toast = { id, msg, type: type || 'success', body: body || '', action: action || null, duration: ms, bg: type === 'error' ? t.danger : t.toastBg, ink: type === 'error' ? t.onBrand : t.toastInk };
    const MAX_VISIBLE = 4;
    this.setState(s => ({ toasts: [...s.toasts.filter(item => item.msg !== toast.msg), toast].slice(-MAX_VISIBLE) }));
    setTimeout(() => this.setState(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), ms);
  }
  dismissToast(id) {
    this.setState(s => ({ toasts: s.toasts.filter(x => x.id !== id) }));
  }

  /* ---------------- computed bindings ---------------- */

  roleLabel(role) { return canViewAdministration(role) ? 'Superadministrador' : 'Colaborador'; }

  // Selecionar apenas mostra a mensagem no painel de leitura; copiar é ação explícita (FR-007).
  selectMessage(messageId) {
    this.setState({ selectedMessageId: messageId, userMenuOpen: false });
  }

  readingIsDialog() {
    return this.state.viewportWidth < 900 && Boolean(this.state.selectedMessageId) && !this.anyModalOpen();
  }

  /* No celular a leitura é um diálogo. Enquanto outra janela estiver aberta ela sai da tela,
   * para que exista sempre um único aria-modal e o foco fique preso na janela certa. */
  anyModalOpen() {
    const st = this.state;
    return Boolean(st.showPreviewModal || st.confirm.open || st.temporaryPassword.open
      || st.messageRequestModal.open || st.showMsgModal || st.showCatModal || st.showAcessoModal
      || st.showAccountModal || st.showMembershipModal || st.accessUsersModal.open
      || st.showSolicitacaoModal || st.showApprovalPopup || st.paletteOpen
      || st.releaseNoticeSeen !== CURRENT_RELEASE);
  }

  /* O aviso de novidades não disputa espaço com o aviso de solicitações pendentes:
   * aparece depois dele, e só uma vez por navegador em cada etapa publicada. */
  shouldShowReleaseNotice() {
    const st = this.state;
    return Boolean(st.currentUser)
      && !st.loading
      && st.releaseNoticeSeen !== CURRENT_RELEASE
      && !st.showApprovalPopup;
  }

  dismissReleaseNotice() {
    try { localStorage.setItem('dp_novidades', CURRENT_RELEASE); } catch (e) {}
    this.setState({ releaseNoticeSeen: CURRENT_RELEASE });
  }

  renderVals() {
    const st = this.state;
    const theme = this.theme();
    const session = st.currentUser;

    if (st.loading) return { isLogin: false, isApp: false, isLoading: true, theme, toasts: st.toasts };

    if (!session) {
      return {
        isLogin: true, isApp: false, isLoading: false,
        theme,
        loginEmail: st.loginEmail, loginPassword: st.loginPassword, loginError: st.loginError,
        loggingIn: st.loggingIn, loginBtnLabel: st.loggingIn ? 'Entrando…' : 'Entrar',
        showLoginPassword: st.showLoginPassword,
        showPasswordHelp: st.showPasswordHelp,
        onLoginEmailChange: (e) => this.setState({ loginEmail: e.target.value }),
        onLoginPasswordChange: (e) => this.setState({ loginPassword: e.target.value }),
        onToggleLoginPassword: () => this.setState({ showLoginPassword: !st.showLoginPassword }),
        onTogglePasswordHelp: () => this.setState({ showPasswordHelp: !st.showPasswordHelp }),
        handleLogin: () => this.handleLogin(),
        onLoginKeyDown: (e) => { if (e.key === 'Enter') this.handleLogin(); },
        toasts: st.toasts,
      };
    }

    const profile = session.profile;
    const activeAcesso = this.activeAccess();
    if (!activeAcesso) {
      return {
        isLogin: false, isApp: false, isNoAcesso: true, isLoading: false, theme,
        noAcessoNome: profile.nome,
        logout: () => this.logout(),
        toasts: st.toasts,
      };
    }

    const isSuperAdmin = canViewAdministration(profile.role);
    const canPublish = canPublishContent(profile.role);
    const acessoMsgs = st.mensagens.filter(m => m.acesso_id === activeAcesso.id);
    const acessoCats = st.categorias.filter(c => c.acesso_id === activeAcesso.id);
    const categoryNames = new Map(acessoCats.map(c => [c.id, c.nome]));
    const categoryName = (m) => categoryNames.get(m.categoria_id) ?? m.categoria ?? '';
    const accessOptions = this.usableAccesses();

    const copyMessage = (msg) => this.copyMessage(msg);
    const toggleFav = (id) => {
      const isFav = st.favoriteIds.includes(id);
      api.toggleFavorite(profile.id, id, isFav)
        .then(() => this.setState(s => ({
          favoriteIds: isFav ? s.favoriteIds.filter(favoriteId => favoriteId !== id) : [...s.favoriteIds, id],
        })))
        .catch(error => this.handleError(error));
    };
    const openPreview = (msg) => this.setState({ showPreviewModal: true, previewingMsgId: msg.id });

    const usageLabel = (frequencia) => `usada ${frequencia}${frequencia === 1 ? ' vez' : ' vezes'}`;
    const buildListItem = (m) => {
      const tagsLabel = m.tags.length ? ` · ${m.tags.map(tag => `#${tag}`).join(' ')}` : '';
      return {
        id: m.id,
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        metaLabel: `${categoryName(m)} · ${usageLabel(m.frequencia)}${tagsLabel}`,
        isFav: st.favoriteIds.includes(m.id),
        selected: m.id === effectiveSelectedId,
        onSelect: () => this.selectMessage(m.id),
      };
    };
    const buildReading = (m) => ({
      id: m.id,
      categoria: categoryName(m),
      titulo: m.titulo,
      conteudo: m.conteudo,
      tagChips: m.tags.map(tag => ({ label: tag, onClick: () => this.setState({ searchQuery: tag, searchQueryDraft: tag }) })),
      usageLabel: usageLabel(m.frequencia),
      isFav: st.favoriteIds.includes(m.id),
      onToggleFav: () => toggleFav(m.id),
      copied: st.copiedId === m.id,
      copyLabel: st.copiedId === m.id ? 'Copiado' : 'Copiar',
      onCopy: () => copyMessage(m),
      onPreview: () => openPreview(m),
      onEdit: () => this.openEditMsg(m),
      onArchive: () => this.requestArchiveMessage(m),
      editLabel: canPublish ? 'Editar' : 'Sugerir edição',
      archiveLabel: canPublish ? 'Arquivar' : 'Solicitar arquivamento',
    });

    const sortBy = st.librarySort === 'az' ? 'alfabetica' : st.librarySort === 'used' ? 'frequencia' : 'relevancia';
    // One fuzzy scan per render, shared by the library and the search dropdown.
    const searchMatches = st.searchQuery.trim() ? acessoMsgs.filter(m => this.matchesSearch(m, st.searchQuery)) : acessoMsgs;
    const scopedMatches = st.favoritesOnly ? searchMatches.filter(m => st.favoriteIds.includes(m.id)) : searchMatches;
    const filtered = selectLibraryMessages(scopedMatches, {
      categoryId: st.categoryFilter,
      sortBy,
    });
    const q = st.searchQuery.trim().toLowerCase();
    if (q) {
      filtered.sort((a, b) => {
        const aExact = a.titulo.toLowerCase().includes(q) ? 1 : 0;
        const bExact = b.titulo.toLowerCase().includes(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.frequencia - a.frequencia;
      });
    } else if (st.librarySort === 'relevance') {
      filtered.sort((a, b) => (st.favoriteIds.includes(b.id) ? 1 : 0) - (st.favoriteIds.includes(a.id) ? 1 : 0) || b.frequencia - a.frequencia);
    }
    const libraryPage = paginateLibraryMessages(filtered, st.libraryVisibleLimit);

    /* Seleção: no computador, a primeira mensagem visível fica selecionada quando nada foi
     * escolhido ou a escolhida saiu do resultado (FR-006). No celular nada é selecionado por
     * padrão, porque a leitura abre como diálogo por cima da lista. */
    const isNarrow = st.viewportWidth < 900;
    const chosen = libraryPage.items.find(m => m.id === st.selectedMessageId) ?? null;
    const selectedMessage = chosen ?? (isNarrow ? null : (libraryPage.items[0] ?? null));
    const effectiveSelectedId = selectedMessage?.id ?? null;

    // A Visão geral não tem pílulas: as listas dela ignoram o filtro de categoria da Biblioteca.
    const acessoMsgsInCategory = acessoMsgs;
    const miniRowData = (m) => ({
      id: m.id, titulo: m.titulo,
      metaLabel: `${categoryName(m)} · ${usageLabel(m.frequencia)}`,
      isFav: st.favoriteIds.includes(m.id),
      onCopy: () => copyMessage(m), copied: st.copiedId === m.id,
    });
    const recentList = st.recentIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);
    const favList = st.favoriteIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      count: acessoMsgs.filter(m => m.categoria_id === c.id).length,
      icon: this.categoryIcon(c.nome), color: this.categoryColor(c.nome),
      active: st.categoryFilter === c.id,
      onClick: () => this.setState({
        categoryFilter: st.categoryFilter === c.id ? null : c.id,
        appView: 'biblioteca', libraryVisibleLimit: 30, selectedMessageId: null,
      }),
    }));

    const heroGreeting = greetingFor(new Date(), profile.nome);

    const adminQ = st.adminSearchQuery.trim().toLowerCase();
    const adminMsgRows = acessoMsgs.filter(m => !adminQ || m.titulo.toLowerCase().includes(adminQ) || m.conteudo.toLowerCase().includes(adminQ))
      .map(m => ({
        id: m.id, categoria: categoryName(m), titulo: m.titulo, conteudo: m.conteudo,
        onEdit: () => this.openEditMsg(m),
        onArchive: () => this.requestArchiveMessage(m),
      }));

    const catRows = acessoCats.map(c => ({
      id: c.id, nome: c.nome,
      countLabel: acessoMsgs.filter(m => m.categoria_id === c.id).length + ' mensagens',
      onEdit: () => this.openEditCat(c),
      onArchive: () => this.requestArchiveCategory(c),
    }));

    const acessoRows = st.acessos.map(a => {
      const linkedCount = st.adminMemberships.filter(m => m.accessId === a.id).length;
      const msgCount = st.mensagens.filter(m => m.acesso_id === a.id).length;
      return {
        id: a.id, nome: a.nome,
        statsLabel: `${msgCount} mensagens · ${linkedCount} usuários`,
        statusLabel: a.ativo ? 'Ativo' : 'Inativo',
        toggleLabel: a.ativo ? 'Desativar' : 'Ativar',
        onToggleStatus: () => a.ativo
          ? this.requestConfirmation('Desativar acesso', `Desativar o acesso "${a.nome}"? Colaboradores vinculados deixarão de visualizar seu conteúdo.`, () => this.setAccessStatus(a.id, false))
          : this.setAccessStatus(a.id, true),
        onUsers: () => this.openAccessUsers(a.id)
      };
    });

    const accountRows = st.adminProfiles.map(account => {
      const membershipCount = st.adminMemberships.filter(membership => membership.userId === account.id).length;
      return {
        id: account.id,
        name: account.nome,
        email: account.email,
        roleLabel: this.roleLabel(account.role),
        membershipLabel: `${membershipCount} ${membershipCount === 1 ? 'acesso' : 'acessos'}`,
        onMemberships: () => this.openMembershipModal(account.id),
        onResetPassword: () => this.requestResetPassword({ userId: account.id, name: account.nome, email: account.email }),
      };
    });

    const appView = (st.appView === 'admin' && !isSuperAdmin) ? 'biblioteca' : (st.appView || 'biblioteca');
    const pageTitles = { biblioteca: 'Biblioteca de mensagens', visaogeral: 'Visão geral', admin: 'Administração' };
    const favoritesCount = acessoMsgs.filter(m => st.favoriteIds.includes(m.id)).length;
    const adminTab = st.adminTab || 'mensagens';
    const pendingRequest = st.solicitacoesPendentes.find(item => item.id === st.viewingSolicitacaoId);
    const previewing = acessoMsgs.find(x => x.id === st.previewingMsgId);
    const accessUsers = st.accessUsersModal;

    return {
      isLogin: false, isApp: true, isLoading: false, theme,
      appView,
      pageTitle: pageTitles[appView],
      isLib: appView === 'biblioteca', isOver: appView === 'visaogeral', isAdminView: appView === 'admin',
      isAdminMsgs: adminTab === 'mensagens', isAdminCats: adminTab === 'categorias', isAdminAcessos: adminTab === 'acessos',
      isAdminAccounts: adminTab === 'contas',
      isAdminSolicitacoes: adminTab === 'solicitacoes',
      isAdminArchived: adminTab === 'arquivados',
      isSuperAdmin, isAdminNow: isSuperAdmin,
      // Trocar de seção fecha o menu da conta e desfaz a seleção: no celular a leitura é um
      // diálogo, e ele não pode sobreviver à navegação.
      navItems: [
        { label: 'Biblioteca', current: appView === 'biblioteca', onClick: () => this.setState({ appView: 'biblioteca', userMenuOpen: false, selectedMessageId: null }) },
        { label: 'Visão geral', current: appView === 'visaogeral', onClick: () => this.setState({ appView: 'visaogeral', userMenuOpen: false, selectedMessageId: null }) },
        ...(isSuperAdmin ? [{
          label: 'Administração',
          current: appView === 'admin',
          badge: st.solicitacoesPendentes.length || null,
          badgeLabel: `${st.solicitacoesPendentes.length} ${st.solicitacoesPendentes.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'}`,
          onClick: () => {
            this.setState({ appView: 'admin', userMenuOpen: false, adminTab: 'mensagens', selectedMessageId: null });
            void this.loadStructuralAdmin();
          },
        }] : []),
      ],
      bandTitle: appView === 'admin' ? 'Administração' : heroGreeting,
      bandSummary: appView === 'admin'
        ? `${st.solicitacoesPendentes.length} ${st.solicitacoesPendentes.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'} · operando em ${activeAcesso.nome}`
        : `${acessoMsgs.length} ${acessoMsgs.length === 1 ? 'padrão disponível' : 'padrões disponíveis'} · ${favoritesCount} ${favoritesCount === 1 ? 'favorita' : 'favoritas'}`,
      // Tela 02: a Visão geral só tem saudação e resumo na faixa; busca e pílulas são da Biblioteca.
      showLibraryTools: appView === 'biblioteca',
      userMenuOpen: st.userMenuOpen,
      onToggleUserMenu: () => this.setState({ userMenuOpen: !st.userMenuOpen }),
      goBiblioteca: () => this.setState({ appView: 'biblioteca', userMenuOpen: false }),
      goVisaoGeral: () => this.setState({ appView: 'visaogeral', userMenuOpen: false }),
      goAdmin: () => { this.setState({ appView: 'admin', userMenuOpen: false, adminTab: 'mensagens' }); void this.loadStructuralAdmin(); },
      setAdminTabMsgs: () => this.setState({ adminTab: 'mensagens' }),
      setAdminTabCats: () => this.setState({ adminTab: 'categorias' }),
      setAdminTabAcessos: () => { this.setState({ adminTab: 'acessos' }); void this.loadStructuralAdmin(); },
      setAdminTabAccounts: () => { this.setState({ adminTab: 'contas' }); void this.loadStructuralAdmin(); },
      setAdminTabSolicitacoes: () => this.setState({ adminTab: 'solicitacoes' }),
      setAdminTabArchived: () => this.openArchivedAdmin(),

      solicitacoesCount: st.solicitacoesPendentes.length,
      goApprovals: () => this.setState({ appView: 'admin', adminTab: 'solicitacoes', showApprovalPopup: false, userMenuOpen: false }),

      currentUser: { nome: profile.nome, iniciais: profile.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(), perfilLabel: this.roleLabel(profile.role) },
      logout: () => this.logout(),

      activeAcesso, activeAcessoId: activeAcesso.id,
      userAcessosOptions: accessOptions,
      onChangeActiveAcesso: (e) => this.changeActiveAccess(e.target.value),

      searchQueryDraft: st.searchQueryDraft, searchInputRef: (el) => { this.searchEl = el; },
      onSearchChange: (e) => {
        const val = e.target.value;
        // The input already shows what was typed: keep the draft without re-rendering and
        // render once, after the debounce (SC-003 measured two full renders per search).
        this.state.searchQueryDraft = val;
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => this.setState({ searchQuery: val, libraryVisibleLimit: 30 }), 100);
      },
      onSearchFocus: () => this.setState({ searchFocused: true }),
      onSearchBlur: () => this.setState({ searchFocused: false }),
      shortcutLabel: /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K',

      searchDropdownResults: (() => {
        if (!st.searchFocused || !st.searchQuery.trim()) return [];
        return [...searchMatches]
          .sort((a, b) => b.frequencia - a.frequencia)
          .slice(0, 6)
          .map(m => ({
            id: m.id, titulo: m.titulo, categoria: categoryName(m),
            snippet: m.conteudo.length > 70 ? m.conteudo.slice(0, 70) + '…' : m.conteudo,
            onPick: (e) => { e.preventDefault(); this.copyMessage(m); this.setState({ searchFocused: false }); if (this.searchEl) this.searchEl.blur(); }
          }));
      })(),
      showSearchDropdown: st.searchFocused && st.searchQuery.trim().length > 0,

      chipAllActive: !st.categoryFilter && !st.favoritesOnly, chipAllCount: acessoMsgs.length,
      setCategoryAll: () => this.setState({ categoryFilter: null, favoritesOnly: false, libraryVisibleLimit: 30, selectedMessageId: null, appView: 'biblioteca' }),
      categoriaChips,
      favoritesCount, favoritesOnly: st.favoritesOnly,
      toggleFavoritesOnly: () => this.setState({
        favoritesOnly: !st.favoritesOnly, libraryVisibleLimit: 30, selectedMessageId: null, appView: 'biblioteca',
      }),

      heroGreeting,
      recentList, hasRecent: recentList.length > 0,
      favList, hasFav: favList.length > 0,

      resultsCountLabel: filtered.length === 1 ? '1 mensagem encontrada' : `${filtered.length} mensagens encontradas`,
      hasResults: filtered.length > 0,
      libraryIsTrulyEmpty: acessoMsgs.length === 0 && !st.searchQuery.trim() && !st.categoryFilter && !st.favoritesOnly,
      emptyTitle: acessoMsgs.length === 0 && !st.searchQuery.trim() && !st.categoryFilter && !st.favoritesOnly
        ? 'Nenhuma mensagem cadastrada ainda'
        : 'Nenhuma mensagem encontrada',
      emptyHint: acessoMsgs.length === 0 && !st.searchQuery.trim() && !st.categoryFilter && !st.favoritesOnly
        ? 'A biblioteca deste acesso ainda está vazia.'
        : 'Ajuste a busca ou escolha outra categoria.',
      messageList: libraryPage.items.map(buildListItem),
      reading: selectedMessage ? buildReading(selectedMessage) : null,
      showReadingPanel: !isNarrow,
      readingAsDialog: isNarrow && Boolean(chosen) && !this.anyModalOpen(),
      onCloseReading: () => this.setState({ selectedMessageId: null }),
      hasMoreMessages: libraryPage.hasMore,
      loadMoreLabel: `Carregar mais (${libraryPage.total - libraryPage.items.length} restantes)`,
      onLoadMore: () => this.setState({ libraryVisibleLimit: libraryPage.nextLimit }),

      librarySort: st.librarySort,
      onLibrarySortChange: (e) => this.setState({ librarySort: e.target.value, libraryVisibleLimit: 30, selectedMessageId: null }),

      releaseNotes: {
        open: this.shouldShowReleaseNotice(),
        title: RELEASE_NOTES.title,
        items: RELEASE_NOTES.items,
        confirmLabel: RELEASE_NOTES.confirmLabel,
        onConfirm: () => this.dismissReleaseNotice(),
      },

      showPreviewModal: st.showPreviewModal,
      closePreview: () => this.setState({ showPreviewModal: false }),
      previewingMsg: previewing ? {
        titulo: previewing.titulo, categoria: categoryName(previewing),
        usageLabel: usageLabel(previewing.frequencia), copied: st.copiedId === previewing.id,
        conteudo: previewing.conteudo, onCopy: () => copyMessage(previewing)
      } : null,

      paletteOpen: st.paletteOpen, paletteQuery: st.paletteQuery, paletteInputRef: (el) => { this.paletteEl = el; if (el && document.activeElement !== el) el.focus(); },
      onPaletteQueryChange: (e) => this.setState({ paletteQuery: e.target.value, paletteIndex: 0 }),
      openPalette: () => this.setState({ paletteOpen: true, paletteQuery: '', paletteIndex: 0 }),
      closePalette: () => this.setState({ paletteOpen: false }),
      paletteRows: st.paletteOpen ? this.paletteList().map((m, i) => ({
        titulo: m.titulo, categoria: categoryName(m), catColor: this.categoryColor(categoryName(m)),
        active: i === st.paletteIndex,
        onPick: () => this.copyFromPalette(m),
      })) : [],
      paletteEmpty: st.paletteOpen && this.paletteList().length === 0,

      adminSearchQueryDraft: st.adminSearchQueryDraft,
      onAdminSearchChange: (e) => {
        const val = e.target.value;
        this.setState({ adminSearchQueryDraft: val });
        clearTimeout(this._adminSearchDebounce);
        this._adminSearchDebounce = setTimeout(() => this.setState({ adminSearchQuery: val }), 150);
      },
      adminMsgRows, catRows, acessoRows, accountRows, accountsLoading: st.structuralLoading,
      openCreateMsg: () => this.openCreateMsg(),
      openCreateCat: () => this.openCreateCat(),
      openCreateAcesso: () => this.openCreateAccess(),
      openCreateAccount: () => this.openCreateAccount(),
      createMessageLabel: canPublish ? 'Nova mensagem' : 'Solicitar mensagem',

      messageEditor: {
        open: st.showMsgModal,
        title: st.editingMsgId ? 'Editar mensagem' : 'Nova mensagem',
        categories: acessoCats, form: st.msgForm,
        saving: st.saving, error: st.msgError, invalid: st.msgInvalid,
        tagChips: st.msgForm.tags.map((label, index) => ({
          label, onRemove: () => this.updateMsgForm({ tags: this.state.msgForm.tags.filter((_, i) => i !== index) }),
        })),
        onCategoryChange: (e) => this.updateMsgForm({ categoryId: e.target.value }),
        onTitleChange: (e) => this.updateMsgForm({ title: e.target.value.slice(0, 100) }),
        onTagInputChange: (e) => this.updateMsgForm({ tagInput: e.target.value }),
        onTagKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addMsgTag(); } },
        onAddTag: () => this.addMsgTag(),
        onContentChange: (e) => this.updateMsgForm({ content: e.target.value.slice(0, 2000) }),
        onClose: () => this.closeMsgModal(),
        onSubmit: () => this.saveMsg(),
      },

      messageRequestModal: {
        ...st.messageRequestModal,
        categories: acessoCats,
        saving: st.requestSaving,
        accessibleName: st.messageRequestModal.type === 'criacao'
          ? 'Solicitar nova mensagem'
          : st.messageRequestModal.type === 'edicao'
            ? `Sugerir edição de ${st.messageRequestModal.previous?.titulo || ''}`
            : `Solicitar arquivamento de ${st.messageRequestModal.previous?.titulo || ''}`,
        title: st.messageRequestModal.type === 'criacao' ? 'Solicitar nova mensagem' : 'Sugerir edição',
        onCategoryChange: (e) => this.updateMessageRequestForm('categoryId', e.target.value),
        onTitleChange: (e) => this.updateMessageRequestForm('title', e.target.value.slice(0, 100)),
        onTagsChange: (e) => this.updateMessageRequestForm('tagsText', e.target.value),
        onContentChange: (e) => this.updateMessageRequestForm('content', e.target.value.slice(0, 2000)),
        onClose: () => this.closeMessageRequest(),
        onSubmit: () => this.submitMessageRequest()
      },

      structuralModals: {
        access: {
          open: st.showAcessoModal,
          form: { name: st.acessoForm.nome, description: st.acessoForm.descricao, color: st.acessoForm.cor },
          saving: st.saving, error: st.accessError, invalid: st.accessInvalid,
          onNameChange: (event) => this.updateAccessForm({ nome: event.target.value }),
          onDescriptionChange: (event) => this.updateAccessForm({ descricao: event.target.value }),
          onColorChange: (event) => this.updateAccessForm({ cor: event.target.value }),
          onClose: () => this.closeAccessModal(),
          onSubmit: () => this.saveAccess(),
        },
        category: {
          open: st.showCatModal,
          title: st.editingCatId ? 'Editar categoria' : 'Nova categoria',
          name: st.catForm.nome, saving: st.saving, error: st.categoryError, invalid: st.categoryInvalid,
          onNameChange: (event) => this.setState({ catForm: { nome: event.target.value }, categoryError: '', categoryInvalid: [] }),
          onClose: () => this.closeCatModal(),
          onSubmit: () => this.saveCat(),
        },
        account: {
          open: st.showAccountModal, form: st.accountForm, saving: st.saving, error: st.accountError, invalid: st.accountInvalid,
          accesses: st.acessos.map(access => ({
            name: access.nome,
            checked: st.accountForm.accessIds.has(access.id),
            onChange: event => this.setAccountAccess(access.id, event.target.checked),
          })),
          onNameChange: event => this.updateAccountForm('name', event.target.value),
          onEmailChange: event => this.updateAccountForm('email', event.target.value),
          onPasswordChange: event => this.updateAccountForm('temporaryPassword', event.target.value),
          onRoleChange: event => this.updateAccountForm('role', event.target.value),
          onClose: () => this.closeAccountModal(),
          onSubmit: () => this.createAccount(),
        },
        membership: {
          open: st.showMembershipModal,
          name: st.adminProfiles.find(account => account.id === st.membershipUserId)?.nome || '',
          saving: st.saving, error: st.membershipError,
          accesses: st.acessos.map(access => ({
            name: access.nome, active: access.ativo,
            checked: st.membershipDraft.has(access.id),
            onChange: event => this.setMembershipDraft(access.id, event.target.checked),
          })),
          onClose: () => this.closeMembershipModal(),
          onSubmit: () => this.saveMemberships(),
        },
        accessUsers: accessUsers.open ? {
          open: true,
          accessName: st.acessos.find(a => a.id === accessUsers.accessId)?.nome ?? '',
          loading: accessUsers.loading, saving: accessUsers.saving, error: accessUsers.error,
          rows: accessUsers.users.map(user => ({
            userId: user.userId, name: user.name, email: user.email, roleLabel: this.roleLabel(user.role),
            onResetPassword: () => this.requestResetPassword(user),
            onUnlink: () => this.requestUnlinkUser(user),
          })),
          options: accessUsers.profiles.filter(p => !accessUsers.users.some(u => u.userId === p.id)),
          selectedId: accessUsers.selectedId,
          onSelect: (e) => this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, selectedId: e.target.value, error: '' } })),
          onAdd: () => this.addUserToAccess(),
          onClose: () => this.closeAccessUsers(),
        } : { open: false },
        temporaryPassword: {
          ...st.temporaryPassword,
          onCopy: () => this.copyTemporaryPassword(),
          onClose: () => this.closeTemporaryPassword(),
        },
      },

      confirmModal: st.confirm.open ? {
        ...st.confirm,
        onClose: () => this.closeConfirm(),
        onConfirm: () => this.runConfirm(),
      } : null,

      showApprovalPopup: st.showApprovalPopup,
      approvalPopupCount: st.solicitacoesPendentes.length,
      dismissApprovalPopup: () => this.setState({ showApprovalPopup: false }),

      solicitacaoRows: st.solicitacoesPendentes.map(s => ({
        id: s.id,
        titulo: s.titulo || s.titulo_anterior || 'Mensagem',
        departamento: s.acessos ? s.acessos.nome : '—',
        usuario: s.solicitante ? s.solicitante.nome : '—',
        tipoLabel: requestTypeLabel(s.tipo),
        onOpen: () => this.openReview(s.id),
      })),
      archivedLoading: st.archivedLoading,
      archivedMessageRows: st.archivedMessages.map(message => ({
        ...message,
        onRestore: () => this.restoreArchivedMessage(message)
      })),
      archivedCategoryRows: st.archivedCategories.map(category => ({
        ...category,
        onRestore: () => this.restoreArchivedCategory(category)
      })),

      reviewModal: pendingRequest ? {
        open: st.showSolicitacaoModal,
        request: {
          typeLabel: requestTypeLabel(pendingRequest.tipo),
          isCreation: pendingRequest.tipo === 'criacao', isArchive: isArchiveRequest(pendingRequest.tipo),
          department: pendingRequest.acessos?.nome || '—', user: pendingRequest.solicitante?.nome || '—',
          previousCategory: pendingRequest.categoria_anterior, category: pendingRequest.categoria,
          previousTitle: pendingRequest.titulo_anterior, title: pendingRequest.titulo,
          previousContent: pendingRequest.conteudo_anterior, content: pendingRequest.conteudo
        },
        rejectMode: st.solicitacaoRejectMode, reason: st.rejectMotivo,
        saving: st.reviewSaving, error: st.reviewError, invalid: st.reviewInvalid,
        onClose: () => this.closeReview(),
        onStartReject: () => this.setState({ solicitacaoRejectMode: true, reviewError: '', reviewInvalid: [] }),
        onCancelReject: () => { if (!this.state.reviewSaving) this.setState({ solicitacaoRejectMode: false, rejectMotivo: '', reviewError: '', reviewInvalid: [] }); },
        onReasonChange: (e) => this.setState({ rejectMotivo: e.target.value, reviewError: '', reviewInvalid: [] }),
        onApprove: () => this.approveReviewedRequest(),
        onReject: () => this.rejectReviewedRequest()
      } : { open: false },

      toasts: st.toasts
    };
  }

  /* ---------------- actions ---------------- */

  async handleLogin() {
    if (this.state.loggingIn) return;
    this.setState({ loggingIn: true, loginError: '' });
    try {
      await api.signIn(this.state.loginEmail.trim(), this.state.loginPassword);
      // Leave loggingIn true — the auth listener now loads the app data, and
      // the login screen (and its button) unmounts as soon as that finishes.
    } catch (e) {
      this.setState({ loginError: resolveErrorPolicy(e).message, loggingIn: false });
    }
  }

  async logout() {
    this.setState({ userMenuOpen: false });
    try {
      await api.signOut();
    } catch (e) {
      this.showToast(`Não foi possível sair. ${resolveErrorPolicy(e).message}`, 'error');
    }
  }

  /* messages: superadministrators publish directly, collaborators send requests */

  openCreateMsg() {
    if (!canPublishContent(this.role())) {
      this.openMessageRequest('criacao');
      return;
    }
    const categories = this.state.categorias.filter(c => c.acesso_id === this.state.activeAcessoId);
    this.setState({
      showMsgModal: true, editingMsgId: null, msgError: '', msgInvalid: [],
      msgForm: { ...EMPTY_MSG_FORM, tags: [], categoryId: categories[0]?.id ?? '' },
    });
  }
  openEditMsg(msg) {
    if (!canPublishContent(this.role())) {
      this.openMessageRequest('edicao', msg);
      return;
    }
    this.setState({
      showMsgModal: true, editingMsgId: msg.id, msgError: '', msgInvalid: [],
      msgForm: { categoryId: msg.categoria_id, title: msg.titulo, tagInput: '', tags: [...msg.tags], content: msg.conteudo },
    });
  }
  updateMsgForm(patch) {
    this.setState(s => ({ msgForm: { ...s.msgForm, ...patch }, msgError: '', msgInvalid: [] }));
  }
  addMsgTag() {
    const { tagInput, tags } = this.state.msgForm;
    this.updateMsgForm({ tags: normalizeTags([...tags, tagInput]), tagInput: '' });
  }
  closeMsgModal() {
    if (this.state.saving) return;
    this.setState({ showMsgModal: false, msgError: '', msgInvalid: [] });
  }
  async saveMsg() {
    if (this.state.saving || !canPublishContent(this.role())) return;
    const f = this.state.msgForm;
    const invalid = [!f.categoryId && 'categoryId', !f.title.trim() && 'title', !f.content.trim() && 'content'].filter(Boolean);
    if (invalid.length) {
      this.setState({
        msgInvalid: invalid,
        msgError: f.categoryId ? 'Preencha título e conteúdo.' : 'Este acesso ainda não tem categorias. Crie uma categoria antes de adicionar mensagens.',
      });
      this.focusFirstInvalid();
      return;
    }
    const editingId = this.state.editingMsgId;
    const accessId = this.state.activeAcessoId;
    this.setState({ saving: true, msgError: '', msgInvalid: [] });
    try {
      const saved = await api.saveMessage({
        id: editingId, accessId, categoryId: f.categoryId, title: f.title, tags: normalizeTags(f.tags), content: f.content,
      });
      this.setState({ saving: false, showMsgModal: false });
      await this.reloadLibrary(accessId);
      if (editingId) {
        this.showToast('Mensagem salva com sucesso!', 'success');
        return;
      }
      const copied = await Promise.resolve(navigator.clipboard?.writeText(saved.conteudo)).then(() => !!navigator.clipboard, () => false);
      if (copied) {
        this.setState({ copiedId: saved.id });
        setTimeout(() => this.setState({ copiedId: null }), 1400);
      }
      this.showToast(copied ? 'Mensagem criada e copiada!' : 'Mensagem criada.', 'success');
    } catch (error) {
      this.setState({ saving: false });
      await this.handleError(error, {
        setFormError: message => this.setState({ msgError: message }),
        closeDetail: editingId ? () => this.setState({ showMsgModal: false }) : null,
        retry: () => this.saveMsg(),
      });
    }
  }

  openMessageRequest(type, message = null) {
    const categories = this.state.categorias.filter(category =>
      category.acesso_id === this.state.activeAcessoId && !category.arquivado_em
    );
    if (type !== 'arquivamento' && categories.length === 0) {
      this.showToast('Este Acesso ainda não tem categorias disponíveis.', 'error');
      return;
    }

    this.setState({
      requestSaving: false,
      messageRequestModal: {
        open: true,
        type,
        messageId: message?.id ?? null,
        idempotencyKey: getOrCreateIdempotencyKey(),
        form: {
          categoryId: message?.categoria_id ?? categories[0]?.id ?? '',
          title: message?.titulo ?? '',
          tagsText: Array.isArray(message?.tags) ? message.tags.join(', ') : '',
          content: message?.conteudo ?? ''
        },
        previous: message ? {
          categoria_id: message.categoria_id,
          categoria: message.categoria,
          titulo: message.titulo,
          conteudo: message.conteudo,
          tags: [...message.tags]
        } : null,
        error: '',
        invalid: [],
      }
    });
  }
  updateMessageRequestForm(field, value) {
    this.setState(state => ({
      messageRequestModal: {
        ...state.messageRequestModal,
        error: '',
        invalid: [],
        form: { ...state.messageRequestModal.form, [field]: value }
      }
    }));
  }
  closeMessageRequest() {
    if (this.state.requestSaving) return;
    this.setState({ messageRequestModal: CLOSED_REQUEST_MODAL });
  }
  async submitMessageRequest() {
    if (this.state.requestSaving) return;
    const request = this.state.messageRequestModal;
    const form = request.form;
    const invalid = request.type === 'arquivamento'
      ? []
      : [!form.categoryId && 'categoryId', !form.title.trim() && 'title', !form.content.trim() && 'content'].filter(Boolean);
    if (invalid.length) {
      this.setState(state => ({
        messageRequestModal: { ...state.messageRequestModal, error: 'Preencha categoria, título e conteúdo.', invalid }
      }));
      this.focusFirstInvalid();
      return;
    }

    this.setState({ requestSaving: true });
    try {
      await api.submitMessageRequest({
        idempotencyKey: request.idempotencyKey,
        accessId: this.state.activeAcessoId,
        type: request.type,
        messageId: request.messageId,
        categoryId: form.categoryId || null,
        title: form.title.trim() || null,
        tags: normalizeTags(form.tagsText),
        content: form.content.trim() || null,
        previous: request.previous
      });
      this.setState({ requestSaving: false });
      this.closeMessageRequest();
      this.showToast('Proposta enviada para revisão', 'success');
    } catch (error) {
      this.setState({ requestSaving: false });
      await this.handleError(error, {
        setFormError: message => this.setState(state => ({
          messageRequestModal: { ...state.messageRequestModal, error: message }
        })),
        // A proposal about a message that no longer exists is moot; a new proposal keeps its text.
        closeDetail: request.type === 'criacao' ? null : () => this.closeMessageRequest(),
        refresh: () => this.reloadLibrary(),
        // The request may have been stored; retrying reuses the same idempotency key.
        messages: { NETWORK: 'Não foi possível confirmar o envio. Tente novamente.' },
      });
    }
  }

  /* archive and restore: the only removal path (FR-020) */

  requestArchiveMessage(msg) {
    if (!canPublishContent(this.role())) {
      this.openMessageRequest('arquivamento', msg);
      return;
    }
    this.requestConfirmation(
      'Arquivar mensagem',
      `Arquivar "${msg.titulo}"? Ela sai da biblioteca e pode ser restaurada depois em Administração › Arquivados, com favoritos e recentes preservados.`,
      () => this.performArchiveMessage(msg)
    );
  }
  async performArchiveMessage(msg) {
    try {
      await api.archiveMessage(msg.id);
      await this.reloadLibrary(msg.acesso_id);
      if (this.state.adminTab === 'arquivados') await this.loadArchivedContent();
      this.showToast('Mensagem arquivada.', 'success');
    } catch (error) {
      await this.handleError(error, { retry: () => this.performArchiveMessage(msg) });
    }
  }
  requestArchiveCategory(category) {
    this.requestConfirmation(
      `Arquivar categoria ${category.nome}`,
      `Arquivar a categoria "${category.nome}"? Ela pode ser restaurada depois em Administração › Arquivados.`,
      () => this.performArchiveCategory(category)
    );
  }
  async performArchiveCategory(category) {
    try {
      await api.archiveCategory(category.id);
      await this.reloadLibrary(category.acesso_id);
      if (this.state.adminTab === 'arquivados') await this.loadArchivedContent();
      this.showToast('Categoria arquivada.', 'success');
    } catch (error) {
      await this.handleError(error, { retry: () => this.performArchiveCategory(category) });
    }
  }
  async loadArchivedContent(accessId = this.state.activeAcessoId) {
    if (!accessId) return;
    this.setState({ archivedLoading: true });
    try {
      const archived = await api.listArchivedContent(accessId);
      if (accessId !== this.state.activeAcessoId) return;
      this.setState({
        archivedMessages: archived.messages,
        archivedCategories: archived.categories,
        archivedLoading: false
      });
    } catch (error) {
      this.setState({ archivedLoading: false });
      await this.handleError(error, { refresh: false });
    }
  }
  openArchivedAdmin() {
    this.setState({ adminTab: 'arquivados' });
    this.loadArchivedContent();
  }
  async restoreArchivedMessage(message) {
    try {
      await api.restoreMessage(message.id);
      await Promise.all([this.reloadLibrary(message.acesso_id), this.loadArchivedContent()]);
      this.showToast('Mensagem restaurada.', 'success');
    } catch (error) {
      await this.handleError(error, { retry: () => this.restoreArchivedMessage(message) });
    }
  }
  async restoreArchivedCategory(category) {
    try {
      await api.restoreCategory(category.id);
      await Promise.all([this.reloadLibrary(category.acesso_id), this.loadArchivedContent()]);
      this.showToast('Categoria restaurada.', 'success');
    } catch (error) {
      await this.handleError(error, { retry: () => this.restoreArchivedCategory(category) });
    }
  }

  /* request review */

  openReview(requestId) {
    this.setState({
      showSolicitacaoModal: true, viewingSolicitacaoId: requestId,
      solicitacaoRejectMode: false, rejectMotivo: '', reviewError: '', reviewInvalid: [],
    });
  }
  closeReview() {
    if (this.state.reviewSaving) return;
    this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false, reviewError: '', reviewInvalid: [] });
  }
  async handleReviewError(error, request) {
    const policy = await this.handleError(error, {
      setFormError: message => this.setState({ reviewError: message }),
      closeDetail: () => this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false }),
      refresh: () => Promise.all([this.reloadPendingRequests(), this.reloadLibrary(request.acesso_id)]),
      messages: { CONFLICT: 'A mensagem mudou desde a proposta. Recarregamos o estado atual; revise antes de decidir.' },
    });
    // CONFLICT on a request that left the pending list means someone else already decided it.
    if (policy.code === 'CONFLICT' && !this.state.solicitacoesPendentes.some(item => item.id === request.id)) {
      this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false, reviewError: '' });
      this.showToast('Esta solicitação já foi revisada. Recarregamos o estado atual.', 'error');
    }
  }
  async approveReviewedRequest() {
    if (this.state.reviewSaving) return;
    const request = this.state.solicitacoesPendentes.find(item => item.id === this.state.viewingSolicitacaoId);
    if (!request) return;
    this.setState({ reviewSaving: true, reviewError: '' });
    try {
      await api.approveMessageRequest(request.id);
      this.setState({ reviewSaving: false, showSolicitacaoModal: false });
      await Promise.all([this.reloadLibrary(request.acesso_id), this.reloadPendingRequests()]);
      this.showToast('Solicitação aprovada.', 'success');
    } catch (error) {
      this.setState({ reviewSaving: false });
      await this.handleReviewError(error, request);
    }
  }
  async rejectReviewedRequest() {
    if (this.state.reviewSaving) return;
    const request = this.state.solicitacoesPendentes.find(item => item.id === this.state.viewingSolicitacaoId);
    if (!request) return;
    const reason = this.state.rejectMotivo.trim();
    if (!reason || reason.length > 500) {
      this.setState({ reviewError: 'Informe um motivo de 1 a 500 caracteres.', reviewInvalid: ['reason'] });
      this.focusFirstInvalid();
      return;
    }
    this.setState({ reviewSaving: true, reviewError: '' });
    try {
      await api.rejectMessageRequest(request.id, reason);
      this.setState({ reviewSaving: false, showSolicitacaoModal: false, solicitacaoRejectMode: false, rejectMotivo: '' });
      await this.reloadPendingRequests();
      this.showToast('Solicitação rejeitada.', 'success');
    } catch (error) {
      this.setState({ reviewSaving: false });
      await this.handleReviewError(error, request);
    }
  }

  /* categories */

  openCreateCat() {
    this.setState({ showCatModal: true, editingCatId: null, catForm: { nome: '' }, categoryError: '', categoryInvalid: [] });
  }
  openEditCat(cat) {
    this.setState({ showCatModal: true, editingCatId: cat.id, catForm: { nome: cat.nome }, categoryError: '', categoryInvalid: [] });
  }
  closeCatModal() {
    if (this.state.saving) return;
    this.setState({ showCatModal: false, categoryError: '', categoryInvalid: [] });
  }
  async saveCat() {
    if (this.state.saving) return;
    const nome = this.state.catForm.nome.trim();
    if (!nome) {
      this.setState({ categoryError: 'Informe o nome da categoria.', categoryInvalid: ['name'] });
      this.focusFirstInvalid();
      return;
    }
    const editingId = this.state.editingCatId;
    const accessId = this.state.activeAcessoId;
    this.setState({ saving: true });
    try {
      await api.saveCategory({ id: editingId, accessId, name: nome });
      this.setState({ saving: false, showCatModal: false, categoryError: '' });
      await this.reloadLibrary(accessId);
      this.showToast('Categoria salva.', 'success');
    } catch (error) {
      this.setState({ saving: false });
      await this.handleError(error, {
        setFormError: message => this.setState({ categoryError: message }),
        closeDetail: editingId ? () => this.setState({ showCatModal: false }) : null,
        retry: () => this.saveCat(),
      });
    }
  }

  /* accesses and memberships */

  openCreateAccess() {
    this.setState({ showAcessoModal: true, acessoForm: { nome: '', descricao: '', cor: DEFAULT_ACCESS_COLOR }, accessError: '', accessInvalid: [] });
  }
  updateAccessForm(patch) {
    this.setState(s => ({ acessoForm: { ...s.acessoForm, ...patch }, accessError: '', accessInvalid: [] }));
  }
  closeAccessModal() {
    if (this.state.saving) return;
    this.setState({ showAcessoModal: false, accessError: '', accessInvalid: [] });
  }
  async saveAccess() {
    if (this.state.saving) return;
    const f = this.state.acessoForm;
    if (!f.nome.trim()) {
      this.setState({ accessError: 'Informe o nome do acesso.', accessInvalid: ['name'] });
      this.focusFirstInvalid();
      return;
    }
    this.setState({ saving: true });
    try {
      const created = await api.createAccess({ name: f.nome, description: f.descricao, color: f.cor });
      this.libraryCache.set(created.id, Promise.resolve({ categories: [], messages: [] }));
      try { localStorage.setItem('dp_active_acesso', created.id); } catch (e) {}
      this.setState(s => ({
        saving: false, showAcessoModal: false, accessError: '',
        acessos: [...s.acessos, created].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        activeAcessoId: created.id,
        categorias: [], mensagens: [], favoriteIds: [], recentIds: [], categoryFilter: null,
        adminTab: 'categorias',
      }));
      this.showToast('Acesso criado.', 'success');
    } catch (error) {
      this.setState({ saving: false });
      await this.handleError(error, { setFormError: message => this.setState({ accessError: message }) });
    }
  }
  async setAccessStatus(id, active) {
    try {
      const updated = await api.setAccessActive(id, active);
      this.setState(s => ({ acessos: s.acessos.map(access => access.id === id ? updated : access) }));
      this.libraryCache.delete(id);
      this.showToast(updated.ativo ? 'Acesso ativado.' : 'Acesso desativado.', 'success');
      // Deactivating the access on screen moves the library to the next usable one.
      const next = this.activeAccess();
      if (next && next.id !== this.state.activeAcessoId) await this.changeActiveAccess(next.id);
    } catch (error) {
      await this.handleError(error, { retry: () => this.setAccessStatus(id, active) });
    }
  }

  async openAccessUsers(accessId) {
    this.setState({ accessUsersModal: { ...CLOSED_ACCESS_USERS, open: true, accessId, loading: true } });
    await this.loadAccessUsers(accessId);
  }
  async loadAccessUsers(accessId) {
    const setModalError = message => this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, error: message } }));
    try {
      const [users, profiles] = await Promise.all([api.listAccessUsers(accessId), api.listProfiles()]);
      if (this.state.accessUsersModal.accessId !== accessId) return;
      this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, users, profiles, loading: false } }));
    } catch (error) {
      this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, loading: false } }));
      await this.handleError(error, { setFormError: setModalError, refresh: false });
    }
  }
  closeAccessUsers() {
    if (this.state.accessUsersModal.saving) return;
    this.setState({ accessUsersModal: CLOSED_ACCESS_USERS });
  }
  async addUserToAccess() {
    const modal = this.state.accessUsersModal;
    if (modal.saving) return;
    if (!modal.selectedId) {
      this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, error: 'Selecione uma conta para vincular.' } }));
      return;
    }
    await this.changeAccessMembership(modal.selectedId, modal.accessId, true, 'Conta vinculada a este acesso.');
  }
  requestUnlinkUser(user) {
    const accessId = this.state.accessUsersModal.accessId;
    this.requestConfirmation(
      'Remover vínculo',
      `Remover ${user.name} deste acesso? A conta deixará de ver as mensagens e categorias daqui.`,
      () => this.changeAccessMembership(user.userId, accessId, false, 'Conta removida deste acesso.')
    );
  }
  async changeAccessMembership(userId, accessId, linked, successMessage) {
    const sameLink = item => item.userId === userId && item.accessId === accessId;
    this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, saving: true, error: '' } }));
    try {
      await api.setAccessMembership(userId, accessId, linked);
      this.setState(s => ({
        accessUsersModal: { ...s.accessUsersModal, saving: false, selectedId: '' },
        adminMemberships: [...s.adminMemberships.filter(item => !sameLink(item)), ...(linked ? [{ userId, accessId }] : [])],
      }));
      await this.loadAccessUsers(accessId);
      this.showToast(successMessage, 'success');
    } catch (error) {
      this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, saving: false } }));
      await this.handleError(error, {
        setFormError: this.state.accessUsersModal.open
          ? message => this.setState(s => ({ accessUsersModal: { ...s.accessUsersModal, error: message } }))
          : null,
        refresh: () => this.loadAccessUsers(accessId),
      });
    }
  }

  /* accounts */

  requestResetPassword(user) {
    const name = user.name || user.nome;
    this.requestConfirmation('Redefinir senha', `Gerar uma nova senha temporária para ${name} (${user.email})? A senha atual deixará de funcionar.`, () => this.resetUserPassword(user.userId));
  }
  async resetUserPassword(userId) {
    try {
      const result = await api.adminResetPassword(userId);
      this.setState({ temporaryPassword: { open: true, value: result.temporaryPassword, copied: false } });
    } catch (error) {
      await this.handleError(error);
    }
  }

  openCreateAccount() {
    this.setState({
      showAccountModal: true,
      accountForm: { name: '', email: '', temporaryPassword: '', role: 'colaborador', accessIds: new Set() },
      accountError: '', accountInvalid: [],
    });
  }
  updateAccountForm(field, value) {
    this.setState(s => ({ accountForm: { ...s.accountForm, [field]: value }, accountError: '', accountInvalid: [] }));
  }
  setAccountAccess(accessId, checked) {
    this.setState(s => {
      const accessIds = new Set(s.accountForm.accessIds);
      if (checked) accessIds.add(accessId); else accessIds.delete(accessId);
      return { accountForm: { ...s.accountForm, accessIds }, accountError: '', accountInvalid: [] };
    });
  }
  closeAccountModal() {
    if (this.state.saving) return;
    this.setState({ showAccountModal: false, accountError: '', accountInvalid: [] });
  }
  async createAccount() {
    if (this.state.saving) return;
    const form = this.state.accountForm;
    const invalid = [
      !form.name.trim() && 'name',
      !form.email.trim() && 'email',
      form.temporaryPassword.length < 8 && 'temporaryPassword',
    ].filter(Boolean);
    if (invalid.length) {
      this.setState({ accountError: 'Informe nome, e-mail e uma senha temporária com ao menos 8 caracteres.', accountInvalid: invalid });
      this.focusFirstInvalid();
      return;
    }
    this.setState({ saving: true, accountError: '' });
    try {
      const accessIds = [...form.accessIds];
      const { userId } = await api.adminCreateUser({
        name: form.name.trim(), email: form.email.trim(), temporaryPassword: form.temporaryPassword,
        accessIds, role: form.role,
      });
      const createdProfile = { id: userId, nome: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, ativo: true };
      this.setState(s => ({
        saving: false,
        showAccountModal: false,
        adminProfiles: [...s.adminProfiles, createdProfile].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        adminMemberships: [...s.adminMemberships, ...accessIds.map(accessId => ({ userId, accessId }))],
        temporaryPassword: { open: true, value: form.temporaryPassword, copied: false },
        accountForm: { name: '', email: '', temporaryPassword: '', role: 'colaborador', accessIds: new Set() },
      }));
      this.showToast('Conta criada.', 'success');
    } catch (error) {
      this.setState({ saving: false });
      await this.handleError(error, { setFormError: message => this.setState({ accountError: message }) });
    }
  }

  openMembershipModal(userId) {
    const linked = this.state.adminMemberships.filter(item => item.userId === userId).map(item => item.accessId);
    this.setState({ showMembershipModal: true, membershipUserId: userId, membershipDraft: new Set(linked), membershipError: '' });
  }
  setMembershipDraft(accessId, checked) {
    this.setState(s => {
      const membershipDraft = new Set(s.membershipDraft);
      if (checked) membershipDraft.add(accessId); else membershipDraft.delete(accessId);
      return { membershipDraft, membershipError: '' };
    });
  }
  closeMembershipModal() {
    if (this.state.saving) return;
    this.setState({ showMembershipModal: false, membershipError: '' });
  }
  async saveMemberships() {
    if (this.state.saving) return;
    const userId = this.state.membershipUserId;
    const previous = new Set(this.state.adminMemberships.filter(item => item.userId === userId).map(item => item.accessId));
    const next = new Set(this.state.membershipDraft);
    const changed = this.state.acessos.filter(access => previous.has(access.id) !== next.has(access.id));
    this.setState({ saving: true, membershipError: '' });
    try {
      await Promise.all(changed.map(access => api.setAccessMembership(userId, access.id, next.has(access.id))));
      this.setState(s => ({
        saving: false,
        showMembershipModal: false,
        adminMemberships: [
          ...s.adminMemberships.filter(item => item.userId !== userId),
          ...[...next].map(accessId => ({ userId, accessId })),
        ],
      }));
      this.showToast('Liberações atualizadas.', 'success');
    } catch (error) {
      this.setState({ saving: false });
      await this.handleError(error, {
        setFormError: message => this.setState({ membershipError: `${message} Reabra a conta para conferir o estado atual.` }),
        refresh: false,
      });
      // Some changes may have been applied before the failure.
      await this.loadStructuralAdmin();
    }
  }

  async copyTemporaryPassword() {
    const value = this.state.temporaryPassword.value;
    try {
      await navigator.clipboard.writeText(value);
      this.setState(s => ({ temporaryPassword: { ...s.temporaryPassword, copied: true } }));
    } catch {
      this.showToast('Não foi possível copiar. Selecione a senha e copie manualmente.', 'error');
    }
  }
  closeTemporaryPassword() {
    this.setState({ temporaryPassword: { open: false, value: '', copied: false } });
  }

  /* ---------------- view (template — identical to prototype) ---------------- */

  view(v) {
    if (v.isLoading) {
      const skel = (w, h, extra) => `<div class="dp-skeleton" style="width:${w}; height:${h}; border-radius:8px; ${extra || ''}"></div>`;
      return `
      <div style="min-height:100vh; background:${v.theme.pageBg};">
        <div style="padding:14px 24px; border-bottom:1px solid ${v.theme.border}; background:${v.theme.cardBg};">
          <div style="max-width:1400px; margin:0 auto; display:flex; align-items:center; gap:20px;">
            <img src="${v.theme.logoSrc}" alt="DentalPlus" style="height:26px; width:auto; opacity:.5;" />
            ${skel('1px', '26px')}
            ${skel('220px', '18px')}
            ${skel('320px', '38px', 'margin-left:auto; border-radius:12px;')}
          </div>
        </div>
        <div style="max-width:1400px; margin:0 auto; padding:24px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:28px;">
            ${skel('100%', '96px', 'border-radius:14px;')}${skel('100%', '96px', 'border-radius:14px;')}${skel('100%', '96px', 'border-radius:14px;')}
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px;">
            ${Array.from({ length: 8 }).map(() => skel('100%', '170px', 'border-radius:14px;')).join('')}
          </div>
        </div>
      </div>`;
    }
    if (v.isNoAcesso) {
      return `<div class="dp-app">${renderNoAccessView(v, (fn) => this.h(fn))
        + this.viewModals(v, v.theme, (fn) => this.h(fn))}</div>`;
    }
    const t = v.theme;
    const H = (fn) => this.h(fn);
    let body = '';

    if (v.isLogin) {
      body += renderLoginView(v, H);
    }

    if (v.isApp) {
      body += renderBrandBand(v, H);
      if (v.isLib) body += renderCategoryPills(v, H);
      if (v.isLib) body += this.viewLibrary(v, H);
      if (v.isOver) body += this.viewVisaoGeral(v, H);
      if (v.isAdminView) body += this.viewAdmin(v, t, H);
      body += renderLibraryReadingDialog(v, H);
    }

    body += this.viewModals(v, t, H);
    body += renderReleaseNotesDialog(v.releaseNotes, H);

    return `<div class="dp-app">${body}</div>`;
  }

  viewLibrary(v, H) {
    return renderLibraryView(v, H);
  }

  viewVisaoGeral(v, H) {
    return renderLibraryOverview(v, H);
  }

  viewAdmin(v, t, H) {
    return renderAdminView(v, t, H);
  }

  viewModals(v, t, H) {
    let out = renderMessageRequestModal(v.messageRequestModal, t, H);
    out += renderMessageEditorModal(v.messageEditor, t, H);
    out += renderAdminConfirmationModal(v.confirmModal, t, H);
    out += renderRequestReviewModal(v.reviewModal, t, H);
    out += renderStructuralModals(v.structuralModals, t, H);
    const stay = H(() => {});

    if (v.showApprovalPopup) {
      const count = v.approvalPopupCount;
      out += renderDialog({
        role: 'alertdialog', name: 'Solicitações pendentes', size: 'sm', register: H,
        onClose: v.dismissApprovalPopup, backdropCloses: false,
        body: `<p class="dp-dialog__text">Há ${count} solicitaç${count === 1 ? 'ão' : 'ões'} de mensagem aguardando sua aprovação.</p>`,
        actions: `<button type="button" class="dp-btn-secondary" data-click="${H(v.dismissApprovalPopup)}">Dispensar</button>`
          + `<button type="button" class="dp-btn-primary" data-click="${H(v.goApprovals)}">Ver solicitações</button>`,
      });
    }

    // Tela 04: categoria e usos no cabeçalho, título como nome acessível e "Copiar mensagem".
    if (v.showPreviewModal && v.previewingMsg) {
      const m = v.previewingMsg;
      out += renderDialog({
        name: m.titulo, kicker: `${m.categoria} · ${m.usageLabel}`, size: 'lg', register: H, layer: 100,
        onClose: v.closePreview,
        body: `<div class="dp-reading__text">${esc(m.conteudo)}</div>`,
        actions: `<button type="button" class="dp-btn-secondary" data-click="${H(v.closePreview)}">Fechar</button>`
          + `<button type="button" class="dp-btn-accent" data-click="${H(m.onCopy)}">${m.copied ? ICONS.check : ICONS.clipboard}${m.copied ? 'Copiada' : 'Copiar mensagem'}</button>`,
      });
    }

    if (v.paletteOpen) {
      out += `
      <div class="dp-backdrop dp-backdrop--top" role="presentation" data-click="${H(v.closePalette)}">
        <div class="dp-dialog dp-palette" role="dialog" aria-modal="true" aria-label="Busca rápida" data-click="${stay}">
          <div class="dp-palette__search">
            ${ICONS.search}
            <input data-ref="${H(v.paletteInputRef)}" data-focus="palette" value="${esc(v.paletteQuery)}" data-input="${H(v.onPaletteQueryChange)}" aria-label="Buscar e copiar" placeholder="Digite para buscar e Enter para copiar…" />
            <kbd class="dp-kbd">Esc</kbd>
          </div>
          <div class="dp-palette__rows">
            ${v.paletteRows.map(r => `
              <div class="dp-palette__row" role="button" tabindex="0" data-click="${H(r.onPick)}"${r.active ? ' aria-current="true"' : ''}>
                <span style="flex:1; min-width:0;">
                  <span class="dp-list-item__title" style="font-size:14px;">${esc(r.titulo)}</span>
                  <span class="dp-list-item__meta">${esc(r.categoria)}</span>
                </span>
                <span class="dp-palette__hint">↵ copiar</span>
              </div>`).join('')}
            ${v.paletteEmpty ? `<div class="dp-empty">Nada encontrado para "${esc(v.paletteQuery)}".</div>` : ''}
          </div>
          <div class="dp-palette__footer">
            <span><kbd class="dp-kbd">↑↓</kbd> navegar</span>
            <span><kbd class="dp-kbd">↵</kbd> copiar</span>
            <span><kbd class="dp-kbd">Esc</kbd> fechar</span>
          </div>
        </div>
      </div>`;
    }

    if (v.toasts.length) {
      out += `
      <div class="dp-toasts">
        ${v.toasts.map(toast => `
        <div class="dp-toast${toast.type === 'error' ? ' dp-toast--error' : ''}" data-key="toast-${esc(toast.id)}" role="status" aria-live="polite">
          <span class="dp-toast__icon">${toast.type === 'error' ? ICONS.close : ICONS.check}</span>
          <div style="flex:1; min-width:0;">
            <div class="dp-toast__title">${esc(toast.msg)}</div>
            ${toast.body ? `<div class="dp-toast__body">${esc(toast.body)}</div>` : ''}
            ${toast.action ? `<button class="dp-toast__action" data-click="${H(() => { toast.action.onClick(); this.dismissToast(toast.id); })}">${esc(toast.action.label)}</button>` : ''}
          </div>
          <button class="dp-toast__close" data-click="${H(() => this.dismissToast(toast.id))}" aria-label="Fechar" title="Fechar">${ICONS.close}</button>
          <span class="dp-toast__progress" style="animation-duration:${toast.duration}ms;"></span>
        </div>`).join('')}
      </div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
