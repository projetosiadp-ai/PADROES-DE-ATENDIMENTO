import { test, expect } from '@playwright/test';

import { loginAs, openLibrary } from '../fixtures/auth.mjs';
import { TEST_DATA, TEST_IDS } from '../fixtures/data.mjs';
import { CURRENT_RELEASE } from '../../domain/release-notes.mjs';

const libraryItem = (page) => page.getByTestId(`message-item-${TEST_IDS.messageAlpha}`);
const reading = (page) => page.locator('[aria-label="Leitura da mensagem"], [aria-modal="true"]').last();

/* A leitura é uma coluna no computador e um diálogo no celular; os dois têm as mesmas ações.
 * No celular o diálogo continua aberto entre uma ação e outra, então só clicamos no item
 * quando a mensagem ainda não está em leitura. */
async function openReading(page) {
  const panel = reading(page);
  const alreadyOpen = await panel.isVisible().catch(() => false)
    && (await panel.textContent() ?? '').includes(TEST_DATA.messageAlpha.titulo);
  if (!alreadyOpen) await libraryItem(page).click();
  await expect(panel).toContainText(TEST_DATA.messageAlpha.titulo);
  return panel;
}

// Sair da leitura antes de navegar: no celular ela é modal e cobre a faixa da marca.
async function closeReading(page) {
  const close = page.locator('[aria-modal="true"]').getByRole('button', { name: 'Fechar' });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  }
}

test('colaborador consulta, organiza e reutiliza a biblioteca autorizada', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openLibrary(page);

  await expect(page.getByRole('button', { name: 'Biblioteca', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Acesso ativo')).toHaveValue(TEST_IDS.accessAlpha);
  await expect(page.getByLabel('Acesso ativo').locator('option')).toHaveText([
    TEST_DATA.accessAlpha.nome,
  ]);
  await expect(page.getByText(TEST_DATA.accessBeta.nome, { exact: true })).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: 'Buscar mensagens' });
  const sort = page.getByRole('combobox', { name: 'Ordenar mensagens' });
  const categoryPills = page.getByRole('group', { name: 'Filtrar por categoria' });

  await expect(search).toBeVisible();
  await expect(sort).toBeVisible();
  await expect(categoryPills.getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(libraryItem(page)).toContainText(TEST_DATA.messageAlpha.titulo);

  await search.fill('COMO PODEMOS');
  await expect(libraryItem(page)).toBeVisible();
  await search.fill('boas-vindas');
  await expect(libraryItem(page)).toBeVisible();
  await search.fill('nao existe');
  await expect(page.getByTestId('library-ready').getByText('Nenhuma mensagem encontrada').first()).toBeVisible();
  await expect(search).toBeVisible();
  await expect(sort).toBeVisible();

  await search.clear();
  await categoryPills.getByRole('button', { name: new RegExp(TEST_DATA.messageAlpha.categoria) }).click();
  await sort.selectOption('az');
  await expect(libraryItem(page)).toBeVisible();

  const panel = await openReading(page);
  const favorite = panel.getByRole('button', { name: 'Remover dos favoritos' });
  await favorite.click();
  await expect(panel.getByRole('button', { name: 'Favoritar' })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: 'Favoritar' }).click();
  await expect(panel.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');

  // Selecionar não copia: a cópia sai do botão do painel de leitura (FR-007).
  await expect(page.getByTestId('copy-status')).toHaveText('');
  await panel.getByRole('button', { name: 'Copiar' }).click();
  await expect(page.getByTestId('copy-status')).toHaveText('Mensagem copiada', { timeout: 1_000 });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(TEST_DATA.messageAlpha.conteudo);

  await closeReading(page);
  await page.getByRole('button', { name: 'Visão geral' }).click();
  await expect(page.getByRole('region', { name: 'Favoritas' })).toContainText(TEST_DATA.messageAlpha.titulo);
  await expect(page.getByRole('region', { name: 'Copiadas recentemente' })).toContainText(TEST_DATA.messageAlpha.titulo);
});

test('colaborador solicita criação, edição e arquivamento sem publicar mudanças', async ({ page }) => {
  await openLibrary(page);

  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  const creationDialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await creationDialog.getByLabel('Categoria').selectOption(TEST_IDS.categoryAlpha);
  await creationDialog.getByLabel('Título').fill('Nova mensagem solicitada');
  await creationDialog.getByLabel('Tags').fill('nova, e2e');
  await creationDialog.getByLabel('Conteúdo').fill('Conteúdo proposto que ainda não foi publicado.');
  await creationDialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(page.getByText('Nova mensagem solicitada', { exact: true })).toHaveCount(0);

  let panel = await openReading(page);
  await panel.getByRole('button', { name: 'Sugerir edição' }).click();
  const editionDialog = page.getByRole('dialog', { name: `Sugerir edição de ${TEST_DATA.messageAlpha.titulo}` });
  await editionDialog.getByLabel('Título').fill('Título proposto ainda pendente');
  await editionDialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(editionDialog).toBeHidden();
  await expect(libraryItem(page)).toContainText(TEST_DATA.messageAlpha.titulo);

  panel = await openReading(page);
  await expect(panel).toContainText(TEST_DATA.messageAlpha.conteudo);
  await panel.getByRole('button', { name: 'Solicitar arquivamento' }).click();
  const archiveDialog = page.getByRole('alertdialog', { name: `Solicitar arquivamento de ${TEST_DATA.messageAlpha.titulo}` });
  await expect(archiveDialog).toContainText('A mensagem continuará publicada até a revisão');
  await archiveDialog.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await expect(libraryItem(page)).toBeVisible();
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

  await openLibrary(page);
  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
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

test('o aviso de novidades aparece uma vez por navegador', async ({ page }) => {
  await loginAs(page);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });

  const notice = page.getByRole('dialog', { name: 'Novidades' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Copiar');
  await notice.getByRole('button', { name: 'Entendi' }).click();
  await expect(notice).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dp_novidades'))).toBe(CURRENT_RELEASE);

  await page.reload();
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  await expect(notice).toHaveCount(0);
});
