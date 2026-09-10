import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScaleFixture } from './scale.mjs';

test('massa de escala contém 100 contas, 10 acessos e 1.000 mensagens determinísticas', () => {
  const first = buildScaleFixture();
  const second = buildScaleFixture();

  assert.equal(first.accounts.length, 100);
  assert.equal(first.accesses.length, 10);
  assert.equal(first.categories.length, 10);
  assert.equal(first.messages.length, 1_000);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.accesses.map(access => first.messages.filter(message => message.acesso_id === access.id).length),
    Array(10).fill(100),
  );
});
