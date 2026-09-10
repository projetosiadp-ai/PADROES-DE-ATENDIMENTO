import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const JWT = /'(eyJ[\w-]+\.[\w-]+\.[\w-]+)'/;

test('config.js usa no ambiente local a mesma chave anon de demonstração de config.local.js', async () => {
  const [config, local] = await Promise.all([read('config.js'), read('config.local.js')]);
  const configKey = config.match(JWT)?.[1];
  const localKey = local.match(JWT)?.[1];

  assert.ok(configKey, 'config.js deve declarar a chave local');
  assert.strictEqual(configKey, localKey);
  const { role, iss } = claims(configKey);
  assert.deepStrictEqual({ role, iss }, { role: 'anon', iss: 'supabase-demo' });
});

test('config.js nunca embute chave de serviço', async () => {
  const config = await read('config.js');
  assert.doesNotMatch(config, /sb_secret_|service_role/);
  for (const [token] of config.matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)) {
    assert.notStrictEqual(claims(token).role, 'service_role');
  }
});
