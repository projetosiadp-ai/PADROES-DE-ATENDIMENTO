import { test, expect } from '@playwright/test';

import { dismissPendingNotice, dismissReleaseNotice, LOCAL_ACCOUNTS, LOCAL_SUPABASE_URL, loginAs, openLibrary } from '../fixtures/auth.mjs';
import { TEST_DATA } from '../fixtures/data.mjs';
import { prepareVisual, settleVisual, volatileRegions } from './helpers/visual.mjs';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/* As fotos comparam o desenho, não os dados. Como a massa local acumula conteúdo a cada
 * bateria, cada tela é levada a um estado determinístico antes da foto (busca que devolve uma
 * única mensagem conhecida, ou uma conta sem uso), e as contagens que variam ficam mascaradas. */
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await prepareVisual(page);
});

// Com um diálogo aberto, só os valores voláteis dele são mascarados: as máscaras da página
// por trás seriam desenhadas por cima do conteúdo do diálogo.
const shot = async (page, name, { dialog = false } = {}) => {
  await settleVisual(page);
  const mask = dialog ? [page.locator('[aria-modal="true"] [data-volatile]')] : volatileRegions(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask });
};

test('@visual login', async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript; charset=utf-8',
    body: `export const SUPABASE_URL = '${LOCAL_SUPABASE_URL}';\nexport const SUPABASE_ANON_KEY = '${ANON_KEY}';\n`,
  }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await shot(page, 'login.png');
});

test('@visual aviso de novidades', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.collaborator);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog', { name: 'Novidades' })).toBeVisible();
  await shot(page, 'novidades.png', { dialog: true });
});

test('@visual biblioteca com mensagem selecionada', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(TEST_DATA.messageAlpha.titulo);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await expect(page.locator('.dp-search__results')).toHaveCount(0);
  await expect(page.getByText('1 mensagem encontrada')).toBeVisible();
  await shot(page, 'biblioteca-selecionada.png');
});

test('@visual biblioteca vazia', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill('zzz sem resultado zzz');
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await expect(page.locator('.dp-search__results')).toHaveCount(0);
  await expect(page.getByTestId('library-ready').getByText('Nenhuma mensagem encontrada').first()).toBeVisible();
  await shot(page, 'biblioteca-vazia.png');
});

test('@visual leitura no celular', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-360-light', 'A leitura só vira diálogo abaixo de 900 px.');
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(TEST_DATA.messageAlpha.titulo);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await expect(page.locator('.dp-search__results')).toHaveCount(0);
  await page.locator('[data-testid^="message-item-"]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'leitura-celular.png', { dialog: true });
});

// A Visão geral usa a conta beta, que nenhuma jornada favorita ou copia: as duas seções ficam
// no estado de orientação, que é o único determinístico nesta massa local.
test('@visual visão geral', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.otherCollaborator);
  await page.getByRole('button', { name: 'Visão geral' }).click();
  await expect(page.getByTestId('overview-ready')).toBeVisible();
  await shot(page, 'visao-geral.png');
});

test('@visual administração de solicitações', async ({ page }) => {
  await loginAs(page, LOCAL_ACCOUNTS.superadmin);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await dismissPendingNotice(page);
  await dismissReleaseNotice(page);
  await page.getByRole('button', { name: 'Administração' }).click();
  await expect(page.getByRole('tab', { name: 'Mensagens' })).toBeVisible();
  await shot(page, 'administracao.png');
});
