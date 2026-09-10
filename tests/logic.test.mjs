// tests/logic.test.mjs
import assert from 'node:assert/strict';
import { normalize, levenshtein, fuzzyTok, matchesSearch, titleSegments, pickActiveAcesso } from '../search-utils.mjs';
import { canPublishContent, canUseAccess, canViewAdministration } from '../domain/permissions.mjs';
import { normalizeTags, paginateLibraryMessages, selectLibraryMessages } from '../domain/library.mjs';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  canTransitionRequest,
  getOrCreateIdempotencyKey,
  isArchiveRequest,
  requestTypeLabel,
} from '../domain/requests.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n  ', e.message); }
}

test('normalize removes accents and lowercases', () => {
  assert.strictEqual(normalize('Confirmação'), 'confirmacao');
});

test('levenshtein distance of identical strings is 0', () => {
  assert.strictEqual(levenshtein('teste', 'teste'), 0);
});

test('levenshtein distance of one substitution is 1', () => {
  assert.strictEqual(levenshtein('reembolso', 'reenbolso'), 1);
});

test('fuzzyTok matches a near-miss typo on a token of length >= 4', () => {
  assert.strictEqual(fuzzyTok('reenbolso', 'reembolso'), true);
});

test('fuzzyTok does not match unrelated short tokens', () => {
  assert.strictEqual(fuzzyTok('oi', 'ola'), false);
});

test('matchesSearch finds a message by content substring', () => {
  const msg = { titulo: 'Reembolso processado', categoria: 'Resolução de Problema', tags: ['financeiro'], conteudo: 'Seu pedido de reembolso foi processado.' };
  assert.strictEqual(matchesSearch(msg, 'reembolso'), true);
});

test('matchesSearch returns false when no token matches', () => {
  const msg = { titulo: 'Reembolso processado', categoria: 'Resolução de Problema', tags: ['financeiro'], conteudo: 'Seu pedido foi processado.' };
  assert.strictEqual(matchesSearch(msg, 'agendamento'), false);
});

test('titleSegments highlights the matched substring with the given style', () => {
  const segs = titleSegments('Confirmação de agendamento', 'agendamento', 'HIGHLIGHT');
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[1].text, 'agendamento');
  assert.strictEqual(segs[1].style, 'HIGHLIGHT');
});

test('titleSegments returns a single plain segment when the query is empty', () => {
  const segs = titleSegments('Boas-vindas', '', 'HIGHLIGHT');
  assert.deepStrictEqual(segs, [{ text: 'Boas-vindas', style: '' }]);
});

test('pickActiveAcesso retorna o acesso com o id ativo quando ele existe na lista', () => {
  const acessos = [{ id: 'a1', nome: 'Relacionamento' }, { id: 'a2', nome: 'Comercial' }];
  assert.deepStrictEqual(pickActiveAcesso(acessos, 'a2'), { id: 'a2', nome: 'Comercial' });
});

test('pickActiveAcesso cai para o primeiro acesso quando o id ativo nao existe na lista', () => {
  const acessos = [{ id: 'a1', nome: 'Relacionamento' }, { id: 'a2', nome: 'Comercial' }];
  assert.deepStrictEqual(pickActiveAcesso(acessos, 'id-que-nao-existe'), { id: 'a1', nome: 'Relacionamento' });
});

test('pickActiveAcesso cai para o primeiro acesso quando activeAcessoId e null', () => {
  const acessos = [{ id: 'a1', nome: 'Relacionamento' }];
  assert.deepStrictEqual(pickActiveAcesso(acessos, null), { id: 'a1', nome: 'Relacionamento' });
});

test('pickActiveAcesso retorna null quando a lista de acessos esta vazia (usuario sem nenhum Acesso vinculado)', () => {
  assert.strictEqual(pickActiveAcesso([], 'a1'), null);
  assert.strictEqual(pickActiveAcesso([], null), null);
});

test('somente superadmin pode visualizar administracao e publicar conteudo', () => {
  assert.strictEqual(canViewAdministration('superadmin'), true);
  assert.strictEqual(canPublishContent('superadmin'), true);
  assert.strictEqual(canViewAdministration('colaborador'), false);
  assert.strictEqual(canPublishContent('colaborador'), false);
  assert.strictEqual(canViewAdministration('user'), false);
  assert.strictEqual(canPublishContent(undefined), false);
});

test('superadmin ativo pode usar qualquer acesso ativo sem vinculo', () => {
  const allowed = canUseAccess({
    profile: { id: 'admin', role: 'superadmin', ativo: true },
    access: { id: 'acesso-b', ativo: true },
    memberships: [],
  });
  assert.strictEqual(allowed, true);
});

test('colaborador ativo pode usar somente acesso ativo ao qual esta vinculado', () => {
  const profile = { id: 'colab', role: 'colaborador', ativo: true };
  const memberships = [{ user_id: 'colab', acesso_id: 'acesso-a' }];

  assert.strictEqual(canUseAccess({ profile, access: { id: 'acesso-a', ativo: true }, memberships }), true);
  assert.strictEqual(canUseAccess({ profile, access: { id: 'acesso-b', ativo: true }, memberships }), false);
  assert.strictEqual(canUseAccess({ profile, access: { id: 'acesso-a', ativo: false }, memberships }), false);
  assert.strictEqual(canUseAccess({ profile: { ...profile, ativo: false }, access: { id: 'acesso-a', ativo: true }, memberships }), false);
});

const libraryMessages = [
  { id: 'm1', titulo: 'Zebra', conteudo: 'Confirmacao de consulta', categoria_id: 'c1', categoria: 'Agenda', tags: ['consulta'], frequencia: 2, used_at: '2026-08-01T10:00:00Z', arquivado_em: null },
  { id: 'm2', titulo: 'Abono', conteudo: 'Reembolso aprovado', categoria_id: 'c2', categoria: 'Financeiro', tags: ['reembolso'], frequencia: 9, used_at: '2026-08-03T10:00:00Z', arquivado_em: null },
  { id: 'm3', titulo: 'Boas-vindas', conteudo: 'Recepcao inicial', categoria_id: 'c1', categoria: 'Agenda', tags: ['inicio'], frequencia: 4, used_at: '2026-08-02T10:00:00Z', arquivado_em: null },
  { id: 'm4', titulo: 'Arquivada', conteudo: 'Reembolso antigo', categoria_id: 'c2', categoria: 'Financeiro', tags: ['reembolso'], frequencia: 99, used_at: '2026-09-01T10:00:00Z', arquivado_em: '2026-09-01T12:00:00Z' },
];

test('selecao da biblioteca exclui arquivadas antes de aplicar busca e categoria', () => {
  assert.deepStrictEqual(
    selectLibraryMessages(libraryMessages, { query: 'reembolso', categoryId: 'c2' }).map(message => message.id),
    ['m2'],
  );
});

test('selecao da biblioteca ordena por frequencia, recencia e titulo sem alterar a entrada', () => {
  const originalOrder = libraryMessages.map(message => message.id);

  assert.deepStrictEqual(selectLibraryMessages(libraryMessages, { sortBy: 'frequencia' }).map(message => message.id), ['m2', 'm3', 'm1']);
  assert.deepStrictEqual(selectLibraryMessages(libraryMessages, { sortBy: 'recencia' }).map(message => message.id), ['m2', 'm3', 'm1']);
  assert.deepStrictEqual(selectLibraryMessages(libraryMessages, { sortBy: 'alfabetica' }).map(message => message.id), ['m2', 'm3', 'm1']);
  assert.deepStrictEqual(libraryMessages.map(message => message.id), originalOrder);
});

test('relevancia preserva a ordem recebida entre mensagens ativas correspondentes', () => {
  assert.deepStrictEqual(
    selectLibraryMessages(libraryMessages, { query: 'agenda', sortBy: 'relevancia' }).map(message => message.id),
    ['m1', 'm3'],
  );
});

test('paginacao da biblioteca preserva o total e amplia o lote deterministicamente', () => {
  const messages = Array.from({ length: 75 }, (_, index) => ({ id: `m${index + 1}` }));
  assert.deepStrictEqual(paginateLibraryMessages(messages, 30), {
    items: messages.slice(0, 30), total: 75, hasMore: true, nextLimit: 60,
  });
  assert.deepStrictEqual(paginateLibraryMessages(messages, 90), {
    items: messages, total: 75, hasMore: false, nextLimit: 75,
  });
});

test('tipos e estados de solicitacao possuem rotulos para exibicao', () => {
  assert.deepStrictEqual(REQUEST_TYPE_LABELS, {
    criacao: 'Criação',
    edicao: 'Edição',
    arquivamento: 'Arquivamento',
  });
  assert.deepStrictEqual(REQUEST_STATUS_LABELS, {
    pendente: 'Pendente',
    aprovada: 'Aprovada',
    rejeitada: 'Rejeitada',
  });
});

test('solicitacao pendente aceita uma decisao e estados finais sao imutaveis', () => {
  assert.strictEqual(canTransitionRequest('pendente', 'aprovar'), true);
  assert.strictEqual(canTransitionRequest('pendente', 'rejeitar'), true);
  assert.strictEqual(canTransitionRequest('aprovada', 'rejeitar'), false);
  assert.strictEqual(canTransitionRequest('rejeitada', 'aprovar'), false);
  assert.strictEqual(canTransitionRequest('pendente', 'publicar'), false);
});

test('retry reutiliza chave idempotente e uma nova tentativa gera UUID', () => {
  const existingKey = '11111111-1111-4111-8111-111111111111';
  let generated = 0;
  const randomUUID = () => {
    generated++;
    return '22222222-2222-4222-8222-222222222222';
  };

  assert.strictEqual(getOrCreateIdempotencyKey(existingKey, randomUUID), existingKey);
  assert.strictEqual(generated, 0);
  assert.strictEqual(getOrCreateIdempotencyKey(null, randomUUID), '22222222-2222-4222-8222-222222222222');
  assert.strictEqual(generated, 1);
});

test('tags sao normalizadas uma unica vez para formulario e proposta', () => {
  assert.deepStrictEqual(normalizeTags(' Cobrança, retorno ,cobrança,, RETORNO '), ['Cobrança', 'retorno']);
  assert.deepStrictEqual(normalizeTags(['Pix', 'pix', ' ', 'Boleto']), ['Pix', 'Boleto']);
  assert.deepStrictEqual(normalizeTags(), []);
});

test('rotulo de solicitacao trata o tipo legado exclusao como arquivamento', () => {
  assert.strictEqual(requestTypeLabel('criacao'), 'Criação');
  assert.strictEqual(requestTypeLabel('exclusao'), 'Arquivamento');
  assert.strictEqual(isArchiveRequest('exclusao'), true);
  assert.strictEqual(isArchiveRequest('edicao'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
