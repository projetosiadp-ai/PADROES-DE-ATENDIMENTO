import { assertLocalUrl, LOCAL_SUPABASE_URL } from './auth.mjs';
import { TEST_DATA, TEST_IDS } from './data.mjs';
import { upsert } from './scale.mjs';

// Etapa 5: pedido "Aprovada com ajustes" fixo do Colaborador Beta, que nenhuma jornada usa para
// enviar pedidos. Dá às fotos de "Suas solicitações" e do histórico filtrado um estado estável.
export const ADJUSTED_REQUEST = Object.freeze({
  id: '50000000-0000-4000-8000-000000000001',
  proposedTitle: 'Proposta de retorno comercial',
  publishedTitle: 'Retorno comercial em até 24 horas',
  comment: 'Ajustei o prazo para o padrão da equipe comercial.',
});

export async function ensureAdjustedRequest() {
  assertLocalUrl(LOCAL_SUPABASE_URL, 'Supabase local');
  const beta = TEST_DATA.messageBeta;
  await upsert('solicitacoes_mensagem', [{
    id: ADJUSTED_REQUEST.id,
    idempotency_key: '50000000-0000-4000-8000-000000000101',
    acesso_id: TEST_IDS.accessBeta,
    mensagem_id: null,
    tipo: 'criacao',
    status: 'aprovada',
    categoria_id: beta.categoria_id,
    categoria: beta.categoria,
    titulo: ADJUSTED_REQUEST.proposedTitle,
    conteudo: 'Vamos retornar sua proposta assim que possível.',
    tags: ['retorno'],
    solicitado_por: TEST_IDS.otherCollaborator,
    criado_em: '2026-09-09T13:00:00.000Z',
    revisado_por: TEST_IDS.superadmin,
    revisado_em: '2026-09-10T15:30:00.000Z',
    motivo_rejeicao: null,
    categoria_id_publicada: beta.categoria_id,
    categoria_publicada: beta.categoria,
    titulo_publicado: ADJUSTED_REQUEST.publishedTitle,
    conteudo_publicado: 'Retornamos sua proposta em até 24 horas úteis.',
    tags_publicadas: ['retorno', 'prazo'],
    comentario_revisao: ADJUSTED_REQUEST.comment,
    ajustada: true,
  }]);
  return ADJUSTED_REQUEST;
}
