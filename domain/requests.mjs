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

export function getOrCreateIdempotencyKey(existingKey, randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (existingKey) return existingKey;
  if (typeof randomUUID !== 'function') {
    throw new Error('Não foi possível gerar a chave idempotente');
  }
  return randomUUID();
}
