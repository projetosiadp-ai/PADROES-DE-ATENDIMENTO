import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../supabase/schema.sql', import.meta.url);

test('snapshot consolidado contém os schemas público e privado', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  assert.match(schema, /CREATE SCHEMA IF NOT EXISTS "public"/);
  assert.match(schema, /CREATE SCHEMA IF NOT EXISTS "private"/);
  assert.match(schema, /"profiles_role_check" CHECK .*'colaborador'.*'superadmin'/s);
});

test('snapshot não reintroduz exclusão física, papel user ou admin local', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  assert.doesNotMatch(schema, /delete\s+from\s+public\.(?:mensagens|categorias)/i);
  assert.doesNotMatch(schema, /'user'::"text"/i);
  assert.doesNotMatch(schema, /is_admin_local"?\s*=\s*true/i);
  assert.match(schema, /"acesso_membros_admin_local_disabled_check" CHECK \(\("is_admin_local" = false\)\)/);
});
