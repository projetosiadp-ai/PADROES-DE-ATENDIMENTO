import assert from 'node:assert/strict';
import test from 'node:test';

import { renderMyRequests, renderRequestHistory } from '../views/requests-view.mjs';

const noop = () => {};

function capture() {
  const handlers = new Map();
  const register = (fn) => { const key = `k${handlers.size}`; handlers.set(key, fn); return key; };
  return { handlers, register };
}

const row = (overrides = {}) => ({
  id: 'r1', typeLabel: 'Criação', title: 'Boas-vindas', accessName: 'Clínica Centro',
  createdLabel: '10/09/2026', reviewedLabel: '11/09/2026', status: 'aprovada', statusLabel: 'Aprovada com ajustes',
  selected: false, onOpen: noop,
  ...overrides,
});

const detail = (overrides = {}) => ({
  typeLabel: 'Criação', accessName: 'Clínica Centro', title: 'Boas-vindas ajustada', status: 'aprovada',
  statusLabel: 'Aprovada com ajustes', createdLabel: '10/09/2026', reviewedLabel: '11/09/2026',
  comment: 'Ajustei o tom da saudação.', showComparison: true, isArchive: false,
  proposed: { category: 'Recepção', title: 'Boas-vindas', content: 'Oi!', tags: ['entrada'] },
  published: { category: 'Recepção', title: 'Boas-vindas ajustada', content: 'Olá, seja bem-vinda!', tags: ['entrada'] },
  previous: null,
  ...overrides,
});

const myModel = (overrides = {}) => ({
  loading: false, error: '', onRetry: noop,
  rows: [row({ selected: true }), row({ id: 'r2', title: 'Cobrança', status: 'rejeitada', statusLabel: 'Rejeitada', reviewedLabel: '12/09/2026' })],
  pageLabel: 'Página 1 de 1', hasPrevious: false, hasNext: false, onPrevious: noop, onNext: noop,
  detail: detail(), detailLoading: false, detailError: '',
  ...overrides,
});

test('Suas solicitações lista tipo, título, acesso, envio, situação e decisão, com a escolhida marcada', () => {
  const { register } = capture();
  const html = renderMyRequests(myModel(), register);
  assert.match(html, /data-testid="my-requests-ready"/);
  assert.match(html, /<ul class="dp-list" aria-label="Suas solicitações">/);
  const items = html.split('<li ').slice(1);
  assert.equal(items.length, 2);
  assert.match(items[0], /aria-current="true"/);
  assert.doesNotMatch(items[1], /aria-current/);
  assert.match(items[0], /Boas-vindas/);
  assert.match(items[0], /Criação · Clínica Centro · enviada em 10\/09\/2026 · decidida em 11\/09\/2026/);
  assert.match(items[0], /Aprovada com ajustes/);
  assert.match(items[1], /class="dp-status dp-status--rejected"[^>]*>Rejeitada/);
});

test('detalhe mostra comentário e "Você enviou" ao lado de "Publicado" quando houve ajuste', () => {
  const { register } = capture();
  const html = renderMyRequests(myModel(), register);
  const aside = html.slice(html.indexOf('<aside'));
  assert.match(aside, /aria-label="Detalhe da solicitação"/);
  assert.match(aside, /Comentário do administrador/);
  assert.match(aside, /Ajustei o tom da saudação\./);
  assert.match(aside, /Você enviou<\/span>Oi!/);
  assert.match(aside, /Publicado<\/span>Olá, seja bem-vinda!/);
});

test('pedido antigo sem versão publicada mostra só situação e comentário disponível', () => {
  const { register } = capture();
  const html = renderMyRequests(myModel({
    detail: detail({ showComparison: false, published: null, status: 'rejeitada', statusLabel: 'Rejeitada', comment: 'Motivo antigo' }),
  }), register);
  const aside = html.slice(html.indexOf('<aside'));
  assert.doesNotMatch(aside, /Publicado<\/span>/);
  assert.match(aside, /Motivo antigo/);
  assert.match(aside, /Você enviou<\/span>Oi!/);
});

test('pendente sem comentário explica que aguarda revisão', () => {
  const { register } = capture();
  const html = renderMyRequests(myModel({
    detail: detail({ status: 'pendente', statusLabel: 'Pendente', reviewedLabel: '', comment: null, showComparison: false, published: null }),
  }), register);
  assert.match(html, /Aguardando a revisão do superadministrador\./);
});

test('estados de carregamento, erro com nova tentativa, lista vazia e paginação', () => {
  const { handlers, register } = capture();
  assert.match(renderMyRequests(myModel({ loading: true, rows: [] }), register), /role="status"[^>]*>Carregando suas solicitações…/);

  const onRetry = () => 'tentou';
  const failed = renderMyRequests(myModel({ error: 'Sem conexão.', rows: [], onRetry }), register);
  assert.match(failed, /role="alert"[^>]*>Sem conexão\./);
  assert.equal(handlers.get(failed.match(/data-click="([^"]+)"[^>]*>Tentar de novo</)[1])(), 'tentou');

  assert.match(renderMyRequests(myModel({ rows: [], detail: null }), register), /Você ainda não enviou solicitações\./);

  const onNext = () => 'próxima';
  const paged = renderMyRequests(myModel({ hasNext: true, onNext, pageLabel: 'Página 1 de 3' }), register);
  assert.match(paged, /<nav class="dp-pager" aria-label="Paginação de Suas solicitações">/);
  assert.match(paged, /Página 1 de 3/);
  assert.match(paged, />Anterior<\/button>/);
  assert.match(paged.match(/<button[^>]*>Anterior<\/button>/)[0], /disabled/);
  assert.equal(handlers.get(paged.match(/data-click="([^"]+)"[^>]*>Próxima</)[1])(), 'próxima');
});

const historyModel = (overrides = {}) => ({
  loading: false, error: '', onRetry: noop,
  filters: { status: 'aprovada_com_ajustes', type: '', accessId: 'a1', requesterId: '', from: '2026-09-01', to: '' },
  statusOptions: [['', 'Todas'], ['pendente', 'Pendente'], ['aprovada', 'Aprovada'], ['aprovada_com_ajustes', 'Aprovada com ajustes'], ['rejeitada', 'Rejeitada']],
  typeOptions: [['', 'Todos'], ['criacao', 'Criação'], ['edicao', 'Edição'], ['arquivamento', 'Arquivamento']],
  accessOptions: [['', 'Todos'], ['a1', 'Clínica Centro']],
  requesterOptions: [['', 'Todas as pessoas'], ['u1', 'Ana Souza']],
  onFilter: () => noop, onClearFilters: noop,
  totalLabel: '1 solicitação encontrada',
  rows: [{
    id: 'r1', title: 'Boas-vindas ajustada', typeLabel: 'Criação', accessName: 'Clínica Centro', requesterName: 'Ana Souza',
    createdLabel: '10/09/2026', status: 'aprovada', statusLabel: 'Aprovada com ajustes',
    decisionLabel: 'Rui Lima · 11/09/2026', comment: 'Ajustei o tom.',
  }],
  pageLabel: 'Página 1 de 1', hasPrevious: false, hasNext: false, onPrevious: noop, onNext: noop,
  ...overrides,
});

test('histórico tem filtros de situação, tipo, acesso, solicitante e período, com os valores escolhidos', () => {
  const { handlers, register } = capture();
  const calls = [];
  const html = renderRequestHistory(historyModel({ onFilter: (field) => () => calls.push(field) }), register);
  assert.match(html, /role="group" aria-label="Filtros do histórico"/);
  for (const [id, label] of [['history-status', 'Situação'], ['history-type', 'Tipo'], ['history-access', 'Acesso'], ['history-requester', 'Solicitante'], ['history-from', 'De'], ['history-to', 'Até']]) {
    assert.match(html, new RegExp(`<label for="${id}" class="dp-label">${label}</label>`), label);
  }
  assert.match(html, /<option value="aprovada_com_ajustes" selected>Aprovada com ajustes<\/option>/);
  assert.match(html, /<option value="a1" selected>Clínica Centro<\/option>/);
  assert.match(html, /<input class="dp-field" id="history-from" type="date" value="2026-09-01"/);
  const statusKey = html.match(/id="history-status"[^>]*data-change="([^"]+)"/)[1];
  handlers.get(statusKey)();
  assert.deepStrictEqual(calls.includes('status'), true);
  assert.match(html, />Limpar filtros</);
});

test('histórico mostra decisão, quem decidiu, quando e comentário em tabela que vira cartões', () => {
  const { register } = capture();
  const html = renderRequestHistory(historyModel(), register);
  assert.match(html, /<table class="dp-table dp-table--cards" aria-label="Histórico de solicitações">/);
  assert.deepStrictEqual(
    [...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(([, label]) => label),
    ['Solicitação', 'Acesso', 'Solicitante', 'Enviada', 'Situação', 'Decisão', 'Comentário'],
  );
  assert.match(html, /<td data-label="Decisão"[^>]*>Rui Lima · 11\/09\/2026<\/td>/);
  assert.match(html, /<td data-label="Comentário"[^>]*>Ajustei o tom\.<\/td>/);
  assert.match(html, /role="status"[^>]*>1 solicitação encontrada/);
});

test('histórico vazio e sem cor literal', () => {
  const { register } = capture();
  const empty = renderRequestHistory(historyModel({ rows: [], totalLabel: 'Nenhuma solicitação encontrada' }), register);
  assert.match(empty, /Nenhuma solicitação corresponde aos filtros\./);
  for (const html of [empty, renderRequestHistory(historyModel(), register), renderMyRequests(myModel(), register)]) {
    assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}\b/);
  }
});
