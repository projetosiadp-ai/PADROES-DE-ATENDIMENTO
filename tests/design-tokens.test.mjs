import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Arquivos já migrados para as classes do design system: neles não pode sobrar cor literal.
// A lista cresce a cada etapa (contracts/design-tokens.md).
const MIGRATED_FILES = [];

const file = (path) => new URL(`../${path}`, import.meta.url);
const css = await readFile(file('styles/design-system.css'), 'utf8');

const tokens = Object.fromEntries(
  [...css.matchAll(/(--dp-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
);

const channel = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const TEXT_PAIRS = [
  ['--dp-text', '--dp-bg'],
  ['--dp-text', '--dp-surface'],
  ['--dp-text-muted', '--dp-bg'],
  ['--dp-text-muted', '--dp-surface'],
  ['--dp-text-muted', '--dp-surface-soft'],
  ['--dp-cyan-700', '--dp-surface'],
  ['--dp-on-brand', '--dp-navy-800'],
  ['--dp-on-brand', '--dp-cyan-700'],
  ['--dp-on-brand-muted', '--dp-navy-800'],
  ['--dp-navy-950', '--dp-cyan-400'],
  ['--dp-highlight-ink', '--dp-highlight-bg'],
  ['--dp-danger-ink', '--dp-danger-bg'],
  ['--dp-success-ink', '--dp-surface'],
];

const UI_PAIRS = [
  ['--dp-control-border', '--dp-surface'],
  ['--dp-control-border', '--dp-bg'],
  ['--dp-star-off', '--dp-surface'],
  ['--dp-cyan-500', '--dp-surface'],
];

test('todos os tokens de cor existem e são hexadecimais completos', () => {
  for (const [, ...pair] of [...TEXT_PAIRS, ...UI_PAIRS].entries()) {
    for (const name of pair.flat()) {
      assert.match(tokens[name] ?? '', /^#[0-9A-Fa-f]{6}$/, `${name} deve ser um hexadecimal de 6 dígitos`);
    }
  }
});

test('texto comum atinge 4,5:1 sobre o próprio fundo', () => {
  for (const [ink, background] of TEXT_PAIRS) {
    const ratio = contrast(ink, background);
    assert.ok(ratio >= 4.5, `${ink} sobre ${background}: ${ratio.toFixed(2)}:1 (mínimo 4,5:1)`);
  }
});

test('contornos, ícones e foco atingem 3:1', () => {
  for (const [ink, background] of UI_PAIRS) {
    const ratio = contrast(ink, background);
    assert.ok(ratio >= 3, `${ink} sobre ${background}: ${ratio.toFixed(2)}:1 (mínimo 3:1)`);
  }
});

test('o design system não tem tema escuro', () => {
  assert.doesNotMatch(css, /prefers-color-scheme|\[data-theme|--dp-dark|\.dark\b/i);
});

test('a folha aplica estilos base somente sob .dp-app', () => {
  const baseRules = [...css.matchAll(/^([^@\s/}][^{}]*)\{/gm)].map(([, selector]) => selector.trim());
  for (const selector of baseRules) {
    if (selector === ':root') continue;
    assert.match(selector, /\.dp-/, `seletor "${selector}" precisa ficar sob .dp-app ou uma classe dp-`);
  }
});

test('arquivos migrados não têm cor literal', async () => {
  for (const path of MIGRATED_FILES) {
    const source = await readFile(file(path), 'utf8');
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{3,8}\b/, `${path} deve usar os tokens do design system`);
  }
});
