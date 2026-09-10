import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, loginAs } from '../fixtures/auth.mjs';

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
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });

  const opener = page.getByRole('button', { name: 'Sugerir mensagem' });
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

test('@a11y tema claro/escuro persiste e não causa overflow a 360 px', async ({ page }, testInfo) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await expectNoPageOverflow(page, 'biblioteca');

  const initialBackground = await page.locator('#app > div').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  const changedBackground = await page.locator('#app > div').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(changedBackground, `${testInfo.project.name}: alternância deve mudar o fundo`).not.toBe(initialBackground);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dp_darkmode'))).not.toBeNull();
  await expectNoPageOverflow(page, 'biblioteca após alternar tema');

  await page.getByRole('button', { name: 'Sugerir mensagem' }).click();
  await expectNoPageOverflow(page, 'modal de solicitação');
});

test('@a11y administração usa cartões responsivos sem overflow a 360 px', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.superadmin);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  const pending = page.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await pending.isVisible().catch(() => false)) await pending.getByRole('button', { name: 'Dispensar' }).click();

  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Contas' }).click();
  await expect(page.getByRole('heading', { name: 'Contas' })).toBeVisible();
  await expectNoPageOverflow(page, 'contas administrativas');
  await expect(page.locator('.dp-admin-card').first()).toBeVisible();

  await page.getByRole('button', { name: 'Nova conta' }).click();
  await expectNoPageOverflow(page, 'modal de nova conta');
});
