import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const PINNED = '2.112.4';
const file = (path) => new URL(`../${path}`, import.meta.url);
const sha256 = async (path) => createHash('sha256').update(await readFile(file(path))).digest('hex');

test(`@supabase/supabase-js fica fixado em ${PINNED} no manifesto e no lockfile`, async () => {
  const manifest = JSON.parse(await readFile(file('package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(file('package-lock.json'), 'utf8'));
  assert.strictEqual(manifest.dependencies['@supabase/supabase-js'], PINNED);
  assert.strictEqual(lock.packages[''].dependencies['@supabase/supabase-js'], PINNED);
  assert.strictEqual(lock.packages['node_modules/@supabase/supabase-js'].version, PINNED);
});

test('o bundle servido localmente é a mesma versão fixada', async () => {
  const bundle = await readFile(file('vendor/supabase.js'), 'utf8');
  const versions = new Set([...bundle.matchAll(/supabase-js\/(\d+\.\d+\.\d+)/g)].map(match => match[1]));
  assert.deepStrictEqual([...versions], [PINNED]);

  const installed = 'node_modules/@supabase/supabase-js/dist/umd/supabase.js';
  const hasInstalled = await access(file(installed)).then(() => true, () => false);
  if (hasInstalled) assert.strictEqual(await sha256('vendor/supabase.js'), await sha256(installed));
});

test('o shell carrega o cliente somente do bundle local', async () => {
  const html = await readFile(file('index.html'), 'utf8');
  assert.match(html, /<script src="vendor\/supabase\.js"><\/script>/);
  assert.doesNotMatch(html, /esm\.sh|cdn\.jsdelivr|unpkg\.com/);
});
