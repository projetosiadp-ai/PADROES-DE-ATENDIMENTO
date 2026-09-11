import assert from 'node:assert/strict';
import test from 'node:test';

import { ICONS } from '../ui/icons.mjs';
import { renderLibraryView } from '../views/library-view.mjs';

const theme = new Proxy({}, { get: () => '#000' });
const register = (() => { let next = 0; return () => `h${next++}`; })();
const noop = () => {};

const card = (overrides = {}) => ({
  id: 'm1', titleText: 'Boas-vindas', titleSegments: [{ text: 'Boas-vindas', style: '' }], tagChips: [],
  categoria: 'Geral', isFav: false, favColor: '#000', borderColor: '#000', displayContent: 'Olá!', frequencia: 3,
  editLabel: 'Sugerir edição', archiveLabel: 'Solicitar arquivamento', copyLabel: 'Copiar', copyBtnBg: '#000', copied: false,
  onCardClick: noop, onCardKeyDown: noop, onToggleFav: noop, onPreview: noop, onEdit: noop, onArchive: noop, onCopy: noop,
  ...overrides,
});

const cardActions = (message) => {
  const html = renderLibraryView({
    resultsCountLabel: '1 mensagem', categoryOptions: [], categoryFilter: '', librarySort: 'relevance',
    hasResults: true, gridStyle: '', cardList: [message], cardPadding: '16px', cardGap: 14, hasMoreMessages: false,
  }, theme, register);
  const [, style, body] = html.match(/<div class="dp-card-actions" style="([^"]*)">([\s\S]*?)<\/div>/);
  const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(([, attrs, content]) => ({ attrs, content: content.trim() }));
  return { style, buttons };
};

for (const [perfil, editLabel, archiveLabel] of [
  ['colaborador', 'Sugerir edição', 'Solicitar arquivamento'],
  ['superadmin', 'Editar', 'Arquivar'],
]) {
  test(`ações secundárias do cartão (${perfil}) são botões de ícone com nome acessível`, () => {
    const { buttons } = cardActions(card({ editLabel, archiveLabel }));
    const secondary = buttons.slice(0, 3);
    assert.deepStrictEqual(
      secondary.map(({ attrs }) => attrs.match(/aria-label="([^"]*)"/)?.[1]),
      ['Visualizar', editLabel, archiveLabel],
    );
    for (const { attrs, content } of secondary) {
      const label = attrs.match(/aria-label="([^"]*)"/)[1];
      assert.match(attrs, new RegExp(`title="${label}"`), `${label}: title igual ao nome acessível`);
      assert.match(attrs, /width:30px;height:30px;flex-shrink:0;/, `${label}: tamanho fixo de ícone`);
      assert.match(content, /^<svg aria-hidden="true"[\s\S]*<\/svg>$/, `${label}: só ícone, sem texto visível`);
    }
  });
}

test('rodapé do cartão quebra linha em qualquer largura', () => {
  assert.match(cardActions(card()).style, /flex-wrap:wrap/);
});

test('Copiar não encolhe nem quebra e troca o ícone ao copiar', () => {
  const idle = cardActions(card()).buttons.at(-1);
  assert.match(idle.attrs, /flex-shrink:0;white-space:nowrap;/);
  assert.strictEqual(idle.content, `${ICONS.clipboard}Copiar`);

  const copied = cardActions(card({ copied: true, copyLabel: 'Copiado' })).buttons.at(-1);
  assert.strictEqual(copied.content, `${ICONS.check}Copiado`);
});
