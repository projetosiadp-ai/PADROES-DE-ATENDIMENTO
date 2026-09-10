import { test, expect } from '@playwright/test';

import { loginAs } from '../fixtures/auth.mjs';
import { SCALE_ACCOUNT } from '../fixtures/scale.mjs';

const RUNS = 5;

function percentile(values, percentileRank) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil((percentileRank / 100) * ordered.length) - 1];
}

test('@perf biblioteca atende aos limites de carga, busca e cópia em cinco medições autenticadas', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'desktop-light', 'Medição canônica executada uma vez em Chromium desktop.');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAs(page, SCALE_ACCOUNT);
  await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 15_000 });
  const scaleCard = page.locator('[data-testid="message-card-80000000-0000-4000-8000-000000000001"]');
  await expect(page.getByText('100 mensagens encontradas')).toBeVisible({ timeout: 20_000 });

  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular3g',
  });

  const loadMeasurements = [];
  const searchMeasurements = [];
  const copyMeasurements = [];
  const transferMeasurements = [];

  for (let run = 0; run < RUNS; run += 1) {
    await page.reload();
    await expect(page.getByTestId('library-ready')).toBeVisible({ timeout: 20_000 });
    loadMeasurements.push(Math.round(await page.evaluate(() => performance.getEntriesByName('dp-library-ready')[0].startTime)));

    transferMeasurements.push(await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const bytes = entry => entry.transferSize || entry.encodedBodySize || 0;
      return {
        scripts: resources.filter(entry => entry.initiatorType === 'script').reduce((total, entry) => total + bytes(entry), 0),
        total: resources.reduce((total, entry) => total + bytes(entry), 0),
      };
    }));

    const search = page.getByRole('searchbox', { name: 'Buscar mensagens' });
    await page.evaluate(() => {
      performance.clearMarks('dp-search-start');
      performance.clearMarks('dp-search-ready');
      performance.mark('dp-search-start');
    });
    await search.fill('MENSAGEM DE ESCALA 0001');
    await expect(scaleCard).toBeVisible();
    searchMeasurements.push(Math.round(await page.evaluate(() =>
      performance.getEntriesByName('dp-search-ready')[0].startTime
      - performance.getEntriesByName('dp-search-start')[0].startTime
    )));
    await search.blur();

    await page.evaluate(() => {
      performance.clearMarks('dp-copy-start');
      performance.clearMarks('dp-copy-ready');
      performance.mark('dp-copy-start');
    });
    await scaleCard.click();
    await expect(page.getByTestId('copy-status')).toHaveText('Mensagem copiada');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Conteúdo determinístico da mensagem de escala 0001.');
    copyMeasurements.push(Math.round(await page.evaluate(() =>
      performance.getEntriesByName('dp-copy-ready')[0].startTime
      - performance.getEntriesByName('dp-copy-start')[0].startTime
    )));

    await search.clear();
  }

  await testInfo.attach('performance-measurements.json', {
    body: JSON.stringify({ loadMeasurements, searchMeasurements, copyMeasurements, transferMeasurements }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ loadMeasurements, searchMeasurements, copyMeasurements, transferMeasurements }));

  expect(percentile(loadMeasurements, 75), 'carga autenticada p75 em 3G').toBeLessThanOrEqual(2_000);
  expect(percentile(searchMeasurements, 95), 'busca p95').toBeLessThanOrEqual(500);
  expect(percentile(copyMeasurements, 95), 'confirmação de cópia p95').toBeLessThanOrEqual(1_000);
  expect(Math.max(...transferMeasurements.map(item => item.scripts)), 'transferência JavaScript').toBeLessThanOrEqual(256 * 1024);
  expect(Math.max(...transferMeasurements.map(item => item.total)), 'transferência total').toBeLessThanOrEqual(512 * 1024);
});
