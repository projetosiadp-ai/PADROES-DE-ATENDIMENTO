import { ERROR_MESSAGES, normalizeApiError } from './api-errors.mjs';

// Safe UI behavior per contract code (contracts/ui-behavior.md, "Errors and progress").
// app.js executes these flags; this module is the single source of the mapping.
const policy = (flags) => Object.freeze({
  clearSession: false,
  closePrompt: false,
  closeDetail: false,
  refresh: false,
  keepInput: false,
  focusInvalid: false,
  offerRetry: false,
  ...flags,
});

export const ERROR_POLICIES = Object.freeze({
  AUTH_REQUIRED: policy({ clearSession: true }),
  FORBIDDEN: policy({ closePrompt: true, keepInput: true }),
  NOT_FOUND: policy({ closePrompt: true, closeDetail: true, refresh: true }),
  CONFLICT: policy({ keepInput: true, refresh: true }),
  VALIDATION: policy({ keepInput: true, focusInvalid: true }),
  NETWORK: policy({ keepInput: true, offerRetry: true }),
  UNKNOWN: policy({ keepInput: true }),
});

const REASON_MESSAGES = Object.freeze({
  CATEGORY_NOT_EMPTY: ({ count }) => {
    if (count === 1) return 'Arquive ou reclassifique a mensagem ativa desta categoria antes de continuar.';
    const amount = Number.isInteger(count) ? `${count} ` : '';
    return `Arquive ou reclassifique as ${amount}mensagens ativas desta categoria antes de continuar.`;
  },
  // Etapa 5: revisão com ajustes (contracts/database-rpcs.md).
  ADJUSTMENTS_NOT_ALLOWED: () => 'Pedidos de arquivamento só podem ser aprovados ou rejeitados, sem ajustes.',
  REVIEW_COMMENT: () => 'O comentário deve ter no máximo 500 caracteres.',
  REJECTION_REASON: () => 'Informe o motivo da rejeição, com até 500 caracteres.',
  TITLE: () => 'O título deve ter de 1 a 100 caracteres.',
  CONTENT: () => 'O conteúdo deve ter de 1 a 2000 caracteres.',
  TAGS: () => 'Revise as etiquetas: não use etiquetas vazias ou repetidas.',
  CATEGORY_NOT_ACTIVE_IN_ACCESS: () => 'Escolha uma categoria ativa deste acesso.',
});

export function describeAppError(error) {
  const appError = normalizeApiError(error);
  const guidance = ERROR_MESSAGES[appError.code];
  if (appError.code === 'AUTH_REQUIRED') return guidance;

  const reasonMessage = REASON_MESSAGES[appError.details?.reason];
  if (reasonMessage) return reasonMessage(appError.details);

  const message = String(appError.message ?? '').trim();
  if (!message || message === guidance) return guidance;
  return `${message.replace(/[.!…\s]+$/u, '')}. ${guidance}`;
}

export function resolveErrorPolicy(error, messageOverrides = {}) {
  const appError = normalizeApiError(error);
  return {
    ...ERROR_POLICIES[appError.code],
    code: appError.code,
    error: appError,
    message: messageOverrides[appError.code] ?? describeAppError(appError),
  };
}
