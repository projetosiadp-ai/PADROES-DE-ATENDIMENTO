import assert from 'node:assert/strict';
import test from 'node:test';

import { firstNameOf, greetingFor, periodFor } from '../domain/greeting.mjs';

// Datas em UTC; em setembro Brasília está em UTC-3 (sem horário de verão desde 2019).
const brasilia = (hour, minute = 0) => new Date(Date.UTC(2026, 8, 11, hour + 3, minute));

test('o período do dia segue as faixas do desenho', () => {
  assert.equal(periodFor(brasilia(5, 0)), 'Bom dia');
  assert.equal(periodFor(brasilia(11, 59)), 'Bom dia');
  assert.equal(periodFor(brasilia(12, 0)), 'Boa tarde');
  assert.equal(periodFor(brasilia(17, 59)), 'Boa tarde');
  assert.equal(periodFor(brasilia(18, 0)), 'Boa noite');
  assert.equal(periodFor(brasilia(4, 59)), 'Boa noite');
  assert.equal(periodFor(brasilia(0, 0)), 'Boa noite');
});

test('o fuso é sempre o de Brasília, não o do aparelho', () => {
  // 23:30 em Brasília ainda é 02:30 do dia seguinte em UTC: quem usa UTC leria "Boa noite"
  // pelo motivo errado, e às 09:00 de Brasília (12:00 UTC) leria "Boa tarde".
  assert.equal(periodFor(new Date('2026-09-11T12:00:00.000Z')), 'Bom dia');
  assert.equal(periodFor(new Date('2026-09-11T17:00:00.000Z')), 'Boa tarde');
  assert.equal(periodFor(new Date('2026-09-12T02:30:00.000Z')), 'Boa noite');
});

test('a saudação usa o primeiro nome da pessoa', () => {
  assert.equal(greetingFor(brasilia(14), 'Camila Moreira da Silva'), 'Boa tarde, Camila');
  assert.equal(greetingFor(brasilia(9), '  Ana  Paula '), 'Bom dia, Ana');
});

test('sem nome, a saudação fica só com o período', () => {
  assert.equal(greetingFor(brasilia(20), ''), 'Boa noite');
  assert.equal(greetingFor(brasilia(20)), 'Boa noite');
  assert.equal(firstNameOf(null), '');
});
