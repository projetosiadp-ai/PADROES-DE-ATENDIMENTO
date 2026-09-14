import { test, expect } from '@playwright/test';

import { clearBrowserSession, LOCAL_ACCOUNTS, loginAs, openLibrary } from '../fixtures/auth.mjs';
import { TEST_DATA, TEST_IDS } from '../fixtures/data.mjs';

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Matriz de autenticação executada uma vez no projeto canônico.');
});

test('login válido abre somente o acesso autorizado e não oferece administração', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);

  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Acesso ativo')).toHaveValue(TEST_IDS.accessAlpha);
  await expect(page.getByLabel('Acesso ativo').locator('option')).toHaveText([TEST_DATA.accessAlpha.nome]);
  await expect(page.getByRole('button', { name: 'Administração' })).toHaveCount(0);
});

test('credenciais inválidas mantêm a biblioteca protegida', async ({ page }) => {
  await loginAs(page, { email: LOCAL_ACCOUNTS.collaborator.email, password: 'senha-incorreta' });

  await expect(page.getByText('Não foi possível entrar')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('library-ready')).toHaveCount(0);
  await expect(page.getByText(TEST_DATA.messageAlpha.conteudo, { exact: true })).toHaveCount(0);
});

test('sessão além do limite local expira e remove conteúdo protegido', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => localStorage.setItem('dp_login_ts', String(Date.now() - 6 * 24 * 60 * 60 * 1_000)));
  await page.reload();

  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('library-ready')).toHaveCount(0);
});

test('AUTH_REQUIRED durante uma ação limpa o estado protegido e volta ao login com aviso', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);

  await page.route('**/rest/v1/favoritos*', route => (route.request().method() === 'GET'
    ? route.continue()
    : route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST303', message: 'JWT expired', details: null, hint: null }),
    })));
  await page.getByTestId(`message-item-${TEST_IDS.messageAlpha}`).click();
  await page.locator('[aria-label="Leitura da mensagem"], [aria-modal="true"]').last()
    .getByRole('button', { name: /favorit/i }).click();

  await expect(page.getByText('Sua sessão expirou. Entre novamente.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByTestId('library-ready')).toHaveCount(0);
  await expect(page.getByText(TEST_DATA.messageAlpha.conteudo, { exact: true })).toHaveCount(0);
});

test('conta sem vínculo recebe orientação sem revelar bibliotecas', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.noAccess);

  await expect(page.getByText(/ainda não está vinculada a nenhum Acesso/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('library-ready')).toHaveCount(0);
  await expect(page.getByText(TEST_DATA.messageAlpha.titulo, { exact: true })).toHaveCount(0);
});

test('duas contas recebem apenas conteúdo do próprio acesso', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByText(TEST_DATA.messageAlpha.titulo, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TEST_DATA.messageBeta.titulo, { exact: true })).toHaveCount(0);

  await clearBrowserSession(page);
  await loginAs(page, LOCAL_ACCOUNTS.otherCollaborator);
  await expect(page.getByText(TEST_DATA.messageBeta.titulo, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TEST_DATA.messageAlpha.titulo, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Acesso ativo')).toHaveValue(TEST_IDS.accessBeta);
});

