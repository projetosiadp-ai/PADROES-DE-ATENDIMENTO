import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, openLibrary } from '../fixtures/auth.mjs';
import { TEST_IDS } from '../fixtures/data.mjs';

// Atalhos da Biblioteca (FR-021): valem no computador, com a lista visível.
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Atalhos de teclado são do layout de computador.');
});

const items = (page) => page.locator('[data-testid^="message-item-"]');

test('↓ ↓ Enter copia a terceira mensagem da lista', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openLibrary(page);
  await expect(items(page).nth(2)).toBeVisible();
  await expect(items(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('↑ ↓ navegar · ⏎ copiar · E solicitar edição')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const third = items(page).nth(2);
  await expect(third).toHaveAttribute('aria-current', 'true');
  await expect(third).toBeFocused();

  const reading = page.getByRole('region', { name: 'Leitura da mensagem' });
  const title = (await third.locator('.dp-list-item__title').textContent()).trim();
  await expect(reading.getByRole('heading', { level: 2 })).toHaveText(title);

  // ↑ volta uma posição. A cópia vem por último: ela soma um uso e pode reordenar a lista.
  await page.keyboard.press('ArrowUp');
  await expect(items(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(third).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('copy-status')).toHaveText('Mensagem copiada');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe('');
});

test('E abre "Sugerir edição" para colaborador e "Editar" para superadministrador', async ({ page, browser }) => {
  await openLibrary(page);
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: /^Sugerir edição de / })).toBeVisible();

  const context = await browser.newContext();
  const admin = await context.newPage();
  await openLibrary(admin, LOCAL_ACCOUNTS.superadmin);
  // Jornadas estruturais criam acessos vazios: o atalho precisa de um acesso com mensagens.
  await admin.getByLabel('Acesso ativo').selectOption(TEST_IDS.accessAlpha);
  await expect(admin.locator('[data-testid^="message-item-"]').first()).toHaveAttribute('aria-current', 'true');
  await admin.keyboard.press('E');
  await expect(admin.getByRole('dialog', { name: 'Editar mensagem' })).toBeVisible();
  await context.close();
});

test('setas, Enter e E não agem com foco na busca ou com janela aberta', async ({ page }) => {
  await openLibrary(page);
  const search = page.getByRole('searchbox', { name: 'Buscar mensagens' });
  await search.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('e');
  await expect(items(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(search).toHaveValue('e');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);

  await search.fill('');
  await search.blur();
  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(items(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
});
