import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, openLibrary } from '../fixtures/auth.mjs';

async function expectNoPageOverflow(page, context) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `${context}: documento excedeu ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, `${context}: body excedeu ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-360-'), 'Contrato responsivo restrito aos projetos de 360 px.');
});

test('@a11y navegação por teclado contém o foco no modal e o devolve ao acionador', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);

  const opener = page.getByRole('button', { name: 'Solicitar mensagem' });
  await opener.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);

  const focusables = dialog.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const last = focusables.last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(focusables.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('@a11y biblioteca e janelas cabem em 360 px sem rolagem horizontal', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await expectNoPageOverflow(page, 'biblioteca');

  // As pílulas de categoria rolam dentro da própria faixa, nunca na página.
  const pills = page.getByRole('group', { name: 'Filtrar por categoria' });
  await expect(pills).toBeVisible();
  const overflow = await pills.evaluate(element => getComputedStyle(element).overflowX);
  expect(overflow).toBe('auto');

  await page.locator('[data-testid^="message-item-"]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoPageOverflow(page, 'leitura em diálogo');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  await expectNoPageOverflow(page, 'modal de solicitação');
});

test('@a11y o tema escuro não existe mais em nenhuma tela', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByRole('button', { name: 'Alternar tema' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('dp_darkmode'))).toBeNull();
});

test('@a11y administração usa cartões responsivos sem overflow a 360 px', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.superadmin);

  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Contas' }).click();
  await expect(page.getByRole('heading', { name: 'Contas' })).toBeVisible();
  await expectNoPageOverflow(page, 'contas administrativas');
  await expect(page.locator('.dp-admin-card').first()).toBeVisible();

  await page.getByRole('button', { name: 'Nova conta' }).click();
  await expectNoPageOverflow(page, 'modal de nova conta');
});
