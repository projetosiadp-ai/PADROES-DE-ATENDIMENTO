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

test('snapshot guarda a revisão com ajustes da Etapa 5', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  for (const column of [
    'categoria_id_publicada', 'categoria_publicada', 'titulo_publicado', 'conteudo_publicado',
    'tags_publicadas', 'comentario_revisao',
  ]) {
    assert.match(schema, new RegExp(`"${column}" "(?:uuid|text)"`), `coluna ${column}`);
  }
  assert.match(schema, /"ajustada" boolean DEFAULT false NOT NULL/);
  assert.match(schema, /"solicitacoes_mensagem_pendente_sem_revisao_check" CHECK/);
  assert.match(schema, /"aprovar_solicitacao"\("p_id" "uuid", "p_ajustes" "jsonb" DEFAULT NULL::"jsonb", "p_comentario" "text" DEFAULT NULL::"text"\)/);
  assert.doesNotMatch(schema, /FUNCTION "public"\."aprovar_solicitacao"\("p_id" "uuid"\) /);
  assert.doesNotMatch(schema, /GRANT .*"aprovar_solicitacao".* TO "anon"/);
});

test('snapshot não reintroduz exclusão física, papel user ou admin local', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  assert.doesNotMatch(schema, /delete\s+from\s+public\.(?:mensagens|categorias)/i);
  assert.doesNotMatch(schema, /'user'::"text"/i);
  assert.doesNotMatch(schema, /is_admin_local"?\s*=\s*true/i);
  assert.match(schema, /"acesso_membros_admin_local_disabled_check" CHECK \(\("is_admin_local" = false\)\)/);
});
