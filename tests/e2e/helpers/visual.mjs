// Preparo determinístico para as fotos de referência (@visual): relógio fixo, fontes carregadas
// e animações já desligadas pela configuração do Playwright.
const FIXED_TIME = new Date('2026-09-11T17:00:00.000Z'); // 14:00 em America/Sao_Paulo

export async function prepareVisual(page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

export async function settleVisual(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
}

// Regiões com valores voláteis (contagens de uso, datas relativas) são mascaradas na comparação.
export const volatileRegions = (page) => [
  page.locator('[data-volatile]'),
  // Contador de solicitações pendentes da navegação: cresce a cada jornada que envia pedidos.
  page.locator('.dp-nav-count'),
];
