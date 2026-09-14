import { test, expect } from '@playwright/test';

import { dismissPendingNotice, dismissReleaseNotice, LOCAL_ACCOUNTS, LOCAL_SUPABASE_URL, loginAs, openLibrary } from '../fixtures/auth.mjs';
import { TEST_DATA } from '../fixtures/data.mjs';
import { ADJUSTED_REQUEST, ensureAdjustedRequest } from '../fixtures/requests.mjs';
import { ensureVariablesMessage } from '../fixtures/variables.mjs';
import { prepareVisual, settleVisual, volatileRegions } from './helpers/visual.mjs';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/* As fotos comparam o desenho, não os dados. Como a massa local acumula conteúdo a cada
 * bateria, cada tela é levada a um estado determinístico antes da foto (busca que devolve uma
 * única mensagem conhecida, ou uma conta sem uso), e as contagens que variam ficam mascaradas. */
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await prepareVisual(page);
});

// Com um diálogo aberto, a foto é só do diálogo: a página por trás acumula dados a cada
// bateria e deixaria a comparação instável.
const shot = async (page, name, { dialog = false } = {}) => {
  await settleVisual(page);
  if (dialog) {
    const modal = page.locator('[aria-modal="true"]');
    await expect(modal).toHaveScreenshot(name, { mask: [modal.locator('[data-volatile]')] });
    return;
  }
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: volatileRegions(page) });
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

// Etapa 2: cada janela, aberta sobre a mesma mensagem determinística.
async function openAlphaReading(page) {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(TEST_DATA.messageAlpha.titulo);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await expect(page.locator('.dp-search__results')).toHaveCount(0);
  await page.getByTestId(`message-item-${TEST_DATA.messageAlpha.id}`).click();
  return page.locator('[aria-label="Leitura da mensagem"], [aria-modal="true"]').last();
}

test('@visual janela solicitar nova mensagem', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('button', { name: 'Solicitar mensagem' }).click();
  await expect(page.getByRole('dialog', { name: 'Solicitar nova mensagem' })).toBeVisible();
  await shot(page, 'janela-solicitar.png', { dialog: true });
});

test('@visual janela visualizar', async ({ page }) => {
  const reading = await openAlphaReading(page);
  await reading.getByRole('button', { name: 'Visualizar' }).click();
  await expect(page.getByRole('dialog', { name: TEST_DATA.messageAlpha.titulo })).toBeVisible();
  await shot(page, 'janela-visualizar.png', { dialog: true });
});

test('@visual janela solicitar arquivamento', async ({ page }) => {
  const reading = await openAlphaReading(page);
  await reading.getByRole('button', { name: 'Solicitar arquivamento' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await shot(page, 'janela-arquivamento.png', { dialog: true });
});

test('@visual janela criar conta', async ({ page }) => {
  await openLibrary(page, LOCAL_ACCOUNTS.superadmin);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Contas' }).click();
  await page.getByRole('button', { name: 'Nova conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar conta' });
  await expect(dialog).toBeVisible();
  // A lista de acessos cresce com as jornadas estruturais: só o formulário entra na comparação.
  await settleVisual(page);
  await expect(dialog).toHaveScreenshot('janela-criar-conta.png', { mask: [dialog.locator('fieldset')] });
});

// Etapa 3: a Administração acumula registros a cada bateria. A foto é da área visível, com
// linhas, listas e painéis de dados mascarados: compara faixa, pílulas, cabeçalhos e layout.
const ADMIN_SECTIONS = [
  ['Solicitações', 'administracao-solicitacoes.png'],
  ['Mensagens', 'administracao-mensagens.png'],
  ['Contas', 'administracao-contas.png'],
  ['Acessos', 'administracao-acessos.png'],
];

for (const [tab, name] of ADMIN_SECTIONS) {
  test(`@visual administração — ${tab.toLowerCase()}`, async ({ page }) => {
    await openLibrary(page, LOCAL_ACCOUNTS.superadmin);
    await page.getByLabel('Acesso ativo').selectOption(TEST_DATA.accessAlpha.id);
    await page.getByRole('button', { name: 'Administração' }).click();
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Carregando/)).toHaveCount(0);
    await settleVisual(page);
    await expect(page).toHaveScreenshot(name, {
      mask: [
        ...volatileRegions(page),
        page.locator('.dp-admin tbody, .dp-admin .dp-list, .dp-admin .dp-side-list, .dp-admin .dp-request, .dp-admin .dp-empty'),
      ],
    });
  });
}

// Etapa 5: "Suas solicitações" com um pedido ajustado e o histórico filtrado até sobrar só ele.
test('@visual suas solicitações com pedido ajustado', async ({ page }) => {
  await ensureAdjustedRequest();
  await openLibrary(page, LOCAL_ACCOUNTS.otherCollaborator);
  await page.getByRole('button', { name: 'Suas solicitações', exact: true }).click();
  const detail = page.getByRole('complementary', { name: 'Detalhe da solicitação' });
  await page.locator(`[data-request-id="${ADJUSTED_REQUEST.id}"]`).click();
  await expect(detail).toContainText(ADJUSTED_REQUEST.comment);
  await expect(detail).toContainText('Publicado');
  await shot(page, 'suas-solicitacoes-ajustada.png');
});

test('@visual histórico filtrado', async ({ page }) => {
  await ensureAdjustedRequest();
  await openLibrary(page, LOCAL_ACCOUNTS.superadmin);
  await page.getByLabel('Acesso ativo').selectOption(TEST_DATA.accessAlpha.id);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  const history = page.getByRole('table', { name: 'Histórico de solicitações' });
  await expect(history).toBeVisible();
  await page.getByLabel('Solicitante', { exact: true }).selectOption({ label: 'Colaborador Beta' });
  await page.getByLabel('Situação', { exact: true }).selectOption('aprovada_com_ajustes');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history).toContainText(ADJUSTED_REQUEST.publishedTitle);
  await expect(page.getByText(/Carregando/)).toHaveCount(0);
  await shot(page, 'historico-filtrado.png');
});

// Etapa 4: mensagem com variáveis, uma preenchida e outra vazia (tela 03, painel de leitura).
test('@visual mensagem com variáveis', async ({ page }) => {
  await ensureVariablesMessage();
  await openLibrary(page, LOCAL_ACCOUNTS.collaborator);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).fill(TEST_DATA.messageVariables.titulo);
  await page.getByRole('searchbox', { name: 'Buscar mensagens' }).blur();
  await expect(page.locator('.dp-search__results')).toHaveCount(0);
  await page.getByTestId(`message-item-${TEST_DATA.messageVariables.id}`).click();
  const reading = page.locator('[aria-label="Leitura da mensagem"], [aria-modal="true"]').last();
  await reading.getByRole('textbox', { name: 'Nome' }).fill('Marina Duarte');
  await reading.getByRole('textbox', { name: 'Nome' }).blur();
  await settleVisual(page);
  await expect(reading).toHaveScreenshot('mensagem-com-variaveis.png', { mask: [reading.locator('[data-volatile]')] });
});