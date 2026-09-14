import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const RE_EXPORTED = ['APP_ERROR_CODES', 'AppError', 'normalizeApiError'];

function moduleExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    match[1].split(',').map(name => name.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach(name => names.add(name));
  }
  return names;
}

function contractFunctions(markdown) {
  const names = new Set();
  for (const block of markdown.matchAll(/```js\r?\n([\s\S]*?)```/g)) {
    for (const match of block[1].matchAll(/^([a-z]\w*)\(/gm)) names.add(match[1]);
  }
  return names;
}

const [apiSource, appSource, contract] = await Promise.all([
  read('api.js'),
  read('app.js'),
  read('specs/001-evoluir-biblioteca-mensagens/contracts/data-access.md'),
]);
const exported = moduleExports(apiSource);

test('api.js exporta exatamente as interfaces de contracts/data-access.md, sem aliases', () => {
  const expected = [...contractFunctions(contract), ...RE_EXPORTED].sort();
  assert.deepStrictEqual([...exported].sort(), expected);
});

test('api.js não expõe o cliente remoto nem exclusão física de mensagem ou categoria', () => {
  assert.doesNotMatch(apiSource, /export\s+(const|let)\s+supabase\b/);
  assert.doesNotMatch(apiSource, /from\('(mensagens|categorias)'\)\s*\.delete\(/);
});

test('app.js usa somente funções exportadas pela camada de dados', () => {
  const used = new Set([...appSource.matchAll(/(?<![\w./'])api\.(\w+)/g)].map(match => match[1]));
  assert.ok(used.size > 10, 'esperava encontrar as chamadas api.* do orquestrador');
  const unknown = [...used].filter(name => !exported.has(name));
  assert.deepStrictEqual(unknown, []);
});

test('app.js não mantém renderizadores administrativos inalcançáveis nem fluxo de exclusão', () => {
  assert.doesNotMatch(appSource, /if\s*\(\s*false\b/);
  assert.match(appSource, /viewAdmin\(v, t, H\) \{\s*return renderAdminView\(v, t, H\);\s*\}/);
  assert.doesNotMatch(appSource, /deleteMensagem|deleteCategoria|scheduleDelete|pendingDeleteIds|undoDelete/);
  assert.doesNotMatch(appSource, /\bExclu(ir|são|ída)\b/i);
});

test('o tema escuro e a barra lateral não deixam resquícios no orquestrador', () => {
  assert.doesNotMatch(appSource, /darkMode|sidebarCollapsed|viewSidebar|toggleDarkMode|Alternar tema/);
  // A preferência antiga é apagada do navegador de quem já tinha o tema escuro (FR-012).
  assert.match(appSource, /localStorage\.removeItem\('dp_darkmode'\)/);
});

test('regras de papel e de acesso vêm de domain/permissions.mjs', () => {
  assert.doesNotMatch(appSource, /===\s*'superadmin'/);
  assert.match(appSource, /canUseAccess\(/);
  assert.match(appSource, /canPublishContent\(/);
});

test('views não oferecem "Excluir" no fluxo normal', async () => {
  for (const file of ['views/library-view.mjs', 'views/admin-view.mjs', 'views/modal-view.mjs']) {
    assert.doesNotMatch(await read(file), /\bExcluir\b/, file);
  }
});

test('conteúdo da biblioteca não é persistido em Web Storage', () => {
  assert.doesNotMatch(appSource, /sessionStorage\.setItem/);
  const localKeys = [...appSource.matchAll(/localStorage\.setItem\('([^']+)'/g)].map(match => match[1]);
  assert.deepStrictEqual([...new Set(localKeys)].sort(), ['dp_active_acesso', 'dp_novidades']);
  const apiSessionWrites = [...apiSource.matchAll(/sessionStorage\.setItem\((\w+)/g)].map(match => match[1]);
  assert.deepStrictEqual([...new Set(apiSessionWrites)], ['SESSION_EXPIRED_KEY']);
});
