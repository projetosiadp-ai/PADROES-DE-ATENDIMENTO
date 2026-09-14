import assert from 'node:assert/strict';
import test from 'node:test';

import { ICONS } from '../ui/icons.mjs';
import { renderLibraryReadingDialog, renderLibraryView } from '../views/library-view.mjs';

const register = (() => { let next = 0; return () => `h${next++}`; })();
const noop = () => {};

const item = (overrides = {}) => ({
  id: 'm1',
  titleSegments: [{ text: 'Boas-vindas', highlight: false }],
  metaLabel: 'Geral · usada 3 vezes · #boas-vindas',
  isFav: false,
  selected: false,
  onSelect: noop,
  ...overrides,
});

const reading = (overrides = {}) => ({
  id: 'm1', categoria: 'Geral', titulo: 'Boas-vindas', conteudo: 'Olá!',
  tagChips: [{ label: 'boas-vindas', onClick: noop }],
  usageLabel: 'usada 3 vezes', isFav: false, onToggleFav: noop,
  copied: false, copyLabel: 'Copiar', onCopy: noop, onPreview: noop,
  onEdit: noop, onArchive: noop, editLabel: 'Sugerir edição', archiveLabel: 'Solicitar arquivamento',
  ...overrides,
});

const view = (overrides = {}) => renderLibraryView({
  resultsCountLabel: '1 mensagem encontrada', librarySort: 'relevance', onLibrarySortChange: noop,
  hasResults: true, messageList: [item()], hasMoreMessages: false, loadMoreLabel: '', onLoadMore: noop,
  emptyTitle: 'Nenhuma mensagem encontrada', emptyHint: 'Ajuste a busca ou escolha outra categoria.',
  showReadingPanel: true, reading: reading(), readingAsDialog: false, onCloseReading: noop,
  ...overrides,
}, register);

const buttonsOf = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  .map(([, attrs, content]) => ({ attrs, content: content.trim() }));

test('a lista é uma <ul> com um botão por mensagem', () => {
  const html = view({
    messageList: [item(), item({ id: 'm2', titleSegments: [{ text: 'Cobrança', highlight: false }] })],
  });
  assert.match(html, /<ul class="dp-list"/);
  assert.equal([...html.matchAll(/<li data-key="item-/g)].length, 2);
  assert.match(html, /<button class="dp-list-item" data-testid="message-item-m1"/);
  assert.match(html, /<button class="dp-list-item" data-testid="message-item-m2"/);
});

test('só a mensagem selecionada recebe aria-current', () => {
  const html = view({ messageList: [item({ selected: true }), item({ id: 'm2' })] });
  assert.equal([...html.matchAll(/aria-current="true"/g)].length, 1);
  assert.match(html, /data-testid="message-item-m1"[^>]*aria-current="true"/);
});

test('o item da lista chama o manipulador de seleção, nunca o de cópia', () => {
  const onSelect = () => 'selecionou';
  const onCopy = () => 'copiou';
  const handlers = new Map();
  const capture = (fn) => { const key = `k${handlers.size}`; handlers.set(key, fn); return key; };
  const html = renderLibraryView({
    resultsCountLabel: '1 mensagem encontrada', librarySort: 'relevance', onLibrarySortChange: noop,
    hasResults: true, messageList: [item({ onSelect })], hasMoreMessages: false, loadMoreLabel: '', onLoadMore: noop,
    emptyTitle: '', emptyHint: '', showReadingPanel: true, reading: reading({ onCopy }),
    readingAsDialog: false, onCloseReading: noop,
  }, capture);

  const listKey = html.match(/data-testid="message-item-m1"\s*\n?\s*data-click="([^"]+)"/)?.[1]
    ?? html.match(/<button class="dp-list-item"[^>]*data-click="([^"]+)"/)[1];
  assert.equal(handlers.get(listKey)(), 'selecionou');
});

test('o painel de leitura é uma região nomeada com as ações do papel', () => {
  const html = view();
  assert.match(html, /<section class="dp-reading" role="region" aria-label="Leitura da mensagem"/);
  const panel = html.slice(html.indexOf('<section class="dp-reading"'));
  const labels = buttonsOf(panel).map(({ content }) => content.replace(/<[^>]+>/g, '').trim());
  assert.ok(labels.includes('Copiar'), 'o painel tem o botão Copiar');
  assert.ok(labels.includes('Sugerir edição'), 'colaborador sugere edição');
  assert.ok(labels.includes('Solicitar arquivamento'), 'colaborador solicita arquivamento');
});

test('o painel mostra as ações do superadministrador quando é o caso', () => {
  const html = view({ reading: reading({ editLabel: 'Editar', archiveLabel: 'Arquivar' }) });
  assert.match(html, />Editar</);
  assert.match(html, />Arquivar</);
});

test('Copiar troca o ícone ao confirmar a cópia', () => {
  assert.ok(view().includes(`${ICONS.clipboard}Copiar`));
  assert.ok(view({ reading: reading({ copied: true, copyLabel: 'Copiado' }) }).includes(`${ICONS.check}Copiado`));
});

test('o favorito do painel é um botão com estado e nome acessível', () => {
  assert.match(view().match(/<button class="dp-star"[^>]*>/)[0], /aria-pressed="false"[^>]*aria-label="Favoritar"/);
  assert.match(
    view({ reading: reading({ isFav: true }) }).match(/<button class="dp-star"[^>]*>/)[0],
    /aria-pressed="true"[^>]*aria-label="Remover dos favoritos"/,
  );
});

test('lista vazia mostra orientação no lugar da lista e no painel', () => {
  const html = view({
    hasResults: false, messageList: [], reading: null,
    emptyTitle: 'Nenhuma mensagem cadastrada ainda', emptyHint: 'A biblioteca deste acesso ainda está vazia.',
  });
  assert.doesNotMatch(html, /<ul class="dp-list"/);
  assert.equal([...html.matchAll(/Nenhuma mensagem cadastrada ainda/g)].length, 2);
  assert.match(html, /A biblioteca deste acesso ainda está vazia\./);
});

test('o destaque da busca usa a marcação do design system, sem cor literal', () => {
  const html = view({
    messageList: [item({ titleSegments: [{ text: 'Boas', highlight: true }, { text: '-vindas', highlight: false }] })],
  });
  assert.match(html, /<mark class="dp-highlight">Boas<\/mark>-vindas/);
  assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}\b/);
});

test('abaixo de 900 px a leitura vira diálogo modal com Fechar e foco no título', () => {
  const model = {
    readingAsDialog: true, reading: reading(), onCloseReading: noop,
  };
  const html = renderLibraryReadingDialog(model, register);
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Boas-vindas"/);
  assert.match(html, /<h2 tabindex="-1" data-initial-focus>/);
  assert.match(html, /aria-label="Fechar"/);
  assert.equal(renderLibraryReadingDialog({ ...model, readingAsDialog: false }, register), '');
});

test('no computador a coluna de leitura não é diálogo', () => {
  assert.doesNotMatch(view(), /aria-modal="true"/);
});
