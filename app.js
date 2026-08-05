// app.js
import * as api from './api.js';
import { normalize, matchesSearch, titleSegments as titleSegmentsPure } from './search-utils.mjs';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ---------------- DOM morphing ----------------
 * Patches the live tree in place instead of tearing it down and rebuilding it
 * (the old innerHTML-replace-per-keystroke approach). Reusing nodes means the
 * browser never destroys a focused <input>, never restarts CSS animations on
 * unrelated elements, and never has to re-decode/re-layout the whole page —
 * which is what caused the flicker/oscillation while typing.
 */
const keyOf = (el) => (el.nodeType === Node.ELEMENT_NODE && el.getAttribute) ? el.getAttribute('data-key') : null;

function syncAttrs(oldEl, newEl) {
  const oldAttrs = oldEl.attributes;
  for (let i = oldAttrs.length - 1; i >= 0; i--) {
    const name = oldAttrs[i].name;
    if (!newEl.hasAttribute(name)) oldEl.removeAttribute(name);
  }
  const newAttrs = newEl.attributes;
  for (let i = 0; i < newAttrs.length; i++) {
    const name = newAttrs[i].name;
    const value = newAttrs[i].value;
    if (oldEl.getAttribute(name) !== value) oldEl.setAttribute(name, value);
  }
}

function syncFormValue(oldEl, newEl) {
  const tag = oldEl.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    // Never stomp the live value of the field the user is actively typing in
    // unless it actually differs — setting .value, even to an identical
    // string, can be enough to disturb the caret in some browsers.
    if (oldEl.value !== newEl.value) oldEl.value = newEl.value;
  } else if (tag === 'SELECT') {
    if (oldEl.value !== newEl.value) oldEl.value = newEl.value;
  }
}

function morphNode(oldNode, newNode) {
  if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
    return newNode.cloneNode(true);
  }
  if (oldNode.nodeType === Node.TEXT_NODE || oldNode.nodeType === Node.COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return oldNode;
  }
  if (oldNode.nodeType !== Node.ELEMENT_NODE) return oldNode;
  syncAttrs(oldNode, newNode);
  syncFormValue(oldNode, newNode);
  morphChildren(oldNode, newNode);
  return oldNode;
}

function morphChildren(oldParent, newParent) {
  const oldChildren = Array.from(oldParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);
  const oldKeyed = new Map();
  oldChildren.forEach(c => { const k = keyOf(c); if (k) oldKeyed.set(k, c); });
  const used = new Set();

  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i];
    const newKey = keyOf(newChild);
    let match = null;
    if (newKey && oldKeyed.has(newKey) && !used.has(oldKeyed.get(newKey))) {
      match = oldKeyed.get(newKey);
    } else {
      const candidate = oldChildren[i];
      if (candidate && !used.has(candidate) && candidate.nodeName === newChild.nodeName && !keyOf(candidate)) {
        match = candidate;
      }
    }
    const kept = match ? morphNode(match, newChild) : newChild.cloneNode(true);
    if (match) used.add(match);
    const ref = oldParent.childNodes[i] || null;
    if (ref !== kept) oldParent.insertBefore(kept, ref);
  }
  while (oldParent.childNodes.length > newChildren.length) {
    oldParent.removeChild(oldParent.lastChild);
  }
}

class App {
  constructor(root) {
    this.root = root;
    this._reg = {};
    this._regN = 0;
    this.searchEl = null;
    this.state = this.initialState();
  }

  initialState() {
    return {
      loading: true,
      loadError: '',
      darkMode: false,
      density: 'compact',
      currentUser: null,     // { user, profile } from api.getSession()
      profileId: null,
      activeAcessoId: null,
      searchQuery: '',
      adminSearchQuery: '',
      categoryFilter: null,
      copiedId: null,
      librarySort: 'relevance',
      libraryViewMode: 'grid',
      showPreviewModal: false, previewingMsgId: null,
      paletteOpen: false, paletteQuery: '', paletteIndex: 0,
      favoriteIds: [],       // mensagem_id[] for the current user
      recentIds: [],         // mensagem_id[] for the current user, most recent first
      toast: { show: false, msg: '', type: 'success', body: '' },
      confirm: { open: false, title: '', message: '', action: null },
      showMsgModal: false, editingMsgId: null,
      msgForm: { categoria: '', titulo: '', tagInput: '', tags: [], conteudo: '' },
      showCatModal: false, editingCatId: null, catForm: { nome: '' },
      showAcessoModal: false, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' },
      showUsersModal: false, usersModalAcessoId: null,
      acessoUsers: [], allProfiles: [], addUserSelectedId: '',
      acessoUsersLoading: false, resetPasswordResult: null,
      acessos: [],
      acessoMembros: [],
      categorias: [],
      mensagens: [],
      solicitacoesPendentes: [],
      showApprovalPopup: false,
      approvalPopupSeenThisSession: false,
      showSolicitacaoModal: false, viewingSolicitacaoId: null,
      solicitacaoRejectMode: false, rejectMotivo: '',
      loginEmail: '', loginPassword: '', loginError: '', loggingIn: false, showLoginPassword: false
    };
  }

  /* ---------------- render engine (unchanged) ---------------- */

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
    this._reg = {};
    this._regN = 0;
    const v = this.renderVals();
    const container = document.createElement('div');
    container.innerHTML = this.view(v);
    // Morph instead of innerHTML-replace: reuses existing nodes, so the
    // focused input/caret, in-flight CSS animations, and scroll position all
    // survive a render untouched.
    morphChildren(this.root, container);

    this.root.querySelectorAll('[data-ref]').forEach(el => {
      const fn = this._reg[el.getAttribute('data-ref')];
      if (fn) fn(el);
    });
  }

  /* Delegated listeners, attached once. Each render() only refreshes
   * this._reg and the data-* attribute values (via morph) — never re-attaches
   * per-node listeners, which used to pile up a new listener on every
   * keystroke as nodes got recreated. */
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
    try {
      const dm = localStorage.getItem('dp_darkmode'); if (dm) this.state.darkMode = dm === '1';
    } catch (e) {}

    this.render();
    this.bindDelegatedEvents();

    api.onAuthChange(async (session) => {
      if (!session) {
        const { darkMode, density } = this.state;
        this.setState({ ...this.initialState(), darkMode, density, loading: false });
        return;
      }
      await this.refreshAppData(session);
    });

    try {
      const session = await api.getSession();
      if (session) await this.refreshAppData(session);
      else this.setState({ loading: false });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message });
    }

    this._keyHandler = (e) => {
      const st = this.state;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.setState({ paletteOpen: !st.paletteOpen, paletteQuery: '', paletteIndex: 0 });
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
      if (e.key === '/' && !typing && st.currentUser) {
        e.preventDefault();
        if (this.searchEl) this.searchEl.focus();
      } else if (e.key === 'Escape') {
        if (st.showPreviewModal) this.setState({ showPreviewModal: false });
        else if (st.showMsgModal) this.setState({ showMsgModal: false });
        else if (st.showCatModal) this.setState({ showCatModal: false });
        else if (st.showAcessoModal) this.setState({ showAcessoModal: false });
        else if (st.showUsersModal) this.setState({ showUsersModal: false });
        else if (st.showSolicitacaoModal) this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false });
        else if (st.showApprovalPopup) this.setState({ showApprovalPopup: false });
        else if (st.confirm.open) this.setState({ confirm: { open: false, title: '', message: '', action: null } });
        else if (st.userMenuOpen) this.setState({ userMenuOpen: false });
        else if (st.searchQuery) this.setState({ searchQuery: '' });
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  async refreshAppData(session) {
    // `session` may be a raw Supabase session ({ user }) on first load/login,
    // or the already-shaped { user, profile } from state on a data refresh —
    // both carry .user, which is all fetchAppData needs.
    try {
      const data = await api.fetchAppData(session.user.id);
      const firstAcessoId = data.acessos[0] ? data.acessos[0].id : null;
      const isSuperAdmin = data.profile.role === 'superadmin';
      const solicitacoesPendentes = isSuperAdmin ? await api.listarSolicitacoesPendentes() : [];
      const shouldPopup = isSuperAdmin && solicitacoesPendentes.length > 0 && !this.state.approvalPopupSeenThisSession;
      this.setState({
        currentUser: { user: session.user, profile: data.profile },
        profileId: session.user.id,
        acessos: data.acessos,
        acessoMembros: data.acessoMembros,
        categorias: data.categorias,
        mensagens: data.mensagens,
        favoriteIds: data.favoritos.map(f => f.mensagem_id),
        recentIds: data.recentes.map(r => r.mensagem_id),
        activeAcessoId: this.state.activeAcessoId && data.acessos.some(a => a.id === this.state.activeAcessoId)
          ? this.state.activeAcessoId : firstAcessoId,
        solicitacoesPendentes,
        showApprovalPopup: shouldPopup,
        approvalPopupSeenThisSession: this.state.approvalPopupSeenThisSession || shouldPopup,
        loading: false, loadError: ''
      });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message, loggingIn: false, loginError: e.message });
      this.showToast(e.message, 'error');
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
    const st = this.state;
    if (!st.currentUser) return [];
    const activeAcesso = st.acessos.find(a => a.id === st.activeAcessoId) || st.acessos[0];
    if (!activeAcesso) return [];
    return st.mensagens.filter(m => m.acesso_id === activeAcesso.id);
  }
  copyMessage(msg) {
    const session = this.state.currentUser;
    const profile = session.profile;
    navigator.clipboard && navigator.clipboard.writeText(msg.conteudo).catch(() => {});
    this.setState({ copiedId: msg.id });
    setTimeout(() => this.setState({ copiedId: null }), 1400);
    this.showToast(`"${msg.titulo}" copiada!`, 'success', msg.conteudo);
    Promise.all([api.incrementFrequencia(msg.id), api.recordRecente(profile.id, msg.id)])
      .then(() => this.refreshAppData(session))
      .catch(e => this.showToast(e.message, 'error'));
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
      navy: dark ? '#2B62D6' : '#16336E', cyan: dark ? '#4CC3FF' : '#0E93D8',
      pageBg: dark ? '#080F22' : '#EEF2F9',
      cardBg: dark ? '#101B38' : '#FFFFFF',
      modalSolidBg: dark ? '#101B38' : '#FFFFFF',
      chipBg: dark ? '#0C152E' : '#F1F5FB',
      chipBgHover: dark ? '#16234a' : '#e4ebf6',
      logoGlow: dark ? 'filter: drop-shadow(0 0 2px rgba(255,255,255,0.85)) drop-shadow(0 0 5px rgba(255,255,255,0.45));' : '',
      inputBg: dark ? '#0C152E' : '#F1F5FB',
      text: dark ? '#E9EFFB' : '#111F3F',
      textSecondary: dark ? '#A3B3D4' : '#54678C',
      textTertiary: dark ? '#5F7199' : '#93A6C4',
      border: dark ? '#213155' : '#DDE6F2',
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
      panel: dark ? 'rgba(13,22,45,0.75)' : 'rgba(255,255,255,0.75)',
      accent: dark ? '#4CC3FF' : '#0E93D8',
      accentSoft: dark ? 'rgba(76,195,255,0.13)' : 'rgba(14,147,216,0.11)',
      brand: dark ? '#2B62D6' : '#16336E',
      brand2: dark ? '#3A74EA' : '#1E4290',
      brandGradient: dark ? 'linear-gradient(135deg,#3A74EA,#39B5F5)' : 'linear-gradient(135deg,#1E4290,#0E93D8)',
      glow: dark ? '0 8px 26px -8px rgba(57,181,245,0.35)' : '0 8px 24px -8px rgba(14,147,216,0.45)',
      ok: dark ? '#34D399' : '#0E9F6E',
      okSoft: dark ? 'rgba(52,211,153,0.13)' : 'rgba(16,185,129,0.13)',
      danger: dark ? '#FF7B7B' : '#D64545',
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

  showToast(msg, type, body) {
    clearTimeout(this._toastTimer);
    const t = this.theme();
    this.setState({ toast: { show: true, msg, type: type || 'success', body: body || '', bg: type === 'error' ? t.danger : t.toastBg, ink: type === 'error' ? '#fff' : t.toastInk } });
    this._toastTimer = setTimeout(() => this.setState({ toast: { show: false, msg: '', type: 'success', body: '' } }), body ? 6000 : 3000);
  }

  /* ---------------- computed bindings ---------------- */

  renderVals() {
    const st = this.state;
    const theme = this.theme();
    const session = st.currentUser;

    if (st.loading) {
      return { isLogin: false, isApp: false, isLoading: true, theme, confirm: st.confirm, toast: st.toast,
        showMsgModal: false, showCatModal: false, showAcessoModal: false, showUsersModal: false,
        showPreviewModal: false, paletteOpen: false, showSolicitacaoModal: false, showApprovalPopup: false };
    }

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
        noop: (e) => e.preventDefault(),
        confirm: st.confirm, toast: st.toast,
        showMsgModal: false, showCatModal: false, showAcessoModal: false, showUsersModal: false
      };
    }

    const profile = session.profile;
    const activeAcesso = st.acessos.find(a => a.id === st.activeAcessoId) || st.acessos[0];
    const acessoMsgs = st.mensagens.filter(m => m.acesso_id === activeAcesso.id);
    const acessoCats = st.categorias.filter(c => c.acesso_id === activeAcesso.id);
    const isSuperAdmin = profile.role === 'superadmin';
    // Superadmin pode alternar entre TODOS os Acessos ativos (não só os que tem
    // vínculo em acesso_membros) — senão um Acesso recém-criado nunca apareceria
    // no seletor para ser gerenciado.
    const userAcessoLinks = isSuperAdmin
      ? st.acessos.filter(a => a.ativo).map(a => ({ acesso_id: a.id }))
      : st.acessoMembros.filter(m => {
          const acc = st.acessos.find(a => a.id === m.acesso_id);
          return acc && acc.ativo;
        });
    const localAdminEntry = st.acessoMembros.find(m => m.acesso_id === activeAcesso.id);
    const isAdmin = isSuperAdmin || (localAdminEntry && localAdminEntry.is_admin_local);

    const copyMessage = (msg) => this.copyMessage(msg);
    const toggleFav = (id) => {
      const isFav = st.favoriteIds.includes(id);
      api.toggleFavorito(profile.id, id, isFav)
        .then(() => this.refreshAppData(session))
        .catch(e => this.showToast(e.message, 'error'));
    };
    const openPreview = (msg) => this.setState({ showPreviewModal: true, previewingMsgId: msg.id });

    const maxFrequencia = Math.max(1, ...acessoMsgs.map(m => m.frequencia));
    const buildCard = (m) => {
      const isFav = st.favoriteIds.includes(m.id);
      return {
        id: m.id, categoria: m.categoria,
        catColor: this.categoryColor(m.categoria),
        catIcon: this.categoryIcon(m.categoria),
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        displayContent: m.conteudo,
        heatWidth: Math.round(100 * m.frequencia / maxFrequencia),
        tagChips: m.tags.map(tag => ({ label: tag, onClick: () => this.setState({ searchQuery: tag }) })),
        frequencia: m.frequencia,
        isFav, favColor: isFav ? '#F5A623' : theme.textTertiary,
        onToggleFav: () => toggleFav(m.id),
        onCardClick: () => copyMessage(m),
        onCardKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyMessage(m); } },
        onCopy: () => copyMessage(m), copied: st.copiedId === m.id, copyLabel: st.copiedId === m.id ? 'Copiado' : 'Copiar',
        copyBtnBg: st.copiedId === m.id ? theme.ok : theme.brand,
        onPreview: () => openPreview(m),
        onEdit: () => this.openEditMsg(m),
        onDelete: () => this.requestDeleteMsg(m),
        borderColor: theme.border
      };
    };

    const acessoMsgsFilteredByCategory = acessoMsgs.filter(m => !st.categoryFilter || m.categoria === st.categoryFilter);
    let filtered = acessoMsgsFilteredByCategory.filter(m => this.matchesSearch(m, st.searchQuery));
    const q = st.searchQuery.trim().toLowerCase();
    if (q) {
      filtered.sort((a, b) => {
        const aExact = a.titulo.toLowerCase().includes(q) ? 1 : 0;
        const bExact = b.titulo.toLowerCase().includes(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.frequencia - a.frequencia;
      });
    } else if (st.librarySort === 'az') {
      filtered.sort((a, b) => a.titulo.localeCompare(b.titulo));
    } else if (st.librarySort === 'used') {
      filtered.sort((a, b) => b.frequencia - a.frequencia);
    } else {
      filtered.sort((a, b) => (st.favoriteIds.includes(b.id) ? 1 : 0) - (st.favoriteIds.includes(a.id) ? 1 : 0) || b.frequencia - a.frequencia);
    }

    const acessoMsgsInCategory = acessoMsgs.filter(m => !st.categoryFilter || m.categoria === st.categoryFilter);
    const miniRowData = (m) => ({
      titulo: m.titulo, catInitial: m.categoria.charAt(0).toUpperCase(), catColor: this.categoryColor(m.categoria),
      catIcon: this.categoryIcon(m.categoria), categoria: m.categoria, usedLabel: `${m.frequencia}x`,
      onCopy: () => copyMessage(m), copied: st.copiedId === m.id, copyLabel: st.copiedId === m.id ? 'Copiado' : 'Copiar'
    });
    const rankColors = ['#E8A10B', '#9AA7BD', '#C77B46', theme.textTertiary, theme.textTertiary];
    const topUsedSource = [...acessoMsgsInCategory].sort((a, b) => b.frequencia - a.frequencia).slice(0, 5);
    const maxTopUsed = Math.max(1, ...topUsedSource.map(m => m.frequencia));
    const mostUsed = topUsedSource.map((m, i) => ({
      ...miniRowData(m), rank: i + 1, rankColor: rankColors[i] || theme.textTertiary,
      barWidth: Math.round(100 * m.frequencia / maxTopUsed)
    }));
    const recentList = st.recentIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);
    const favList = st.favoriteIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean).map(miniRowData);

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      count: acessoMsgs.filter(m => m.categoria === c.nome).length,
      icon: this.categoryIcon(c.nome), color: this.categoryColor(c.nome),
      active: st.categoryFilter === c.nome,
      onClick: () => this.setState({ categoryFilter: st.categoryFilter === c.nome ? null : c.nome, appView: 'biblioteca' })
    }));

    const density = st.density;
    const cardGap = density === 'compact' ? 12 : 16;
    const gridStyle = `column-width:${density === 'compact' ? 260 : 300}px; column-gap:${cardGap}px;`;
    const cardPadding = density === 'compact' ? '14px' : '18px';

    const hour = new Date().getHours();
    const firstName = (profile.nome || '').split(' ')[0] || '';
    const heroGreeting = (hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite') + (firstName ? `, ${firstName}!` : '!');
    const heroStats = [
      { value: acessoMsgs.length, label: 'MENSAGENS' },
      { value: acessoMsgs.reduce((a, m) => a + m.frequencia, 0), label: 'CÓPIAS' },
      { value: acessoMsgs.filter(m => st.favoriteIds.includes(m.id)).length, label: 'FAVORITAS' }
    ];

    const adminQ = st.adminSearchQuery.trim().toLowerCase();
    const adminMsgRows = acessoMsgs.filter(m => !adminQ || m.titulo.toLowerCase().includes(adminQ) || m.conteudo.toLowerCase().includes(adminQ))
      .map(m => ({
        id: m.id, categoria: m.categoria, titulo: m.titulo, conteudo: m.conteudo, tagsLabel: m.tags.join(', '), frequencia: m.frequencia,
        onEdit: () => this.openEditMsg(m),
        onDelete: () => this.requestDelete('Excluir mensagem', `Tem certeza que deseja excluir "${m.titulo}"? Esta ação não pode ser desfeita.`, () => this.deleteMsg(m.id))
      }));

    const catRows = acessoCats.map(c => ({
      id: c.id, nome: c.nome,
      countLabel: acessoMsgs.filter(m => m.categoria === c.nome).length + ' mensagens',
      onEdit: () => this.openEditCat(c),
      onDelete: () => this.requestDelete('Excluir categoria', `Excluir a categoria "${c.nome}"? As mensagens vinculadas manterão o nome, mas o filtro será removido.`, () => this.deleteCat(c.id))
    }));

    const acessoRows = st.acessos.map(a => {
      const linkedCount = st.acessoMembros.filter(m => m.acesso_id === a.id).length;
      const msgCount = st.mensagens.filter(m => m.acesso_id === a.id).length;
      return {
        id: a.id, nome: a.nome, cor: a.cor, initial: a.nome.charAt(0).toUpperCase(),
        statsLabel: `${msgCount} mensagens · ${linkedCount} usuários`,
        statusLabel: a.ativo ? 'Ativo' : 'Inativo',
        statusBg: a.ativo ? theme.okSoft : theme.dangerSoft, statusColor: a.ativo ? theme.ok : theme.danger,
        toggleLabel: a.ativo ? 'Desativar' : 'Ativar',
        onToggleStatus: () => this.toggleAcessoStatus(a.id, a.ativo),
        onUsers: () => this.openUsersModal(a.id)
      };
    });

    const msgFormTagChips = st.msgForm.tags.map((t, i) => ({
      label: t, onRemove: () => this.setState(s => ({ msgForm: { ...s.msgForm, tags: s.msgForm.tags.filter((_, idx) => idx !== i) } }))
    }));

    const appView = (st.appView === 'admin' && !isAdmin) ? 'biblioteca' : (st.appView || 'biblioteca');
    const pageTitles = { biblioteca: 'Biblioteca de mensagens', visaogeral: 'Visão geral', admin: 'Administração' };

    return {
      isLogin: false, isApp: true, isLoading: false, theme,
      appView,
      pageTitle: pageTitles[appView],
      isLib: appView === 'biblioteca', isOver: appView === 'visaogeral', isAdminView: appView === 'admin',
      adminTab: st.adminTab || 'mensagens',
      isAdminMsgs: (st.adminTab || 'mensagens') === 'mensagens', isAdminCats: st.adminTab === 'categorias', isAdminAcessos: st.adminTab === 'acessos',
      isAdminSolicitacoes: st.adminTab === 'solicitacoes',
      tabMsgsBg: (st.adminTab || 'mensagens') === 'mensagens' ? theme.navy : 'transparent', tabMsgsColor: (st.adminTab || 'mensagens') === 'mensagens' ? '#fff' : theme.text,
      tabCatsBg: st.adminTab === 'categorias' ? theme.navy : 'transparent', tabCatsColor: st.adminTab === 'categorias' ? '#fff' : theme.text,
      tabAcessosBg: st.adminTab === 'acessos' ? theme.navy : 'transparent', tabAcessosColor: st.adminTab === 'acessos' ? '#fff' : theme.text,
      tabSolicitacoesBg: st.adminTab === 'solicitacoes' ? theme.navy : 'transparent', tabSolicitacoesColor: st.adminTab === 'solicitacoes' ? '#fff' : theme.text,
      isSuperAdmin, isAdmin, isAdminNow: isAdmin,
      goBiblioteca: () => this.setState({ appView: 'biblioteca', userMenuOpen: false }),
      goVisaoGeral: () => this.setState({ appView: 'visaogeral', userMenuOpen: false }),
      goAdmin: () => this.setState({ appView: 'admin', userMenuOpen: false, adminTab: 'mensagens' }),
      setAdminTabMsgs: () => this.setState({ adminTab: 'mensagens' }),
      setAdminTabCats: () => this.setState({ adminTab: 'categorias' }),
      setAdminTabAcessos: () => this.setState({ adminTab: 'acessos' }),
      setAdminTabSolicitacoes: () => this.setState({ adminTab: 'solicitacoes' }),

      solicitacoesCount: st.solicitacoesPendentes.length,
      solicitacoesTabLabel: st.solicitacoesPendentes.length > 0 ? `Solicitações (${st.solicitacoesPendentes.length})` : 'Solicitações',
      goApprovals: () => this.setState({ appView: 'admin', adminTab: 'solicitacoes', showApprovalPopup: false, userMenuOpen: false }),

      currentUser: { nome: profile.nome, iniciais: profile.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(), perfilLabel: isSuperAdmin ? 'Administrador' : (isAdmin ? 'Admin local' : 'Usuário') },
      userMenuOpen: !!st.userMenuOpen, toggleUserMenu: () => this.setState({ userMenuOpen: !st.userMenuOpen }),
      logout: () => this.logout(),

      activeAcesso, activeAcessoId: activeAcesso.id,
      showAcessoSelector: userAcessoLinks.length > 1,
      userAcessosOptions: userAcessoLinks.map(l => st.acessos.find(a => a.id === l.acesso_id)).filter(Boolean),
      onChangeActiveAcesso: (e) => this.setState({ activeAcessoId: e.target.value, categoryFilter: null }),

      searchQuery: st.searchQuery, searchInputRef: (el) => { this.searchEl = el; },
      onSearchChange: (e) => this.setState({ searchQuery: e.target.value }),
      shortcutLabel: /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K',

      darkModeIcon: st.darkMode ? '☀' : '☾',
      toggleDarkMode: () => { const val = !st.darkMode; this.setState({ darkMode: val }); try { localStorage.setItem('dp_darkmode', val ? '1' : '0'); } catch (e) {} },

      chipAllActive: !st.categoryFilter, chipAllCount: acessoMsgs.length,
      setCategoryAll: () => this.setState({ categoryFilter: null }),
      categoriaChips,

      heroGreeting, heroStats,
      mostUsedList: mostUsed, recentList, hasRecent: recentList.length > 0,
      favList, hasFav: favList.length > 0,

      resultsCountLabel: filtered.length === 1 ? '1 mensagem encontrada' : `${filtered.length} mensagens encontradas`,
      hasResults: filtered.length > 0,
      gridStyle, cardPadding, cardGap,
      cardList: filtered.map(buildCard),

      librarySort: st.librarySort,
      onLibrarySortChange: (e) => this.setState({ librarySort: e.target.value }),
      libraryViewMode: st.libraryViewMode,
      isGridView: st.libraryViewMode !== 'list', isListView: st.libraryViewMode === 'list',
      setGridView: () => this.setState({ libraryViewMode: 'grid' }),
      setListView: () => this.setState({ libraryViewMode: 'list' }),

      showPreviewModal: st.showPreviewModal,
      closePreview: () => this.setState({ showPreviewModal: false }),
      previewingMsg: (() => {
        const m = acessoMsgs.find(x => x.id === st.previewingMsgId);
        if (!m) return null;
        return {
          titulo: m.titulo, categoria: m.categoria, catColor: this.categoryColor(m.categoria), catIcon: this.categoryIcon(m.categoria),
          conteudo: m.conteudo, onCopy: () => copyMessage(m)
        };
      })(),

      paletteOpen: st.paletteOpen, paletteQuery: st.paletteQuery, paletteInputRef: (el) => { this.paletteEl = el; if (el && document.activeElement !== el) el.focus(); },
      onPaletteQueryChange: (e) => this.setState({ paletteQuery: e.target.value, paletteIndex: 0 }),
      openPalette: () => this.setState({ paletteOpen: true, paletteQuery: '', paletteIndex: 0 }),
      closePalette: () => this.setState({ paletteOpen: false }),
      paletteRows: st.paletteOpen ? this.paletteList().map((m, i) => ({
        titulo: m.titulo, categoria: m.categoria, catColor: this.categoryColor(m.categoria),
        active: i === st.paletteIndex,
        onPick: () => this.copyFromPalette(m),
        onHover: () => this.setState({ paletteIndex: i })
      })) : [],
      paletteEmpty: st.paletteOpen && this.paletteList().length === 0,

      categorias: acessoCats,
      adminSearchQuery: st.adminSearchQuery, onAdminSearchChange: (e) => this.setState({ adminSearchQuery: e.target.value }),
      adminMsgRows, catRows, acessoRows,
      openCreateMsg: () => this.openCreateMsg(),
      showUsersModal: st.showUsersModal,
      usersModalAcessoNome: (st.acessos.find(a => a.id === st.usersModalAcessoId) || {}).nome || '',
      acessoUsersLoading: st.acessoUsersLoading,
      usersModalRows: st.acessoUsers.map(u => ({
        userId: u.userId, nome: u.nome, email: u.email,
        isAdminLocal: u.isAdminLocal,
        roleLabel: u.isAdminLocal ? 'Admin local' : 'Usuário',
        onResetPassword: () => this.requestResetPassword(u),
        onToggleAdmin: () => this.toggleMemberAdminLocal(u.userId, !u.isAdminLocal),
        onUnlink: () => this.requestUnlinkUser(u),
        justReset: st.resetPasswordResult && st.resetPasswordResult.userId === u.userId ? st.resetPasswordResult.tempPassword : null
      })),
      addUserOptions: st.allProfiles.filter(p => !st.acessoUsers.some(u => u.userId === p.id)),
      addUserSelectedId: st.addUserSelectedId,
      onAddUserSelectChange: (e) => this.setState({ addUserSelectedId: e.target.value }),
      addUserToAcesso: () => this.addUserToAcesso(),
      closeUsersModal: () => this.setState({ showUsersModal: false, resetPasswordResult: null }),

      showMsgModal: st.showMsgModal, msgModalTitle: st.editingMsgId ? 'Editar mensagem' : 'Nova mensagem',
      msgForm: st.msgForm, msgFormTagChips, msgContentCount: st.msgForm.conteudo.length,
      onMsgCategoriaChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, categoria: e.target.value } })),
      onMsgTituloChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, titulo: e.target.value.slice(0, 100) } })),
      onMsgTagInputChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, tagInput: e.target.value } })),
      onMsgTagKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addMsgTag(); } },
      addMsgTag: () => this.addMsgTag(),
      onMsgConteudoChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, conteudo: e.target.value.slice(0, 2000) } })),
      closeMsgModal: () => this.setState({ showMsgModal: false }),
      saveMsg: () => this.saveMsg(),

      showCatModal: st.showCatModal, catModalTitle: st.editingCatId ? 'Editar categoria' : 'Nova categoria', catForm: st.catForm,
      openCreateCat: () => this.setState({ showCatModal: true, editingCatId: null, catForm: { nome: '' } }),
      onCatNomeChange: (e) => this.setState({ catForm: { nome: e.target.value } }),
      closeCatModal: () => this.setState({ showCatModal: false }),
      saveCat: () => this.saveCat(),

      showAcessoModal: st.showAcessoModal, acessoForm: st.acessoForm,
      openCreateAcesso: () => this.setState({ showAcessoModal: true, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' } }),
      onAcessoNomeChange: (e) => this.setState(s => ({ acessoForm: { ...s.acessoForm, nome: e.target.value } })),
      onAcessoDescChange: (e) => this.setState(s => ({ acessoForm: { ...s.acessoForm, descricao: e.target.value } })),
      acessoColorOptions: ['#1BA7DC', '#0F2C6B', '#4F46E5', '#16A34A', '#D97706'].map(c => ({
        value: c, border: st.acessoForm.cor === c ? '2px solid #12203F' : '2px solid transparent',
        onSelect: () => this.setState(s => ({ acessoForm: { ...s.acessoForm, cor: c } }))
      })),
      closeAcessoModal: () => this.setState({ showAcessoModal: false }),
      saveAcesso: () => this.saveAcesso(),

      confirm: st.confirm, closeConfirm: () => this.setState({ confirm: { open: false, title: '', message: '', action: null } }),
      runConfirm: () => { if (st.confirm.action) st.confirm.action(); this.setState({ confirm: { open: false, title: '', message: '', action: null } }); },

      showApprovalPopup: st.showApprovalPopup,
      approvalPopupCount: st.solicitacoesPendentes.length,
      dismissApprovalPopup: () => this.setState({ showApprovalPopup: false }),

      solicitacaoRows: st.solicitacoesPendentes.map(s => ({
        id: s.id,
        departamento: s.acessos ? s.acessos.nome : '—',
        usuario: s.solicitante ? s.solicitante.nome : '—',
        tipoLabel: s.tipo === 'criacao' ? 'Criação' : s.tipo === 'edicao' ? 'Edição' : 'Exclusão',
        dataLabel: new Date(s.criado_em).toLocaleString('pt-BR'),
        onOpen: () => this.setState({ showSolicitacaoModal: true, viewingSolicitacaoId: s.id, solicitacaoRejectMode: false, rejectMotivo: '' })
      })),
      hasSolicitacoes: st.solicitacoesPendentes.length > 0,

      showSolicitacaoModal: st.showSolicitacaoModal,
      closeSolicitacaoModal: () => this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false }),
      viewingSolicitacao: (() => {
        const s = st.solicitacoesPendentes.find(x => x.id === st.viewingSolicitacaoId);
        if (!s) return null;
        return {
          id: s.id,
          departamento: s.acessos ? s.acessos.nome : '—',
          usuario: s.solicitante ? s.solicitante.nome : '—',
          tipoLabel: s.tipo === 'criacao' ? 'Criação' : s.tipo === 'edicao' ? 'Edição' : 'Exclusão',
          dataLabel: new Date(s.criado_em).toLocaleString('pt-BR'),
          isCriacao: s.tipo === 'criacao',
          categoriaAnterior: s.categoria_anterior, categoriaNova: s.categoria,
          tituloAnterior: s.titulo_anterior, tituloNovo: s.titulo,
          conteudoAnterior: s.conteudo_anterior, conteudoNovo: s.conteudo,
          isRejectMode: st.solicitacaoRejectMode,
          rejectMotivo: st.rejectMotivo
        };
      })(),
      aprovarViewing: () => this.aprovarSolicitacaoViewing(),
      startReject: () => this.setState({ solicitacaoRejectMode: true }),
      cancelReject: () => this.setState({ solicitacaoRejectMode: false, rejectMotivo: '' }),
      onRejectMotivoChange: (e) => this.setState({ rejectMotivo: e.target.value }),
      confirmReject: () => this.rejeitarSolicitacaoViewing(),

      toast: st.toast
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
      this.setState({ loginError: e.message, loggingIn: false });
    }
  }

  async logout() {
    this.setState({ userMenuOpen: false });
    try {
      await api.signOut();
    } catch (e) {
      this.showToast('Não foi possível sair: ' + e.message, 'error');
    }
  }

  openCreateMsg() {
    const cats = this.state.categorias.filter(c => c.acesso_id === this.state.activeAcessoId);
    this.setState({ showMsgModal: true, editingMsgId: null, msgForm: { categoria: cats[0] ? cats[0].nome : '', titulo: '', tagInput: '', tags: [], conteudo: '' } });
  }
  openEditMsg(msg) {
    this.setState({ showMsgModal: true, editingMsgId: msg.id, msgForm: { categoria: msg.categoria, titulo: msg.titulo, tagInput: '', tags: [...msg.tags], conteudo: msg.conteudo } });
  }

  isAdminNow(acessoId) {
    const st = this.state;
    if (!st.currentUser) return false;
    if (st.currentUser.profile.role === 'superadmin') return true;
    const entry = st.acessoMembros.find(m => m.acesso_id === acessoId);
    return !!(entry && entry.is_admin_local);
  }
  addMsgTag() {
    const val = this.state.msgForm.tagInput.trim();
    if (!val) return;
    this.setState(s => ({ msgForm: { ...s.msgForm, tags: [...s.msgForm.tags, val], tagInput: '' } }));
  }
  async saveMsg() {
    const f = this.state.msgForm;
    if (!f.titulo.trim() || !f.conteudo.trim()) { this.showToast('Preencha título e conteúdo.', 'error'); return; }
    const wasCreate = !this.state.editingMsgId;
    const acessoId = this.state.activeAcessoId;
    const userId = this.state.currentUser.profile.id;

    if (!this.isAdminNow(acessoId)) {
      try {
        if (wasCreate) {
          await api.solicitarCriacaoMensagem({ acessoId, categoria: f.categoria, titulo: f.titulo, tags: f.tags, conteudo: f.conteudo, userId });
        } else {
          const anterior = this.state.mensagens.find(m => m.id === this.state.editingMsgId);
          await api.solicitarEdicaoMensagem({ acessoId, mensagemId: this.state.editingMsgId, categoria: f.categoria, titulo: f.titulo, tags: f.tags, conteudo: f.conteudo, anterior, userId });
        }
        this.setState({ showMsgModal: false });
        await this.refreshAppData(this.state.currentUser);
        this.showToast('Enviado para aprovação. Um administrador irá revisar.', 'success');
      } catch (e) { this.showToast(e.message, 'error'); }
      return;
    }

    try {
      const saved = await api.saveMensagem({ id: this.state.editingMsgId, acessoId, categoria: f.categoria, titulo: f.titulo, tags: f.tags, conteudo: f.conteudo });
      this.setState({ showMsgModal: false });
      await this.refreshAppData(this.state.currentUser);
      if (wasCreate && saved) {
        navigator.clipboard && navigator.clipboard.writeText(saved.conteudo).catch(() => {});
        this.setState({ appView: 'biblioteca', copiedId: saved.id });
        setTimeout(() => this.setState({ copiedId: null }), 1400);
        this.showToast('Mensagem criada e copiada!', 'success');
      } else {
        this.showToast('Mensagem salva com sucesso!', 'success');
      }
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async deleteMsg(id) {
    try {
      await api.deleteMensagem(id);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Mensagem excluída.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestDeleteMsg(msg) {
    if (this.isAdminNow(msg.acesso_id)) {
      this.requestDelete('Excluir mensagem', `Tem certeza que deseja excluir "${msg.titulo}"? Esta ação não pode ser desfeita.`, () => this.deleteMsg(msg.id));
    } else {
      this.requestDelete('Solicitar exclusão', `Deseja solicitar a exclusão de "${msg.titulo}"? Um administrador precisará aprovar antes que a mensagem seja removida.`, () => this.solicitarExclusaoMsg(msg));
    }
  }
  async solicitarExclusaoMsg(msg) {
    try {
      await api.solicitarExclusaoMensagem({ acessoId: msg.acesso_id, mensagemId: msg.id, anterior: msg, userId: this.state.currentUser.profile.id });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Solicitação de exclusão enviada para aprovação.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }

  async aprovarSolicitacaoViewing() {
    const id = this.state.viewingSolicitacaoId;
    try {
      await api.aprovarSolicitacao(id);
      this.setState({ showSolicitacaoModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Solicitação aprovada.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }

  async rejeitarSolicitacaoViewing() {
    const id = this.state.viewingSolicitacaoId;
    const motivo = this.state.rejectMotivo.trim();
    if (!motivo) { this.showToast('Informe o motivo da rejeição.', 'error'); return; }
    try {
      await api.rejeitarSolicitacao(id, motivo);
      this.setState({ showSolicitacaoModal: false, solicitacaoRejectMode: false, rejectMotivo: '' });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Solicitação rejeitada.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  openEditCat(cat) { this.setState({ showCatModal: true, editingCatId: cat.id, catForm: { nome: cat.nome } }); }
  async saveCat() {
    const nome = this.state.catForm.nome.trim();
    if (!nome) { this.showToast('Informe o nome da categoria.', 'error'); return; }
    try {
      await api.saveCategoria({ id: this.state.editingCatId, acessoId: this.state.activeAcessoId, nome });
      this.setState({ showCatModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Categoria salva.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async deleteCat(id) {
    try {
      await api.deleteCategoria(id);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Categoria excluída.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async saveAcesso() {
    const f = this.state.acessoForm;
    if (!f.nome.trim()) { this.showToast('Informe o nome do Acesso.', 'error'); return; }
    try {
      const created = await api.saveAcesso({ nome: f.nome.trim(), descricao: f.descricao, cor: f.cor });
      this.setState({ showAcessoModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.setState({ activeAcessoId: created.id, adminTab: 'categorias' });
      this.showToast('Acesso criado! Gerencie as categorias e mensagens dele abaixo.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async toggleAcessoStatus(id, currentAtivo) {
    try {
      await api.toggleAcessoStatus(id, !currentAtivo);
      await this.refreshAppData(this.state.currentUser);
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async openUsersModal(acessoId) {
    this.setState({ showUsersModal: true, usersModalAcessoId: acessoId, acessoUsersLoading: true, acessoUsers: [], allProfiles: [], addUserSelectedId: '', resetPasswordResult: null });
    await this.reloadUsersModal(acessoId);
  }
  async reloadUsersModal(acessoId) {
    try {
      const [users, allProfiles] = await Promise.all([api.listAcessoUsers(acessoId), api.listAllProfiles()]);
      this.setState({ acessoUsers: users, allProfiles, acessoUsersLoading: false });
    } catch (e) {
      this.setState({ acessoUsersLoading: false });
      this.showToast(e.message, 'error');
    }
  }
  async addUserToAcesso() {
    const userId = this.state.addUserSelectedId;
    const acessoId = this.state.usersModalAcessoId;
    if (!userId) { this.showToast('Selecione um usuário para vincular.', 'error'); return; }
    try {
      await api.toggleUserLink(userId, acessoId, false);
      this.setState({ addUserSelectedId: '' });
      await this.reloadUsersModal(acessoId);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Usuário vinculado a este acesso.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestUnlinkUser(user) {
    this.requestDelete('Remover vínculo', `Remover ${user.nome} deste Acesso? Ele(a) deixará de ver as mensagens e categorias daqui.`, () => this.unlinkUser(user.userId));
  }
  async unlinkUser(userId) {
    const acessoId = this.state.usersModalAcessoId;
    try {
      await api.toggleUserLink(userId, acessoId, true);
      await this.reloadUsersModal(acessoId);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Usuário removido deste acesso.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async toggleMemberAdminLocal(userId, value) {
    const acessoId = this.state.usersModalAcessoId;
    try {
      await api.toggleUserAdminLocal(userId, acessoId, value);
      await this.reloadUsersModal(acessoId);
      this.showToast(value ? 'Usuário agora é admin deste acesso.' : 'Permissão de admin removida.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestResetPassword(user) {
    this.requestDelete('Redefinir senha', `Gerar uma nova senha temporária para ${user.nome} (${user.email})? A senha atual dele(a) deixará de funcionar.`, () => this.resetUserPassword(user.userId));
  }
  async resetUserPassword(userId) {
    try {
      const result = await api.adminResetPassword(userId);
      if (!result.ok) { this.showToast(result.error || 'Não foi possível redefinir a senha.', 'error'); return; }
      this.setState({ resetPasswordResult: { userId, tempPassword: result.tempPassword } });
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestDelete(title, message, action) { this.setState({ confirm: { open: true, title, message, action } }); }

  /* ---------------- view (template — identical to prototype) ---------------- */

  view(v) {
    if (v.isLoading) {
      const skel = (w, h, extra) => `<div class="dp-skeleton" style="width:${w}; height:${h}; border-radius:8px; ${extra || ''}"></div>`;
      return `
      <div style="min-height:100vh; background:${v.theme.pageBg};">
        <div style="padding:14px 24px; border-bottom:1px solid ${v.theme.border}; background:${v.theme.cardBg};">
          <div style="max-width:1400px; margin:0 auto; display:flex; align-items:center; gap:20px;">
            <img src="assets/dentalplus-logo.png" alt="DentalPlus" style="height:26px; width:auto; opacity:.5; ${v.theme.logoGlow}" />
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
            <img src="assets/dentalplus-logo.png" alt="DentalPlus" width="309" height="52" style="height:48px; width:auto; ${t.logoGlow}" />
          </div>
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:19px; font-weight:800; color:${t.text}; font-family:${t.fontDisplay};">Padrões de atendimento</div>
            <div style="font-size:14px; color:${t.textSecondary}; margin-top:4px;">Acesse com sua conta para continuar</div>
          </div>
          ${v.loginError ? `<div style="background:${t.dangerSoft}; color:${t.danger}; font-size:13px; font-weight:600; padding:10px 14px; border-radius:${t.radiusSm}; margin-bottom:16px;">${esc(v.loginError)}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">E-mail</label>
              <input type="text" autocapitalize="off" autocorrect="off" spellcheck="false" ${v.loggingIn ? 'disabled' : ''} data-focus="loginEmail" placeholder="seuemail@empresa.com" value="${esc(v.loginEmail)}" data-input="${H(v.onLoginEmailChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Senha</label>
              <div style="position:relative;">
                <input type="${v.showLoginPassword ? 'text' : 'password'}" ${v.loggingIn ? 'disabled' : ''} data-focus="loginPassword" placeholder="••••••••" value="${esc(v.loginPassword)}" data-input="${H(v.onLoginPasswordChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 44px 12px 14px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
                <button type="button" data-click="${H(v.onToggleLoginPassword)}" tabindex="-1" aria-label="${v.showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}" title="${v.showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); border:none; background:transparent; color:${t.textSecondary}; cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; border-radius:6px;">${v.showLoginPassword ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`}</button>
              </div>
            </div>
            <button data-click="${H(v.handleLogin)}" ${v.loggingIn ? 'disabled' : ''} style="margin-top:8px; padding:13px; border-radius:${t.radiusSm}; border:none; background:${t.brandGradient}; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:${t.glow}; opacity:${v.loggingIn ? '0.75' : '1'};">${esc(v.loginBtnLabel)}</button>
          </div>
        </div>
      </div>`;
    }

    if (v.isApp) {
      body += `<div style="display:grid; grid-template-columns:262px 1fr; min-height:100vh; align-items:start;" class="dp-app-shell">`
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
    const navIcon = (path) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${path}</svg>`;
    const navItem = (icon, label, active, onClick, badge) => `
      <div role="button" tabindex="0" data-click="${H(onClick)}" style="display:flex; align-items:center; gap:10px; width:100%; border-radius:${t.radiusSm}; padding:10px 12px; font-size:13.5px; font-weight:800; cursor:pointer; transition:background .15s; background:${active ? t.accentSoft : 'transparent'}; color:${active ? t.accent : t.textSecondary}; margin-bottom:2px;">
        <span style="width:3px; height:16px; border-radius:3px; background:${active ? t.accent : 'transparent'}; flex-shrink:0;"></span>${icon}${esc(label)}
        ${badge ? `<span style="margin-left:auto; background:${t.danger}; color:#fff; font-size:10px; font-weight:800; border-radius:999px; padding:2px 8px;">${badge}</span>` : ''}
      </div>`;

    return `
    <aside class="dp-sidebar" style="position:sticky; top:0; height:100vh; display:flex; flex-direction:column; gap:2px; background:${t.cardBg}; border-right:1px solid ${t.border}; padding:20px 14px 16px; overflow:auto;">
      <div role="button" tabindex="0" data-click="${H(v.goBiblioteca)}" style="display:flex; flex-direction:column; gap:2px; padding:2px 8px 18px; cursor:pointer;">
        <img src="assets/dentalplus-logo.png" alt="DentalPlus" width="160" height="26" style="height:24px; width:auto; ${t.logoGlow}" />
        <span style="font-size:11px; color:${t.textTertiary}; font-weight:700;">Padrões de atendimento</span>
      </div>
      ${navItem(navIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'), 'Biblioteca', v.isLib, v.goBiblioteca)}
      ${navItem(navIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'), 'Visão geral', v.isOver, v.goVisaoGeral)}
      ${v.isAdminNow ? navItem(navIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), 'Administração', v.isAdminView, v.goAdmin, v.isSuperAdmin && v.solicitacoesCount > 0 ? v.solicitacoesCount : null) : ''}
      <div style="font-size:10.5px; font-weight:800; letter-spacing:1.4px; color:${t.textTertiary}; padding:18px 10px 8px;">CATEGORIAS</div>
      <div role="button" tabindex="0" data-click="${H(v.setCategoryAll)}" style="display:flex; align-items:center; gap:10px; width:100%; border-radius:${t.radiusSm}; padding:8px 12px; font-size:13px; font-weight:700; cursor:pointer; background:${v.chipAllActive ? t.inputBg : 'transparent'}; color:${v.chipAllActive ? t.text : t.textSecondary}; box-shadow:${v.chipAllActive ? `inset 0 0 0 1px ${t.border2}` : 'none'}; margin-bottom:2px;">
        <span style="width:8px; height:8px; border-radius:50%; background:${t.textTertiary}; flex-shrink:0;"></span>Todas<span style="margin-left:auto; font-size:11px; font-weight:700; color:${t.textTertiary};">${v.chipAllCount}</span>
      </div>
      ${v.categoriaChips.map(chip => `
        <div role="button" tabindex="0" data-click="${H(chip.onClick)}" style="display:flex; align-items:center; gap:10px; width:100%; border-radius:${t.radiusSm}; padding:8px 12px; font-size:13px; font-weight:700; cursor:pointer; background:${chip.active ? t.inputBg : 'transparent'}; color:${chip.active ? t.text : t.textSecondary}; box-shadow:${chip.active ? `inset 0 0 0 1px ${t.border2}` : 'none'}; margin-bottom:2px;">
          <span style="width:8px; height:8px; border-radius:50%; background:${chip.color}; flex-shrink:0;"></span>${esc(chip.nome)}<span style="margin-left:auto; font-size:11px; font-weight:700; color:${t.textTertiary};">${chip.count}</span>
        </div>`).join('')}
      <div style="flex:1;"></div>
      <div style="border-top:1px solid ${t.border}; padding-top:12px; display:flex; flex-direction:column; gap:8px;">
        <button data-click="${H(v.toggleDarkMode)}" style="display:flex; align-items:center; gap:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.textSecondary}; border-radius:${t.radiusSm}; padding:9px 12px; font-size:13px; font-weight:700; cursor:pointer;">${v.darkModeIcon} Alternar tema</button>
        <div style="display:flex; align-items:center; gap:10px; padding:4px;">
          <div style="width:32px; height:32px; border-radius:${t.radiusSm}; background:${t.brandGradient}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; flex-shrink:0;">${esc(v.currentUser.iniciais)}</div>
          <div style="flex:1; min-width:0; line-height:1.15;">
            <div style="font-size:13px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(v.currentUser.nome)}</div>
            <div style="font-size:11px; color:${t.textTertiary};">${esc(v.currentUser.perfilLabel)}</div>
          </div>
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
    <header style="position:sticky; top:0; z-index:40; background:${t.panel}; ${t.glassEffect} border-bottom:1px solid ${t.border}; padding:14px 28px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <h1 style="margin:0; font-size:20px; font-weight:800; letter-spacing:-0.4px; font-family:${t.fontDisplay};">${esc(v.pageTitle)}</h1>
      ${v.showAcessoSelector ? `
        <select data-change="${H(v.onChangeActiveAcesso)}" style="padding:8px 12px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-weight:700; font-family:inherit;">
          ${v.userAcessosOptions.map(opt => `<option value="${esc(opt.id)}" ${opt.id === v.activeAcessoId ? 'selected' : ''}>${esc(opt.nome)}</option>`).join('')}
        </select>` : ''}
      <div style="flex:1;"></div>
      ${showLibraryTools ? `
        <div style="position:relative; width:min(360px,100%);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${t.textTertiary}" stroke-width="2.2" stroke-linecap="round" style="position:absolute; left:13px; top:50%; transform:translateY(-50%);"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input data-ref="${H(v.searchInputRef)}" data-focus="search" type="text" placeholder="Buscar mensagem, tag, categoria…  ( / )" value="${esc(v.searchQuery)}" data-input="${H(v.onSearchChange)}" style="width:100%; padding:10px 14px 10px 36px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13.5px; font-family:inherit;" />
        </div>
        <button data-click="${H(v.openPalette)}" title="Busca rápida" style="border:1px solid ${t.border}; background:${t.cardBg}; color:${t.textSecondary}; border-radius:${t.radiusSm}; padding:9px 12px; font-size:11px; font-weight:700; cursor:pointer;">${esc(v.shortcutLabel)}</button>
        <button data-click="${H(v.openCreateMsg)}" style="display:flex; align-items:center; gap:7px; border:0; border-radius:${t.radiusSm}; background:${t.brandGradient}; color:#fff; font-weight:800; font-size:13.5px; padding:11px 18px; cursor:pointer; box-shadow:${t.glow};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nova mensagem
        </button>` : ''}
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
      search: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`
    };
  }

  viewLibrary(v, t, H) {
    const ic = App.icons(t);
    const actionBtn = (icon, onClick, label, danger) => `<button data-click="${H(onClick)}" title="${esc(label)}" aria-label="${esc(label)}" style="width:30px; height:30px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:transparent; color:${danger ? t.danger : t.textSecondary}; cursor:pointer; display:flex; align-items:center; justify-content:center;">${icon}</button>`;

    const card = (m) => `
      <div data-key="${esc(m.id)}" class="dp-card" style="position:relative; overflow:hidden; background:${t.cardBg}; border:1px solid ${m.borderColor}; border-radius:${t.radiusLg}; padding:${v.cardPadding}; display:flex; flex-direction:column; gap:10px; box-shadow:${t.shadowMd}; break-inside:avoid; margin-bottom:${v.cardGap}px;">
        <span style="position:absolute; top:0; left:0; height:3px; border-radius:0 3px 3px 0; width:${m.heatWidth}%; background:${t.brandGradient}; opacity:${m.frequencia ? .85 : 0};"></span>
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            ${this.avatarIcon(m.catIcon, m.catColor, 26)}
            <div style="font-size:11px; font-weight:700; color:${t.textSecondary};">${esc(m.categoria)}</div>
          </div>
          <button data-click="${H(m.onToggleFav)}" aria-label="${m.isFav ? 'Remover dos favoritos' : 'Favoritar'}" style="border:none; background:transparent; cursor:pointer; color:${m.favColor}; line-height:1; display:flex;">${ic.star(m.isFav)}</button>
        </div>
        <div style="font-size:15.5px; font-weight:700; color:${t.text}; letter-spacing:-0.2px;">${m.titleSegments.map(seg => `<span style="${seg.style}">${esc(seg.text)}</span>`).join('')}</div>
        <div style="font-size:13.5px; color:${t.textSecondary}; line-height:1.55; white-space:pre-line; word-break:break-word; overflow-wrap:break-word; max-width:100%; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${esc(m.displayContent)}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${m.tagChips.map(tag => `<button data-click="${H(tag.onClick)}" style="border:0; background:${t.accentSoft}; color:${t.accent}; font-size:11.5px; font-weight:700; border-radius:999px; padding:3px 10px; cursor:pointer;">#${esc(tag.label)}</button>`).join('')}
        </div>
        <div style="margin-top:auto; border-top:1px solid ${t.border}; padding-top:10px; display:flex; align-items:center; gap:6px;">
          <span style="font-size:11.5px; color:${t.textTertiary}; font-weight:700;">usada ${esc(m.frequencia)}x</span>
          <span style="flex:1;"></span>
          ${actionBtn(ic.eye, m.onPreview, 'Visualizar')}
          ${actionBtn(ic.edit, m.onEdit, 'Editar')}
          ${actionBtn(ic.trash, m.onDelete, 'Excluir', true)}
          <button data-click="${H(m.onCopy)}" style="display:flex; align-items:center; gap:6px; border:none; background:${m.copyBtnBg}; color:#fff; font-size:12.5px; font-weight:700; padding:7px 13px; border-radius:${t.radiusSm}; cursor:pointer;">${m.copied ? ic.check : ic.clipboard}${esc(m.copyLabel)}</button>
        </div>
      </div>`;

    const row = (m) => `
      <div data-key="${esc(m.id)}" style="display:flex; align-items:center; gap:14px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; padding:12px 16px; margin-bottom:8px;">
        ${this.avatarIcon(m.catIcon, m.catColor, 32)}
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.titleSegments.map(seg => `<span style="${seg.style}">${esc(seg.text)}</span>`).join('')}</div>
          <div style="font-size:12px; color:${t.textTertiary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.categoria)} · usada ${esc(m.frequencia)}x</div>
        </div>
        <button data-click="${H(m.onToggleFav)}" aria-label="${m.isFav ? 'Remover dos favoritos' : 'Favoritar'}" style="border:none; background:transparent; cursor:pointer; color:${m.favColor}; display:flex; flex-shrink:0;">${ic.star(m.isFav)}</button>
        ${actionBtn(ic.eye, m.onPreview, 'Visualizar')}
        ${actionBtn(ic.edit, m.onEdit, 'Editar')}
        ${actionBtn(ic.trash, m.onDelete, 'Excluir', true)}
        <button data-click="${H(m.onCopy)}" style="display:flex; align-items:center; gap:6px; border:none; background:${m.copyBtnBg}; color:#fff; font-size:12.5px; font-weight:700; padding:7px 13px; border-radius:${t.radiusSm}; cursor:pointer; flex-shrink:0;">${m.copied ? ic.check : ic.clipboard}${esc(m.copyLabel)}</button>
      </div>`;

    const viewBtn = (active, onClick, path) => `<button data-click="${H(onClick)}" style="border:0; border-radius:8px; padding:6px 10px; cursor:pointer; display:flex; align-items:center; justify-content:center; background:${active ? t.cardBg : 'transparent'}; color:${active ? t.text : t.textTertiary}; box-shadow:${active ? t.shadowSm : 'none'};"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${path}</svg></button>`;

    return `
    <main data-key="view-library" class="dp-view-enter" style="padding:22px 28px 60px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
        <div style="font-weight:800; font-size:14px; color:${t.textSecondary};">${esc(v.resultsCountLabel)}</div>
        <div style="flex:1;"></div>
        <select data-change="${H(v.onLibrarySortChange)}" style="padding:8px 12px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.cardBg}; color:${t.textSecondary}; font-size:13px; font-weight:700; font-family:inherit; cursor:pointer;">
          <option value="relevance" ${v.librarySort === 'relevance' ? 'selected' : ''}>Favoritas primeiro</option>
          <option value="used" ${v.librarySort === 'used' ? 'selected' : ''}>Mais usadas</option>
          <option value="az" ${v.librarySort === 'az' ? 'selected' : ''}>A → Z</option>
        </select>
        <div style="display:flex; gap:3px; background:${t.inputBg}; border:1px solid ${t.border}; border-radius:${t.radiusSm}; padding:3px;">
          ${viewBtn(v.isGridView, v.setGridView, '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')}
          ${viewBtn(v.isListView, v.setListView, '<path d="M4 6h16M4 12h16M4 18h16"/>')}
        </div>
      </div>
      ${v.hasResults
        ? (v.isGridView ? `<div style="${v.gridStyle}">${v.cardList.map(card).join('')}</div>` : `<div>${v.cardList.map(row).join('')}</div>`)
        : `<div style="text-align:center; padding:70px 20px; color:${t.textTertiary};">
            <div style="display:flex; justify-content:center; margin-bottom:12px;">${ic.search}</div>
            <div style="font-weight:800; font-size:17px; color:${t.textSecondary};">Nenhuma mensagem encontrada</div>
            <div style="font-size:14px; margin-top:5px;">Ajuste a busca ou os filtros de categoria.</div>
          </div>`}
    </main>`;
  }

  viewVisaoGeral(v, t, H) {
    const ic = App.icons(t);
    const panelHeader = (icon, label, bg, color) => `<div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;"><span style="width:34px; height:34px; border-radius:11px; background:${bg}; color:${color}; display:flex; align-items:center; justify-content:center;">${icon}</span><span style="font-weight:700; font-size:16px; font-family:${t.fontDisplay};">${esc(label)}</span></div>`;
    const rankRow = (m) => `
      <div style="display:flex; align-items:center; gap:12px; background:${t.inputBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; padding:11px 14px;">
        <span style="width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; flex-shrink:0; background:${m.rankColor}2E; color:${m.rankColor};">${m.rank}</span>
        <span style="flex:1; min-width:0;">
          <span style="display:block; font-weight:800; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.titulo)}</span>
          <span style="display:flex; align-items:center; gap:8px; margin-top:5px;">
            <span style="flex:1; height:5px; border-radius:5px; background:${t.border}; overflow:hidden; display:block;"><span style="display:block; height:100%; width:${m.barWidth}%; border-radius:5px; background:${t.brandGradient};"></span></span>
            <span style="font-size:11px; color:${t.textTertiary}; font-weight:800; white-space:nowrap;">${esc(m.usedLabel)}</span>
          </span>
        </span>
        <button data-click="${H(m.onCopy)}" style="flex-shrink:0; border:none; background:${m.copied ? t.ok : t.brand}; color:#fff; font-size:11px; font-weight:700; padding:6px 12px; border-radius:9px; cursor:pointer;">${esc(m.copyLabel)}</button>
      </div>`;
    const plainRow = (m) => `
      <div style="display:flex; align-items:center; gap:12px; background:${t.inputBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; padding:11px 14px;">
        ${this.avatarIcon(m.catIcon, m.catColor, 30)}
        <span style="flex:1; min-width:0;">
          <span style="display:block; font-weight:800; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.titulo)}</span>
          <span style="display:block; font-size:11.5px; color:${t.textTertiary}; font-weight:700;">${esc(m.categoria)}</span>
        </span>
        <button data-click="${H(m.onCopy)}" style="flex-shrink:0; border:none; background:${m.copied ? t.ok : t.brand}; color:#fff; font-size:11px; font-weight:700; padding:6px 12px; border-radius:9px; cursor:pointer;">${esc(m.copyLabel)}</button>
      </div>`;
    const favTile = (m) => `
      <button data-click="${H(m.onCopy)}" title="Clique para copiar" style="display:flex; align-items:center; gap:11px; border:1px solid ${m.copied ? t.ok : t.border}; background:${t.inputBg}; border-radius:${t.radiusMd}; padding:11px 13px; cursor:pointer; text-align:left;">
        ${this.avatarIcon(m.catIcon, m.catColor, 28)}
        <span style="flex:1; min-width:0;">
          <span style="display:block; font-weight:800; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${t.text};">${esc(m.titulo)}</span>
          <span style="display:block; font-size:11px; color:${t.textTertiary}; font-weight:700;">${esc(m.categoria)}</span>
        </span>
        <span style="width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:${m.copied ? t.ok : t.brand}; color:#fff;">${m.copied ? ic.check : ic.clipboard}</span>
      </button>`;

    return `
    <main data-key="view-visaogeral" class="dp-view-enter" style="padding:22px 28px 60px; display:flex; flex-direction:column; gap:18px;">
      <div style="background:${t.brandGradient}; border-radius:${t.radiusXl}; padding:24px 28px; color:#fff; display:flex; align-items:center; gap:20px; flex-wrap:wrap; box-shadow:${t.glow};">
        <div style="flex:1; min-width:220px;">
          <div style="font-family:${t.fontDisplay}; font-weight:800; font-size:22px; letter-spacing:-0.4px;">${esc(v.heroGreeting)}</div>
          <div style="font-size:13.5px; opacity:.85; margin-top:4px;">Copie sua mensagem em segundos — favoritas e mais usadas estão a um clique.</div>
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          ${v.heroStats.map(h => `
            <div style="text-align:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:14px; padding:10px 20px;">
              <div style="font-family:${t.fontDisplay}; font-weight:800; font-size:23px; letter-spacing:-0.4px;">${h.value}</div>
              <div style="font-size:10.5px; font-weight:800; letter-spacing:1px; opacity:.85;">${esc(h.label)}</div>
            </div>`).join('')}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; align-items:start;">
        <section style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusXl}; padding:22px; box-shadow:${t.shadowMd};">
          ${panelHeader(ic.fire, 'Mais usadas', '#E8A10B26', '#E8A10B')}
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${v.mostUsedList.length ? v.mostUsedList.map(rankRow).join('') : `<div style="font-size:13px; color:${t.textTertiary};">Nenhuma mensagem usada ainda.</div>`}
          </div>
        </section>
        <section style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusXl}; padding:22px; box-shadow:${t.shadowMd};">
          ${panelHeader(ic.clock, 'Recentes', t.accentSoft, t.accent)}
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${v.hasRecent ? v.recentList.map(plainRow).join('') : `<div style="color:${t.textTertiary}; font-size:13px; text-align:center; border:1px dashed ${t.border}; border-radius:${t.radiusMd}; padding:20px;">Copie uma mensagem e ela aparece aqui.</div>`}
          </div>
        </section>
      </div>

      <section style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusXl}; padding:22px; box-shadow:${t.shadowMd};">
        ${panelHeader(App.icons(t).star ? App.icons(t).star(true, '#8B5CF6') : '', 'Favoritas — copie com 1 clique', 'rgba(139,92,246,.14)', '#8B5CF6')}
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px;">
          ${v.hasFav ? v.favList.map(favTile).join('') : `<div style="grid-column:1/-1; color:${t.textTertiary}; font-size:13px; text-align:center; border:1px dashed ${t.border}; border-radius:${t.radiusMd}; padding:20px;">Marque mensagens com a estrela para vê-las aqui.</div>`}
        </div>
      </section>
    </main>`;
  }

  viewAdmin(v, t, H) {
    const cols = '150px 1.1fr 1.5fr 80px 150px';
    let content = '';

    if (v.isAdminMsgs) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
          <div style="font-size:19px; font-weight:800; font-family:${t.fontDisplay};">Mensagens</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <input type="text" data-focus="adminSearch" placeholder="Buscar…" value="${esc(v.adminSearchQuery)}" data-input="${H(v.onAdminSearchChange)}" style="padding:9px 12px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            <button data-click="${H(v.openCreateMsg)}" style="border:none; background:${t.brandGradient}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:${t.radiusSm}; cursor:pointer; box-shadow:${t.glow};">+ Nova mensagem</button>
          </div>
        </div>
        <div class="dp-table-scroll">
          <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; overflow:hidden; min-width:760px; box-shadow:${t.shadowMd};">
            <div style="display:grid; grid-template-columns:${cols}; gap:12px; padding:13px 20px; font-size:11px; font-weight:800; color:${t.textTertiary}; letter-spacing:1px; text-transform:uppercase;">
              <div>Categoria</div><div>Título</div><div>Conteúdo</div><div>Freq.</div><div style="text-align:right;">Ações</div>
            </div>
            ${v.adminMsgRows.map(row => `
              <div data-key="${esc(row.id)}" style="display:grid; grid-template-columns:${cols}; gap:12px; padding:12px 20px; font-size:13.5px; border-top:1px solid ${t.border}; align-items:center;">
                <div style="font-weight:700; color:${t.accent};">${esc(row.categoria)}</div>
                <div style="font-weight:800;">${esc(row.titulo)}</div>
                <div style="color:${t.textSecondary}; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(row.conteudo)}</div>
                <div style="color:${t.textSecondary}; font-weight:700;">${esc(row.frequencia)}</div>
                <div style="display:flex; gap:6px; justify-content:flex-end;">
                  <button data-click="${H(row.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:12px; font-weight:700; padding:6px 12px; border-radius:${t.radiusSm}; cursor:pointer;">Editar</button>
                  <button data-click="${H(row.onDelete)}" style="border:none; background:${t.dangerSoft}; color:${t.danger}; font-size:12px; font-weight:700; padding:6px 12px; border-radius:${t.radiusSm}; cursor:pointer;">Excluir</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    } else if (v.isAdminCats) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:19px; font-weight:800; font-family:${t.fontDisplay};">Categorias de situação</div>
          <button data-click="${H(v.openCreateCat)}" style="border:none; background:${t.brandGradient}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:${t.radiusSm}; cursor:pointer; box-shadow:${t.glow};">+ Nova categoria</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${v.catRows.map(cat => `
            <div data-key="${esc(cat.id)}" class="dp-row-card" style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusMd}; padding:14px 18px; box-shadow:${t.shadowSm};">
              <div>
                <div style="font-weight:800; font-size:14.5px;">${esc(cat.nome)}</div>
                <div style="font-size:12px; color:${t.textTertiary};">${esc(cat.countLabel)}</div>
              </div>
              <div style="display:flex; gap:6px;">
                <button data-click="${H(cat.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:12px; font-weight:700; padding:7px 12px; border-radius:${t.radiusSm}; cursor:pointer;">Editar</button>
                <button data-click="${H(cat.onDelete)}" style="border:none; background:${t.dangerSoft}; color:${t.danger}; font-size:12px; font-weight:700; padding:7px 12px; border-radius:${t.radiusSm}; cursor:pointer;">Excluir</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminAcessos) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:19px; font-weight:800; font-family:${t.fontDisplay};">Acessos</div>
          <button data-click="${H(v.openCreateAcesso)}" style="border:none; background:${t.brandGradient}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:${t.radiusSm}; cursor:pointer; box-shadow:${t.glow};">+ Novo Acesso</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${v.acessoRows.map(a => `
            <div data-key="${esc(a.id)}" class="dp-row-card" style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; padding:18px 20px; box-shadow:${t.shadowMd};">
              <div style="display:flex; align-items:center; gap:14px;">
                ${this.avatarSquare(a.initial, a.cor, 40)}
                <div>
                  <div style="font-weight:800; font-size:15px;">${esc(a.nome)}</div>
                  <div style="font-size:12px; color:${t.textTertiary}; margin-top:2px;">${esc(a.statsLabel)}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="font-size:11px; font-weight:800; padding:6px 14px; border-radius:999px; background:${a.statusBg}; color:${a.statusColor};">${esc(a.statusLabel)}</div>
                <button data-click="${H(a.onUsers)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:12px; font-weight:700; padding:8px 14px; border-radius:${t.radiusSm}; cursor:pointer;">Usuários</button>
                <button data-click="${H(a.onToggleStatus)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:12px; font-weight:700; padding:8px 14px; border-radius:${t.radiusSm}; cursor:pointer;">${esc(a.toggleLabel)}</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminSolicitacoes) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:19px; font-weight:800; font-family:${t.fontDisplay};">Solicitações de Aprovação</div>
        </div>
        ${v.hasSolicitacoes ? `
        <div class="dp-table-scroll">
          <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; overflow:hidden; min-width:640px; box-shadow:${t.shadowMd};">
            <div style="display:grid; grid-template-columns:1fr 1fr 120px 180px 100px; gap:10px; padding:13px 20px; font-size:11px; font-weight:800; color:${t.textTertiary}; letter-spacing:1px; text-transform:uppercase;">
              <div>Departamento</div><div>Usuário</div><div>Tipo</div><div>Data</div><div>Ações</div>
            </div>
            ${v.solicitacaoRows.map(row => `
              <div data-key="${esc(row.id)}" style="display:grid; grid-template-columns:1fr 1fr 120px 180px 100px; gap:10px; padding:12px 20px; font-size:13.5px; border-top:1px solid ${t.border}; align-items:center;">
                <div style="font-weight:800;">${esc(row.departamento)}</div>
                <div>${esc(row.usuario)}</div>
                <div style="color:${t.textSecondary};">${esc(row.tipoLabel)}</div>
                <div style="color:${t.textTertiary}; font-size:12px;">${esc(row.dataLabel)}</div>
                <div><button data-click="${H(row.onOpen)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:12px; font-weight:700; padding:6px 12px; border-radius:${t.radiusSm}; cursor:pointer;">Analisar</button></div>
              </div>`).join('')}
          </div>
        </div>` : `
        <div style="text-align:center; padding:60px 20px; background:${t.cardBg}; border:1px dashed ${t.border}; border-radius:${t.radiusLg};">
          <div style="font-size:16px; font-weight:800; color:${t.text};">Nenhuma solicitação pendente</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-top:6px;">Quando um usuário criar, editar ou pedir exclusão de uma mensagem, aparecerá aqui.</div>
        </div>`}`;
    }

    const navIcon = (path) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${path}</svg>`;
    const iconMsgs = navIcon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>');
    const iconCats = navIcon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>');
    const iconAcessos = navIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
    const iconSolic = navIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/>');

    return `
    <main data-key="view-admin" class="dp-admin-layout dp-view-enter" style="padding:22px 28px 60px; display:flex; gap:24px; align-items:flex-start;">
      <div class="dp-admin-sidebar" role="tablist" aria-label="Seções do painel administrativo" style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; padding:14px; position:sticky; top:88px;">
        <div role="tab" tabindex="0" aria-selected="${v.isAdminMsgs}" data-click="${H(v.setAdminTabMsgs)}" style="display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:999px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:6px; background:${v.tabMsgsBg}; color:${v.tabMsgsColor};">${iconMsgs}Mensagens</div>
        <div role="tab" tabindex="0" aria-selected="${v.isAdminCats}" data-click="${H(v.setAdminTabCats)}" style="display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:999px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:6px; background:${v.tabCatsBg}; color:${v.tabCatsColor};">${iconCats}Categorias</div>
        ${v.isSuperAdmin ? `<div role="tab" tabindex="0" aria-selected="${v.isAdminAcessos}" data-click="${H(v.setAdminTabAcessos)}" style="display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:999px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:6px; background:${v.tabAcessosBg}; color:${v.tabAcessosColor};">${iconAcessos}Acessos</div>` : ''}
        ${v.isSuperAdmin ? `<div role="tab" tabindex="0" aria-selected="${v.isAdminSolicitacoes}" data-click="${H(v.setAdminTabSolicitacoes)}" style="display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:999px; cursor:pointer; font-size:14px; font-weight:700; background:${v.tabSolicitacoesBg}; color:${v.tabSolicitacoesColor};">${iconSolic}${esc(v.solicitacoesTabLabel)}</div>` : ''}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:${t.textTertiary}; margin-bottom:14px;">Operando em: <span style="color:${t.accent};">${esc(v.activeAcesso.nome)}</span></div>
        ${content}
      </div>
    </main>`;
  }

  viewModals(v, t, H) {
    let out = '';
    const stay = H(() => {});

    if (v.showMsgModal) {
      out += `
      <div role="presentation" data-click="${H(v.closeMsgModal)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="${esc(v.msgModalTitle)}" data-click="${stay}" style="width:100%; max-width:520px; background:${t.modalSolidBg}; border-radius:16px; padding:28px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:18px;">${esc(v.msgModalTitle)}</div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Categoria / Situação</label>
              <select data-change="${H(v.onMsgCategoriaChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;">
                ${v.categorias.map(c => `<option value="${esc(c.nome)}" ${c.nome === v.msgForm.categoria ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Título (máx. 100 caracteres)</label>
              <input type="text" data-focus="msgTitulo" maxlength="100" value="${esc(v.msgForm.titulo)}" data-input="${H(v.onMsgTituloChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Tags</label>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                ${v.msgFormTagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.text}; background:${t.pageBg}; padding:5px 10px; border-radius:999px; display:flex; align-items:center; gap:6px;">${esc(tag.label)}<span role="button" tabindex="0" aria-label="Remover tag ${esc(tag.label)}" data-click="${H(tag.onRemove)}" style="cursor:pointer; color:${t.textSecondary};">×</span></div>`).join('')}
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" data-focus="msgTagInput" placeholder="adicionar tag e Enter" value="${esc(v.msgForm.tagInput)}" data-input="${H(v.onMsgTagInputChange)}" data-keydown="${H(v.onMsgTagKeyDown)}" style="flex:1; padding:9px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
                <button data-click="${H(v.addMsgTag)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:12px; font-weight:700; padding:0 14px; border-radius:8px; cursor:pointer;">Add</button>
              </div>
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Conteúdo (${esc(v.msgContentCount)}/2000)</label>
              <textarea data-focus="msgConteudo" maxlength="2000" rows="5" data-input="${H(v.onMsgConteudoChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit; resize:vertical;">${esc(v.msgForm.conteudo)}</textarea>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
            <button data-click="${H(v.closeMsgModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveMsg)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Salvar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showCatModal) {
      out += `
      <div role="presentation" data-click="${H(v.closeCatModal)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="${esc(v.catModalTitle)}" data-click="${stay}" style="width:100%; max-width:400px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:16px;">${esc(v.catModalTitle)}</div>
          <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Nome da categoria</label>
          <input type="text" data-focus="catNome" value="${esc(v.catForm.nome)}" data-input="${H(v.onCatNomeChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button data-click="${H(v.closeCatModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveCat)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Salvar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showAcessoModal) {
      out += `
      <div role="presentation" data-click="${H(v.closeAcessoModal)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="Novo Acesso" data-click="${stay}" style="width:100%; max-width:420px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:16px;">Novo Acesso</div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Nome do Acesso</label>
              <input type="text" data-focus="acessoNome" placeholder="ex: Financeiro" value="${esc(v.acessoForm.nome)}" data-input="${H(v.onAcessoNomeChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Descrição (opcional)</label>
              <input type="text" data-focus="acessoDesc" value="${esc(v.acessoForm.descricao)}" data-input="${H(v.onAcessoDescChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:8px;">Cor de identificação</label>
              <div style="display:flex; gap:8px;">
                ${v.acessoColorOptions.map(c => `<div role="button" tabindex="0" aria-label="Selecionar cor ${esc(c.value)}" data-click="${H(c.onSelect)}" style="width:30px; height:30px; border-radius:8px; background:${c.value}; cursor:pointer; border:${c.border};"></div>`).join('')}
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button data-click="${H(v.closeAcessoModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveAcesso)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Criar Acesso</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showUsersModal) {
      out += `
      <div role="presentation" data-click="${H(v.closeUsersModal)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="Usuários vinculados" data-click="${stay}" style="width:100%; max-width:520px; max-height:90vh; overflow-y:auto; background:${t.modalSolidBg}; border-radius:16px; padding:18px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:16px; font-weight:800; margin-bottom:2px;">Usuários vinculados</div>
          <div style="font-size:12px; color:${t.textSecondary}; margin-bottom:12px;">${esc(v.usersModalAcessoNome)}</div>
          ${v.acessoUsersLoading
            ? `<div style="font-size:13px; color:${t.textSecondary};">Carregando…</div>`
            : `
              ${v.usersModalRows.length === 0
                ? `<div style="font-size:13px; color:${t.textSecondary}; margin-bottom:12px;">Nenhum usuário vinculado a este acesso ainda.</div>`
                : `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                    ${v.usersModalRows.map(u => `
                      <div data-key="${esc(u.userId)}" style="background:${t.pageBg}; border:1px solid ${t.border}; border-radius:${t.radiusSm}; padding:10px 12px;">
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px;">
                          <div style="min-width:0;">
                            <div style="font-weight:700; font-size:13px;">${esc(u.nome)}</div>
                            <div style="font-size:11px; color:${t.textSecondary}; overflow:hidden; text-overflow:ellipsis;">${esc(u.email)} · ${esc(u.roleLabel)}</div>
                          </div>
                          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; flex-shrink:0;">
                            <button data-click="${H(u.onToggleAdmin)}" style="border:1px solid ${t.border}; background:${u.isAdminLocal ? t.navy : 'transparent'}; color:${u.isAdminLocal ? '#fff' : t.text}; font-size:10px; font-weight:700; padding:5px 8px; border-radius:5px; cursor:pointer; white-space:nowrap;">${u.isAdminLocal ? 'Sem admin' : 'Admin local'}</button>
                            <button data-click="${H(u.onResetPassword)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:10px; font-weight:700; padding:5px 8px; border-radius:5px; cursor:pointer; white-space:nowrap;">Redefinir</button>
                            <button data-click="${H(u.onUnlink)}" style="grid-column:1 / -1; border:none; background:#FEE2E2; color:#B91C1C; font-size:10px; font-weight:700; padding:5px 8px; border-radius:5px; cursor:pointer;">Remover deste acesso</button>
                          </div>
                        </div>
                        ${u.justReset ? `
                          <div style="padding:8px 10px; background:#DCFCE7; border-radius:6px;">
                            <div style="font-size:10px; font-weight:800; color:#166534; text-transform:uppercase; margin-bottom:2px;">Senha temporária (copie agora)</div>
                            <div style="font-family:monospace; font-size:13px; font-weight:700; color:#14532D; user-select:all;">${esc(u.justReset)}</div>
                          </div>` : ''}
                      </div>`).join('')}
                  </div>`}
              <div style="border-top:1px solid ${t.border}; padding-top:10px;">
                <div style="font-size:11px; font-weight:700; color:${t.textSecondary}; margin-bottom:6px; text-transform:uppercase;">Adicionar usuário</div>
                <div style="display:flex; gap:6px;">
                  <select data-change="${H(v.onAddUserSelectChange)}" style="flex:1; padding:8px 8px; border-radius:6px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:12px; font-family:inherit;">
                    <option value="">Selecione…</option>
                    ${v.addUserOptions.map(p => `<option value="${esc(p.id)}" ${p.id === v.addUserSelectedId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
                  </select>
                  <button data-click="${H(v.addUserToAcesso)}" style="border:none; background:${t.navy}; color:#fff; font-size:12px; font-weight:700; padding:0 12px; border-radius:6px; cursor:pointer; white-space:nowrap;">Vincular</button>
                </div>
              </div>`}
          <div style="display:flex; justify-content:flex-end; margin-top:12px;">
            <button data-click="${H(v.closeUsersModal)}" style="padding:8px 16px; border-radius:6px; border:none; background:${t.navy}; color:#fff; font-size:12px; font-weight:700; cursor:pointer;">Concluir</button>
          </div>
        </div>
      </div>`;
    }

    if (v.confirm.open) {
      out += `
      <div role="presentation" data-click="${H(v.closeConfirm)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:110; padding:20px;">
        <div role="alertdialog" aria-modal="true" aria-label="${esc(v.confirm.title)}" data-click="${stay}" style="width:100%; max-width:380px; background:${t.cardBg}; border-radius:16px; padding:24px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:16px; font-weight:800; margin-bottom:8px;">${esc(v.confirm.title)}</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:20px; line-height:1.5;">${esc(v.confirm.message)}</div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button data-click="${H(v.closeConfirm)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.runConfirm)}" style="padding:9px 16px; border-radius:${t.radiusSm}; border:none; background:${t.danger}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showSolicitacaoModal && v.viewingSolicitacao) {
      const s = v.viewingSolicitacao;
      const field = (label, before, after) => `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px; font-weight:800; color:${t.textSecondary}; text-transform:uppercase; margin-bottom:4px;">${esc(label)}</div>
          <div style="display:grid; grid-template-columns:${s.isCriacao ? '1fr' : '1fr 1fr'}; gap:10px;">
            ${s.isCriacao ? '' : `<div style="background:${t.pageBg}; border:1px solid ${t.border}; border-radius:8px; padding:8px 10px; font-size:13px; color:${t.textSecondary}; white-space:pre-wrap;">${esc(before || '—')}</div>`}
            ${after != null ? `<div style="background:${t.pageBg}; border:1px solid ${t.border}; border-radius:8px; padding:8px 10px; font-size:13px; white-space:pre-wrap;">${esc(after)}</div>` : ''}
          </div>
        </div>`;
      out += `
      <div role="presentation" data-click="${H(v.closeSolicitacaoModal)}" style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:110; padding:20px;">
        <div role="dialog" aria-modal="true" aria-label="Solicitação de ${esc(s.tipoLabel)}" data-click="${stay}" style="width:100%; max-width:560px; max-height:85vh; overflow-y:auto; background:${t.modalSolidBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:4px;">Solicitação de ${esc(s.tipoLabel)}</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:18px;">${esc(s.departamento)} · ${esc(s.usuario)} · ${esc(s.dataLabel)}</div>
          ${s.tipoLabel === 'Exclusão' ? `
            <div style="font-size:13px; margin-bottom:10px;">Mensagem a ser excluída:</div>
            ${field('Título', s.tituloAnterior, null)}
            ${field('Conteúdo', s.conteudoAnterior, null)}
          ` : `
            ${!s.isCriacao ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:6px;">
              <div style="font-size:11px; font-weight:800; color:${t.textSecondary}; text-transform:uppercase;">Antes</div>
              <div style="font-size:11px; font-weight:800; color:${t.textSecondary}; text-transform:uppercase;">Depois</div>
            </div>` : ''}
            ${field('Categoria', s.categoriaAnterior, s.categoriaNova)}
            ${field('Título', s.tituloAnterior, s.tituloNovo)}
            ${field('Conteúdo', s.conteudoAnterior, s.conteudoNovo)}
          `}
          ${s.isRejectMode ? `
            <div style="margin-top:8px;">
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Motivo da rejeição</label>
              <textarea data-input="${H(v.onRejectMotivoChange)}" rows="3" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit; resize:vertical;">${esc(s.rejectMotivo)}</textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
              <button data-click="${H(v.cancelReject)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
              <button data-click="${H(v.confirmReject)}" style="padding:9px 16px; border-radius:${t.radiusSm}; border:none; background:${t.danger}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar rejeição</button>
            </div>
          ` : `
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
              <button data-click="${H(v.closeSolicitacaoModal)}" style="padding:9px 16px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Fechar</button>
              <button data-click="${H(v.startReject)}" style="padding:9px 16px; border-radius:${t.radiusSm}; border:none; background:${t.dangerSoft}; color:${t.danger}; font-size:13px; font-weight:700; cursor:pointer;">Rejeitar</button>
              <button data-click="${H(v.aprovarViewing)}" style="padding:9px 16px; border-radius:${t.radiusSm}; border:none; background:${t.ok}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Aprovar</button>
            </div>
          `}
        </div>
      </div>`;
    }

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

    if (v.toast.show) {
      out += `
      <div role="status" aria-live="polite" style="position:fixed; bottom:24px; right:24px; z-index:200; display:flex; flex-direction:column; gap:8px; background:${v.toast.bg}; color:${v.toast.ink || '#fff'}; border-radius:${t.radiusMd}; padding:13px 16px; box-shadow:0 12px 30px -8px rgba(0,0,0,0.35); animation:dp-toast-in .2s ease-out; max-width:min(400px,86vw);">
        <div style="display:flex; align-items:center; gap:10px; font-weight:800; font-size:13.5px;">
          <span style="width:20px; height:20px; border-radius:50%; background:${v.toast.type === 'error' ? 'rgba(255,255,255,.25)' : 'rgba(16,185,129,.9)'}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; flex-shrink:0;">${v.toast.type === 'error' ? '!' : '✓'}</span>${esc(v.toast.msg)}
        </div>
        ${v.toast.body ? `<div style="white-space:pre-wrap; font-size:12.5px; line-height:1.55; font-weight:500; opacity:.85; max-height:200px; overflow:auto; border-top:1px solid rgba(128,140,170,.25); padding-top:8px;">${esc(v.toast.body)}</div>` : ''}
      </div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
