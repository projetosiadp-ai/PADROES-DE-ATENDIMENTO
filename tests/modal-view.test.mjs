import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderAdminConfirmationModal,
  renderMessageEditorModal,
  renderMessageRequestModal,
  renderStructuralModals,
} from '../views/modal-view.mjs';

const register = (() => { let next = 0; return () => `h${next++}`; })();
const noop = () => {};

const confirmation = (saving) => renderAdminConfirmationModal({
  open: true, title: 'Arquivar mensagem', message: 'Pode ser restaurada.', saving, onClose: noop, onConfirm: noop,
}, register);

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
  }, register);
  assert.match(html, /aria-label="Título"[^>]*aria-invalid="true" aria-describedby="editor-title-counter message-editor-error"/);
  assert.match(html, /aria-label="Conteúdo"[^>]*aria-invalid="true" aria-describedby="editor-content-counter message-editor-error"/);
  assert.match(html, /id="message-editor-error" role="alert"/);
});

const anatomy = (html) => {
  const dialog = html.match(/<section class="dp-dialog[^"]*" role="(dialog|alertdialog)" aria-modal="true" aria-labelledby="([^"]+)"/);
  assert.ok(dialog, 'janela usa a casca dp-dialog com aria-labelledby');
  const title = html.match(new RegExp(`<h2 id="${dialog[2]}">([^<]*)</h2>`));
  assert.ok(title, 'o id do nome acessível aponta para o título do cabeçalho');
  assert.match(html, /<header class="dp-dialog__header">/);
  const actions = html.slice(html.indexOf('dp-dialog__actions'));
  const actionButtons = buttons(actions.slice(0, actions.indexOf('</div>')));
  return { role: dialog[1], title: title[1], actionButtons };
};

const everyDialog = () => [
  ['solicitar nova mensagem', renderMessageRequestModal({
    open: true, type: 'criacao', accessibleName: 'Solicitar nova mensagem', categories: [], onClose: noop,
    form: { categoryId: '', title: '', tagsText: '', content: '' }, saving: false, invalid: [],
  }, register), 'Enviar para revisão'],
  ['solicitar arquivamento', renderMessageRequestModal({
    open: true, type: 'arquivamento', accessibleName: 'Solicitar arquivamento de Boas-vindas', saving: false, onClose: noop,
  }, register), 'Enviar solicitação'],
  ['editor', renderMessageEditorModal({
    open: true, title: 'Editar mensagem', categories: [], form: { categoryId: '', title: '', tagInput: '', tags: [], content: '' },
    tagChips: [], saving: false, invalid: [], onClose: noop,
  }, register), 'Salvar'],
  ['confirmação', confirmation(false), 'Confirmar'],
  ['novo acesso', renderStructuralModals({ access: { open: true, form: { name: '', description: '', color: '#000000' }, saving: false, onClose: noop } }, register), 'Criar acesso'],
  ['senha temporária', renderStructuralModals({ temporaryPassword: { open: true, value: 'Senha!123', copied: false, onClose: noop } }, register), 'Concluir'],
];

test('toda janela tem cabeçalho da marca com o título como nome acessível', () => {
  for (const [name, html] of everyDialog()) {
    const { title } = anatomy(html);
    assert.ok(title.length > 0, `${name}: título vazio`);
  }
});

test('a ação principal fica por último, à direita, e sempre há como sair', () => {
  for (const [name, html, primary] of everyDialog()) {
    const { actionButtons } = anatomy(html);
    assert.match(actionButtons.at(-1), new RegExp(`>(<svg[\\s\\S]*</svg>)?${primary}</button>$`), `${name}: "${primary}" é a última ação`);
    const exits = buttons(html).filter(button => /Cancelar|Fechar|Concluir|aria-label="Fechar"/.test(button));
    assert.ok(exits.length > 0, `${name}: sem Cancelar, Fechar ou Concluir`);
  }
});

test('janelas comuns têm o ✕ de fechar; alertas de confirmação não', () => {
  for (const [name, html] of everyDialog()) {
    const { role } = anatomy(html);
    const hasClose = /class="dp-dialog__close"[^>]*aria-label="Fechar"/.test(html);
    assert.equal(hasClose, role === 'dialog', `${name}: ✕ ${hasClose ? 'presente' : 'ausente'} em ${role}`);
  }
});

test('as janelas não carregam cor literal', async () => {
  for (const [name, html] of everyDialog()) {
    assert.doesNotMatch(html.replace(/value="#[0-9A-Fa-f]{6}"/g, ''), /#[0-9A-Fa-f]{3,8}\b/, name);
  }
});

test('diálogos estruturais ficam ocupados enquanto salvam', () => {
  const html = renderStructuralModals({
    category: { open: true, title: 'Nova categoria', name: 'X', saving: true, onClose: noop, onSubmit: noop },
  }, register);
  assert.match(html, /role="dialog"[^>]*aria-busy="true"/);
  assert.ok(buttons(html).every(button => /\bdisabled\b/.test(button)));
});


const requestModel = (overrides = {}) => ({
  open: true, type: 'criacao', accessibleName: 'Solicitar nova mensagem', categories: [], onClose: noop,
  form: { categoryId: '', title: '', tagsText: '', content: '' }, saving: false, invalid: [], onInsertVariable: noop,
  ...overrides,
});

test('título e conteúdo têm maxlength e contador ligado ao campo', () => {
  for (const html of [
    renderMessageRequestModal(requestModel({ form: { categoryId: '', title: 'Olá', tagsText: '', content: 'Texto' } }), register),
    renderMessageEditorModal({
      open: true, title: 'Nova mensagem', categories: [], form: { categoryId: '', title: 'Olá', tagInput: '', tags: [], content: 'Texto' },
      tagChips: [], saving: false, invalid: [], onClose: noop, onInsertVariable: noop,
    }, register),
  ]) {
    const title = html.match(/<input[^>]*aria-label="Título"[^>]*>/)[0];
    const content = html.match(/<textarea[^>]*aria-label="Conteúdo"[^>]*>/)[0];
    assert.match(title, /maxlength="100"/);
    assert.match(content, /maxlength="2000"/);
    const titleCounter = title.match(/aria-describedby="([^" ]+)/)[1];
    const contentCounter = content.match(/aria-describedby="([^" ]+)/)[1];
    assert.match(html, new RegExp(`id="${titleCounter}"[^>]*>3 / 100 caracteres<`));
    assert.match(html, new RegExp(`id="${contentCounter}"[^>]*>5 / 2000 caracteres<`));
  }
});

test('o leitor de tela só é avisado a partir de 90% do limite', () => {
  const live = (content) => renderMessageRequestModal(requestModel({ form: { categoryId: '', title: '', tagsText: '', content } }), register)
    .match(/id="request-content-counter"[^>]*>[^<]*<\/span><span class="sr-only" aria-live="polite">([^<]*)</)[1];
  assert.equal(live('a'.repeat(1799)), '');
  assert.equal(live('a'.repeat(1800)), 'Conteúdo: perto do limite de 2000 caracteres.');
  assert.equal(live('a'.repeat(2000)), 'Conteúdo: limite de 2000 caracteres atingido.');
});

test('as janelas de solicitar e editar oferecem [NOME], [DATA] e [VALOR]', () => {
  const html = renderMessageRequestModal(requestModel(), register);
  assert.deepStrictEqual([...html.matchAll(/data-insert-variable="([^"]+)"/g)].map(([, token]) => token), ['[NOME]', '[DATA]', '[VALOR]']);
  assert.match(html, /<textarea[^>]*data-variable-target/);
  assert.doesNotMatch(renderMessageRequestModal(requestModel({ type: 'arquivamento' }), register), /data-insert-variable/);
});