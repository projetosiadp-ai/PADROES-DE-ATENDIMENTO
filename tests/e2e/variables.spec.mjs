import { test, expect } from '@playwright/test';

import { openLibrary } from '../fixtures/auth.mjs';
import { TEST_DATA } from '../fixtures/data.mjs';
import { ensureVariablesMessage } from '../fixtures/variables.mjs';

const message = TEST_DATA.messageVariables;
const readingOf = (page) => page.locator('[aria-label="Leitura da mensagem"], [aria-modal="true"]').last();
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

test.beforeAll(async () => {
  await ensureVariablesMessage();
});

async function openVariablesMessage(page) {
  await openLibrary(page);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(message.titulo);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await page.getByTestId(`message-item-${message.id}`).click();
  const reading = readingOf(page);
  await expect(reading).toContainText(message.titulo);
  return reading;
}

test('colaborador preenche as variáveis e cola a mensagem sem colchetes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const reading = await openVariablesMessage(page);

  // Um campo por variável distinta, com rótulo derivado do nome (FR-017).
  await expect(reading.getByRole('textbox', { name: 'Nome' })).toHaveCount(1);
  await expect(reading.getByRole('textbox', { name: 'Data' })).toHaveCount(1);
  await expect(reading.getByRole('status').filter({ hasText: 'variáveis preenchidas' })).toHaveText('0 variáveis preenchidas · 2 sem preencher');

  await reading.getByRole('textbox', { name: 'Nome' }).fill('Marina Duarte');
  await expect(reading.getByRole('status').filter({ hasText: 'preenchida' })).toHaveText('1 variável preenchida · 1 sem preencher');
  await expect(reading.locator('mark.dp-highlight', { hasText: 'Marina Duarte' })).toHaveCount(2);

  // Vazias continuam entre colchetes e o aviso fica visível antes de copiar (FR-018).
  await reading.getByRole('button', { name: 'Copiar preenchida' }).click();
  await expect(page.getByTestId('copy-status')).toHaveText('Mensagem copiada');
  await expect.poll(() => clipboard(page)).toBe(
    'Olá, Marina Duarte! Sua consulta está confirmada para [DATA]. Qualquer dúvida, Marina Duarte, estamos à disposição.',
  );

  await reading.getByRole('textbox', { name: 'Data' }).fill('20/09/2026');
  await expect(reading.getByRole('status').filter({ hasText: 'preenchidas' })).toHaveText('2 variáveis preenchidas');
  await reading.getByRole('button', { name: /Copiar preenchida|Copiado/ }).click();
  await expect.poll(() => clipboard(page)).toBe(
    'Olá, Marina Duarte! Sua consulta está confirmada para 20/09/2026. Qualquer dúvida, Marina Duarte, estamos à disposição.',
  );

  // "Texto original" copia o conteúdo sem nenhuma alteração.
  await reading.getByRole('button', { name: 'Texto original' }).click();
  await expect.poll(() => clipboard(page)).toBe(message.conteudo);
});

test('os valores são descartados ao trocar de mensagem e nunca vão para o armazenamento do navegador', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'A troca direta entre mensagens usa a lista ao lado da leitura.');
  const reading = await openVariablesMessage(page);
  await reading.getByRole('textbox', { name: 'Nome' }).fill('Valor temporário');

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('Valor temporário');

  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill('');
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await page.getByTestId(`message-item-${TEST_DATA.messageAlpha.id}`).click();
  await expect(readingOf(page)).toContainText(TEST_DATA.messageAlpha.titulo);
  await page.keyboard.press('Escape');

  await page.getByTestId(`message-item-${message.id}`).click();
  await expect(readingOf(page).getByRole('textbox', { name: 'Nome' })).toHaveValue('');
});

test('solicitar mensagem insere [NOME] na posição do cursor', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  const content = dialog.getByLabel('Conteúdo');
  await content.fill('Olá, ! Tudo bem?');
  await content.evaluate(element => element.setSelectionRange(5, 5));

  await dialog.getByRole('button', { name: '[NOME]' }).click();
  await expect(content).toHaveValue('Olá, [NOME]! Tudo bem?');
  await expect(content).toBeFocused();
  await expect(dialog.getByText('22 / 2000 caracteres')).toBeVisible();

  await page.keyboard.type(' e [DATA]');
  await expect(content).toHaveValue('Olá, [NOME] e [DATA]! Tudo bem?');
});
