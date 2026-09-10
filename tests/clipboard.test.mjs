import assert from 'node:assert/strict';
import test from 'node:test';

async function loadClipboardModule() {
  try {
    return await import('../ui/clipboard.mjs');
  } catch (error) {
    assert.fail(`o módulo de clipboard deve existir: ${error.message}`);
  }
}

function createDocumentDouble() {
  const appended = [];
  const document = {
    body: {
      append(element) {
        appended.push(element);
        element.isConnected = true;
      },
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        value: '',
        attributes: {},
        style: {},
        focused: false,
        selected: false,
        isConnected: false,
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; },
        select() { this.selected = true; },
      };
    },
  };
  return { document, appended };
}

test('copyExactText envia ao clipboard exatamente o texto armazenado', async () => {
  const { copyExactText } = await loadClipboardModule();
  const writes = [];
  const text = '  Olá, Maria!\n\nSeu retorno é amanhã.  ';

  const result = await copyExactText(text, {
    clipboard: { writeText(value) { writes.push(value); return Promise.resolve(); } },
  });

  assert.deepStrictEqual(writes, [text]);
  assert.deepStrictEqual(result, { copied: true, method: 'clipboard' });
});

test('copyExactText oferece fallback manual selecionável quando a API falha', async () => {
  const { copyExactText } = await loadClipboardModule();
  const { document, appended } = createDocumentDouble();
  const text = 'Linha 1\nLinha 2';

  const result = await copyExactText(text, {
    clipboard: { writeText() { return Promise.reject(new Error('negado')); } },
    document,
  });

  assert.strictEqual(result.copied, false);
  assert.strictEqual(result.method, 'manual');
  assert.strictEqual(result.element, appended[0]);
  assert.strictEqual(result.element.value, text);
  assert.strictEqual(result.element.attributes.readonly, '');
  assert.strictEqual(result.element.attributes['aria-label'], 'Texto para cópia manual');
  assert.strictEqual(result.element.focused, true);
  assert.strictEqual(result.element.selected, true);
});

test('copyExactText usa fallback manual quando clipboard não está disponível', async () => {
  const { copyExactText } = await loadClipboardModule();
  const { document } = createDocumentDouble();

  const result = await copyExactText('conteúdo', { clipboard: null, document });

  assert.strictEqual(result.method, 'manual');
  assert.strictEqual(result.element.value, 'conteúdo');
  assert.strictEqual(result.element.selected, true);
});

test('telemetria pendente não bloqueia a confirmação de cópia', async () => {
  const { copyExactText } = await loadClipboardModule();
  let telemetryStarted = false;
  const telemetry = () => {
    telemetryStarted = true;
    return new Promise(() => {});
  };

  const result = await copyExactText('texto', {
    clipboard: { writeText() { return Promise.resolve(); } },
    telemetry,
  });

  assert.strictEqual(telemetryStarted, true);
  assert.deepStrictEqual(result, { copied: true, method: 'clipboard' });
});

test('falha da telemetria é observável sem desfazer a cópia', async () => {
  const { copyExactText } = await loadClipboardModule();
  const telemetryErrors = [];

  const result = await copyExactText('texto', {
    clipboard: { writeText() { return Promise.resolve(); } },
    telemetry: () => Promise.reject(new Error('telemetria indisponível')),
    onTelemetryError: error => telemetryErrors.push(error.message),
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepStrictEqual(result, { copied: true, method: 'clipboard' });
  assert.deepStrictEqual(telemetryErrors, ['telemetria indisponível']);
});
