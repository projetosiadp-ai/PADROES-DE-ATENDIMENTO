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
      expandedIds: {},
      copiedId: null,
      favoriteIds: [],       // mensagem_id[] for the current user
      recentIds: [],         // mensagem_id[] for the current user, most recent first
      toast: { show: false, msg: '', type: 'success' },
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
      loginEmail: '', loginPassword: '', loginError: '', loggingIn: false
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.searchEl) this.searchEl.focus();
      } else if (e.key === 'Escape') {
        const st = this.state;
        if (st.showMsgModal) this.setState({ showMsgModal: false });
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

  theme() {
    const dark = this.state.darkMode;
    return {
      navy: '#0F2C6B', cyan: '#1BA7DC',
      pageBg: dark ? '#091B2E' : '#A9DEEC',
      cardBg: dark ? 'rgba(15,44,107,0.75)' : 'rgba(255,255,255,0.82)',
      modalSolidBg: dark ? '#12203F' : '#FFFFFF',
      logoGlow: dark ? 'filter: drop-shadow(0 0 2px rgba(255,255,255,0.85)) drop-shadow(0 0 5px rgba(255,255,255,0.45));' : '',
      inputBg: dark ? '#0A2847' : '#FFFFFF',
      text: dark ? '#E7ECF3' : '#0D1B38',
      textSecondary: dark ? '#8B98AC' : '#4A5B75',
      border: dark ? '#22304A' : '#B8DCE8',
      radiusSm: '8px',
      radiusLg: '16px',
      shadowSm: dark ? '0 2px 6px -2px rgba(0,0,0,0.4)' : '0 2px 6px -2px rgba(15,44,107,0.12)',
      shadowMd: dark ? '0 8px 20px -10px rgba(0,0,0,0.5)' : '0 8px 20px -10px rgba(15,44,107,0.18)',
      shadowLg: dark ? '0 14px 32px -14px rgba(0,0,0,0.6)' : '0 14px 32px -14px rgba(15,44,107,0.28)',
      glassEffect: 'backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);'
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

  showToast(msg, type) {
    clearTimeout(this._toastTimer);
    this.setState({ toast: { show: true, msg, type: type || 'success', bg: type === 'error' ? '#DC2626' : '#0F2C6B' } });
    this._toastTimer = setTimeout(() => this.setState({ toast: { show: false, msg: '', type: 'success' } }), 3000);
  }

  /* ---------------- computed bindings ---------------- */

  renderVals() {
    const st = this.state;
    const theme = this.theme();
    const session = st.currentUser;

    if (st.loading) {
      return { isLogin: false, isApp: false, isLoading: true, theme, confirm: st.confirm, toast: st.toast,
        showMsgModal: false, showCatModal: false, showAcessoModal: false, showUsersModal: false };
    }

    if (!session) {
      return {
        isLogin: true, isApp: false, isLoading: false,
        theme,
        loginEmail: st.loginEmail, loginPassword: st.loginPassword, loginError: st.loginError,
        loggingIn: st.loggingIn, loginBtnLabel: st.loggingIn ? 'Entrando…' : 'Entrar',
        onLoginEmailChange: (e) => this.setState({ loginEmail: e.target.value }),
        onLoginPasswordChange: (e) => this.setState({ loginPassword: e.target.value }),
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

    const copyMessage = (msg) => {
      navigator.clipboard && navigator.clipboard.writeText(msg.conteudo).catch(() => {});
      this.setState({ copiedId: msg.id });
      setTimeout(() => this.setState({ copiedId: null }), 1400);
      this.showToast('Mensagem copiada!', 'success');
      Promise.all([api.incrementFrequencia(msg.id), api.recordRecente(profile.id, msg.id)])
        .then(() => this.refreshAppData(session))
        .catch(e => this.showToast(e.message, 'error'));
    };
    const toggleFav = (id) => {
      const isFav = st.favoriteIds.includes(id);
      api.toggleFavorito(profile.id, id, isFav)
        .then(() => this.refreshAppData(session))
        .catch(e => this.showToast(e.message, 'error'));
    };
    const toggleExpand = (id) => this.setState({ expandedIds: { ...st.expandedIds, [id]: !st.expandedIds[id] } });

    const buildCard = (m) => {
      const isFav = st.favoriteIds.includes(m.id);
      const expanded = !!st.expandedIds[m.id];
      const threshold = 130;
      const isLong = m.conteudo.length > threshold;
      const displayContent = isLong && !expanded ? m.conteudo.slice(0, threshold).trim() + '…' : m.conteudo;
      return {
        id: m.id, categoria: m.categoria, catInitial: m.categoria.charAt(0).toUpperCase(),
        catColor: this.categoryColor(m.categoria),
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        displayContent, showToggle: isLong, toggleLabel: expanded ? 'ver menos' : 'ver mais',
        onToggleExpand: () => toggleExpand(m.id),
        tagChips: m.tags, frequencia: m.frequencia,
        isFav, favColor: isFav ? '#F59E0B' : theme.textSecondary,
        onToggleFav: () => toggleFav(m.id),
        onCardClick: () => copyMessage(m),
        onCardKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyMessage(m); } },
        onCopy: () => copyMessage(m), copied: st.copiedId === m.id, copyLabel: st.copiedId === m.id ? 'Copiado!' : 'Copiar',
        copyBtnBg: st.copiedId === m.id ? '#16A34A' : theme.navy,
        onEdit: () => this.openEditMsg(m),
        onDelete: () => this.requestDeleteMsg(m),
        borderColor: isFav ? '#F59E0B' : theme.border,
        shadow: isFav ? '0 0 0 1px #F59E0B22' : 'none'
      };
    };

    const filtered = acessoMsgs
      .filter(m => !st.categoryFilter || m.categoria === st.categoryFilter)
      .filter(m => this.matchesSearch(m, st.searchQuery));
    const q = st.searchQuery.trim().toLowerCase();
    filtered.sort((a, b) => {
      if (q) {
        const aExact = a.titulo.toLowerCase().includes(q) ? 1 : 0;
        const bExact = b.titulo.toLowerCase().includes(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      return b.frequencia - a.frequencia;
    });

    const acessoMsgsInCategory = acessoMsgs.filter(m => !st.categoryFilter || m.categoria === st.categoryFilter);
    const mostUsed = [...acessoMsgsInCategory].sort((a, b) => b.frequencia - a.frequencia).slice(0, 5)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const recentList = st.recentIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const favList = st.favoriteIds.map(id => acessoMsgsInCategory.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      bg: st.categoryFilter === c.nome ? theme.navy : theme.pageBg,
      color: st.categoryFilter === c.nome ? '#fff' : theme.text,
      onClick: () => this.setState({ categoryFilter: st.categoryFilter === c.nome ? null : c.nome })
    }));

    const density = st.density;
    const cardGap = density === 'compact' ? 12 : 16;
    const gridStyle = `column-width:${density === 'compact' ? 260 : 300}px; column-gap:${cardGap}px;`;
    const cardPadding = density === 'compact' ? '14px' : '18px';

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
        statusBg: a.ativo ? '#DCFCE7' : '#FEE2E2', statusColor: a.ativo ? '#166534' : '#B91C1C',
        toggleLabel: a.ativo ? 'Desativar' : 'Ativar',
        onToggleStatus: () => this.toggleAcessoStatus(a.id, a.ativo),
        onUsers: () => this.openUsersModal(a.id)
      };
    });

    const msgFormTagChips = st.msgForm.tags.map((t, i) => ({
      label: t, onRemove: () => this.setState(s => ({ msgForm: { ...s.msgForm, tags: s.msgForm.tags.filter((_, idx) => idx !== i) } }))
    }));

    return {
      isLogin: false, isApp: true, isLoading: false, theme,
      appView: st.appView || 'dashboard',
      isDashboard: !(st.appView === 'admin' && isAdmin), isAdminView: st.appView === 'admin' && isAdmin,
      adminTab: st.adminTab || 'mensagens',
      isAdminMsgs: (st.adminTab || 'mensagens') === 'mensagens', isAdminCats: st.adminTab === 'categorias', isAdminAcessos: st.adminTab === 'acessos',
      isAdminSolicitacoes: st.adminTab === 'solicitacoes',
      tabMsgsBg: (st.adminTab || 'mensagens') === 'mensagens' ? theme.navy : 'transparent', tabMsgsColor: (st.adminTab || 'mensagens') === 'mensagens' ? '#fff' : theme.text,
      tabCatsBg: st.adminTab === 'categorias' ? theme.navy : 'transparent', tabCatsColor: st.adminTab === 'categorias' ? '#fff' : theme.text,
      tabAcessosBg: st.adminTab === 'acessos' ? theme.navy : 'transparent', tabAcessosColor: st.adminTab === 'acessos' ? '#fff' : theme.text,
      tabSolicitacoesBg: st.adminTab === 'solicitacoes' ? theme.navy : 'transparent', tabSolicitacoesColor: st.adminTab === 'solicitacoes' ? '#fff' : theme.text,
      isSuperAdmin, isAdmin,
      goDashboard: () => this.setState({ appView: 'dashboard', userMenuOpen: false }),
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

      chipAllBg: !st.categoryFilter ? theme.navy : theme.pageBg, chipAllColor: !st.categoryFilter ? '#fff' : theme.text,
      setCategoryAll: () => this.setState({ categoryFilter: null }),
      categoriaChips,

      mostUsedList: mostUsed, recentList, hasRecent: recentList.length > 0,
      favList,

      resultsCountLabel: `${filtered.length} mensagem${filtered.length === 1 ? '' : 's'} encontrada${filtered.length === 1 ? '' : 's'}`,
      hasResults: filtered.length > 0,
      gridStyle, cardPadding, cardGap,
      cardList: filtered.map(buildCard),

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
        this.setState({ appView: 'dashboard', copiedId: saved.id });
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
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${t.pageBg}; padding:24px;">
        <div style="width:100%; max-width:400px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:16px; padding:40px 36px; box-shadow:0 20px 50px -20px rgba(11,45,107,0.25);">
          <div style="display:flex; justify-content:center; margin-bottom:28px;">
            <img src="assets/dentalplus-logo.png" alt="DentalPlus" width="309" height="52" style="height:52px; width:auto; ${t.logoGlow}" />
          </div>
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:20px; font-weight:800; color:${t.text};">Padrões de atendimento</div>
            <div style="font-size:14px; color:${t.textSecondary}; margin-top:4px;">Acesse com sua conta para continuar</div>
          </div>
          ${v.loginError ? `<div style="background:#FEE2E2; color:#B91C1C; font-size:13px; font-weight:600; padding:10px 14px; border-radius:10px; margin-bottom:16px;">${esc(v.loginError)}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">E-mail</label>
              <input type="text" autocapitalize="off" autocorrect="off" spellcheck="false" ${v.loggingIn ? 'disabled' : ''} data-focus="loginEmail" placeholder="seuemail@empresa.com" value="${esc(v.loginEmail)}" data-input="${H(v.onLoginEmailChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Senha</label>
              <input type="password" ${v.loggingIn ? 'disabled' : ''} data-focus="loginPassword" placeholder="••••••••" value="${esc(v.loginPassword)}" data-input="${H(v.onLoginPasswordChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <button data-click="${H(v.handleLogin)}" ${v.loggingIn ? 'disabled' : ''} style="margin-top:8px; padding:13px; border-radius:10px; border:none; background:${t.navy}; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit; opacity:${v.loggingIn ? '0.75' : '1'};">${esc(v.loginBtnLabel)}</button>
          </div>
        </div>
      </div>`;
    }

    if (v.isApp) {
      body += `<div>` + this.viewHeader(v, t, H);
      if (v.isDashboard) body += this.viewDashboard(v, t, H);
      if (v.isAdminView) body += this.viewAdmin(v, t, H);
      body += `</div>`;
    }

    body += this.viewModals(v, t, H);

    return `<div style="min-height:100vh; background:${t.pageBg}; color:${t.text}; transition:background .2s,color .2s;">${body}</div>`;
  }

  viewHeader(v, t, H) {
    return `
    <div style="position:sticky; top:0; z-index:40; background:${t.cardBg}; border-bottom:1px solid ${t.border}; padding:14px 24px;">
      <div style="display:flex; align-items:center; gap:20px; max-width:1400px; margin:0 auto; flex-wrap:wrap;">
        <div role="button" tabindex="0" style="display:flex; align-items:center; gap:12px; cursor:pointer; border-radius:8px;" data-click="${H(v.goDashboard)}">
          <img src="assets/dentalplus-logo.png" alt="DentalPlus" width="140" height="24" style="height:24px; width:auto; ${t.logoGlow}" />
          <div style="width:1px; height:26px; background:${t.border};"></div>
          <div style="font-size:15px; font-weight:800; color:${t.text}; line-height:1.2;">Padrões de atendimento</div>
        </div>
        ${v.showAcessoSelector ? `
          <select data-change="${H(v.onChangeActiveAcesso)}" style="padding:8px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-weight:700; font-family:inherit;">
            ${v.userAcessosOptions.map(opt => `<option value="${esc(opt.id)}" ${opt.id === v.activeAcessoId ? 'selected' : ''}>${esc(opt.nome)}</option>`).join('')}
          </select>` : ''}
        <div style="flex:1; min-width:220px; position:relative; max-width:640px;">
          <div style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:15px; height:15px; border:2px solid ${t.textSecondary}; border-radius:50%;"></div>
          <div style="position:absolute; left:22px; top:63%; width:8px; height:2px; background:${t.textSecondary}; transform:rotate(45deg); border-radius:2px;"></div>
          <input data-ref="${H(v.searchInputRef)}" data-focus="search" type="text" placeholder="Buscar por título, conteúdo, tag ou categoria…" value="${esc(v.searchQuery)}" data-input="${H(v.onSearchChange)}" style="width:100%; padding:13px 70px 13px 40px; border-radius:12px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
          <div style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:11px; font-weight:700; color:${t.textSecondary}; background:${t.pageBg}; border:1px solid ${t.border}; padding:3px 8px; border-radius:6px;">${esc(v.shortcutLabel)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
          <button data-click="${H(v.toggleDarkMode)}" title="Alternar tema" style="width:34px; height:34px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; background:transparent; color:${t.text}; cursor:pointer; font-size:15px; box-shadow:${t.shadowSm};">${v.darkModeIcon}</button>
          <div style="position:relative;">
            <div role="button" tabindex="0" aria-haspopup="true" aria-expanded="${v.userMenuOpen}" data-click="${H(v.toggleUserMenu)}" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:6px 10px; border-radius:${t.radiusSm}; border:1px solid ${t.border}; box-shadow:${t.shadowSm};">
              <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, ${t.cyan}dd 0%, ${t.navy}dd 100%); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; box-shadow:0 2px 8px rgba(27,167,220,0.3); position:relative; overflow:hidden;"><div style="position:absolute; inset:0; background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent); border-radius:50%;"></div><span style="position:relative; z-index:1;">${esc(v.currentUser.iniciais)}</span></div>
              <div style="line-height:1.15;">
                <div style="font-size:13px; font-weight:700;">${esc(v.currentUser.nome)}</div>
                <div style="font-size:11px; color:${t.textSecondary};">${esc(v.currentUser.perfilLabel)}</div>
              </div>
            </div>
            ${v.userMenuOpen ? `
              <div style="position:absolute; right:0; top:44px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusSm}; box-shadow:${t.shadowLg}; min-width:200px; padding:8px; z-index:50;">
                ${v.isAdmin ? `<div data-click="${H(v.goAdmin)}" style="padding:10px 12px; border-radius:${t.radiusSm}; cursor:pointer; font-size:13px; font-weight:700; color:${t.text}; display:flex; align-items:center; justify-content:space-between; gap:8px;">Painel Administrativo${v.isSuperAdmin && v.solicitacoesCount > 0 ? `<span style="background:#DC2626; color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px;">${v.solicitacoesCount}</span>` : ''}</div>` : ''}
                <div data-click="${H(v.logout)}" style="padding:10px 12px; border-radius:${t.radiusSm}; cursor:pointer; font-size:13px; font-weight:700; color:#DC2626;">Sair</div>
              </div>` : ''}
          </div>
        </div>
      </div>
      <div style="max-width:1400px; margin:12px auto 0; display:flex; gap:8px; flex-wrap:wrap;">
        <div role="button" tabindex="0" data-click="${H(v.setCategoryAll)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${v.chipAllBg}; color:${v.chipAllColor}; box-shadow:${v.chipAllBg === t.navy ? t.shadowSm : 'none'};">Todas</div>
        ${v.categoriaChips.map(chip => `<div role="button" tabindex="0" data-click="${H(chip.onClick)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${chip.bg}; color:${chip.color};">${esc(chip.nome)}</div>`).join('')}
      </div>
    </div>`;
  }

  viewDashboard(v, t, H) {
    const miniRow = (m) => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-radius:${t.radiusSm}; background:${t.pageBg};">
        <div style="font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.titulo)}</div>
        <button data-click="${H(m.onCopy)}" style="flex-shrink:0; border:none; background:${t.navy}; color:#fff; font-size:11px; font-weight:700; padding:5px 10px; border-radius:6px; cursor:pointer;">${esc(m.copyLabel)}</button>
      </div>`;

    const starIcon = (filled) => filled
      ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.7z"/></svg>`
      : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.7z"/></svg>`;
    const clipboardIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>`;
    const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;"><path d="M20 6L9 17l-5-5"/></svg>`;
    const fireIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-3 4-3 8a4 4 0 0 0 8 0c1.5 1.5 2 3.5 2 5a7 7 0 1 1-14 0c0-4 3-6 4-8 1-2 1.5-3.5 3-5z"/></svg>`;
    const clockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
    const panelHeader = (icon, label, color) => `<div style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:${t.text}; margin-bottom:10px;">${icon}<span style="color:${t.textSecondary};">${esc(label)}</span></div>`;

    const card = (m) => `
      <div data-key="${esc(m.id)}" data-click="${H(m.onCardClick)}" data-keydown="${H(m.onCardKeyDown)}" role="button" tabindex="0" aria-label="Copiar mensagem" title="Clique para copiar" class="dp-card" style="background:${t.cardBg}; border:1px solid ${m.borderColor}; border-radius:${t.radiusLg}; padding:${v.cardPadding}; display:flex; flex-direction:column; gap:10px; box-shadow:${m.shadow === 'none' ? t.shadowMd : m.shadow}; cursor:pointer; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); break-inside:avoid; margin-bottom:${v.cardGap}px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            ${this.avatarSquare(m.catInitial, m.catColor, 26)}
            <div style="font-size:11px; font-weight:700; color:${t.textSecondary};">${esc(m.categoria)}</div>
          </div>
          <button data-click="${H(m.onToggleFav)}" aria-label="${m.isFav ? 'Remover dos favoritos' : 'Favoritar'}" style="border:none; background:transparent; cursor:pointer; color:${m.favColor}; line-height:1; display:flex; transition:transform .15s ease;" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'">${starIcon(m.isFav)}</button>
        </div>
        <div style="font-size:15px; font-weight:800; color:${t.text};">${m.titleSegments.map(seg => `<span style="${seg.style}">${esc(seg.text)}</span>`).join('')}</div>
        <div style="font-size:13px; color:${t.textSecondary}; line-height:1.5; white-space:pre-wrap; word-break:break-word; overflow-wrap:break-word; max-width:100%;">${esc(m.displayContent)}</div>
        ${m.showToggle ? `<div data-click="${H(m.onToggleExpand)}" style="font-size:12px; font-weight:700; color:${t.cyan}; cursor:pointer;">${esc(m.toggleLabel)}</div>` : ''}
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${m.tagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.textSecondary}; background:${t.pageBg}; padding:4px 9px; border-radius:999px;">${esc(tag)}</div>`).join('')}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px; padding-top:10px; border-top:1px solid ${t.border};">
          <div style="font-size:11px; color:${t.textSecondary}; font-weight:600;">usada ${esc(m.frequencia)}x</div>
          <div style="display:flex; gap:8px;">
            <button data-click="${H(m.onDelete)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:${t.radiusSm}; cursor:pointer;">Excluir</button>
            <button data-click="${H(m.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:${t.radiusSm}; cursor:pointer;">Editar</button>
            <button data-click="${H(m.onCopy)}" style="border:none; background:${m.copyBtnBg}; color:#fff; font-size:12px; font-weight:700; padding:7px 14px; border-radius:${t.radiusSm}; cursor:pointer; display:flex; align-items:center; gap:6px;">${m.copied ? checkIcon : clipboardIcon}${esc(m.copyLabel)}</button>
          </div>
        </div>
      </div>`;

    return `
    <div data-key="view-dashboard" class="dp-view-enter" style="max-width:1400px; margin:0 auto; padding:24px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:28px;">
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; padding:16px; box-shadow:${t.shadowSm}; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);">
          ${panelHeader(fireIcon, 'MAIS USADAS', '#D97706')}
          <div style="display:flex; flex-direction:column; gap:6px;">${v.mostUsedList.map(miniRow).join('')}</div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; padding:16px; box-shadow:${t.shadowSm}; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);">
          ${panelHeader(clockIcon, 'RECENTES', t.cyan)}
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.hasRecent ? v.recentList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Suas cópias recentes aparecem aqui.</span></div>`}
          </div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:${t.radiusLg}; padding:16px; box-shadow:${t.shadowSm}; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);">
          ${panelHeader(starIcon(true), 'FAVORITAS', '#4F46E5')}
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.favList.length ? v.favList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Marque mensagens com a estrela para vê-las aqui.</span></div>`}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="font-size:14px; font-weight:700; color:${t.textSecondary};">${esc(v.resultsCountLabel)}</div>
        <button data-click="${H(v.openCreateMsg)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:9px 16px; border-radius:${t.radiusSm}; cursor:pointer;">+ Nova mensagem</button>
      </div>
      ${v.hasResults
        ? `<div style="${v.gridStyle}">${v.cardList.map(card).join('')}</div>`
        : `<div>
            <div style="text-align:center; padding:60px 20px; background:${t.cardBg}; border:1px dashed ${t.border}; border-radius:16px;">
              <div style="font-size:16px; font-weight:800; color:${t.text}; margin-bottom:6px;">Nenhum resultado encontrado</div>
              <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:18px;">Tente uma categoria ou uma das mensagens mais usadas abaixo.</div>
              <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                ${v.categoriaChips.map(chip => `<div data-click="${H(chip.onClick)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${t.pageBg}; color:${t.text}; border:1px solid ${t.border};">${esc(chip.nome)}</div>`).join('')}
              </div>
            </div>
          </div>`}
    </div>`;
  }

  viewAdmin(v, t, H) {
    const cols = '140px 1fr 1fr 140px 90px 130px';
    let content = '';

    if (v.isAdminMsgs) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
          <div style="font-size:20px; font-weight:800;">Mensagens</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <input type="text" data-focus="adminSearch" placeholder="Buscar…" value="${esc(v.adminSearchQuery)}" data-input="${H(v.onAdminSearchChange)}" style="padding:9px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            <button data-click="${H(v.openCreateMsg)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Nova mensagem</button>
          </div>
        </div>
        <div class="dp-table-scroll">
          <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; overflow:hidden; min-width:760px;">
            <div style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:11px; font-weight:800; color:${t.textSecondary}; background:${t.pageBg}; text-transform:uppercase;">
              <div>Categoria</div><div>Título</div><div>Conteúdo</div><div>Tags</div><div>Freq.</div><div>Ações</div>
            </div>
            ${v.adminMsgRows.map(row => `
              <div data-key="${esc(row.id)}" style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:13px; border-top:1px solid ${t.border}; align-items:center;">
                <div style="font-weight:700; color:${t.cyan};">${esc(row.categoria)}</div>
                <div style="font-weight:700;">${esc(row.titulo)}</div>
                <div style="color:${t.textSecondary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(row.conteudo)}</div>
                <div style="color:${t.textSecondary}; font-size:12px;">${esc(row.tagsLabel)}</div>
                <div>${esc(row.frequencia)}</div>
                <div style="display:flex; gap:6px;">
                  <button data-click="${H(row.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:5px 9px; border-radius:6px; cursor:pointer;">Editar</button>
                  <button data-click="${H(row.onDelete)}" style="border:none; background:#FEE2E2; color:#B91C1C; font-size:11px; font-weight:700; padding:5px 9px; border-radius:6px; cursor:pointer;">Excluir</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    } else if (v.isAdminCats) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Categorias de situação</div>
          <button data-click="${H(v.openCreateCat)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Nova categoria</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${v.catRows.map(cat => `
            <div data-key="${esc(cat.id)}" style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:12px 16px;">
              <div>
                <div style="font-weight:700; font-size:14px;">${esc(cat.nome)}</div>
                <div style="font-size:12px; color:${t.textSecondary};">${esc(cat.countLabel)}</div>
              </div>
              <div style="display:flex; gap:6px;">
                <button data-click="${H(cat.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Editar</button>
                <button data-click="${H(cat.onDelete)}" style="border:none; background:#FEE2E2; color:#B91C1C; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Excluir</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminAcessos) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Acessos</div>
          <button data-click="${H(v.openCreateAcesso)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Novo Acesso</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${v.acessoRows.map(a => `
            <div data-key="${esc(a.id)}" style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:14px 18px;">
              <div style="display:flex; align-items:center; gap:12px;">
                ${this.avatarSquare(a.initial, a.cor, 36)}
                <div>
                  <div style="font-weight:800; font-size:14px;">${esc(a.nome)}</div>
                  <div style="font-size:12px; color:${t.textSecondary};">${esc(a.statsLabel)}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:999px; background:${a.statusBg}; color:${a.statusColor};">${esc(a.statusLabel)}</div>
                <button data-click="${H(a.onUsers)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Usuários</button>
                <button data-click="${H(a.onToggleStatus)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">${esc(a.toggleLabel)}</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminSolicitacoes) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Solicitações de Aprovação</div>
        </div>
        ${v.hasSolicitacoes ? `
        <div class="dp-table-scroll">
          <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; overflow:hidden; min-width:640px;">
            <div style="display:grid; grid-template-columns:1fr 1fr 120px 180px 100px; gap:10px; padding:12px 16px; font-size:11px; font-weight:800; color:${t.textSecondary}; background:${t.pageBg}; text-transform:uppercase;">
              <div>Departamento</div><div>Usuário</div><div>Tipo</div><div>Data</div><div>Ações</div>
            </div>
            ${v.solicitacaoRows.map(row => `
              <div data-key="${esc(row.id)}" style="display:grid; grid-template-columns:1fr 1fr 120px 180px 100px; gap:10px; padding:12px 16px; font-size:13px; border-top:1px solid ${t.border}; align-items:center;">
                <div style="font-weight:700;">${esc(row.departamento)}</div>
                <div>${esc(row.usuario)}</div>
                <div style="color:${t.textSecondary};">${esc(row.tipoLabel)}</div>
                <div style="color:${t.textSecondary}; font-size:12px;">${esc(row.dataLabel)}</div>
                <div><button data-click="${H(row.onOpen)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Analisar</button></div>
              </div>`).join('')}
          </div>
        </div>` : `
        <div style="text-align:center; padding:60px 20px; background:${t.cardBg}; border:1px dashed ${t.border}; border-radius:16px;">
          <div style="font-size:16px; font-weight:800; color:${t.text};">Nenhuma solicitação pendente</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-top:6px;">Quando um usuário criar, editar ou pedir exclusão de uma mensagem, aparecerá aqui.</div>
        </div>`}`;
    }

    return `
    <div data-key="view-admin" class="dp-admin-layout dp-view-enter" style="max-width:1300px; margin:0 auto; padding:24px; display:flex; gap:24px; align-items:flex-start;">
      <div class="dp-admin-sidebar" role="tablist" aria-label="Seções do painel administrativo" style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:12px; position:sticky; top:96px;">
        <div role="button" tabindex="0" data-click="${H(v.goDashboard)}" style="font-size:13px; font-weight:700; color:${t.textSecondary}; padding:10px 12px; cursor:pointer; border-radius:8px;">← Voltar ao painel</div>
        <div style="height:1px; background:${t.border}; margin:8px 0;"></div>
        <div role="tab" tabindex="0" aria-selected="${v.isAdminMsgs}" data-click="${H(v.setAdminTabMsgs)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabMsgsBg}; color:${v.tabMsgsColor};">Mensagens</div>
        <div role="tab" tabindex="0" aria-selected="${v.isAdminCats}" data-click="${H(v.setAdminTabCats)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabCatsBg}; color:${v.tabCatsColor};">Categorias</div>
        ${v.isSuperAdmin ? `<div role="tab" tabindex="0" aria-selected="${v.isAdminAcessos}" data-click="${H(v.setAdminTabAcessos)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabAcessosBg}; color:${v.tabAcessosColor};">Acessos</div>` : ''}
        ${v.isSuperAdmin ? `<div role="tab" tabindex="0" aria-selected="${v.isAdminSolicitacoes}" data-click="${H(v.setAdminTabSolicitacoes)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; background:${v.tabSolicitacoesBg}; color:${v.tabSolicitacoesColor};">${esc(v.solicitacoesTabLabel)}</div>` : ''}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:${t.textSecondary}; margin-bottom:14px;">Operando em: <span style="color:${t.cyan};">${esc(v.activeAcesso.nome)}</span></div>
        ${content}
      </div>
    </div>`;
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
            <button data-click="${H(v.runConfirm)}" style="padding:9px 16px; border-radius:8px; border:none; background:#DC2626; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar</button>
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
              <button data-click="${H(v.confirmReject)}" style="padding:9px 16px; border-radius:8px; border:none; background:#DC2626; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar rejeição</button>
            </div>
          ` : `
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
              <button data-click="${H(v.closeSolicitacaoModal)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Fechar</button>
              <button data-click="${H(v.startReject)}" style="padding:9px 16px; border-radius:8px; border:none; background:#FEE2E2; color:#B91C1C; font-size:13px; font-weight:700; cursor:pointer;">Rejeitar</button>
              <button data-click="${H(v.aprovarViewing)}" style="padding:9px 16px; border-radius:8px; border:none; background:#16A34A; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Aprovar</button>
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

    if (v.toast.show) {
      out += `<div role="status" aria-live="polite" style="position:fixed; bottom:24px; right:24px; z-index:200; background:${v.toast.bg}; color:#fff; padding:13px 20px; border-radius:10px; font-size:13px; font-weight:700; box-shadow:0 12px 30px -8px rgba(0,0,0,0.35); animation:dp-toast-in .2s ease-out;">${esc(v.toast.msg)}</div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
