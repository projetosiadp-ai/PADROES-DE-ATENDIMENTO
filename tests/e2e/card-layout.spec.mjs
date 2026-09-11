import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, loginAs } from '../fixtures/auth.mjs';
import { TEST_IDS } from '../fixtures/data.mjs';

// Nenhum botão do rodapé pode sair do cartão nem quebrar em duas linhas (bug rodape-cartao-botoes).
async function expectActionsInsideCards(page, context) {
  const cards = page.locator('[data-testid^="message-card-"]');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  const problems = await cards.evaluateAll(elements => elements.flatMap(card => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('.dp-card-actions button')].flatMap(button => {
      const rect = button.getBoundingClientRect();
      const label = button.getAttribute('aria-label') || button.textContent.trim();
      const where = `${card.dataset.testid} › ${label}`;
      const issues = [];
      if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) issues.push(`${where}: fora do cartão`);
      if (rect.height > 44) issues.push(`${where}: ${Math.round(rect.height)}px de altura (quebrou linha)`);
      return issues;
    });
  }));
  expect(problems, `${context}: ${problems.join('; ')}`).toEqual([]);
}

test('rodapé dos cartões cabe no cartão para colaborador', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await expectActionsInsideCards(page, 'colaborador');
});

test('rodapé dos cartões cabe no cartão para superadmin', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.superadmin);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  const pending = page.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await pending.isVisible().catch(() => false)) await pending.getByRole('button', { name: 'Dispensar' }).click();
  // Outras jornadas criam acessos vazios; o teste precisa de um acesso com mensagens.
  await page.getByLabel('Acesso ativo').selectOption(TEST_IDS.accessAlpha);
  await expectActionsInsideCards(page, 'superadmin');
});
