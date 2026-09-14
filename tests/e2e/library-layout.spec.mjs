import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, openLibrary } from '../fixtures/auth.mjs';
import { TEST_IDS } from '../fixtures/data.mjs';

const listItem = (page) => page.locator('[data-testid^="message-item-"]');
const readingPanel = (page) => page.getByRole('region', { name: 'Leitura da mensagem' });

async function boxOf(locator) {
  const box = await locator.boundingBox();
  expect(box, 'elemento precisa estar visível para ser medido').not.toBeNull();
  return box;
}

test('no computador a lista e a leitura ficam lado a lado, com as ações no painel', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Contrato de duas colunas vale a partir de 900 px.');
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);

  // A primeira mensagem já vem selecionada (FR-006).
  await expect(listItem(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(readingPanel(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const list = await boxOf(listItem(page).first());
  const panel = await boxOf(readingPanel(page));
  expect(panel.x, 'o painel fica à direita da lista').toBeGreaterThanOrEqual(list.x + list.width - 1);

  for (const label of ['Copiar', 'Visualizar', 'Sugerir edição', 'Solicitar arquivamento']) {
    const action = readingPanel(page).getByRole('button', { name: label });
    await expect(action, `${label} fica dentro do painel de leitura`).toBeVisible();
    const box = await boxOf(action);
    expect(box.x).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
  }
});

test('a 360 px a leitura abre como diálogo e devolve o foco ao item', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-360-light', 'Contrato de diálogo vale abaixo de 900 px.');
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);

  await expect(readingPanel(page)).toHaveCount(0);
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);

  const item = page.getByTestId(`message-item-${TEST_IDS.messageAlpha}`);
  await item.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.locator(':focus')).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toBeHidden();
  await expect(item).toBeFocused();
});

test('nenhuma largura provoca rolagem horizontal da página', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
});
