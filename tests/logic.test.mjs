// tests/logic.test.mjs
import assert from 'node:assert/strict';
import { normalize, levenshtein, fuzzyTok, matchesSearch, titleSegments, pickActiveAcesso } from '../search-utils.mjs';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
