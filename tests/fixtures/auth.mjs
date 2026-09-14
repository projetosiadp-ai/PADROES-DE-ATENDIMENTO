const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export const LOCAL_APP_URL = 'http://127.0.0.1:4173';
export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54421';

export const LOCAL_ACCOUNTS = Object.freeze({
  collaborator: Object.freeze({
    email: 'colaborador.alpha@local.test',
    password: 'LocalTest!123',
  }),
  otherCollaborator: Object.freeze({
    email: 'colaborador.beta@local.test',
    password: 'LocalTest!123',
  }),
  superadmin: Object.freeze({
    email: 'superadmin@local.test',
    password: 'LocalTest!123',
  }),
  noAccess: Object.freeze({
    email: 'sem-acesso@local.test',
    password: 'LocalTest!123',
  }),
});

export function assertLocalUrl(value, label = 'URL') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${label} deve apontar para uma origem HTTP local.`);
  }
  return url;
}

export async function loginAs(page, account = LOCAL_ACCOUNTS.collaborator) {
  assertLocalUrl(page.url() === 'about:blank' ? LOCAL_APP_URL : page.url(), 'URL do navegador');
  const bootErrors = [];
  page.on('pageerror', (error) => bootErrors.push(error.message));
  page.on('requestfailed', (request) => {
    bootErrors.push(`${request.url()}: ${request.failure()?.errorText ?? 'falha de rede'}`);
  });
  if (globalThis.location) await page.route('**/config.js', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript; charset=utf-8',
      body: `export const SUPABASE_URL = '${LOCAL_SUPABASE_URL}';\nexport const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';\n`,
    });
  });
  await page.goto('/');
  try {
    await page.locator('[data-focus="loginEmail"]').waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    throw new Error(`A tela de login não iniciou. ${bootErrors.join(' | ') || error.message}`);
  }
  await page.locator('[data-focus="loginEmail"]').fill(account.email);
  await page.locator('[data-focus="loginPassword"]').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// O aviso de novidades (dp_novidades) aparece uma vez por navegador em cada etapa publicada.
export async function dismissReleaseNotice(page) {
  const notice = page.getByRole('dialog', { name: 'Novidades' });
  if (await notice.isVisible().catch(() => false)) {
    await notice.getByRole('button', { name: 'Entendi' }).click();
    await notice.waitFor({ state: 'hidden' });
  }
}

export async function dismissPendingNotice(page) {
  const popup = page.getByRole('alertdialog', { name: 'Solicitações pendentes' });
  if (await popup.isVisible().catch(() => false)) {
    await popup.getByRole('button', { name: 'Dispensar' }).click();
    await popup.waitFor({ state: 'hidden' });
  }
}

// Entra e deixa a Biblioteca pronta para interação: sem avisos por cima.
export async function openLibrary(page, account = LOCAL_ACCOUNTS.collaborator) {
  await loginAs(page, account);
  await page.getByTestId('library-ready').waitFor({ state: 'visible', timeout: 15_000 });
  await dismissPendingNotice(page);
  await dismissReleaseNotice(page);
}

// "Sair" mora no menu da conta, aberto pelo botão de iniciais da faixa da marca.
export async function logout(page) {
  await page.getByRole('button', { name: /^Conta de / }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await page.locator('[data-focus="loginEmail"]').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function clearBrowserSession(page) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}
