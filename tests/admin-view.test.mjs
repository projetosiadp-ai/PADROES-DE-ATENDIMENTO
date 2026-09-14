import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAdminView } from '../views/admin-view.mjs';

const noop = () => {};

function capture() {
  const handlers = new Map();
  const register = (fn) => { const key = `k${handlers.size}`; handlers.set(key, fn); return key; };
  return { handlers, register };
}

const baseModel = (overrides = {}) => ({
  isAdminSolicitacoes: false, isAdminMsgs: false, isAdminCats: false, isAdminArchived: false,
  isAdminAccounts: false, isAdminAcessos: false,
  setAdminTabSolicitacoes: noop, setAdminTabMsgs: noop, setAdminTabCats: noop, setAdminTabArchived: noop,
  setAdminTabAcessos: noop, setAdminTabAccounts: noop,
  solicitacoesCount: 1, adminMsgRows: [], catRows: [], acessoRows: [], accountRows: [], accountsLoading: false,
  solicitacaoRows: [], requestPanel: null, archivedLoading: false, archivedMessageRows: [], archivedCategoryRows: [],
  adminSearchQueryDraft: '', onAdminSearchChange: noop,
  ...overrides,
});

const panel = (overrides = {}) => ({
  typeLabel: 'Edição', isCreation: false, isArchive: false, department: 'Atendimento', user: 'Ana Souza',
  dateLabel: '09/09/2026', previousCategory: 'Geral', category: 'Geral', previousTitle: 'Antigo', title: 'Novo',
  previousContent: 'Texto antigo', content: 'Texto novo', tags: ['cobranca'],
  rejectMode: false, reason: '', saving: false, error: '', invalid: [],
  onStartReject: noop, onCancelReject: noop, onReasonChange: noop, onApprove: noop, onReject: noop,
  ...overrides,
});

test('as seções são pílulas de uma tablist, com a ativa marcada', () => {
  const { register } = capture();
  const html = renderAdminView(baseModel({ isAdminAccounts: true }), register);
  const tabs = [...html.matchAll(/<button type="button" class="dp-pill" role="tab" aria-selected="(true|false)"[^>]*>([^<]+)/g)]
    .map(([, selected, label]) => [label.trim(), selected]);
  assert.deepStrictEqual(tabs.map(([label]) => label), ['Solicitações', 'Mensagens', 'Categorias', 'Arquivados', 'Acessos', 'Contas']);
  assert.deepStrictEqual(tabs.filter(([, selected]) => selected === 'true').map(([label]) => label), ['Contas']);
  assert.match(html, /role="tablist" aria-label="Seções do painel administrativo"/);
});

test('solicitações: lista à esquerda e painel com antes, proposto e as duas decisões', () => {
  const { handlers, register } = capture();
  const onApprove = () => 'aprovou';
  const html = renderAdminView(baseModel({
    isAdminSolicitacoes: true,
    solicitacaoRows: [
      { id: 'r1', titulo: 'Novo', departamento: 'Atendimento', usuario: 'Ana', tipoLabel: 'Edição', selected: true, onOpen: noop },
      { id: 'r2', titulo: 'Outro', departamento: 'Comercial', usuario: 'Bia', tipoLabel: 'Criação', selected: false, onOpen: noop },
    ],
    requestPanel: panel({ onApprove }),
  }), register);

  assert.equal([...html.matchAll(/aria-current="true"/g)].length, 1);
  assert.match(html, /data-request-id="r1"[^>]*aria-current="true"/);
  assert.match(html, /<aside class="dp-panel dp-admin__aside dp-request" aria-label="Solicitação selecionada"/);
  assert.match(html, /Antes<\/span>Texto antigo/);
  assert.match(html, /Proposto<\/span>Texto novo/);
  assert.match(html, />Rejeitar com motivo</);
  const approveKey = html.match(/data-click="([^"]+)"[^>]*>Aprovar e publicar</)[1];
  assert.equal(handlers.get(approveKey)(), 'aprovou');
});

test('rejeitar com motivo abre o campo e troca as ações', () => {
  const { register } = capture();
  const html = renderAdminView(baseModel({ isAdminSolicitacoes: true, requestPanel: panel({ rejectMode: true }) }), register);
  assert.match(html, /aria-label="Motivo da rejeição"/);
  assert.match(html, />Confirmar rejeição</);
  assert.doesNotMatch(html, />Aprovar e publicar</);
});

test('criação mostra que antes a mensagem não existia; arquivamento não tem proposto', () => {
  const { register } = capture();
  const creation = renderAdminView(baseModel({ isAdminSolicitacoes: true, requestPanel: panel({ isCreation: true, previousTitle: null, previousContent: null, previousCategory: null }) }), register);
  assert.match(creation, /Não existe — mensagem nova\./);
  const archive = renderAdminView(baseModel({ isAdminSolicitacoes: true, requestPanel: panel({ isArchive: true }) }), register);
  assert.doesNotMatch(archive, /Proposto/);
});

const account = (overrides = {}) => ({
  id: 'u1', name: 'Thiago Souza', email: 't@local.test', initials: 'TS', roleLabel: 'Colaborador',
  isSuperadmin: false, withoutAccess: false, accessLabel: 'Atendimento', membershipLabel: '1 acesso',
  onMemberships: noop, onResetPassword: noop,
  ...overrides,
});

test('"Conceder acesso" aparece só para conta sem vínculo e abre a janela de vínculos', () => {
  const { handlers, register } = capture();
  const onMemberships = () => 'vínculos';
  const html = renderAdminView(baseModel({
    isAdminAccounts: true,
    accountRows: [account({ id: 'u1', withoutAccess: true, onMemberships }), account({ id: 'u2', name: 'Ana' })],
  }), register);

  const rows = html.split('<tr data-user-id=').slice(1);
  assert.match(rows[0], /Sem vínculo/);
  assert.match(rows[0], />Conceder acesso</);
  assert.doesNotMatch(rows[1], /Conceder acesso|Sem vínculo/);
  assert.match(rows[1], /aria-label="Gerenciar acessos de Ana"/);

  const grantKey = rows[0].match(/data-click="([^"]+)"[^>]*>Conceder acesso</)[1];
  assert.equal(handlers.get(grantKey)(), 'vínculos');
});

test('tabelas são <table> com cabeçalhos e rótulos para virar cartões no celular', () => {
  const { register } = capture();
  const html = renderAdminView(baseModel({
    isAdminMsgs: true,
    adminMsgRows: [{ id: 'm1', titulo: 'Boas-vindas', conteudo: 'Olá', categoria: 'Geral', usageLabel: '3×', onEdit: noop, onArchive: noop }],
    catRows: [{ id: 'c1', nome: 'Geral', countLabel: '1 mensagem', onEdit: noop, onArchive: noop }],
  }), register);
  assert.match(html, /<table class="dp-table dp-table--cards" aria-label="Mensagens ativas">/);
  assert.deepStrictEqual([...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(([, label]) => label), ['Mensagem', 'Categoria', 'Uso', 'Ações']);
  assert.match(html, /<td data-label="Categoria">Geral<\/td>/);
  assert.match(html, /aria-label="Categorias deste acesso"/);
});

test('a Administração não carrega cor literal', () => {
  const { register } = capture();
  for (const section of ['isAdminSolicitacoes', 'isAdminMsgs', 'isAdminCats', 'isAdminArchived', 'isAdminAccounts', 'isAdminAcessos']) {
    const html = renderAdminView(baseModel({ [section]: true, requestPanel: panel(), accountRows: [account()] }), register);
    assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}\b/, section);
  }
});
