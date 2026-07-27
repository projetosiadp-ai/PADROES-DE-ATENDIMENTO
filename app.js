// app.js
import * as api from './api.js';
import { normalize, matchesSearch, titleSegments as titleSegmentsPure } from './search-utils.mjs';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

class App {
  constructor(root) {
    this.root = root;
    this._reg = {};
    this._regN = 0;
    this.searchEl = null;
    this.state = {
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
      acessos: [],
      acessoMembros: [],
      categorias: [],
      mensagens: [],
      loginEmail: '', loginPassword: '', loginError: ''
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
    let focusInfo = null;
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.focus) {
      // Some input types (email, number, etc.) don't support selectionStart/End —
      // reading/restoring null on those resets the caret to 0 and reverses typed order.
      const supportsSelection = typeof a.selectionStart === 'number';
      focusInfo = { key: a.dataset.focus, start: supportsSelection ? a.selectionStart : null, end: supportsSelection ? a.selectionEnd : null };
    }

    this._reg = {};
    this._regN = 0;
    const v = this.renderVals();
    this.root.innerHTML = this.view(v);

    const R = this._reg;
    this.root.querySelectorAll('[data-click]').forEach(el =>
      el.addEventListener('click', (e) => R[el.getAttribute('data-click')](e)));
    this.root.querySelectorAll('[data-input]').forEach(el =>
      el.addEventListener('input', (e) => R[el.getAttribute('data-input')](e)));
    this.root.querySelectorAll('[data-change]').forEach(el =>
      el.addEventListener('change', (e) => R[el.getAttribute('data-change')](e)));
    this.root.querySelectorAll('[data-keydown]').forEach(el =>
      el.addEventListener('keydown', (e) => R[el.getAttribute('data-keydown')](e)));
    this.root.querySelectorAll('[data-ref]').forEach(el => R[el.getAttribute('data-ref')](el));

    if (focusInfo) {
      const el = this.root.querySelector('[data-focus="' + focusInfo.key + '"]');
      if (el) {
        el.focus();
        if (focusInfo.start !== null) {
          try { el.setSelectionRange(focusInfo.start, focusInfo.end); } catch (e) {}
        }
      }
    }
  }

  async mount() {
    try {
      const dm = localStorage.getItem('dp_darkmode'); if (dm) this.state.darkMode = dm === '1';
    } catch (e) {}

    this.render();

    api.onAuthChange(async (session) => {
      if (!session) {
        this.setState({ currentUser: null, profileId: null, loading: false, appView: 'dashboard', adminTab: 'mensagens' });
        return;
      }
      await this.loadSessionAndData();
    });

    try {
      const session = await api.getSession();
      if (session) await this.loadSessionAndData();
      else this.setState({ loading: false });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message });
    }

    this._keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.searchEl) this.searchEl.focus();
      } else if (e.key === 'Escape') {
        if (this.state.searchQuery) this.setState({ searchQuery: '' });
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  async loadSessionAndData() {
    const session = await api.getSession();
    if (!session) { this.setState({ currentUser: null, profileId: null, loading: false }); return; }
    await this.refreshAppData(session);
  }

  async refreshAppData(session) {
    try {
      const data = await api.fetchAppData(session.user.id);
      const firstAcessoId = data.acessos[0] ? data.acessos[0].id : null;
      this.setState({
        currentUser: session,
        profileId: session.user.id,
        acessos: data.acessos,
        acessoMembros: data.acessoMembros,
        categorias: data.categorias,
        mensagens: data.mensagens,
        favoriteIds: data.favoritos.map(f => f.mensagem_id),
        recentIds: data.recentes.map(r => r.mensagem_id),
        activeAcessoId: this.state.activeAcessoId && data.acessos.some(a => a.id === this.state.activeAcessoId)
          ? this.state.activeAcessoId : firstAcessoId,
        loading: false, loadError: ''
      });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message });
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
      pageBg: dark ? '#0B1220' : '#F5F8FC',
      cardBg: dark ? '#151E2E' : '#FFFFFF',
      inputBg: dark ? '#0F1826' : '#FFFFFF',
      text: dark ? '#E7ECF3' : '#12203F',
      textSecondary: dark ? '#8B98AC' : '#64748B',
      border: dark ? '#22304A' : '#E2E8F0'
    };
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
    const userAcessoLinks = st.acessoMembros.filter(m => {
      const acc = st.acessos.find(a => a.id === m.acesso_id);
      return acc && acc.ativo;
    });
    const isSuperAdmin = profile.role === 'superadmin';
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
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        displayContent, showToggle: isLong, toggleLabel: expanded ? 'ver menos' : 'ver mais',
        onToggleExpand: () => toggleExpand(m.id),
        tagChips: m.tags, frequencia: m.frequencia,
        favIcon: isFav ? '★' : '☆', favColor: isFav ? '#F59E0B' : theme.textSecondary,
        onToggleFav: () => toggleFav(m.id),
        onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓ Copiado!' : 'Copiar',
        copyBtnBg: st.copiedId === m.id ? '#16A34A' : theme.navy,
        onEdit: () => this.openEditMsg(m),
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

    const mostUsed = [...acessoMsgs].sort((a, b) => b.frequencia - a.frequencia).slice(0, 5)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const recentList = st.recentIds.map(id => acessoMsgs.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const favList = st.favoriteIds.map(id => acessoMsgs.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      bg: st.categoryFilter === c.nome ? theme.navy : theme.pageBg,
      color: st.categoryFilter === c.nome ? '#fff' : theme.text,
      onClick: () => this.setState({ categoryFilter: st.categoryFilter === c.nome ? null : c.nome })
    }));

    const density = st.density;
    const gridStyle = `display:grid; grid-template-columns:repeat(auto-fill,minmax(${density === 'compact' ? 260 : 300}px,1fr)); gap:${density === 'compact' ? 12 : 16}px;`;
    const cardPadding = density === 'compact' ? '14px' : '18px';

    const adminQ = st.adminSearchQuery.trim().toLowerCase();
    const adminMsgRows = acessoMsgs.filter(m => !adminQ || m.titulo.toLowerCase().includes(adminQ) || m.conteudo.toLowerCase().includes(adminQ))
      .map(m => ({
        categoria: m.categoria, titulo: m.titulo, conteudo: m.conteudo, tagsLabel: m.tags.join(', '), frequencia: m.frequencia,
        onEdit: () => this.openEditMsg(m),
        onDelete: () => this.requestDelete('Excluir mensagem', `Tem certeza que deseja excluir "${m.titulo}"? Esta ação não pode ser desfeita.`, () => this.deleteMsg(m.id))
      }));

    const catRows = acessoCats.map(c => ({
      nome: c.nome,
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
        onUsers: () => this.setState({ showUsersModal: true, usersModalAcessoId: a.id })
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
      tabMsgsBg: (st.adminTab || 'mensagens') === 'mensagens' ? theme.navy : 'transparent', tabMsgsColor: (st.adminTab || 'mensagens') === 'mensagens' ? '#fff' : theme.text,
      tabCatsBg: st.adminTab === 'categorias' ? theme.navy : 'transparent', tabCatsColor: st.adminTab === 'categorias' ? '#fff' : theme.text,
      tabAcessosBg: st.adminTab === 'acessos' ? theme.navy : 'transparent', tabAcessosColor: st.adminTab === 'acessos' ? '#fff' : theme.text,
      isSuperAdmin, isAdmin,
      goDashboard: () => this.setState({ appView: 'dashboard', userMenuOpen: false }),
      goAdmin: () => this.setState({ appView: 'admin', userMenuOpen: false, adminTab: 'mensagens' }),
      setAdminTabMsgs: () => this.setState({ adminTab: 'mensagens' }),
      setAdminTabCats: () => this.setState({ adminTab: 'categorias' }),
      setAdminTabAcessos: () => this.setState({ adminTab: 'acessos' }),

      currentUser: { nome: profile.nome, iniciais: profile.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(), perfilLabel: isSuperAdmin ? 'Administrador' : (isAdmin ? 'Admin local' : 'Usuário') },
      userMenuOpen: !!st.userMenuOpen, toggleUserMenu: () => this.setState({ userMenuOpen: !st.userMenuOpen }),
      logout: () => api.signOut(),

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
      gridStyle, cardPadding,
      cardList: filtered.map(buildCard),

      categorias: acessoCats,
      adminSearchQuery: st.adminSearchQuery, onAdminSearchChange: (e) => this.setState({ adminSearchQuery: e.target.value }),
      adminMsgRows, catRows, acessoRows,
      openCreateMsg: () => this.openCreateMsg(),
      usersModalAcessoNome: (st.acessos.find(a => a.id === st.usersModalAcessoId) || {}).nome || '',
      usersModalRows: [],
      closeUsersModal: () => this.setState({ showUsersModal: false }),

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
      toast: st.toast
    };
  }

  /* ---------------- actions ---------------- */

  async handleLogin() {
    try {
      await api.signIn(this.state.loginEmail.trim(), this.state.loginPassword);
      this.setState({ loginError: '' });
    } catch (e) {
      this.setState({ loginError: e.message });
    }
  }

  openCreateMsg() {
    const cats = this.state.categorias.filter(c => c.acesso_id === this.state.activeAcessoId);
    this.setState({ showMsgModal: true, editingMsgId: null, msgForm: { categoria: cats[0] ? cats[0].nome : '', titulo: '', tagInput: '', tags: [], conteudo: '' } });
  }
  openEditMsg(msg) {
    this.setState({ showMsgModal: true, editingMsgId: msg.id, msgForm: { categoria: msg.categoria, titulo: msg.titulo, tagInput: '', tags: [...msg.tags], conteudo: msg.conteudo } });
  }
  addMsgTag() {
    const val = this.state.msgForm.tagInput.trim();
    if (!val) return;
    this.setState(s => ({ msgForm: { ...s.msgForm, tags: [...s.msgForm.tags, val], tagInput: '' } }));
  }
  async saveMsg() {
    const f = this.state.msgForm;
    if (!f.titulo.trim() || !f.conteudo.trim()) { this.showToast('Preencha título e conteúdo.', 'error'); return; }
    try {
      await api.saveMensagem({ id: this.state.editingMsgId, acessoId: this.state.activeAcessoId, categoria: f.categoria, titulo: f.titulo, tags: f.tags, conteudo: f.conteudo });
      this.setState({ showMsgModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Mensagem salva com sucesso!', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async deleteMsg(id) {
    try {
      await api.deleteMensagem(id);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Mensagem excluída.', 'success');
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
      await api.saveAcesso({ nome: f.nome.trim(), descricao: f.descricao, cor: f.cor });
      this.setState({ showAcessoModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Acesso criado com sucesso!', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async toggleAcessoStatus(id, currentAtivo) {
    try {
      await api.toggleAcessoStatus(id, !currentAtivo);
      await this.refreshAppData(this.state.currentUser);
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestDelete(title, message, action) { this.setState({ confirm: { open: true, title, message, action } }); }

  /* ---------------- view (template — identical to prototype) ---------------- */

  view(v) {
    if (v.isLoading) {
      return `<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${v.theme.pageBg}; color:${v.theme.textSecondary}; font-family:'Nunito',sans-serif;">Carregando…</div>`;
    }
    const t = v.theme;
    const H = (fn) => this.h(fn);
    let body = '';

    if (v.isLogin) {
      body += `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${t.pageBg}; padding:24px;">
        <div style="width:100%; max-width:400px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:16px; padding:40px 36px; box-shadow:0 20px 50px -20px rgba(11,45,107,0.25);">
          <div style="display:flex; justify-content:center; margin-bottom:28px;">
            <img src="assets/dentalplus-logo.png" alt="DentalPlus" style="height:52px; width:auto;" />
          </div>
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:20px; font-weight:800; color:${t.text};">Mensagens de Relacionamento</div>
            <div style="font-size:14px; color:${t.textSecondary}; margin-top:4px;">Acesse com sua conta para continuar</div>
          </div>
          ${v.loginError ? `<div style="background:#FEE2E2; color:#B91C1C; font-size:13px; font-weight:600; padding:10px 14px; border-radius:10px; margin-bottom:16px;">${esc(v.loginError)}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">E-mail</label>
              <input type="text" autocapitalize="off" autocorrect="off" spellcheck="false" data-focus="loginEmail" placeholder="seuemail@empresa.com" value="${esc(v.loginEmail)}" data-input="${H(v.onLoginEmailChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Senha</label>
              <input type="password" data-focus="loginPassword" placeholder="••••••••" value="${esc(v.loginPassword)}" data-input="${H(v.onLoginPasswordChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <button data-click="${H(v.handleLogin)}" style="margin-top:8px; padding:13px; border-radius:10px; border:none; background:${t.navy}; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit;">Entrar</button>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:16px;">
            <a href="#" data-click="${H(v.noop)}" style="font-size:13px; color:${t.cyan}; text-decoration:none; font-weight:600;">Esqueci minha senha</a>
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
        <div style="display:flex; align-items:center; gap:12px; cursor:pointer;" data-click="${H(v.goDashboard)}">
          <img src="assets/dentalplus-logo.png" alt="DentalPlus" style="height:30px; width:auto;" />
          <div style="width:1px; height:26px; background:${t.border};"></div>
          <div style="font-size:15px; font-weight:800; color:${t.text}; line-height:1.2;">Mensagens — ${esc(v.activeAcesso.nome)}</div>
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
          <button data-click="${H(v.toggleDarkMode)}" title="Alternar tema" style="width:34px; height:34px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; cursor:pointer; font-size:15px;">${v.darkModeIcon}</button>
          <div style="position:relative;">
            <div data-click="${H(v.toggleUserMenu)}" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:6px 10px; border-radius:10px; border:1px solid ${t.border};">
              <div style="width:28px; height:28px; border-radius:50%; background:${t.cyan}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;">${esc(v.currentUser.iniciais)}</div>
              <div style="line-height:1.15;">
                <div style="font-size:13px; font-weight:700;">${esc(v.currentUser.nome)}</div>
                <div style="font-size:11px; color:${t.textSecondary};">${esc(v.currentUser.perfilLabel)}</div>
              </div>
            </div>
            ${v.userMenuOpen ? `
              <div style="position:absolute; right:0; top:44px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:10px; box-shadow:0 12px 30px -10px rgba(0,0,0,0.25); min-width:200px; padding:8px; z-index:50;">
                ${v.isAdmin ? `<div data-click="${H(v.goAdmin)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:${t.text};">Painel Administrativo</div>` : ''}
                <div data-click="${H(v.logout)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:#DC2626;">Sair</div>
              </div>` : ''}
          </div>
        </div>
      </div>
      <div style="max-width:1400px; margin:12px auto 0; display:flex; gap:8px; flex-wrap:wrap;">
        <div data-click="${H(v.setCategoryAll)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${v.chipAllBg}; color:${v.chipAllColor};">Todas</div>
        ${v.categoriaChips.map(chip => `<div data-click="${H(chip.onClick)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${chip.bg}; color:${chip.color};">${esc(chip.nome)}</div>`).join('')}
      </div>
    </div>`;
  }

  viewDashboard(v, t, H) {
    const miniRow = (m) => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-radius:8px; background:${t.pageBg};">
        <div style="font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.titulo)}</div>
        <button data-click="${H(m.onCopy)}" style="flex-shrink:0; border:none; background:${t.navy}; color:#fff; font-size:11px; font-weight:700; padding:5px 10px; border-radius:6px; cursor:pointer;">${esc(m.copyLabel)}</button>
      </div>`;

    const card = (m) => `
      <div style="background:${t.cardBg}; border:1px solid ${m.borderColor}; border-radius:14px; padding:${v.cardPadding}; display:flex; flex-direction:column; gap:10px; transition:transform .15s; box-shadow:${m.shadow};">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:26px; height:26px; border-radius:8px; background:${t.cyan}22; color:${t.cyan}; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${esc(m.catInitial)}</div>
            <div style="font-size:11px; font-weight:700; color:${t.textSecondary};">${esc(m.categoria)}</div>
          </div>
          <button data-click="${H(m.onToggleFav)}" aria-label="Favoritar" style="border:none; background:transparent; cursor:pointer; font-size:18px; color:${m.favColor}; line-height:1;">${m.favIcon}</button>
        </div>
        <div style="font-size:15px; font-weight:800; color:${t.text};">${m.titleSegments.map(seg => `<span style="${seg.style}">${esc(seg.text)}</span>`).join('')}</div>
        <div style="font-size:13px; color:${t.textSecondary}; line-height:1.5; white-space:pre-wrap;">${esc(m.displayContent)}</div>
        ${m.showToggle ? `<div data-click="${H(m.onToggleExpand)}" style="font-size:12px; font-weight:700; color:${t.cyan}; cursor:pointer;">${esc(m.toggleLabel)}</div>` : ''}
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${m.tagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.textSecondary}; background:${t.pageBg}; padding:4px 9px; border-radius:999px;">${esc(tag)}</div>`).join('')}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px; padding-top:10px; border-top:1px solid ${t.border};">
          <div style="font-size:11px; color:${t.textSecondary}; font-weight:600;">usada ${esc(m.frequencia)}x</div>
          <div style="display:flex; gap:8px;">
            ${v.isAdmin ? `<button data-click="${H(m.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer;">Editar</button>` : ''}
            <button data-click="${H(m.onCopy)}" style="border:none; background:${m.copyBtnBg}; color:#fff; font-size:12px; font-weight:700; padding:7px 14px; border-radius:8px; cursor:pointer;">${esc(m.copyLabel)}</button>
          </div>
        </div>
      </div>`;

    return `
    <div style="max-width:1400px; margin:0 auto; padding:24px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:28px;">
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:#D97706; margin-bottom:10px;">🔥 MAIS USADAS</div>
          <div style="display:flex; flex-direction:column; gap:6px;">${v.mostUsedList.map(miniRow).join('')}</div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:${t.cyan}; margin-bottom:10px;">🕒 RECENTES</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.hasRecent ? v.recentList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Suas cópias recentes aparecem aqui.</span></div>`}
          </div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:#4F46E5; margin-bottom:10px;">★ FAVORITAS</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.favList.length ? v.favList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Marque mensagens com a estrela para vê-las aqui.</span></div>`}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="font-size:14px; font-weight:700; color:${t.textSecondary};">${esc(v.resultsCountLabel)}</div>
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
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; overflow:hidden;">
          <div style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:11px; font-weight:800; color:${t.textSecondary}; background:${t.pageBg}; text-transform:uppercase;">
            <div>Categoria</div><div>Título</div><div>Conteúdo</div><div>Tags</div><div>Freq.</div><div>Ações</div>
          </div>
          ${v.adminMsgRows.map(row => `
            <div style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:13px; border-top:1px solid ${t.border}; align-items:center;">
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
        </div>`;
    } else if (v.isAdminCats) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Categorias de situação</div>
          <button data-click="${H(v.openCreateCat)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Nova categoria</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${v.catRows.map(cat => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:12px 16px;">
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
            <div style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:14px 18px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:36px; height:36px; border-radius:10px; background:${a.cor}; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:14px;">${esc(a.initial)}</div>
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
    }

    return `
    <div style="max-width:1300px; margin:0 auto; padding:24px; display:flex; gap:24px; align-items:flex-start;">
      <div style="width:220px; flex-shrink:0; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:12px; position:sticky; top:96px;">
        <div data-click="${H(v.goDashboard)}" style="font-size:13px; font-weight:700; color:${t.textSecondary}; padding:10px 12px; cursor:pointer;">← Voltar ao painel</div>
        <div style="height:1px; background:${t.border}; margin:8px 0;"></div>
        <div data-click="${H(v.setAdminTabMsgs)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabMsgsBg}; color:${v.tabMsgsColor};">Mensagens</div>
        <div data-click="${H(v.setAdminTabCats)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabCatsBg}; color:${v.tabCatsColor};">Categorias</div>
        ${v.isSuperAdmin ? `<div data-click="${H(v.setAdminTabAcessos)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; background:${v.tabAcessosBg}; color:${v.tabAcessosColor};">Acessos</div>` : ''}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:${t.textSecondary}; margin-bottom:14px;">Operando em: <span style="color:${t.cyan};">${esc(v.activeAcesso.nome)}</span></div>
        ${content}
      </div>
    </div>`;
  }

  viewModals(v, t, H) {
    let out = '';

    if (v.showMsgModal) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:520px; background:${t.cardBg}; border-radius:16px; padding:28px; animation:dp-modal-in .18s ease-out;">
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
                ${v.msgFormTagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.text}; background:${t.pageBg}; padding:5px 10px; border-radius:999px; display:flex; align-items:center; gap:6px;">${esc(tag.label)}<span data-click="${H(tag.onRemove)}" style="cursor:pointer; color:${t.textSecondary};">×</span></div>`).join('')}
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
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:400px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
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
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:420px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
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
                ${v.acessoColorOptions.map(c => `<div data-click="${H(c.onSelect)}" style="width:30px; height:30px; border-radius:8px; background:${c.value}; cursor:pointer; border:${c.border};"></div>`).join('')}
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
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:460px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:4px;">Usuários vinculados</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:16px;">${esc(v.usersModalAcessoNome)}</div>
          <div style="font-size:13px; color:${t.textSecondary};">A edição de vínculos de usuários por acesso está disponível na Task de acompanhamento pós-lançamento (fora do escopo de hoje).</div>
          <div style="display:flex; justify-content:flex-end; margin-top:20px;">
            <button data-click="${H(v.closeUsersModal)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Concluir</button>
          </div>
        </div>
      </div>`;
    }

    if (v.confirm.open) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:110; padding:20px;">
        <div style="width:100%; max-width:380px; background:${t.cardBg}; border-radius:16px; padding:24px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:16px; font-weight:800; margin-bottom:8px;">${esc(v.confirm.title)}</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:20px; line-height:1.5;">${esc(v.confirm.message)}</div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button data-click="${H(v.closeConfirm)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.runConfirm)}" style="padding:9px 16px; border-radius:8px; border:none; background:#DC2626; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.toast.show) {
      out += `<div style="position:fixed; bottom:24px; right:24px; z-index:200; background:${v.toast.bg}; color:#fff; padding:13px 20px; border-radius:10px; font-size:13px; font-weight:700; box-shadow:0 12px 30px -8px rgba(0,0,0,0.35); animation:dp-toast-in .2s ease-out;">${esc(v.toast.msg)}</div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
