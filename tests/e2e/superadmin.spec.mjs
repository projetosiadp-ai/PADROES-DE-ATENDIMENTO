import { test, expect } from '@playwright/test';

import { LOCAL_ACCOUNTS, loginAs } from '../fixtures/auth.mjs';
import { TEST_DATA, TEST_IDS } from '../fixtures/data.mjs';

test.describe.configure({ timeout: 60_000 });

async function createPendingProposal(page, title) {
  await loginAs(page);
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Sugerir mensagem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar nova mensagem' });
  await dialog.getByLabel('Categoria').selectOption(TEST_IDS.categoryAlpha);
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Conteúdo').fill(`Conteúdo proposto para ${title}.`);
  await dialog.getByRole('button', { name: 'Enviar para revisão' }).click();
  await expect(page.getByText('Proposta enviada para revisão')).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('[data-focus="loginEmail"]')).toBeVisible({ timeout: 10_000 });
}

async function openPendingRequests(page) {
  await loginAs(page, LOCAL_ACCOUNTS.superadmin);
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });
  const popup = page.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await popup.isVisible().catch(() => false)) {
    await popup.getByRole('button', { name: 'Dispensar' }).click();
  }
  await page.getByLabel('Acesso ativo').selectOption(TEST_IDS.accessAlpha);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: /Solicitações/ }).click();
  await expect(page.getByText('Solicitações de Aprovação')).toBeVisible();
}

async function openNewestRequest(page, title) {
  await page.getByRole('button', { name: 'Analisar' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Solicitação de Criação' });
  await expect(dialog).toContainText(title);
  return dialog;
}

test('superadministrador aprova e rejeita propostas com decisão persistida', async ({ page }) => {
  const approvedTitle = 'Proposta E2E para aprovação';
  await createPendingProposal(page, approvedTitle);
  await openPendingRequests(page);
  let dialog = await openNewestRequest(page, approvedTitle);
  await dialog.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Solicitação aprovada.')).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('[data-focus="loginEmail"]')).toBeVisible({ timeout: 10_000 });
  const rejectedTitle = 'Proposta E2E para rejeição';
  await createPendingProposal(page, rejectedTitle);
  await openPendingRequests(page);
  dialog = await openNewestRequest(page, rejectedTitle);
  await dialog.getByRole('button', { name: 'Rejeitar' }).click();
  await dialog.getByLabel('Motivo da rejeição').fill('Não atende ao padrão editorial.');
  await dialog.getByRole('button', { name: 'Confirmar rejeição' }).click();
  await expect(page.getByText('Solicitação rejeitada.')).toBeVisible();
});

test('duas revisões concorrentes aplicam a proposta no máximo uma vez', async ({ page, browser }) => {
  const title = 'Proposta E2E concorrente';
  await createPendingProposal(page, title);
  await openPendingRequests(page);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await loginAs(secondPage, LOCAL_ACCOUNTS.superadmin);
  await expect(secondPage.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });
  const popup = secondPage.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await popup.isVisible().catch(() => false)) {
    await popup.getByRole('button', { name: 'Dispensar' }).click();
  }
  await secondPage.getByRole('button', { name: 'Administração' }).click();
  await secondPage.getByRole('tab', { name: /Solicitações/ }).click();

  const firstDialog = await openNewestRequest(page, title);
  const secondDialog = await openNewestRequest(secondPage, title);
  await Promise.all([
    firstDialog.getByRole('button', { name: 'Aprovar' }).click(),
    secondDialog.getByRole('button', { name: 'Aprovar' }).click(),
  ]);

  await expect.poll(async () => await page.getByText('Solicitação aprovada.').count()
    + await secondPage.getByText('Solicitação aprovada.').count()).toBe(1);
  await expect.poll(async () => await page.getByText(/já foi revisada|estado atual/i).count()
    + await secondPage.getByText(/já foi revisada|estado atual/i).count()).toBe(1);
  await secondContext.close();
});

test('superadministrador cria, edita, arquiva e restaura conteúdo pelo mesmo id', async ({ page }) => {
  const title = `Mensagem editorial E2E ${crypto.randomUUID().slice(0, 8)}`;
  await openPendingRequests(page);
  await page.getByRole('tab', { name: 'Mensagens' }).click();
  await page.getByRole('button', { name: 'Nova mensagem' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Nova mensagem' });
  await createDialog.getByLabel('Categoria').selectOption({ label: 'Boas-vindas' });
  await createDialog.getByLabel('Título').fill(title);
  await createDialog.getByLabel('Conteúdo').fill('Conteúdo editorial inicial.');
  await createDialog.getByRole('button', { name: 'Salvar' }).click();

  const row = page.getByRole('row', { name: new RegExp(title) });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog', { name: 'Editar mensagem' }).getByLabel('Conteúdo').fill('Conteúdo editorial revisado.');
  await page.getByRole('dialog', { name: 'Editar mensagem' }).getByRole('button', { name: 'Salvar' }).click();
  await row.getByRole('button', { name: 'Arquivar' }).click();
  await page.getByRole('alertdialog', { name: /Arquivar mensagem/ }).getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Mensagem arquivada.')).toBeVisible();

  await page.getByRole('tab', { name: 'Arquivados' }).click();
  const archivedRow = page.getByRole('row', { name: new RegExp(title) });
  const stableId = await archivedRow.getAttribute('data-message-id');
  await archivedRow.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Mensagem restaurada.')).toBeVisible();
  await page.getByRole('tab', { name: 'Mensagens' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveAttribute('data-message-id', stableId);
});

test('arquivar pela biblioteca usa o ciclo recuperável e bloqueia confirmação duplicada', async ({ page }) => {
  const title = `Arquivo pela biblioteca ${crypto.randomUUID().slice(0, 8)}`;
  await openPendingRequests(page);
  await page.getByRole('tab', { name: 'Mensagens' }).click();
  await page.getByRole('button', { name: 'Nova mensagem' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Nova mensagem' });
  await createDialog.getByLabel('Categoria').selectOption({ label: 'Boas-vindas' });
  await createDialog.getByLabel('Título').fill(title);
  await createDialog.getByLabel('Conteúdo').fill('Conteúdo que será arquivado pela biblioteca.');
  await createDialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(createDialog).toBeHidden();

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(title);
  const card = page.getByRole('article', { name: title });
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);

  let archiveCalls = 0;
  await page.route('**/rest/v1/rpc/arquivar_mensagem', async route => {
    archiveCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });
  await card.getByRole('button', { name: 'Arquivar' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Arquivar mensagem' });
  await expect(confirmation).toContainText(title);
  await expect(confirmation).toContainText('pode ser restaurada');
  await expect(confirmation.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await confirmation.getByRole('button', { name: 'Confirmar' }).dblclick();
  await expect(confirmation).toHaveAttribute('aria-busy', 'true');
  await expect(confirmation.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await expect(confirmation.getByRole('button', { name: 'Processando…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();

  await expect(page.getByText('Mensagem arquivada.')).toBeVisible();
  await expect(confirmation).toBeHidden();
  expect(archiveCalls).toBe(1);
  await expect(card).toHaveCount(0);

  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Arquivados' }).click();
  await page.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Mensagem restaurada.')).toBeVisible();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await expect(page.getByRole('article', { name: title })).toBeVisible();
});

test('superadministrador cria acesso e categoria, arquiva e restaura a categoria', async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const accessName = `Acesso estrutural ${suffix}`;
  const categoryName = `Categoria estrutural ${suffix}`;

  await openPendingRequests(page);
  await page.getByRole('tab', { name: 'Acessos' }).click();
  await page.getByRole('button', { name: 'Novo acesso' }).click();
  const accessDialog = page.getByRole('dialog', { name: 'Novo acesso' });
  await accessDialog.getByLabel('Nome do acesso').fill(accessName);
  await accessDialog.getByLabel('Descrição').fill('Criado pela jornada estrutural.');
  await accessDialog.getByRole('button', { name: 'Criar acesso' }).click();

  await expect(page.getByText('Acesso criado.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Categorias' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Nova categoria' });
  await categoryDialog.getByLabel('Nome da categoria').fill(categoryName);
  await categoryDialog.getByRole('button', { name: 'Salvar' }).click();

  const categoryRow = page.getByRole('row', { name: new RegExp(categoryName) });
  await categoryRow.getByRole('button', { name: 'Arquivar' }).click();
  await page.getByRole('alertdialog', { name: new RegExp(`Arquivar categoria ${categoryName}`) })
    .getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('tab', { name: 'Arquivados' }).click();
  await page.getByRole('row', { name: new RegExp(categoryName) }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Categoria restaurada.')).toBeVisible();
  await page.getByRole('tab', { name: 'Categorias' }).click();
  await expect(page.getByRole('row', { name: new RegExp(categoryName) })).toBeVisible();

  await page.getByRole('tab', { name: 'Acessos' }).click();
  const accessRow = page.getByRole('row', { name: new RegExp(accessName) });
  await accessRow.getByRole('button', { name: 'Desativar' }).click();
  await page.getByRole('alertdialog', { name: 'Desativar acesso' }).getByRole('button', { name: 'Confirmar' }).click();
  await expect(accessRow).toContainText('Inativo');
  await accessRow.getByRole('button', { name: 'Ativar' }).click();
  await expect(accessRow).toContainText('Ativo');
});

test('superadministrador cria conta com vários acessos, altera vínculos e redefine a senha', async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `Colaborador estrutural ${suffix}`;
  const email = `colaborador.${suffix}@local.test`;
  const initialPassword = `Inicial!${suffix}Aa1`;

  await openPendingRequests(page);
  await page.getByRole('tab', { name: 'Contas' }).click();
  await page.getByRole('button', { name: 'Nova conta' }).click();
  const accountDialog = page.getByRole('dialog', { name: 'Criar conta' });
  await accountDialog.getByLabel('Nome').fill(name);
  await accountDialog.getByLabel('E-mail').fill(email);
  await accountDialog.getByLabel('Senha temporária').fill(initialPassword);
  await accountDialog.getByLabel('Papel').selectOption('colaborador');
  await accountDialog.getByRole('checkbox', { name: 'Atendimento Local' }).check();
  await accountDialog.getByRole('checkbox', { name: 'Comercial Local' }).check();
  await accountDialog.getByRole('button', { name: 'Criar conta' }).click();

  const passwordDialog = page.getByRole('dialog', { name: 'Senha temporária criada' });
  await expect(passwordDialog).toContainText(initialPassword, { timeout: 20_000 });
  await passwordDialog.getByRole('button', { name: 'Concluir' }).click();
  const accountRow = page.getByRole('row', { name: new RegExp(name) });
  await expect(accountRow).toContainText('2 acessos');

  await accountRow.getByRole('button', { name: 'Gerenciar acessos' }).click();
  const membershipDialog = page.getByRole('dialog', { name: new RegExp(`Acessos de ${name}`) });
  await membershipDialog.getByRole('checkbox', { name: 'Comercial Local' }).uncheck();
  await membershipDialog.getByRole('button', { name: 'Concluir' }).click();
  await expect(accountRow).toContainText('1 acesso');

  await accountRow.getByRole('button', { name: 'Redefinir senha' }).click();
  await page.getByRole('alertdialog', { name: 'Redefinir senha' }).getByRole('button', { name: 'Confirmar' }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Senha temporária criada' });
  await expect(resetDialog).toBeVisible({ timeout: 20_000 });
  const resetPassword = await resetDialog.locator('[data-temporary-password]').textContent();
  expect(resetPassword).toBeTruthy();
  expect(resetPassword).not.toBe(initialPassword);
  await resetDialog.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText(resetPassword)).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('[data-focus="loginEmail"]')).toBeVisible({ timeout: 15_000 });
  await loginAs(page, { email, password: resetPassword });
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Selecionar acesso')).toHaveCount(0);
  await expect(page.getByText(TEST_DATA.messageAlpha.titulo)).toBeVisible();
  await expect(page.getByText(TEST_DATA.messageBeta.titulo)).toHaveCount(0);
});
