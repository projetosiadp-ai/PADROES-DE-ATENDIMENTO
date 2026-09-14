import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

test('configuração Vercel protege todas as rotas e impede indexação', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', rootUrl), 'utf8'));
  const globalHeaders = Object.fromEntries(
    config.headers.find(rule => rule.source === '/(.*)').headers.map(({ key, value }) => [key, value]),
  );
  assert.match(globalHeaders['Content-Security-Policy'], /default-src 'self'/);
  assert.match(globalHeaders['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(globalHeaders['Content-Security-Policy'], /127\.0\.0\.1|localhost/);
  assert.match(globalHeaders['X-Robots-Tag'], /noindex/);
  assert.equal(globalHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(globalHeaders['X-Frame-Options'], 'DENY');
  assert.equal(globalHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('código é revalidado a cada carregamento e só os arquivos versionados ficam em cache', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', rootUrl), 'utf8'));
  const cacheOf = (source) => config.headers
    .find(rule => rule.source === source)?.headers
    .find(({ key }) => key === 'Cache-Control')?.value;

  for (const source of ['/(.*)', '/domain/(.*)', '/ui/(.*)', '/views/(.*)', '/styles/(.*)']) {
    assert.strictEqual(cacheOf(source), 'public, max-age=0, must-revalidate', source);
  }
  for (const source of ['/vendor/(.*)', '/assets/(.*)']) {
    assert.strictEqual(cacheOf(source), 'public, max-age=3600, stale-while-revalidate=86400', source);
  }
});

test('HTML repete a diretiva de não indexação', async () => {
  const html = await readFile(new URL('index.html', rootUrl), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">/);
});
