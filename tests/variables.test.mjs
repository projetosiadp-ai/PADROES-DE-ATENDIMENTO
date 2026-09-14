import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractVariables,
  fillVariables,
  insertAtCursor,
  variableLabel,
  variableSegments,
  variablesStatus,
} from '../domain/variables.mjs';

test('reconhece maiúsculas, acentos, números e sublinhado entre colchetes', () => {
  assert.deepStrictEqual(
    extractVariables('Olá [NOME], vence em [DATA_VENCIMENTO] no [ENDEREÇO] do plano [PLANO2].'),
    ['NOME', 'DATA_VENCIMENTO', 'ENDEREÇO', 'PLANO2'],
  );
});

test('ignora colchetes com minúsculas, espaços ou vazios', () => {
  assert.deepStrictEqual(extractVariables('Veja [ver anexo], [Nome], [] e [NOME COMPLETO].'), []);
});

test('um campo por variável distinta, na ordem da primeira aparição', () => {
  assert.deepStrictEqual(extractVariables('[NOME], [DATA]. Obrigado, [NOME]!'), ['NOME', 'DATA']);
});

test('o rótulo é derivado do nome', () => {
  assert.equal(variableLabel('NOME'), 'Nome');
  assert.equal(variableLabel('DATA_VENCIMENTO'), 'Data vencimento');
  assert.equal(variableLabel('ENDEREÇO'), 'Endereço');
});

test('preenche todas as ocorrências e mantém as vazias entre colchetes', () => {
  const result = fillVariables('[NOME], sua fatura vence em [DATA]. Até logo, [NOME]!', { NOME: 'Marina', DATA: '   ' });
  assert.equal(result.text, 'Marina, sua fatura vence em [DATA]. Até logo, Marina!');
  assert.deepStrictEqual({ filled: result.filled, empty: result.empty, total: result.total }, { filled: 1, empty: 1, total: 2 });
});

test('valores com cifrão ou barras são inseridos literalmente', () => {
  assert.equal(fillVariables('Total: [VALOR]', { VALOR: 'R$ 10,00 $& $1' }).text, 'Total: R$ 10,00 $& $1');
});

test('mensagem sem variáveis continua igual', () => {
  assert.deepStrictEqual(fillVariables('Olá! Como podemos ajudar?', {}), { text: 'Olá! Como podemos ajudar?', filled: 0, empty: 0, total: 0 });
});

test('trechos separam texto, variável vazia e valor digitado', () => {
  assert.deepStrictEqual(variableSegments('Oi [NOME], até [DATA].', { NOME: 'Ana' }), [
    { kind: 'text', text: 'Oi ' },
    { kind: 'value', name: 'NOME', text: 'Ana' },
    { kind: 'text', text: ', até ' },
    { kind: 'variable', name: 'DATA', text: '[DATA]' },
    { kind: 'text', text: '.' },
  ]);
});

test('texto de estado conta preenchidas e sem preencher', () => {
  assert.equal(variablesStatus({ filled: 2, empty: 0 }), '2 variáveis preenchidas');
  assert.equal(variablesStatus({ filled: 1, empty: 1 }), '1 variável preenchida · 1 sem preencher');
});

test('inserir variável respeita a posição do cursor e a seleção', () => {
  assert.deepStrictEqual(insertAtCursor('Olá , tudo bem?', '[NOME]', 4), { text: 'Olá [NOME], tudo bem?', caret: 10 });
  assert.deepStrictEqual(insertAtCursor('Olá fulano!', '[NOME]', 4, 10), { text: 'Olá [NOME]!', caret: 10 });
  assert.deepStrictEqual(insertAtCursor('Fim', '[DATA]'), { text: 'Fim[DATA]', caret: 9 });
});
