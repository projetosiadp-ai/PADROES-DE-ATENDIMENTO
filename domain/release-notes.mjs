// Aviso de novidades: uma etapa publicada é vista uma vez por navegador.
// A chave gravada em localStorage (dp_novidades) guarda a etapa já vista.
export const CURRENT_RELEASE = 'etapa-1';

export const RELEASE_NOTES = Object.freeze({
  title: 'Novidades',
  release: CURRENT_RELEASE,
  items: Object.freeze([
    'A Biblioteca está com o visual novo da DentalPlus: as categorias agora são botões logo abaixo da faixa azul.',
    'Clicar em uma mensagem abre a leitura ao lado, sem copiar nada.',
    'Para copiar, use o botão Copiar do painel de leitura.',
  ]),
  confirmLabel: 'Entendi',
});
