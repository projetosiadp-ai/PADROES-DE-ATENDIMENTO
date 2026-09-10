import assert from 'node:assert/strict';
import test from 'node:test';

import { activateDialogFocus } from '../ui/focus.mjs';

function setupDialog() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const makeElement = (name) => ({
    name,
    disabled: false,
    hidden: false,
    tabIndex: 0,
    isConnected: true,
    focus() { document.activeElement = this; },
  });
  const opener = makeElement('opener');
  const cancel = makeElement('cancel');
  const confirm = makeElement('confirm');
  const dialog = {
    contains(element) { return element === cancel || element === confirm; },
    querySelectorAll() { return [cancel, confirm]; },
    focus() { document.activeElement = this; },
  };
  document.activeElement = opener;
  return { document, listeners, opener, cancel, confirm, dialog };
}

function keyEvent(key, options = {}) {
  return {
    key,
    shiftKey: options.shiftKey ?? false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

test('abertura move foco para o controle inicial solicitado', () => {
  const fixture = setupDialog();
  const deactivate = activateDialogFocus(fixture.dialog, {
    document: fixture.document,
    initialFocus: fixture.cancel,
  });

  assert.strictEqual(fixture.document.activeElement, fixture.cancel);
  deactivate();
});

test('Tab e Shift+Tab permanecem dentro do dialogo', () => {
  const fixture = setupDialog();
  const deactivate = activateDialogFocus(fixture.dialog, { document: fixture.document });
  const onKeydown = fixture.listeners.get('keydown');

  fixture.confirm.focus();
  const forward = keyEvent('Tab');
  onKeydown(forward);
  assert.strictEqual(fixture.document.activeElement, fixture.cancel);
  assert.strictEqual(forward.defaultPrevented, true);

  const backward = keyEvent('Tab', { shiftKey: true });
  onKeydown(backward);
  assert.strictEqual(fixture.document.activeElement, fixture.confirm);
  assert.strictEqual(backward.defaultPrevented, true);
  deactivate();
});

test('Escape fecha quando seguro e restaura foco ao opener', () => {
  const fixture = setupDialog();
  let requested = 0;
  activateDialogFocus(fixture.dialog, {
    document: fixture.document,
    onEscape: () => { requested += 1; },
  });

  const escape = keyEvent('Escape');
  fixture.listeners.get('keydown')(escape);

  assert.strictEqual(requested, 1);
  assert.strictEqual(escape.defaultPrevented, true);
  assert.strictEqual(fixture.document.activeElement, fixture.opener);
  assert.strictEqual(fixture.listeners.has('keydown'), false);
});

test('predicado de Escape bloqueia somente enquanto a operacao esta em andamento', () => {
  const fixture = setupDialog();
  let busy = true;
  let requested = 0;
  activateDialogFocus(fixture.dialog, {
    document: fixture.document,
    escapeCloses: () => !busy,
    onEscape: () => { requested += 1; },
  });
  const onKeydown = fixture.listeners.get('keydown');

  onKeydown(keyEvent('Escape'));
  assert.strictEqual(requested, 0);
  assert.strictEqual(fixture.document.activeElement, fixture.cancel);

  busy = false;
  onKeydown(keyEvent('Escape'));
  assert.strictEqual(requested, 1);
  assert.strictEqual(fixture.document.activeElement, fixture.opener);
});

test('Escape pode ser bloqueado durante uma operacao insegura', () => {
  const fixture = setupDialog();
  let requested = 0;
  const deactivate = activateDialogFocus(fixture.dialog, {
    document: fixture.document,
    escapeCloses: false,
    onEscape: () => { requested += 1; },
  });

  const escape = keyEvent('Escape');
  fixture.listeners.get('keydown')(escape);

  assert.strictEqual(requested, 0);
  assert.strictEqual(escape.defaultPrevented, false);
  assert.strictEqual(fixture.document.activeElement, fixture.cancel);
  deactivate();
});
