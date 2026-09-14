import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, logout, openLibrary } from '../fixtures/auth.mjs';
import { TEST_IDS } from '../fixtures/data.mjs';

// Etapa 5 (US5): três pedidos, três decisões e o retorno visto pelo colaborador e no histórico.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const run = Date.now().toString(36);
const titles = {
  approved: `Pedido aprovado ${run}`,
  adjusted: `Pedido ajustado ${run}`,
  rejected: `Pedido rejeitado ${run}`,
};
const adjustedTitle = `Publicado com ajuste ${run}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function sendProposal(page, title) {
  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await expect(dialog).toContainText('Suas solicitações');
  await dialog.getByLabel('Categoria').selectOption(TEST_IDS.categoryAlpha);
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Conteúdo').fill(`Conteúdo enviado para ${title}.`);
  await dialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
}

async function openRequest(page, title) {
  await page.locator('[data-request-id]', { hasText: title }).click();
  const panel = page.getByRole('complementary', { name: 'Solicitação selecionada' });
  await expect(panel.getByRole('heading', { name: title })).toBeVisible();
  return panel;
}

test('superadministrador aprova com comentário, ajusta e aprova, e rejeita só com motivo', async ({ page }) => {
  await openLibrary(page);
  for (const title of Object.values(titles)) await sendProposal(page, title);
  await logout(page);

  await openLibrary(page, LOCAL_ACCOUNTS.superadmin);
  await page.getByLabel('Acesso ativo').selectOption(TEST_IDS.accessAlpha);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: /^Solicitações/ }).click();

  // Aprovar sem ajuste, com comentário opcional.
  let panel = await openRequest(page, titles.approved);
  await panel.getByLabel('Comentário').fill('Texto aprovado como enviado.');
  await expect(panel.getByText('28 / 500 caracteres')).toBeVisible();
  await panel.getByRole('button', { name: 'Aprovar e publicar' }).click();
  await expect(page.getByText('Solicitação aprovada.')).toBeVisible({ timeout: 15_000 });

  // Editar e aprovar: título e conteúdo ajustados; a versão enviada fica guardada.
  panel = await openRequest(page, titles.adjusted);
  await panel.getByRole('button', { name: 'Editar e aprovar' }).click();
  await expect(panel.getByLabel('Título')).toHaveValue(titles.adjusted);
  await panel.getByLabel('Título').fill('');
  await panel.getByRole('button', { name: 'Aprovar com ajustes' }).click();
  await expect(panel.getByLabel('Título')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByRole('alert')).toContainText('Revise a versão ajustada');
  await panel.getByLabel('Título').fill(adjustedTitle);
  await panel.getByLabel('Conteúdo').fill(`Conteúdo ajustado pelo superadministrador ${run}.`);
  await panel.getByLabel('Comentário').fill('Ajustei o título para o padrão.');
  await panel.getByRole('button', { name: 'Aprovar com ajustes' }).click();
  await expect(page.getByText('Solicitação aprovada com ajustes.')).toBeVisible({ timeout: 15_000 });

  // Rejeitar sem motivo é bloqueado; com motivo, decide.
  panel = await openRequest(page, titles.rejected);
  await panel.getByRole('button', { name: 'Rejeitar com motivo' }).click();
  await panel.getByRole('button', { name: 'Confirmar rejeição' }).click();
  await expect(panel.getByLabel('Motivo da rejeição')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByLabel('Motivo da rejeição')).toBeFocused();
  await expect(panel.getByRole('alert')).toHaveText('Informe o motivo da rejeição.');
  await panel.getByLabel('Motivo da rejeição').fill('Já existe um padrão com este conteúdo.');
  await panel.getByRole('button', { name: 'Confirmar rejeição' }).click();
  await expect(page.getByText('Solicitação rejeitada.')).toBeVisible({ timeout: 15_000 });

  // A mensagem ajustada foi publicada com a versão final.
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(adjustedTitle);
  await expect(page.locator('[data-testid^="message-item-"]', { hasText: adjustedTitle })).toHaveCount(1);
});

test('histórico do superadministrador encontra os três pedidos com filtros', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.superadmin);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  const history = page.getByRole('table', { name: 'Histórico de solicitações' });
  await expect(history).toBeVisible();

  await page.getByLabel('Solicitante', { exact: true }).selectOption({ label: 'Colaborador Alpha' });
  await page.getByLabel('Acesso', { exact: true }).selectOption(TEST_IDS.accessAlpha);
  await page.getByLabel('De', { exact: true }).fill(today);
  await expect(history.locator('tr', { hasText: run })).toHaveCount(3);

  await page.getByLabel('Situação', { exact: true }).selectOption('aprovada_com_ajustes');
  const adjustedRow = history.locator('tr', { hasText: adjustedTitle });
  await expect(adjustedRow).toHaveCount(1);
  await expect(adjustedRow).toContainText('Aprovada com ajustes');
  await expect(adjustedRow).toContainText('Superadministrador Local');
  await expect(adjustedRow).toContainText('Ajustei o título para o padrão.');
  await expect(history.locator('tr', { hasText: titles.approved })).toHaveCount(0);

  await page.getByLabel('Situação', { exact: true }).selectOption('rejeitada');
  await page.getByLabel('Tipo', { exact: true }).selectOption('criacao');
  const rejectedRow = history.locator('tr', { hasText: titles.rejected });
  await expect(rejectedRow).toContainText('Já existe um padrão com este conteúdo.');
  await expect(history.locator('tr', { hasText: run })).toHaveCount(1);

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByLabel('Situação', { exact: true })).toHaveValue('');
});

test('colaborador acompanha situação, comentário e enviado x publicado em Suas solicitações', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Suas solicitações', exact: true }).click();
  const list = page.getByRole('list', { name: 'Suas solicitações' });
  await expect(list).toBeVisible();

  const item = (title) => list.locator('[data-request-id]', { hasText: title });
  await expect(item(titles.approved)).toContainText('Aprovada');
  await expect(item(adjustedTitle)).toContainText('Aprovada com ajustes');
  await expect(item(titles.rejected)).toContainText('Rejeitada');

  const detail = page.getByRole('complementary', { name: 'Detalhe da solicitação' });
  await item(adjustedTitle).click();
  await expect(detail).toContainText('Ajustei o título para o padrão.');
  await expect(detail).toContainText('Você enviou');
  await expect(detail).toContainText(`Conteúdo enviado para ${titles.adjusted}.`);
  await expect(detail).toContainText('Publicado');
  await expect(detail).toContainText(`Conteúdo ajustado pelo superadministrador ${run}.`);

  await item(titles.approved).click();
  await expect(detail).toContainText('Texto aprovado como enviado.');
  await expect(detail).not.toContainText('Publicado');

  await item(titles.rejected).click();
  await expect(detail).toContainText('Já existe um padrão com este conteúdo.');

  // Atalho da Visão geral (FR-030).
  await page.getByRole('button', { name: 'Visão geral' }).click();
  await page.getByRole('button', { name: 'Ver solicitações enviadas' }).click();
  await expect(page.getByTestId('my-requests-ready')).toBeVisible();
});

test('outro colaborador nunca vê os pedidos nem os comentários de quem enviou', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.otherCollaborator);
  await page.getByRole('button', { name: 'Suas solicitações', exact: true }).click();
  await expect(page.getByTestId('my-requests-ready')).toBeVisible();
  await expect(page.getByText(/Carregando suas solicitações/)).toHaveCount(0);
  await expect(page.getByText(run)).toHaveCount(0);
  await expect(page.getByText('Ajustei o título para o padrão.')).toHaveCount(0);
});
