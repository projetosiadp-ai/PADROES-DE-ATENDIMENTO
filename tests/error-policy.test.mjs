import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_ERROR_CODES, ERROR_MESSAGES, normalizeApiError } from '../domain/api-errors.mjs';
import { ERROR_POLICIES, describeAppError, resolveErrorPolicy } from '../domain/error-policy.mjs';

const flags = (code) => Object.entries(ERROR_POLICIES[code]).filter(([, value]) => value).map(([key]) => key).sort();

test('cada código contratual possui uma política de UI', () => {
  assert.deepStrictEqual(Object.keys(ERROR_POLICIES).sort(), [...APP_ERROR_CODES].sort());
});

test('políticas seguem a tabela de contracts/ui-behavior.md', () => {
  assert.deepStrictEqual(flags('AUTH_REQUIRED'), ['clearSession']);
  assert.deepStrictEqual(flags('FORBIDDEN'), ['closePrompt', 'keepInput']);
  assert.deepStrictEqual(flags('NOT_FOUND'), ['closeDetail', 'closePrompt', 'refresh']);
  assert.deepStrictEqual(flags('CONFLICT'), ['keepInput', 'refresh']);
  assert.deepStrictEqual(flags('VALIDATION'), ['focusInvalid', 'keepInput']);
  assert.deepStrictEqual(flags('NETWORK'), ['keepInput', 'offerRetry']);
  assert.deepStrictEqual(flags('UNKNOWN'), ['keepInput']);
});

test('mensagem combina a operação com a orientação do código', () => {
  const error = normalizeApiError({ status: 403, code: '42501' }, { message: 'Não foi possível arquivar a mensagem' });
  assert.strictEqual(describeAppError(error), `Não foi possível arquivar a mensagem. ${ERROR_MESSAGES.FORBIDDEN}`);
  assert.strictEqual(describeAppError(normalizeApiError({ message: 'falha inesperada' })), ERROR_MESSAGES.UNKNOWN);
});

test('sessão expirada sempre usa a mensagem de reautenticação', () => {
  const policy = resolveErrorPolicy(normalizeApiError({ status: 401 }, { message: 'Não foi possível salvar' }));
  assert.strictEqual(policy.code, 'AUTH_REQUIRED');
  assert.strictEqual(policy.clearSession, true);
  assert.strictEqual(policy.message, 'Sua sessão expirou. Entre novamente.');
});

test('categoria não vazia informa quantas mensagens ativas bloqueiam o arquivamento', () => {
  const error = normalizeApiError({ code: 'P0001', message: 'CONFLICT:CATEGORY_NOT_EMPTY:3' }, { message: 'Não foi possível arquivar a categoria' });
  const policy = resolveErrorPolicy(error);
  assert.strictEqual(policy.code, 'CONFLICT');
  assert.strictEqual(policy.message, 'Arquive ou reclassifique as 3 mensagens ativas desta categoria antes de continuar.');
  assert.strictEqual(
    describeAppError(normalizeApiError({ message: 'CONFLICT:CATEGORY_NOT_EMPTY:1' })),
    'Arquive ou reclassifique a mensagem ativa desta categoria antes de continuar.',
  );
});

test('revisão com ajustes explica ajuste em arquivamento e comentário inválido', () => {
  const notAllowed = resolveErrorPolicy({ code: 'P0001', message: 'VALIDATION:ADJUSTMENTS_NOT_ALLOWED' });
  assert.strictEqual(notAllowed.code, 'VALIDATION');
  assert.strictEqual(notAllowed.focusInvalid, true);
  assert.strictEqual(notAllowed.message, 'Pedidos de arquivamento só podem ser aprovados ou rejeitados, sem ajustes.');
  assert.strictEqual(
    describeAppError({ code: 'P0001', message: 'VALIDATION:REVIEW_COMMENT' }),
    'O comentário deve ter no máximo 500 caracteres.',
  );
  assert.strictEqual(
    describeAppError({ code: 'P0001', message: 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS' }),
    'Escolha uma categoria ativa deste acesso.',
  );
});

test('o chamador pode especializar a mensagem de um código sem mudar a política', () => {
  const policy = resolveErrorPolicy(new TypeError('Failed to fetch'), { NETWORK: 'Não foi possível confirmar o envio. Tente novamente.' });
  assert.strictEqual(policy.code, 'NETWORK');
  assert.strictEqual(policy.offerRetry, true);
  assert.strictEqual(policy.message, 'Não foi possível confirmar o envio. Tente novamente.');
});
