# Contract: Observable UI Behavior (Design 2.0)

Substitui, para esta feature, as seções equivalentes de
`specs/001-evoluir-biblioteca-mensagens/contracts/ui-behavior.md`. O que não é citado aqui (tabela de códigos de erro,
formulários e idempotência, arquivamento e restauração, política de indexação) continua valendo sem mudança.

## Estrutura geral (Etapa 1)

- Toda tela autenticada tem a **faixa da marca** (`<header>`): selo e logo DentalPlus; navegação principal com botões
  "Biblioteca", "Visão geral", "Suas solicitações" (colaborador, a partir da Etapa 5) e "Administração"
  (superadministrador, com a contagem de pendentes como texto acessível); seletor "Acesso ativo"; botão com as iniciais
  que abre o menu da conta (nome, papel e "Sair").
- O item da navegação atual tem `aria-current="page"`.
- Não existe barra lateral, botão "Recolher menu" nem "Alternar tema".
- Abaixo da faixa, as **pílulas de categoria** ("Todas", uma por categoria ativa e "Favoritas") são botões com
  `aria-pressed`, rótulo e contagem; ficam em uma linha com rolagem horizontal própria no celular, sem rolagem da página.
- Ctrl K continua abrindo a paleta de busca.

## Login (Etapa 1)

- Painel da marca com "Padrões de atendimento" e o texto de apoio; formulário com selo, "Entrar", e-mail, senha com
  mostrar/ocultar e botão "Entrar".
- "Esqueceu a senha? Fale com um administrador" é um botão que expande uma explicação: a senha é redefinida por um
  superadministrador, que gera uma senha temporária. Nenhuma requisição é feita.
- No celular, o painel da marca vira uma faixa curta acima do formulário.
- O shell de login continua sem nome de pessoas, acessos, contagens ou conteúdo de mensagens.

## Biblioteca (Etapa 1)

- Cabeçalho da Biblioteca na faixa: saudação ("Bom dia", "Boa tarde", "Boa noite" + primeiro nome), resumo, campo de
  busca em destaque e botão "Solicitar mensagem" (colaborador) ou "Nova mensagem" (superadministrador).
- A lista é uma `<ul>`; cada mensagem é um `<button>` com título, categoria, usos, etiquetas e o estado de favorito
  descrito em texto. A mensagem selecionada tem `aria-current="true"` e destaque visual que não depende só de cor.
- O **painel de leitura** é uma região com nome "Leitura da mensagem": categoria, título, texto completo, etiquetas, usos,
  favorito, "Copiar", "Solicitar edição"/"Editar" e "Solicitar arquivamento"/"Arquivar", conforme o papel.
- Selecionar uma mensagem **não copia**. Copiar: botão "Copiar" do painel, Enter com a mensagem selecionada (Etapa 4) ou
  clique em um item da Visão geral.
- Largura ≥ 900 px: lista e painel lado a lado; a primeira mensagem visível fica selecionada quando nada foi escolhido ou
  a selecionada saiu do resultado. Largura < 900 px: nada selecionado por padrão; escolher uma mensagem abre o painel
  como diálogo modal com "Fechar", foco inicial no título e retorno do foco ao item da lista.
- Lista vazia: o painel mostra a orientação de estado vazio (acesso sem mensagens ou busca sem resultado).
- Mensagem que deixou de existir enquanto aberta: segue a política `NOT_FOUND` (fecha, atualiza, explica).
- "Carregar mais" continua no fim da lista.

## Visão geral (Etapa 1; cartões de números na Etapa 6)

- Saudação na faixa; seções "Favoritas" e "Copiadas recentemente" em linhas clicáveis que copiam a mensagem.
- Etapa 6: três cartões — "Copiadas hoje" (com "média da equipe: N" somente quando permitida), "Padrões no seu acesso"
  (com categorias) e "Suas solicitações" (pendentes), este com atalho para a tela de solicitações.

## Janelas (Etapa 2)

- Cabeçalho azul da marca com título (nome acessível do diálogo) e contexto; corpo claro; ações à direita com a principal
  em destaque; "Fechar"/"Cancelar" sempre visível.
- Comportamento de foco, Escape e bloqueio durante operação em andamento sem mudança.
- "Visualizar": categoria e usos no cabeçalho, título, texto e "Copiar mensagem".
- "Solicitar nova mensagem" e "Sugerir edição": avisam que a biblioteca só muda após a aprovação e, a partir da Etapa 5,
  que o resultado aparece em "Suas solicitações".

## Administração (Etapa 3)

- Cabeçalho na faixa com título e resumo da seção; pílulas "Solicitações", "Mensagens", "Categorias", "Arquivados",
  "Acessos", "Contas" e, na Etapa 5, "Histórico".
- Solicitações: lista à esquerda e painel à direita com tipo, categoria, solicitante, data, antes e proposto lado a lado,
  etiquetas e ações "Rejeitar com motivo" e "Aprovar e publicar".
- Mensagens: tabela com mensagem, categoria, uso e ações "Editar" e "Arquivar"; ao lado, as categorias do acesso com a
  contagem de mensagens.
- Contas: tabela com iniciais, nome, e-mail, acessos, perfil e ações "Acessos" e "Senha"; conta sem vínculo mostra
  "Sem vínculo" e a ação "Conceder acesso", que abre a janela de vínculos existente. Ao lado, os acessos com situação.
- Abaixo de 720 px as tabelas viram cartões rotulados e os painéis laterais passam para baixo da lista.

## Variáveis, atalhos e contadores (Etapa 4)

- Mensagem com variáveis: um campo por variável distinta acima do texto; o texto destaca variáveis e valores; ações
  "Copiar preenchida" e "Texto original"; texto de estado "N variáveis preenchidas" e, se houver vazias, "M sem
  preencher" antes de copiar.
- Janelas de solicitar e editar: atalhos "Inserir variável" `[NOME]`, `[DATA]` e `[VALOR]` inserem na posição do cursor.
- Teclado na Biblioteca: ↑/↓ movem a seleção e o foco; Enter copia a selecionada; E abre "Solicitar edição" ou
  "Editar". Inativos com diálogo aberto ou foco em campo editável. Dica visível: "↑ ↓ navegar · ⏎ copiar · E solicitar
  edição".
- Campos de título e conteúdo: "N / 100 caracteres" e "N / 2000 caracteres" ligados ao campo; não é possível ultrapassar.

## Solicitações do colaborador e histórico (Etapa 5)

- "Suas solicitações": lista das próprias solicitações, da mais recente para a mais antiga, com tipo, título, acesso,
  data de envio, situação ("Pendente", "Aprovada", "Aprovada com ajustes", "Rejeitada") e data da decisão; paginada.
  Abrir uma mostra o comentário do superadministrador e, se ajustada, "Você enviou" e "Publicado" lado a lado.
  Pedidos antigos sem versão publicada separada mostram só a situação e o comentário disponível.
- Painel de revisão do superadministrador: campo "Comentário" (opcional ao aprovar, obrigatório ao rejeitar, até 500
  caracteres) e ação "Editar e aprovar" em criação e edição, que torna categoria, título, etiquetas e conteúdo editáveis
  com as mesmas validações do editor de mensagens. Arquivamento só tem aprovar e rejeitar.
- "Histórico" (superadministrador): todas as solicitações com filtros de situação, tipo, acesso, solicitante e período;
  cada linha mostra decisão, quem decidiu, quando e comentário; paginado.
- Conflito ao aprovar segue a política `CONFLICT` existente.

## Aviso de novidades (a partir da Etapa 1)

- Após o login, se a etapa publicada ainda não foi vista neste navegador, abre o diálogo "Novidades" com 2 ou 3 frases e
  "Entendi". Não abre sobre o aviso de solicitações pendentes; aparece depois dele.

## Responsividade e tema

- De 360 px a 1440 px nenhuma tela tem rolagem horizontal da página nem elementos sobrepostos; tabelas e listas largas só
  rolam dentro do próprio contêiner.
- Tema único claro. Contraste mínimo de 4,5:1 para texto comum e 3:1 para texto grande, ícones e contornos de controles,
  conforme [design-tokens.md](design-tokens.md).
- `prefers-reduced-motion` desliga transições e animações.

## Cobertura de fotos de referência

Fotos em `desktop-light` e `mobile-360-light`: login; Biblioteca com mensagem selecionada; Biblioteca vazia; leitura no
celular; Visão geral; cada janela da Etapa 2; cada seção da Administração; aviso de novidades; mensagem com variáveis;
"Suas solicitações" com um pedido ajustado; histórico filtrado.
