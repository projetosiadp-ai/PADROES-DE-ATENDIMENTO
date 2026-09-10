import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderAdminConfirmationModal,
  renderMessageEditorModal,
  renderStructuralModals,
} from '../views/modal-view.mjs';

const theme = new Proxy({}, { get: () => '#000' });
const register = (() => { let next = 0; return () => `h${next++}`; })();
const noop = () => {};

const confirmation = (saving) => renderAdminConfirmationModal({
  open: true, title: 'Arquivar mensagem', message: 'Pode ser restaurada.', saving, onClose: noop, onConfirm: noop,
}, theme, register);

const buttons = (html) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);

test('confirmação ociosa permite cancelar e confirmar', () => {
  const html = confirmation(false);
  assert.doesNotMatch(html, /aria-busy/);
  assert.deepStrictEqual(buttons(html).map(button => /\bdisabled\b/.test(button)), [false, false]);
  assert.match(html, />Confirmar<\/button>/);
});

test('confirmação em andamento desabilita confirmação e cancelamento e marca o diálogo como ocupado', () => {
  const html = confirmation(true);
  assert.match(html, /role="alertdialog"[^>]*aria-busy="true"/);
  assert.deepStrictEqual(buttons(html).map(button => /\bdisabled\b/.test(button)), [true, true]);
  assert.match(html, /Processando…/);
});

test('editor de mensagens aponta campos inválidos para a mensagem de erro', () => {
  const html = renderMessageEditorModal({
    open: true, title: 'Nova mensagem', categories: [{ id: 'c1', nome: 'Boas-vindas' }],
    form: { categoryId: 'c1', title: '', tagInput: '', tags: [], content: '' },
    tagChips: [], saving: false, error: 'Preencha título e conteúdo.', invalid: ['title', 'content'],
  }, theme, register);
  assert.strictEqual([...html.matchAll(/aria-invalid="true" aria-describedby="message-editor-error"/g)].length, 2);
  assert.match(html, /id="message-editor-error" role="alert"/);
});

test('diálogos estruturais ficam ocupados enquanto salvam', () => {
  const html = renderStructuralModals({
    category: { open: true, title: 'Nova categoria', name: 'X', saving: true, onClose: noop, onSubmit: noop },
  }, theme, register);
  assert.match(html, /role="dialog"[^>]*aria-busy="true"/);
  assert.ok(buttons(html).every(button => /\bdisabled\b/.test(button)));
});
