export const REQUEST_TYPES = Object.freeze(['criacao', 'edicao', 'arquivamento']);
export const REQUEST_STATUSES = Object.freeze(['pendente', 'aprovada', 'rejeitada']);

export const REQUEST_TYPE_LABELS = Object.freeze({
  criacao: 'Criação',
  edicao: 'Edição',
  arquivamento: 'Arquivamento',
});

export const REQUEST_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
});

const TRANSITION_TARGETS = Object.freeze({
  aprovar: 'aprovada',
  rejeitar: 'rejeitada',
});

// Pending requests created before the rollout may still carry the legacy `exclusao` type,
// which the review RPC applies as an archive.
export function requestTypeLabel(type) {
  return REQUEST_TYPE_LABELS[type === 'exclusao' ? 'arquivamento' : type] ?? 'Solicitação';
}

export function isArchiveRequest(type) {
  return type === 'arquivamento' || type === 'exclusao';
}

export function canTransitionRequest(currentStatus, action) {
  return currentStatus === 'pendente' && Object.hasOwn(TRANSITION_TARGETS, action);
}

export function validateRequestTransition(currentStatus, action) {
  if (!canTransitionRequest(currentStatus, action)) {
    throw new RangeError(`Transição de solicitação inválida: ${currentStatus} -> ${action}`);
  }
  return TRANSITION_TARGETS[action];
}

// Etapa 5: "Aprovada com ajustes" não é um novo status no banco, e sim aprovada + ajustada.
export const ADJUSTED_STATUS_LABEL = 'Aprovada com ajustes';

export function requestStatusLabel(status, adjusted = false) {
  if (status === 'aprovada' && adjusted === true) return ADJUSTED_STATUS_LABEL;
  return REQUEST_STATUS_LABELS[status] ?? 'Solicitação';
}

// Pedidos decididos antes da Etapa 5 não têm versão publicada separada: sem comparação lado a lado.
export function hasPublishedComparison(request) {
  return request?.ajustada === true && request?.titulo_publicado != null;
}

export const REQUEST_HISTORY_STATUS_FILTERS = Object.freeze(['pendente', 'aprovada', 'aprovada_com_ajustes', 'rejeitada']);

export const REQUEST_HISTORY_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  aprovada_com_ajustes: ADJUSTED_STATUS_LABEL,
  rejeitada: 'Rejeitada',
});

export function requestStatusFilter(filter) {
  if (filter === undefined || filter === null || filter === '') return { status: null, adjusted: null };
  if (!REQUEST_HISTORY_STATUS_FILTERS.includes(filter)) {
    throw new RangeError(`Filtro de situação inválido: ${filter}`);
  }
  if (filter === 'aprovada_com_ajustes') return { status: 'aprovada', adjusted: true };
  if (filter === 'aprovada') return { status: 'aprovada', adjusted: false };
  return { status: filter, adjusted: null };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
// São Paulo não tem horário de verão desde 2019: o dia começa às 00:00 -03:00.
const SAO_PAULO_OFFSET = '-03:00';

function dayStart(day) {
  return `${day}T00:00:00${SAO_PAULO_OFFSET}`;
}

function nextDay(day) {
  const [, year, month, date] = ISO_DAY.exec(day);
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date) + 1));
  return next.toISOString().slice(0, 10);
}

export function historyDateBounds({ from, to } = {}) {
  for (const day of [from, to]) {
    if (day && !ISO_DAY.test(day)) throw new RangeError(`Data inválida: ${day}`);
  }
  return {
    gte: from ? dayStart(from) : null,
    lt: to ? dayStart(nextDay(to)) : null,
  };
}

export const REVIEW_COMMENT_MAX = 500;

export function normalizeReviewComment(comment) {
  const value = String(comment ?? '').trim();
  return value === '' ? null : value;
}

export function reviewCommentError(comment, { required = false } = {}) {
  const value = normalizeReviewComment(comment);
  if (value === null) return required ? 'Informe o motivo da rejeição.' : null;
  if (value.length > REVIEW_COMMENT_MAX) return `Use no máximo ${REVIEW_COMMENT_MAX} caracteres.`;
  return null;
}

export function toAdjustmentsPayload(adjustments) {
  if (!adjustments) return null;
  return {
    categoria_id: adjustments.categoryId,
    titulo: String(adjustments.title ?? '').trim(),
    tags: adjustments.tags ?? [],
    conteudo: String(adjustments.content ?? '').trim(),
  };
}

export function toRequestSummary(row) {
  const adjusted = row.ajustada === true;
  return {
    id: row.id,
    type: row.tipo,
    status: row.status,
    adjusted,
    statusLabel: requestStatusLabel(row.status, adjusted),
    title: row.titulo_publicado ?? row.titulo ?? row.titulo_anterior ?? '',
    accessName: row.acessos?.nome ?? null,
    requesterName: row.solicitante?.nome ?? null,
    createdAt: row.criado_em,
    reviewedAt: row.revisado_em ?? null,
    reviewerName: row.revisor?.nome ?? null,
    comment: row.comentario_revisao ?? row.motivo_rejeicao ?? null,
  };
}

function version(row, suffix, categoryIdColumn) {
  const title = row[`titulo${suffix}`];
  if (title == null) return null;
  const tagsColumn = suffix === '_publicado' ? 'tags_publicadas' : `tags${suffix}`;
  const categoryColumn = suffix === '_publicado' ? 'categoria_publicada' : `categoria${suffix}`;
  return {
    categoryId: row[categoryIdColumn] ?? null,
    category: row[categoryColumn] ?? null,
    title,
    content: row[`conteudo${suffix}`] ?? '',
    tags: row[tagsColumn] ?? [],
  };
}

export function toRequestDetail(row) {
  return {
    ...toRequestSummary(row),
    accessId: row.acesso_id,
    messageId: row.mensagem_id ?? null,
    previous: version(row, '_anterior', 'categoria_id_anterior'),
    proposed: version(row, '', 'categoria_id'),
    published: version(row, '_publicado', 'categoria_id_publicada'),
    showComparison: hasPublishedComparison(row),
  };
}

export function getOrCreateIdempotencyKey(existingKey, randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (existingKey) return existingKey;
  if (typeof randomUUID !== 'function') {
    throw new Error('Não foi possível gerar a chave idempotente');
  }
  return randomUUID();
}
