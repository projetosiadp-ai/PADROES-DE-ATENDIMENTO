import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';

const RUNS = 3;
const PORT = 9333;
const OUTPUT_DIR = path.resolve('.lighthouseci');
const PROFILE_DIR = path.join(OUTPUT_DIR, `chrome-profile-${process.pid}`);
const URL = 'http://127.0.0.1:4173/';
const SCRIPT_BUDGET = 256 * 1024;
const TOTAL_BUDGET = 512 * 1024;

await mkdir(OUTPUT_DIR, { recursive: true });
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  args: [`--remote-debugging-port=${PORT}`, '--disable-gpu'],
});

const results = [];
try {
  for (let run = 1; run <= RUNS; run += 1) {
    const audit = await lighthouse(URL, {
      port: PORT,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 360, height: 800, deviceScaleFactor: 2, disabled: false },
    });
    const lhr = audit.lhr;
    const resources = lhr.audits['resource-summary']?.details?.items;
    if (!resources) {
      // Lighthouse occasionally returns a partial report; surface its own reason instead of a TypeError.
      const reason = lhr.runtimeError?.message ?? lhr.audits['resource-summary']?.errorMessage ?? 'motivo não informado';
      throw new Error(`Lighthouse (execução ${run}) não produziu o resumo de recursos: ${reason}`);
    }
    const scripts = resources.find(item => item.resourceType === 'script')?.transferSize ?? 0;
    const total = resources.find(item => item.resourceType === 'total')?.transferSize ?? 0;
    results.push({ run, scripts, total, performance: lhr.categories.performance.score });
    await writeFile(path.join(OUTPUT_DIR, `lhr-current-${run}.json`), JSON.stringify(lhr), 'utf8');
  }
} finally {
  await context.close();
  await rm(PROFILE_DIR, { recursive: true, force: true });
}

const maxScripts = Math.max(...results.map(result => result.scripts));
const maxTotal = Math.max(...results.map(result => result.total));
const assertions = [
  { name: 'script.size', expected: SCRIPT_BUDGET, actual: maxScripts, passed: maxScripts <= SCRIPT_BUDGET },
  { name: 'total.size', expected: TOTAL_BUDGET, actual: maxTotal, passed: maxTotal <= TOTAL_BUDGET },
];
await writeFile(path.join(OUTPUT_DIR, 'assertion-results.json'), JSON.stringify(assertions, null, 2), 'utf8');
console.log(JSON.stringify({ lighthouseRuns: results, assertions }));
assert.ok(assertions[0].passed, `JavaScript transferido: ${maxScripts} > ${SCRIPT_BUDGET}`);
assert.ok(assertions[1].passed, `Transferência total: ${maxTotal} > ${TOTAL_BUDGET}`);
