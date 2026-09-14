import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

import { dismissReleaseNotice, LOCAL_ACCOUNTS, LOCAL_SUPABASE_URL, loginAs, openLibrary } from '../fixtures/auth.mjs';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DIALOG = '[aria-modal="true"]';

// Each full-page axe pass takes seconds on the accumulated local dataset; the default 30 s
// budget covers only a couple of passes, not the full sweep below.
test.describe.configure({ timeout: 120_000 });

async function openLogin(page) {
  if (globalThis.location) await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript; charset=utf-8',
    body: `export const SUPABASE_URL = '${LOCAL_SUPABASE_URL}';\nexport const SUPABASE_ANON_KEY = '${ANON_KEY}';\n`,
  }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
}

// Pages get a full audit. Dialog audits are scoped to the modal: aria-modal makes the page behind
// it inert, and re-auditing that page under the overlay only multiplies color-contrast work.
async function expectAccessible(page, context, include = null) {
  await page.waitForTimeout(250);
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const blocking = result.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(blocking, `${context}: ${blocking.map(item => `${item.id} (${item.nodes.length})`).join(', ')}`).toEqual([]);
}

async function closeDialog(dialog) {
  const close = dialog.getByRole('button', { name: /Cancelar|Fechar|Concluir|Dispensar|Entendi/ }).first();
  await close.click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Auditoria axe executada uma vez no projeto canônico.');
});

test('@a11y login, aviso de novidades e biblioteca não têm violações axe críticas ou sérias', async ({ page }) => {
  await openLogin(page);
  await expectAccessible(page, 'login');

  // A explicação de "Esqueceu a senha?" é um trecho expansível, sem requisição.
  await page.getByRole('button', { name: /Esqueceu a senha/ }).click();
  await expect(page.getByText(/redefinida por um superadministrador/)).toBeVisible();
  await expectAccessible(page, 'login com a explicação de senha aberta');

  await page.getByLabel('E-mail').fill(LOCAL_ACCOUNTS.collaborator.email);
  await page.getByLabel('Senha', { exact: true }).fill(LOCAL_ACCOUNTS.collaborator.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });

  const notice = page.getByRole('dialog', { name: 'Novidades' });
  await expect(notice).toBeVisible();
  await expectAccessible(page, 'aviso de novidades', DIALOG);
  await closeDialog(notice);

  await expectAccessible(page, 'biblioteca com painel de leitura');

  await page.getByRole('button', { name: 'Visão geral' }).click();
  await expect(page.getByTestId('overview-ready')).toBeVisible();
  await expectAccessible(page, 'visão geral');
});

test('@a11y mostrar e ocultar a senha funciona pelo teclado', async ({ page }) => {
  await openLogin(page);
  const password = page.getByLabel('Senha', { exact: true });
  const toggle = page.getByRole('button', { name: 'Mostrar senha' });

  await password.fill('LocalTest!123');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('@a11y diálogos da biblioteca não têm violações axe críticas ou sérias', async ({ page }) => {
  await openLibrary(page);

  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  let dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await expectAccessible(page, 'solicitar nova mensagem', DIALOG);
  await closeDialog(dialog);

  const reading = page.getByRole('region', { name: 'Leitura da mensagem' });
  await reading.getByRole('button', { name: 'Visualizar' }).click();
  dialog = page.getByRole('dialog', { name: /Visualizar mensagem|Pré-visualizar|Boas-vindas/i });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'pré-visualização de mensagem', DIALOG);
  await closeDialog(dialog);

  await reading.getByRole('button', { name: 'Sugerir edição' }).click();
  dialog = page.getByRole('dialog', { name: /Sugerir edição/ });
  await expectAccessible(page, 'sugerir edição', DIALOG);
  await closeDialog(dialog);

  await reading.getByRole('button', { name: 'Solicitar arquivamento' }).click();
  const alertDialog = page.getByRole('alertdialog', { name: /Solicitar arquivamento/ });
  await expectAccessible(page, 'solicitar arquivamento', DIALOG);
  await closeDialog(alertDialog);

  await page.keyboard.press('Control+K');
  dialog = page.getByRole('dialog', { name: 'Busca rápida' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'busca rápida', DIALOG);
  await page.keyboard.press('Escape');
});

test('@a11y administração e diálogos estruturais não têm violações axe críticas ou sérias', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.superadmin);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  const pending = page.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await pending.isVisible().catch(() => false)) {
    await expectAccessible(page, 'aviso de solicitações pendentes', DIALOG);
    await closeDialog(pending);
  }
  await dismissReleaseNotice(page);

  await page.getByRole('button', { name: 'Administração' }).click();
  await expect(page.getByRole('tab', { name: 'Mensagens' })).toBeVisible();
  await expectAccessible(page, 'administração');

  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await expectAccessible(page, 'nova mensagem administrativa', DIALOG);
  await closeDialog(page.getByRole('dialog', { name: 'Nova mensagem' }));

  await page.getByRole('tab', { name: 'Categorias' }).click();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await expectAccessible(page, 'nova categoria', DIALOG);
  await closeDialog(page.getByRole('dialog', { name: 'Nova categoria' }));

  await page.getByRole('tab', { name: 'Acessos' }).click();
  await page.getByRole('button', { name: 'Novo acesso' }).click();
  await expectAccessible(page, 'novo acesso', DIALOG);
  await closeDialog(page.getByRole('dialog', { name: 'Novo acesso' }));

  await page.getByRole('button', { name: 'Gerenciar vínculos' }).first().click();
  const accessLinks = page.getByRole('dialog', { name: /Vínculos de/ });
  await expect(accessLinks.getByRole('combobox', { name: 'Conta a vincular' })).toBeVisible();
  await expectAccessible(page, 'vínculos do acesso', DIALOG);
  await closeDialog(accessLinks);

  await page.getByRole('tab', { name: 'Contas' }).click();
  await expect(page.locator('[data-user-id]').first()).toBeVisible();
  await expectAccessible(page, 'contas');

  await page.getByRole('button', { name: 'Nova conta' }).click();
  await expectAccessible(page, 'nova conta', DIALOG);
  await closeDialog(page.getByRole('dialog', { name: 'Criar conta' }));

  const accountRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Gerenciar acessos' }) }).first();
  await accountRow.getByRole('button', { name: 'Gerenciar acessos' }).click();
  const membership = page.getByRole('dialog', { name: /Acessos de/ });
  await expectAccessible(page, 'gerenciar acessos da conta', DIALOG);
  await closeDialog(membership);

  await accountRow.getByRole('button', { name: 'Redefinir senha' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Redefinir senha' });
  await expectAccessible(page, 'confirmar redefinição de senha', DIALOG);
  await closeDialog(confirmation);
});

test('@a11y a leitura no celular é um diálogo acessível', async ({ page, browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const mobile = await context.newPage();
  await openLibrary(mobile, LOCAL_ACCOUNTS.collaborator);
  await mobile.locator('[data-testid^="message-item-"]').first().click();
  await expect(mobile.getByRole('dialog')).toBeVisible();

  const builder = new AxeBuilder({ page: mobile })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include(DIALOG);
  const result = await builder.analyze();
  const blocking = result.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(blocking, `leitura no celular: ${blocking.map(item => item.id).join(', ')}`).toEqual([]);
  await context.close();
});
