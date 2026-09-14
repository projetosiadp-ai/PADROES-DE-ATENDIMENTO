// Aviso de novidades: uma etapa publicada é vista uma vez por navegador.
// A chave gravada em localStorage (dp_novidades) guarda a etapa já vista.
//
// As notas descrevem o que muda em relação à versão em produção. Enquanto a Etapa 1 não for
// publicada, as etapas seguintes repetem a mudança mais importante dela: a forma de copiar.
export const CURRENT_RELEASE = 'etapa-5';

export const RELEASE_NOTES = Object.freeze({
  title: 'Novidades',
  release: CURRENT_RELEASE,
  // Só o que muda no dia a dia de quem atende (2 a 3 frases, spec). As mudanças da Administração
  // são explicadas diretamente aos superadministradores.
  items: Object.freeze([
    'A Biblioteca está com o visual novo. Clicar numa mensagem abre a leitura ao lado; para copiar, use o botão Copiar (ou Enter).',
    'Mensagens com [NOME] ou [DATA] mostram campos para preencher antes de copiar.',
    'Em “Suas solicitações” você acompanha a resposta de cada pedido que enviou.',
  ]),
  confirmLabel: 'Entendi',
});
