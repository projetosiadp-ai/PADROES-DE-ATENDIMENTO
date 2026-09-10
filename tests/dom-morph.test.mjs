import assert from 'node:assert/strict';
import test from 'node:test';

import { syncFormValue } from '../ui/dom-morph.mjs';

function createField({ tagName = 'INPUT', value = '', start = 0, end = start, direction = 'none' } = {}) {
  let currentValue = value;
  const writes = [];
  const selections = [];
  const field = {
    tagName,
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: direction,
    get value() { return currentValue; },
    set value(next) {
      writes.push(next);
      currentValue = next;
    },
    setSelectionRange(nextStart, nextEnd, nextDirection) {
      selections.push([nextStart, nextEnd, nextDirection]);
      this.selectionStart = nextStart;
      this.selectionEnd = nextEnd;
      this.selectionDirection = nextDirection;
    },
  };
  field.ownerDocument = { activeElement: field };
  return { field, writes, selections };
}

test('atualiza input ativo e restaura selecao e direcao do caret', () => {
  const current = createField({ value: 'mensgem', start: 4, end: 6, direction: 'backward' });
  const next = createField({ value: 'mensagem' });

  syncFormValue(current.field, next.field);

  assert.strictEqual(current.field.value, 'mensagem');
  assert.deepStrictEqual(current.selections, [[4, 6, 'backward']]);
});

test('nao reatribui valor identico nem perturba o caret', () => {
  const current = createField({ value: 'texto', start: 3 });
  const next = createField({ value: 'texto' });

  syncFormValue(current.field, next.field);

  assert.deepStrictEqual(current.writes, []);
  assert.deepStrictEqual(current.selections, []);
  assert.strictEqual(current.field.selectionStart, 3);
});

test('atualiza select sem tentar manipular selecao textual', () => {
  const current = createField({ tagName: 'SELECT', value: 'a' });
  const next = createField({ tagName: 'SELECT', value: 'b' });

  syncFormValue(current.field, next.field);

  assert.strictEqual(current.field.value, 'b');
  assert.deepStrictEqual(current.selections, []);
});
