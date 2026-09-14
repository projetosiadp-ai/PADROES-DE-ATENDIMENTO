import { assertLocalUrl, LOCAL_SUPABASE_URL } from './auth.mjs';
import { TEST_DATA, TEST_IDS } from './data.mjs';
import { upsert } from './scale.mjs';

// Garante no Supabase local a mensagem com variáveis do seed, com o conteúdo original e ativa.
export async function ensureVariablesMessage() {
  assertLocalUrl(LOCAL_SUPABASE_URL, 'Supabase local');
  const message = TEST_DATA.messageVariables;
  await upsert('mensagens', [{
    id: message.id,
    acesso_id: message.acesso_id,
    categoria_id: message.categoria_id,
    categoria: message.categoria,
    titulo: message.titulo,
    conteudo: message.conteudo,
    tags: [...message.tags],
    created_by: TEST_IDS.superadmin,
    arquivado_em: null,
    arquivado_por: null,
  }]);
  return message;
}
