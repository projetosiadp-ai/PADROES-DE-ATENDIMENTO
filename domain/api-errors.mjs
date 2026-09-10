export const APP_ERROR_CODES = Object.freeze([
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'NETWORK',
  'UNKNOWN',
]);

const ERROR_CODE_SET = new Set(APP_ERROR_CODES);

export const ERROR_MESSAGES = Object.freeze({
  AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
  NOT_FOUND: 'O item não existe mais ou foi alterado.',
  CONFLICT: 'O item foi alterado por outra pessoa. Atualize e tente novamente.',
  VALIDATION: 'Revise os dados informados e tente novamente.',
  NETWORK: 'Não foi possível conectar. Verifique a rede e tente novamente.',
  UNKNOWN: 'Não foi possível concluir a ação. Tente novamente ou procure suporte.',
});

const AUTH_CODES = new Set([
  'invalid_jwt',
  'jwt_expired',
  'refresh_token_not_found',
  'session_not_found',
  'bad_jwt',
  // PostgREST rejects an invalid/expired JWT with these codes; its error object carries no status.
  'PGRST301',
  'PGRST302',
  'PGRST303',
]);
const FORBIDDEN_CODES = new Set(['42501']);
const NOT_FOUND_CODES = new Set(['PGRST116', 'PGRST205', '42P01']);
const CONFLICT_CODES = new Set(['23505', '23P01', 'PGRST409']);
const VALIDATION_CODES = new Set([
  '22000', '22001', '22003', '22P02',
  '23502', '23503', '23514',
  'PGRST100', 'PGRST102', 'PGRST204',
]);

export class AppError extends Error {
  constructor(code, message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = ERROR_CODE_SET.has(code) ? code : 'UNKNOWN';
    this.details = options.details ?? null;
    this.status = options.status ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function contractError(message) {
  if (typeof message !== 'string') return null;
  const [code, reason, rawCount] = message.trim().split(':');
  if (!ERROR_CODE_SET.has(code)) return null;

  const details = reason
    ? {
        reason,
        ...(/^\d+$/.test(rawCount ?? '') ? { count: Number(rawCount) } : {}),
      }
    : null;
  return { code, details };
}

function isNetworkError(error, message) {
  return /failed to fetch|networkerror|network request failed|connection failed|conexão/i.test(message)
    || error instanceof TypeError && /fetch|network|load|conex/i.test(message)
    || /FunctionsFetchError|AuthRetryableFetchError/i.test(String(error?.name ?? ''));
}

export function normalizeApiError(error, options = {}) {
  if (error instanceof AppError) return error;

  const message = String(error?.message ?? error ?? '');
  const code = String(error?.code ?? error?.error_code ?? '');
  const status = Number(error?.status ?? error?.context?.status) || null;
  const contracted = contractError(message);

  let normalizedCode = contracted?.code;
  if (!normalizedCode && (status === 401 || AUTH_CODES.has(code))) normalizedCode = 'AUTH_REQUIRED';
  if (!normalizedCode && (status === 403 || FORBIDDEN_CODES.has(code) || /permission denied|forbidden/i.test(message))) normalizedCode = 'FORBIDDEN';
  if (!normalizedCode && (status === 404 || NOT_FOUND_CODES.has(code))) normalizedCode = 'NOT_FOUND';
  if (!normalizedCode && (status === 409 || CONFLICT_CODES.has(code))) normalizedCode = 'CONFLICT';
  if (!normalizedCode && (status === 400 || status === 422 || VALIDATION_CODES.has(code))) normalizedCode = 'VALIDATION';
  if (!normalizedCode && isNetworkError(error, message)) normalizedCode = 'NETWORK';
  if (!normalizedCode) normalizedCode = 'UNKNOWN';

  return new AppError(
    normalizedCode,
    options.message ?? ERROR_MESSAGES[normalizedCode],
    {
      cause: error,
      details: contracted?.details ?? error?.details ?? null,
      status,
    },
  );
}
