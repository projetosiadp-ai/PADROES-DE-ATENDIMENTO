// Aviso de novidades: uma etapa publicada é vista uma vez por navegador.
// A chave gravada em localStorage (dp_novidades) guarda a etapa já vista.
//
// As notas descrevem o que muda em relação à versão em produção. Enquanto a Etapa 1 não for
// publicada, as etapas seguintes repetem a mudança mais importante dela: a forma de copiar.
export const CURRENT_RELEASE = 'etapa-4';

export const RELEASE_NOTES = Object.freeze({
  title: 'Novidades',
  release: CURRENT_RELEASE,
  items: Object.freeze([
    'A Biblioteca está com o visual novo da DentalPlus: as categorias agora são botões logo abaixo da faixa azul.',
    'Clicar em uma mensagem abre a leitura ao lado, sem copiar nada. Para copiar, use o botão Copiar.',
    'Mensagens com [NOME], [DATA] ou outras variáveis mostram campos para preencher antes de “Copiar preenchida”; o que você digita não fica salvo.',
    'Atalhos na Biblioteca: ↑ ↓ para navegar, Enter para copiar e E para solicitar edição.',
    'Na Administração, as solicitações ficam em lista com a decisão ao lado, e contas sem acesso mostram “Conceder acesso”.',
  ]),
  confirmLabel: 'Entendi',
});
