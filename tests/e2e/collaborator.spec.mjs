import { test, expect } from '@playwright/test';

import { loginAs } from '../fixtures/auth.mjs';
import { TEST_DATA, TEST_IDS } from '../fixtures/data.mjs';

const libraryCard = (page) => page.locator(`[data-testid="message-card-${TEST_IDS.messageAlpha}"]`);

test('colaborador consulta, organiza e reutiliza a biblioteca autorizada', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAs(page);

  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Acesso ativo')).toHaveValue(TEST_IDS.accessAlpha);
  await expect(page.getByLabel('Acesso ativo').locator('option')).toHaveText([
    TEST_DATA.accessAlpha.nome,
  ]);
  await expect(page.getByText(TEST_DATA.accessBeta.nome, { exact: true })).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: 'Buscar mensagens' });
  const category = page.getByRole('combobox', { name: 'Filtrar por categoria' });
  const sort = page.getByRole('combobox', { name: 'Ordenar mensagens' });

  await expect(search).toBeVisible();
  await expect(category).toBeVisible();
  await expect(sort).toBeVisible();
  await expect(libraryCard(page)).toContainText(TEST_DATA.messageAlpha.titulo);

  await search.fill('COMO PODEMOS');
  await expect(libraryCard(page)).toBeVisible();
  await search.fill('boas-vindas');
  await expect(libraryCard(page)).toBeVisible();
  await search.fill('nao existe');
  await expect(page.getByTestId('library-ready').getByText('Nenhuma mensagem encontrada')).toBeVisible();
  await expect(search).toBeVisible();
  await expect(category).toBeVisible();
  await expect(sort).toBeVisible();

  await search.clear();
  await category.selectOption(TEST_IDS.categoryAlpha);
  await sort.selectOption('az');
  await expect(libraryCard(page)).toBeVisible();

  const favorite = libraryCard(page).getByRole('button', { name: 'Remover dos favoritos' });
  await favorite.click();
  await expect(libraryCard(page).getByRole('button', { name: 'Favoritar' })).toHaveAttribute('aria-pressed', 'false');
  await libraryCard(page).getByRole('button', { name: 'Favoritar' }).click();
  await expect(libraryCard(page).getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');

  await libraryCard(page).getByRole('button', { name: 'Copiar' }).click();
  await expect(page.getByTestId('copy-status')).toHaveText('Mensagem copiada', { timeout: 1_000 });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(TEST_DATA.messageAlpha.conteudo);

  await page.getByRole('button', { name: 'Visão geral' }).click();
  await expect(page.getByRole('region', { name: 'Favoritas' })).toContainText(TEST_DATA.messageAlpha.titulo);
  await expect(page.getByRole('region', { name: 'Recentes' })).toContainText(TEST_DATA.messageAlpha.titulo);
});

test('colaborador solicita criação, edição e arquivamento sem publicar mudanças', async ({ page }) => {
  await loginAs(page);
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Sugerir mensagem' }).click();
  const creationDialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await creationDialog.getByLabel('Categoria').selectOption(TEST_IDS.categoryAlpha);
  await creationDialog.getByLabel('Título').fill('Nova mensagem solicitada');
  await creationDialog.getByLabel('Tags').fill('nova, e2e');
  await creationDialog.getByLabel('Conteúdo').fill('Conteúdo proposto que ainda não foi publicado.');
  await creationDialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(page.getByText('Nova mensagem solicitada', { exact: true })).toHaveCount(0);

  await libraryCard(page).getByRole('button', { name: 'Sugerir edição' }).click();
  const editionDialog = page.getByRole('dialog', { name: `Sugerir edição de ${TEST_DATA.messageAlpha.titulo}` });
  await editionDialog.getByLabel('Título').fill('Título proposto ainda pendente');
  await editionDialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(libraryCard(page)).toContainText(TEST_DATA.messageAlpha.titulo);
  await expect(libraryCard(page)).toContainText(TEST_DATA.messageAlpha.conteudo);

  await libraryCard(page).getByRole('button', { name: 'Solicitar arquivamento' }).click();
  const archiveDialog = page.getByRole('alertdialog', { name: `Solicitar arquivamento de ${TEST_DATA.messageAlpha.titulo}` });
  await expect(archiveDialog).toContainText('A mensagem continuará publicada até a revisão');
  await archiveDialog.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(libraryCard(page)).toBeVisible();
});

test('envio bloqueia clique duplo e retry incerto reutiliza a chave idempotente', async ({ page }) => {
  const requestBodies = [];
  let firstSubmission = true;

  await page.route('**/rest/v1/solicitacoes_mensagem*', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    requestBodies.push(route.request().postDataJSON());
    if (firstSubmission) {
      firstSubmission = false;
      await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.abort('connectionfailed');
      return;
    }
    await route.continue();
  });

  await loginAs(page);
  await page.getByRole('button', { name: 'Sugerir mensagem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await dialog.getByLabel('Categoria').selectOption(TEST_IDS.categoryAlpha);
  await dialog.getByLabel('Título').fill('Solicitação idempotente E2E');
  await dialog.getByLabel('Conteúdo').fill('A resposta desta solicitação será perdida uma vez.');

  const submit = dialog.getByRole('button', { name: 'Enviar para revisão' });
  await submit.dblclick();
  await expect.poll(() => requestBodies.length).toBe(1);
  await expect(page.getByText('Não foi possível confirmar o envio. Tente novamente.')).toBeVisible();
  await expect(dialog).toBeVisible();

  await submit.click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  expect(requestBodies).toHaveLength(2);
  expect(requestBodies[0].idempotency_key).toBeTruthy();
  expect(requestBodies[1].idempotency_key).toBe(requestBodies[0].idempotency_key);
});
