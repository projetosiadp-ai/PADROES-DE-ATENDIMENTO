import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_ERROR_CODES,
  AppError,
  normalizeApiError,
} from '../domain/api-errors.mjs';

test('preserva AppError normalizado sem perder causa ou detalhes', () => {
  const cause = new Error('origem');
  const error = new AppError('FORBIDDEN', 'Sem permissao.', {
    cause,
    details: { operation: 'update' },
  });

  assert.strictEqual(normalizeApiError(error), error);
  assert.strictEqual(error.name, 'AppError');
  assert.strictEqual(error.code, 'FORBIDDEN');
  assert.strictEqual(error.cause, cause);
  assert.deepStrictEqual(error.details, { operation: 'update' });
});

test('normaliza erros Auth e HTTP de autenticacao e permissao', () => {
  assert.strictEqual(normalizeApiError({ status: 401, code: 'invalid_jwt' }).code, 'AUTH_REQUIRED');
  assert.strictEqual(normalizeApiError({ status: 403, code: '42501', message: 'permission denied' }).code, 'FORBIDDEN');
});

test('JWT expirado ou invalido no PostgREST exige nova autenticacao mesmo sem status', () => {
  for (const code of ['PGRST301', 'PGRST302', 'PGRST303']) {
    assert.strictEqual(normalizeApiError({ code, message: 'JWT expired' }).code, 'AUTH_REQUIRED', code);
  }
});

test('normaliza codigos PostgREST e Postgres por contrato', () => {
  const cases = [
    [{ status: 404, code: 'PGRST116' }, 'NOT_FOUND'],
    [{ status: 409, code: '23505' }, 'CONFLICT'],
    [{ status: 400, code: '23514' }, 'VALIDATION'],
    [{ status: 422, code: '22P02' }, 'VALIDATION'],
  ];

  for (const [input, expected] of cases) {
    assert.strictEqual(normalizeApiError(input).code, expected);
  }
});

test('extrai codigo e detalhes de erro contratual retornado por RPC', () => {
  const error = normalizeApiError({
    code: 'P0001',
    message: 'CONFLICT:CATEGORY_NOT_EMPTY:3',
  });

  assert.strictEqual(error.code, 'CONFLICT');
  assert.deepStrictEqual(error.details, { reason: 'CATEGORY_NOT_EMPTY', count: 3 });
});

test('distingue falha de rede de erro desconhecido', () => {
  assert.strictEqual(normalizeApiError(new TypeError('Failed to fetch')).code, 'NETWORK');
  assert.strictEqual(normalizeApiError({ message: 'TypeError: Failed to fetch' }).code, 'NETWORK');
  assert.strictEqual(normalizeApiError({ message: 'falha inesperada' }).code, 'UNKNOWN');
});

test('expoe somente os codigos estaveis do contrato', () => {
  assert.deepStrictEqual(APP_ERROR_CODES, [
    'AUTH_REQUIRED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'VALIDATION',
    'NETWORK',
    'UNKNOWN',
  ]);
});
