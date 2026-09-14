// Aviso de novidades: uma etapa publicada é vista uma vez por navegador.
// A chave gravada em localStorage (dp_novidades) guarda a etapa já vista.
//
// As notas descrevem o que muda em relação à versão em produção. Enquanto a Etapa 1 não for
// publicada, as etapas seguintes repetem a mudança mais importante dela: a forma de copiar.
export const CURRENT_RELEASE = 'etapa-2';

export const RELEASE_NOTES = Object.freeze({
  title: 'Novidades',
  release: CURRENT_RELEASE,
  items: Object.freeze([
    'A Biblioteca está com o visual novo da DentalPlus: as categorias agora são botões logo abaixo da faixa azul.',
    'Clicar em uma mensagem abre a leitura ao lado, sem copiar nada. Para copiar, use o botão Copiar.',
    'As janelas de solicitar, editar e confirmar ganharam o mesmo visual, com o título na faixa azul.',
  ]),
  confirmLabel: 'Entendi',
});
