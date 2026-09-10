// app.js
import * as api from './api.js';
import { normalize, matchesSearch, titleSegments as titleSegmentsPure, pickActiveAcesso } from './search-utils.mjs';
import { normalizeTags, paginateLibraryMessages, selectLibraryMessages } from './domain/library.mjs';
import { canPublishContent, canUseAccess, canViewAdministration } from './domain/permissions.mjs';
import { getOrCreateIdempotencyKey, isArchiveRequest, requestTypeLabel } from './domain/requests.mjs';
import { resolveErrorPolicy } from './domain/error-policy.mjs';
import { copyExactText } from './ui/clipboard.mjs';
import { morphChildren } from './ui/dom-morph.mjs';
import { activateDialogFocus } from './ui/focus.mjs';
import { renderLibraryOverview, renderLibraryView, renderNoAccessView } from './views/library-view.mjs';
import { renderAdminConfirmationModal, renderMessageEditorModal, renderMessageRequestModal, renderRequestReviewModal, renderStructuralModals } from './views/modal-view.mjs';
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
      darkMode: false,
      sidebarCollapsed: false,
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
      showAcessoModal: false, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' }, accessError: '', accessInvalid: [],
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
      const dm = localStorage.getItem('dp_darkmode'); if (dm) this.state.darkMode = dm === '1';
      const sc = localStorage.getItem('dp_sidebar_collapsed'); if (sc) this.state.sidebarCollapsed = sc === '1';
      const activeAccess = localStorage.getItem('dp_active_acesso'); if (activeAccess) this.state.activeAcessoId = activeAccess;
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
        const { darkMode, density, sidebarCollapsed } = this.state;
        this.setState({
          ...this.initialState(), darkMode, density, sidebarCollapsed, loading: false,
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
        if (st.showPreviewModal) this.setState({ showPreviewModal: false });
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
  titleSegments(titulo, query) {
    return titleSegmentsPure(titulo, query, `background:${this.theme().cyan}33; border-radius:3px; padding:0 2px;`);
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

  theme() {
    const dark = this.state.darkMode;
    return {
      // Legacy aliases kept so every existing call site keeps working —
      // only the underlying values change for the redesign.
      navy: dark ? '#2B62D6' : '#16336E', cyan: dark ? '#4CC3FF' : '#09679F',
      pageBg: dark ? '#0B1428' : '#EEF2F9',
      cardBg: dark ? '#141F3D' : '#FFFFFF',
      modalSolidBg: dark ? '#1A2748' : '#FFFFFF',
      chipBg: dark ? '#141F3D' : '#F1F5FB',
      chipBgHover: dark ? '#1E2C52' : '#e4ebf6',
      logoSrc: dark ? 'assets/dentalplus-logo-dark.png' : 'assets/dentalplus-logo.png',
      inputBg: dark ? '#141F3D' : '#F1F5FB',
      text: dark ? '#DCE4F5' : '#111F3F',
      textSecondary: dark ? '#A3B3D4' : '#54678C',
      textTertiary: dark ? '#9AAACC' : '#586A8D',
      border: dark ? '#243456' : '#DDE6F2',
      border2: dark ? '#2C3F6B' : '#CBD9EA',
      radiusSm: '12px',
      radiusMd: '14px',
      radiusLg: '18px',
      radiusXl: '22px',
      shadowSm: dark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(17,31,63,0.04)',
      shadowMd: dark ? '0 1px 2px rgba(0,0,0,.3), 0 14px 36px -18px rgba(0,0,0,.6)' : '0 1px 2px rgba(17,31,63,.04), 0 12px 32px -16px rgba(17,31,63,.18)',
      shadowLg: dark ? '0 14px 36px -18px rgba(0,0,0,0.6)' : '0 12px 32px -16px rgba(17,31,63,0.18)',
      glassEffect: 'backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);',

      // New tokens for the redesign.
      panel: dark ? 'rgba(20,31,61,0.75)' : 'rgba(255,255,255,0.75)',
      accent: dark ? '#4CC3FF' : '#09679F',
      accentSoft: dark ? 'rgba(76,195,255,0.13)' : 'rgba(14,147,216,0.11)',
      brand: dark ? '#2B62D6' : '#16336E',
      brand2: dark ? '#3A74EA' : '#1E4290',
      brandGradient: dark ? 'linear-gradient(135deg,#3A74EA,#39B5F5)' : 'linear-gradient(135deg,#1E4290,#0E93D8)',
      glow: dark ? '0 8px 26px -8px rgba(57,181,245,0.22)' : '0 8px 24px -8px rgba(14,147,216,0.45)',
      ok: dark ? '#34D399' : '#0E9F6E',
      okSoft: dark ? 'rgba(52,211,153,0.13)' : 'rgba(16,185,129,0.13)',
      danger: dark ? '#FF7B7B' : '#B82D2D',
      dangerSoft: dark ? 'rgba(255,123,123,0.13)' : 'rgba(214,69,69,0.11)',
      toastBg: dark ? '#E9EFFB' : '#111F3F',
      toastInk: dark ? '#111F3F' : '#F2F7FD',
      fontDisplay: "'Sora', 'Nunito', sans-serif",
      fontBody: "'Manrope', sans-serif"
    };
  }

  categoryColor(nome) {
    const palette = ['#1BA7DC', '#4F46E5', '#D97706', '#16A34A', '#DB2777', '#7C3AED'];
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
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
    const toast = { id, msg, type: type || 'success', body: body || '', action: action || null, duration: ms, bg: type === 'error' ? t.danger : t.toastBg, ink: type === 'error' ? '#fff' : t.toastInk };
    const MAX_VISIBLE = 4;
    this.setState(s => ({ toasts: [...s.toasts.filter(item => item.msg !== toast.msg), toast].slice(-MAX_VISIBLE) }));
    setTimeout(() => this.setState(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), ms);
  }
  dismissToast(id) {
    this.setState(s => ({ toasts: s.toasts.filter(x => x.id !== id) }));
  }

  /* ---------------- computed bindings ---------------- */

  roleLabel(role) { return canViewAdministration(role) ? 'Superadministrador' : 'Colaborador'; }

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
        onLoginEmailChange: (e) => this.setState({ loginEmail: e.target.value }),
        onLoginPasswordChange: (e) => this.setState({ loginPassword: e.target.value }),
        onToggleLoginPassword: () => this.setState({ showLoginPassword: !st.showLoginPassword }),
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
    const toggleExpand = (id) => {
      const next = new Set(st.expandedCardIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      this.setState({ expandedCardIds: next });
    };

    const maxFrequencia = Math.max(1, ...acessoMsgs.map(m => m.frequencia));
    const buildCard = (m) => {
      const isFav = st.favoriteIds.includes(m.id);
      const isLong = m.conteudo.length > 130 || (m.conteudo.match(/\n/g) || []).length >= 3;
      const isExpanded = st.expandedCardIds.has(m.id);
      const name = categoryName(m);
      return {
        id: m.id, categoria: name, titleText: m.titulo,
        catColor: this.categoryColor(name),
        catIcon: this.categoryIcon(name),
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        displayContent: m.conteudo,
        isLong, isExpanded, onToggleExpand: () => toggleExpand(m.id),
        heatWidth: Math.round(100 * m.frequencia / maxFrequencia),
        tagChips: m.tags.map(tag => ({ label: tag, onClick: () => this.setState({ searchQuery: tag, searchQueryDraft: tag }) })),
        frequencia: m.frequencia,
        isFav, favColor: isFav ? '#F5A623' : theme.textTertiary,
        onToggleFav: () => toggleFav(m.id),
        onCardClick: () => copyMessage(m),
        onCardKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyMessage(m); } },
        onCopy: () => copyMessage(m), copied: st.copiedId === m.id, copyLabel: st.copiedId === m.id ? 'Copiado' : 'Copiar',
        copyBtnBg: st.copiedId === m.id ? theme.ok : theme.brand,
        onPreview: () => openPreview(m),
        onEdit: () => this.openEditMsg(m),
        onArchive: () => this.requestArchiveMessage(m),
        editLabel: canPublish ? 'Editar' : 'Sugerir edição',
        archiveLabel: canPublish ? 'Arquivar' : 'Solicitar arquivamento',
        borderColor: theme.border
      };
    };

    const sortBy = st.librarySort === 'az' ? 'alfabetica' : st.librarySort === 'used' ? 'frequencia' : 'relevancia';
    const filtered = selectLibraryMessages(acessoMsgs, {
      query: st.searchQuery,
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

    const acessoMsgsInCategory = acessoMsgs.filter(m => !st.categoryFilter || m.categoria_id === st.categoryFilter);
    const miniRowData = (m) => ({
      titulo: m.titulo, categoria: categoryName(m),
      onCopy: () => copyMessage(m), copied: st.copiedId === m.id,
    });
    const recentList = st.recentIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);
    const favList = st.favoriteIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      count: acessoMsgs.filter(m => m.categoria_id === c.id).length,
      icon: this.categoryIcon(c.nome), color: this.categoryColor(c.nome),
      active: st.categoryFilter === c.id,
      onClick: () => this.setState({ categoryFilter: st.categoryFilter === c.id ? null : c.id, appView: 'biblioteca' })
    }));

    const density = st.density;
    const cardGap = density === 'compact' ? 12 : 16;
    const gridStyle = `column-width:${density === 'compact' ? 260 : 300}px; column-gap:${cardGap}px;`;
    const cardPadding = density === 'compact' ? '14px' : '18px';

    const hour = new Date().getHours();
    const firstName = (profile.nome || '').split(' ')[0] || '';
    const heroGreeting = (hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite') + (firstName ? `, ${firstName}!` : '!');

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
        this.setState({ searchQueryDraft: val, libraryVisibleLimit: 30 });
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => this.setState({ searchQuery: val }), 100);
      },
      onSearchFocus: () => this.setState({ searchFocused: true }),
      onSearchBlur: () => this.setState({ searchFocused: false }),
      shortcutLabel: /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K',

      searchDropdownResults: (() => {
        const query = st.searchQuery.trim();
        if (!query) return [];
        return acessoMsgs.filter(m => this.matchesSearch(m, query))
          .sort((a, b) => b.frequencia - a.frequencia)
          .slice(0, 6)
          .map(m => ({
            id: m.id, titulo: m.titulo, categoria: categoryName(m),
            snippet: m.conteudo.length > 70 ? m.conteudo.slice(0, 70) + '…' : m.conteudo,
            onPick: (e) => { e.preventDefault(); this.copyMessage(m); this.setState({ searchFocused: false }); if (this.searchEl) this.searchEl.blur(); }
          }));
      })(),
      showSearchDropdown: st.searchFocused && st.searchQuery.trim().length > 0,

      darkModeIcon: App.icons(theme)[st.darkMode ? 'sun' : 'moon'],
      toggleDarkMode: () => { const val = !st.darkMode; this.setState({ darkMode: val }); try { localStorage.setItem('dp_darkmode', val ? '1' : '0'); } catch (e) {} },

      sidebarCollapsed: st.sidebarCollapsed,
      toggleSidebarCollapsed: () => { const val = !st.sidebarCollapsed; this.setState({ sidebarCollapsed: val }); try { localStorage.setItem('dp_sidebar_collapsed', val ? '1' : '0'); } catch (e) {} },

      chipAllActive: !st.categoryFilter, chipAllCount: acessoMsgs.length,
      setCategoryAll: () => this.setState({ categoryFilter: null, libraryVisibleLimit: 30 }),
      categoriaChips,
      categoryFilter: st.categoryFilter || '',
      categoryOptions: acessoCats,
      onCategoryFilterChange: (e) => this.setState({ categoryFilter: e.target.value || null, libraryVisibleLimit: 30 }),

      heroGreeting,
      recentList, hasRecent: recentList.length > 0,
      favList, hasFav: favList.length > 0,

      resultsCountLabel: filtered.length === 1 ? '1 mensagem encontrada' : `${filtered.length} mensagens encontradas`,
      hasResults: filtered.length > 0,
      libraryIsTrulyEmpty: acessoMsgs.length === 0 && !st.searchQuery.trim() && !st.categoryFilter,
      gridStyle, cardPadding, cardGap,
      cardList: libraryPage.items.map(buildCard),
      hasMoreMessages: libraryPage.hasMore,
      loadMoreLabel: `Carregar mais (${libraryPage.total - libraryPage.items.length} restantes)`,
      onLoadMore: () => this.setState({ libraryVisibleLimit: libraryPage.nextLimit }),

      librarySort: st.librarySort,
      onLibrarySortChange: (e) => this.setState({ librarySort: e.target.value, libraryVisibleLimit: 30 }),

      showPreviewModal: st.showPreviewModal,
      closePreview: () => this.setState({ showPreviewModal: false }),
      previewingMsg: previewing ? {
        titulo: previewing.titulo, categoria: categoryName(previewing),
        catColor: this.categoryColor(categoryName(previewing)), catIcon: this.categoryIcon(categoryName(previewing)),
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
      createMessageLabel: canPublish ? 'Nova mensagem' : 'Sugerir mensagem',

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
    this.setState({ showAcessoModal: true, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' }, accessError: '', accessInvalid: [] });
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
      return renderNoAccessView(v, v.theme, (fn) => this.h(fn))
        + this.viewModals(v, v.theme, (fn) => this.h(fn));
    }
    const t = v.theme;
    const H = (fn) => this.h(fn);
    let body = '';

    if (v.isLogin) {
      body += `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${t.pageBg}; padding:24px; position:relative; overflow:hidden;">
        <div style="position:absolute; width:520px; height:520px; border-radius:50%; background:${t.accentSoft}; filter:blur(80px); top:-160px; right:-120px;"></div>
        <div style="position:absolute; width:420px; height:420px; border-radius:50%; background:${t.accentSoft}; filter:blur(90px); bottom:-140px; left:-100px;"></div>
        <div style="position:relative; width:100%; max-width:420px; background:${t.panel}; ${t.glassEffect} border:1px solid ${t.border}; border-radius:${t.radiusXl}; padding:40px 36px; box-shadow:${t.shadowMd};">
          <div style="display:flex; justify-content:center; margin-bottom:24px;">
            <img src="${t.logoSrc}" alt="DentalPlus" width="309" height="52" style="height:48px; width:auto;" />
          </div>
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:19px; font-weight:800; color:${t.text}; font-family:${t.fontDisplay};">Padrões de atendimento</div>
            <div style="font-size:14px; color:${t.textSecondary}; margin-top:4px;">Acesse com sua conta para continuar</div>
          </div>
          ${v.loginError ? `<div role="alert" aria-live="assertive" style="background:${t.dangerSoft}; color:${t.danger}; font-size:13px; font-weight:600; padding:10px 14px; border-radius:${t.radiusSm}; margin-bottom:16px;">${esc(v.loginError)}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label for="login-email" style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">E-mail</label>
              <input id="login-email" name="email" type="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" ${v.loggingIn ? 'disabled' : ''} data-focus="loginEmail" placeholder="seuemail@empresa.com" value="${esc(v.loginEmail)}" data-input="${H(v.onLoginEmailChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <div>
              <label for="login-password" style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Senha</label>
              <div style="position:relative;">
                <input id="login-password" name="password" autocomplete="current-password" type="${v.showLoginPassword ? 'text' : 'password'}" ${v.loggingIn ? 'disabled' : ''} data-focus="loginPassword" placeholder="••••••••" value="${esc(v.loginPassword)}" data-input="${H(v.onLoginPasswordChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 44px 12px 14px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
                <button type="button" data-click="${H(v.onToggleLoginPassword)}" tabindex="-1" aria-label="${v.showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}" title="${v.showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); border:none; background:transparent; color:${t.textSecondary}; cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; border-radius:6px;">${v.showLoginPassword ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`}</button>
              </div>
            </div>
            <button data-click="${H(v.handleLogin)}" ${v.loggingIn ? 'disabled' : ''} style="margin-top:8px; padding:13px; border-radius:${t.radiusSm}; border:none; background:${t.brandGradient}; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:${t.glow}; opacity:${v.loggingIn ? '0.75' : '1'};">${esc(v.loginBtnLabel)}</button>
          </div>
        </div>
      </div>`;
    }

    if (v.isApp) {
      const sidebarW = v.sidebarCollapsed ? '72px' : '262px';
      body += `<div style="display:grid; grid-template-columns:${sidebarW} 1fr; min-height:100vh; align-items:start; transition:grid-template-columns .15s cubic-bezier(0.4,0,0.2,1);" class="dp-app-shell">`
        + this.viewSidebar(v, t, H)
        + `<div style="min-width:0;">` + this.viewTopHeader(v, t, H);
      if (v.isLib) body += this.viewLibrary(v, t, H);
      if (v.isOver) body += this.viewVisaoGeral(v, t, H);
      if (v.isAdminView) body += this.viewAdmin(v, t, H);
      body += `</div></div>`;
    }

    body += this.viewModals(v, t, H);

    return `<div style="min-height:100vh; background:${t.pageBg}; color:${t.text}; font-family:${t.fontBody}; transition:background .2s,color .2s;">${body}</div>`;
  }

  viewSidebar(v, t, H) {
    const c = v.sidebarCollapsed;
    const tip = (label) => c ? `<span class="dp-tooltip">${esc(label)}</span>` : '';
    const navIcon = (path) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${path}</svg>`;
    const navItem = (icon, label, active, onClick, badge) => `
      <div role="button" tabindex="0" data-click="${H(onClick)}" aria-label="${esc(label)}" class="${c ? 'dp-tooltip-target' : ''}" style="position:relative; display:flex; align-items:center; gap:10px; width:100%; border-radius:${t.radiusSm}; padding:${c ? '10px' : '10px 12px'}; justify-content:${c ? 'center' : 'flex-start'}; font-size:13.5px; font-weight:800; cursor:pointer; transition:background .15s cubic-bezier(0.4,0,0.2,1); background:${active ? t.accentSoft : 'transparent'}; color:${active ? t.accent : t.textSecondary}; margin-bottom:2px;">
        ${c ? '' : `<span style="width:3px; height:16px; border-radius:3px; background:${active ? t.accent : 'transparent'}; flex-shrink:0;"></span>`}${icon}${c ? '' : esc(label)}
        ${badge ? `<span style="${c ? 'position:absolute; top:2px; right:2px;' : 'margin-left:auto;'} background:${t.danger}; color:#fff; font-size:10px; font-weight:800; border-radius:999px; padding:2px 8px;">${badge}</span>` : ''}
        ${tip(label)}
      </div>`;
    const catRow = (dot, label, count, active, onClick) => `
      <div role="button" tabindex="0" data-click="${H(onClick)}" aria-label="${esc(label)}" class="${c ? 'dp-tooltip-target' : ''}" style="position:relative; display:flex; align-items:center; gap:10px; width:100%; border-radius:${t.radiusSm}; padding:${c ? '8px' : '8px 12px'}; justify-content:${c ? 'center' : 'flex-start'}; font-size:13px; font-weight:700; cursor:pointer; background:${active ? t.inputBg : 'transparent'}; color:${active ? t.text : t.textSecondary}; box-shadow:${active ? `inset 0 0 0 1px ${t.border2}` : 'none'}; margin-bottom:2px;">
        <span style="width:8px; height:8px; border-radius:50%; background:${dot}; flex-shrink:0;"></span>${c ? '' : `${esc(label)}<span style="margin-left:auto; font-size:11px; font-weight:700; color:${t.textTertiary};">${count}</span>`}
        ${tip(label)}
      </div>`;

    return `
    <aside class="dp-sidebar" style="position:sticky; top:0; height:100vh; width:${c ? '72px' : '262px'}; display:flex; flex-direction:column; gap:2px; background:${t.cardBg}; border-right:1px solid ${t.border}; padding:20px 14px 16px; overflow:auto; transition:width .15s cubic-bezier(0.4,0,0.2,1), padding .15s cubic-bezier(0.4,0,0.2,1);">
      <div role="button" tabindex="0" data-click="${H(v.goBiblioteca)}" aria-label="DentalPlus" class="${c ? 'dp-tooltip-target' : ''}" style="position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; padding:2px 8px 18px; cursor:pointer; text-align:center;">
        ${c
          ? `<img src="assets/favicon.png" alt="DentalPlus" width="32" height="32" style="height:32px; width:32px; border-radius:9px;" />`
          : `<img src="${t.logoSrc}" alt="DentalPlus" width="160" height="26" style="height:24px; width:auto;" /><span style="font-size:11px; color:${t.textTertiary}; font-weight:700;">Padrões de atendimento</span>`}
        ${tip('DentalPlus')}
      </div>
      ${navItem(navIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'), 'Biblioteca', v.isLib, v.goBiblioteca)}
      ${navItem(navIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'), 'Visão geral', v.isOver, v.goVisaoGeral)}
      ${v.isAdminNow ? navItem(navIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), 'Administração', v.isAdminView, v.goAdmin, v.isSuperAdmin && v.solicitacoesCount > 0 ? v.solicitacoesCount : null) : ''}
      ${c ? '' : `<div style="font-size:10.5px; font-weight:800; letter-spacing:1.4px; color:${t.textTertiary}; padding:18px 10px 8px;">CATEGORIAS</div>`}
      ${catRow(t.textTertiary, 'Todas', v.chipAllCount, v.chipAllActive, v.setCategoryAll)}
      ${v.categoriaChips.map(chip => catRow(chip.color, chip.nome, chip.count, chip.active, chip.onClick)).join('')}
      <div style="flex:1;"></div>
      <div style="border-top:1px solid ${t.border}; padding-top:14px; display:flex; flex-direction:column; gap:10px;">
        <button class="dp-sidebar-collapse-btn${c ? ' dp-tooltip-target' : ''}" data-click="${H(v.toggleSidebarCollapsed)}" aria-label="${c ? 'Expandir menu' : 'Recolher menu'}" style="position:relative; display:flex; align-items:center; gap:10px; justify-content:${c ? 'center' : 'flex-start'}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.textSecondary}; border-radius:${t.radiusSm}; padding:9px 12px; font-size:13px; font-weight:700; cursor:pointer;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; transform:rotate(${c ? '180deg' : '0deg'}); transition:transform .15s cubic-bezier(0.4,0,0.2,1);"><path d="M15 18l-6-6 6-6"/></svg>${c ? '' : 'Recolher menu'}
          ${tip('Expandir menu')}
        </button>
        <button class="${c ? 'dp-tooltip-target' : ''}" data-click="${H(v.toggleDarkMode)}" aria-label="Alternar tema" style="position:relative; display:flex; align-items:center; gap:10px; justify-content:${c ? 'center' : 'flex-start'}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.textSecondary}; border-radius:${t.radiusSm}; padding:9px 12px; font-size:13px; font-weight:700; cursor:pointer;">${v.darkModeIcon}${c ? '' : ' Alternar tema'}${tip('Alternar tema')}</button>
        <div style="display:flex; align-items:center; gap:10px; padding:${c ? '10px 4px 0' : '12px 4px 0'}; margin-top:2px; border-top:1px solid ${t.border}; flex-direction:${c ? 'column' : 'row'}; justify-content:${c ? 'center' : 'flex-start'};">
          <div aria-label="${c ? esc(v.currentUser.nome) : ''}" class="${c ? 'dp-tooltip-target' : ''}" style="position:relative; width:32px; height:32px; border-radius:${t.radiusSm}; background:${t.brandGradient}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; flex-shrink:0;">${esc(v.currentUser.iniciais)}${tip(v.currentUser.nome)}</div>
          ${c ? '' : `
          <div style="flex:1; min-width:0; line-height:1.15;">
            <div style="font-size:13px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(v.currentUser.nome)}</div>
            <div style="font-size:11px; color:${t.textTertiary};">${esc(v.currentUser.perfilLabel)}</div>
          </div>`}
          <button data-click="${H(v.logout)}" title="Sair" style="border:0; background:transparent; color:${t.textTertiary}; cursor:pointer; padding:6px; border-radius:${t.radiusSm}; display:flex;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </div>
    </aside>`;
  }

  viewTopHeader(v, t, H) {
    const showLibraryTools = v.isLib || v.isOver;
    return `
    <header class="dp-top-header" style="position:sticky; top:0; z-index:40; background:${t.panel}; ${t.glassEffect} border-bottom:1px solid ${t.border}; padding:18px 28px; display:flex; flex-direction:column; gap:16px;">
      <div class="dp-topbar-row" style="display:flex; align-items:center; gap:14px;">
        <h1 style="margin:0; font-size:20px; font-weight:800; letter-spacing:-0.4px; font-family:${t.fontDisplay};">${esc(v.pageTitle)}</h1>
        ${`
          <select aria-label="Acesso ativo" data-change="${H(v.onChangeActiveAcesso)}" style="padding:8px 12px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-weight:700; font-family:inherit;">
            ${v.userAcessosOptions.map(opt => `<option value="${esc(opt.id)}" ${opt.id === v.activeAcessoId ? 'selected' : ''}>${esc(opt.nome)}</option>`).join('')}
          </select>`}
        <div style="flex:1;"></div>
        ${showLibraryTools ? `
          <button data-click="${H(v.openPalette)}" title="Busca rápida" style="border:1px solid ${t.border}; background:${t.cardBg}; color:${t.textSecondary}; border-radius:${t.radiusSm}; padding:9px 12px; font-size:11px; font-weight:700; cursor:pointer; flex-shrink:0;">${esc(v.shortcutLabel)}</button>
          <button data-click="${H(v.openCreateMsg)}" style="display:flex; align-items:center; gap:7px; border:0; border-radius:${t.radiusSm}; background:${t.brandGradient}; color:#fff; font-weight:800; font-size:13.5px; padding:11px 18px; cursor:pointer; box-shadow:${t.glow}; flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${esc(v.createMessageLabel)}
          </button>` : ''}
      </div>
      ${showLibraryTools ? `
        <div style="position:relative; width:100%;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${t.textTertiary}" stroke-width="2.2" stroke-linecap="round" style="position:absolute; left:15px; top:50%; transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input aria-label="Buscar mensagens" data-ref="${H(v.searchInputRef)}" data-focus="search" type="search" placeholder="Buscar mensagem, tag, categoria…  ( / )" value="${esc(v.searchQueryDraft)}" data-input="${H(v.onSearchChange)}" data-focusin="${H(v.onSearchFocus)}" data-focusout="${H(v.onSearchBlur)}" autocomplete="off" style="width:100%; padding:14px 18px 14px 46px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:15px; font-family:inherit;" />
          ${v.showSearchDropdown ? `
          <div style="position:absolute; top:calc(100% + 6px); left:0; right:0; background:${t.modalSolidBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; box-shadow:${t.shadowLg}; overflow-y:auto; overflow-x:hidden; max-height:min(300px, 45vh); z-index:50;">
            ${v.searchDropdownResults.length ? v.searchDropdownResults.map(r => `
              <div data-mousedown="${H(r.onPick)}" style="display:flex; align-items:center; gap:10px; padding:11px 16px; cursor:pointer; border-bottom:1px solid ${t.border};" class="dp-table-row">
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13.5px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.titulo)}</div>
                  <div style="font-size:12px; color:${t.textSecondary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.snippet)}</div>
                </div>
                <div style="font-size:10.5px; font-weight:800; color:${t.accent}; background:${t.accentSoft}; padding:3px 9px; border-radius:999px; flex-shrink:0;">${esc(r.categoria)}</div>
              </div>`).join('') : `
              <div style="padding:16px; text-align:center; font-size:13px; color:${t.textTertiary};">Nenhuma mensagem encontrada</div>`}
          </div>` : ''}
        </div>` : ''}
    </header>`;
  }

  static icons(t) {
    return {
      star: (filled, color) => filled
        ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="${color || 'currentColor'}" stroke="${color || 'currentColor'}" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2.5 14.9 9.1 22 9.8 16.6 14.5 18.3 21.5 12 17.6 5.7 21.5 7.4 14.5 2 9.8 9.1 9.1"/></svg>`
        : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2.5 14.9 9.1 22 9.8 16.6 14.5 18.3 21.5 12 17.6 5.7 21.5 7.4 14.5 2 9.8 9.1 9.1"/></svg>`,
      clipboard: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
      check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 6L9 17l-5-5"/></svg>`,
      eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
      edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`,
      trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
      fire: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-3 4-3 8a4 4 0 0 0 8 0c1.5 1.5 2 3.5 2 5a7 7 0 1 1-14 0c0-4 3-6 4-8 1-2 1.5-3.5 3-5z"/></svg>`,
      clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
      search: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
      sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>`,
      moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>`
    };
  }

  viewLibrary(v, t, H) {
    return renderLibraryView(v, t, H);
  }

  viewVisaoGeral(v, t, H) {
    return renderLibraryOverview(v, t, H);
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
      out += `
      <div role="presentation" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:120; padding:20px;">
        <div role="alertdialog" aria-modal="true" aria-label="Solicitações pendentes" style="width:100%; max-width:380px; background:${t.modalSolidBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:8px;">Solicitações pendentes</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:20px; line-height:1.5;">Há ${v.approvalPopupCount} solicitaç${v.approvalPopupCount === 1 ? 'ão' : 'ões'} de mensagem aguardando sua aprovação.</div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button data-click="${H(v.dismissApprovalPopup)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Dispensar</button>
            <button data-click="${H(v.goApprovals)}" style="padding:9px 16px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Ver solicitações</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showPreviewModal && v.previewingMsg) {
      const m = v.previewingMsg;
      out += `
      <div role="presentation" data-click="${H(v.closePreview)}" style="position:fixed; inset:0; background:rgba(5,10,26,0.55); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="${esc(m.titulo)}" data-click="${stay}" style="width:100%; max-width:560px; background:${t.modalSolidBg}; border-radius:${t.radiusXl}; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            ${this.avatarIcon(m.catIcon, m.catColor, 30)}
            <span style="font-size:12.5px; font-weight:800; color:${t.textSecondary};">${esc(m.categoria)}</span>
            <span style="flex:1;"></span>
            <button data-click="${H(v.closePreview)}" style="border:0; background:${t.inputBg}; color:${t.textSecondary}; width:30px; height:30px; border-radius:${t.radiusSm}; cursor:pointer; font-size:15px; font-weight:700;">✕</button>
          </div>
          <h3 style="margin:4px 0 14px; font-size:19px; font-weight:700; letter-spacing:-0.3px; font-family:${t.fontDisplay};">${esc(m.titulo)}</h3>
          <div style="background:${t.inputBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; padding:16px 18px; white-space:pre-wrap; font-size:14px; line-height:1.65; color:${t.text}; max-height:48vh; overflow:auto;">${esc(m.conteudo)}</div>
          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:18px;">
            <button data-click="${H(v.closePreview)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-weight:700; font-size:13.5px; padding:10px 18px; border-radius:${t.radiusSm}; cursor:pointer;">Fechar</button>
            <button data-click="${H(m.onCopy)}" style="display:flex; align-items:center; gap:7px; border:0; border-radius:${t.radiusSm}; background:${t.brandGradient}; color:#fff; font-weight:800; font-size:13.5px; padding:10px 18px; cursor:pointer; box-shadow:${t.glow};">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copiar mensagem
            </button>
          </div>
        </div>
      </div>`;
    }

    if (v.paletteOpen) {
      out += `
      <div role="presentation" data-click="${H(v.closePalette)}" style="position:fixed; inset:0; background:rgba(5,10,26,0.5); backdrop-filter:blur(6px); display:flex; justify-content:center; align-items:flex-start; z-index:120; padding:12vh 20px 20px;">
        <div role="dialog" aria-modal="true" aria-label="Busca rápida" data-click="${stay}" style="width:100%; max-width:600px; background:${t.modalSolidBg}; border:1px solid ${t.border}; border-radius:${t.radiusXl}; box-shadow:${t.shadowLg}; overflow:hidden; animation:dp-modal-in .18s ease-out;">
          <div style="display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid ${t.border};">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${t.textTertiary}" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input data-ref="${H(v.paletteInputRef)}" data-focus="palette" value="${esc(v.paletteQuery)}" data-input="${H(v.onPaletteQueryChange)}" placeholder="Digite para buscar e Enter para copiar…" style="flex:1; border:0; background:transparent; color:${t.text}; font-size:15px; outline:none; font-family:inherit;" />
            <span style="border:1px solid ${t.border}; background:${t.inputBg}; border-radius:6px; padding:2px 7px; font-size:11px; font-weight:700; color:${t.textSecondary};">Esc</span>
          </div>
          <div style="max-height:330px; overflow:auto; padding:8px;">
            ${v.paletteRows.map(r => `
              <div role="button" tabindex="0" data-click="${H(r.onPick)}" style="display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:${t.radiusSm}; cursor:pointer; background:${r.active ? t.accentSoft : 'transparent'};">
                <span style="width:10px; height:10px; border-radius:50%; background:${r.catColor}; flex-shrink:0;"></span>
                <span style="flex:1; min-width:0;"><span style="display:block; font-weight:800; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.titulo)}</span><span style="display:block; font-size:12px; color:${t.textTertiary};">${esc(r.categoria)}</span></span>
                <span style="font-size:11px; font-weight:700; color:${t.accent}; opacity:${r.active ? 1 : 0};">↵ copiar</span>
              </div>`).join('')}
            ${v.paletteEmpty ? `<div style="padding:24px; text-align:center; color:${t.textTertiary}; font-size:14px;">Nada encontrado para "${esc(v.paletteQuery)}".</div>` : ''}
          </div>
          <div style="display:flex; gap:16px; padding:11px 20px; border-top:1px solid ${t.border}; font-size:11.5px; color:${t.textTertiary}; font-weight:600;">
            <span><span style="border:1px solid ${t.border}; background:${t.inputBg}; border-radius:5px; padding:1px 6px;">↑↓</span> navegar</span>
            <span><span style="border:1px solid ${t.border}; background:${t.inputBg}; border-radius:5px; padding:1px 6px;">↵</span> copiar</span>
            <span><span style="border:1px solid ${t.border}; background:${t.inputBg}; border-radius:5px; padding:1px 6px;">Esc</span> fechar</span>
          </div>
        </div>
      </div>`;
    }

    if (v.toasts.length) {
      const toastIcon = (ok) => ok
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg>`;
      const closeIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>`;
      out += `
      <div style="position:fixed; bottom:24px; right:24px; z-index:200; display:flex; flex-direction:column-reverse; gap:10px; max-width:min(380px,86vw);">
        ${v.toasts.map(toast => `
        <div data-key="toast-${esc(toast.id)}" role="status" aria-live="polite" style="position:relative; overflow:hidden; background:${toast.bg}; color:${toast.ink || '#fff'}; border-radius:${t.radiusLg}; box-shadow:0 16px 36px -12px rgba(0,0,0,.4), 0 2px 8px -2px rgba(0,0,0,.15); animation:dp-toast-in .25s cubic-bezier(.2,.9,.3,1.3);">
          <div style="display:flex; align-items:flex-start; gap:11px; padding:14px 14px 14px 16px;">
            <span style="width:24px; height:24px; border-radius:50%; background:${toast.type === 'error' ? 'rgba(255,255,255,.22)' : 'rgba(16,185,129,.95)'}; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; box-shadow:0 2px 6px -1px rgba(0,0,0,.25);">${toastIcon(toast.type !== 'error')}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:800; font-size:13.5px; font-family:${t.fontDisplay}; line-height:1.35;">${esc(toast.msg)}</div>
              ${toast.body ? `<div style="white-space:pre-wrap; font-size:12px; line-height:1.5; font-weight:500; opacity:.8; margin-top:7px; max-height:150px; overflow:auto; background:rgba(128,140,170,.14); border-radius:9px; padding:8px 10px;">${esc(toast.body)}</div>` : ''}
              ${toast.action ? `<button data-click="${H(() => { toast.action.onClick(); this.dismissToast(toast.id); })}" style="margin-top:9px; border:1px solid rgba(255,255,255,.4); background:transparent; color:inherit; font-size:12px; font-weight:800; padding:6px 13px; border-radius:8px; cursor:pointer;">${esc(toast.action.label)}</button>` : ''}
            </div>
            <button data-click="${H(() => this.dismissToast(toast.id))}" aria-label="Fechar" title="Fechar" style="flex-shrink:0; width:20px; height:20px; border-radius:50%; border:none; background:transparent; color:inherit; opacity:.55; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:2px;">${closeIcon}</button>
          </div>
          <span style="position:absolute; left:0; bottom:0; height:2.5px; width:100%; background:rgba(128,140,170,.3); overflow:hidden; display:block;"><span style="display:block; height:100%; background:${toast.type === 'error' ? 'rgba(255,255,255,.7)' : t.brandGradient}; animation:dp-toast-progress ${toast.duration}ms linear forwards;"></span></span>
        </div>`).join('')}
      </div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
