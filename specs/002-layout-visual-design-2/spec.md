# Feature Specification: Nova identidade visual DentalPlus (Design 2.0)

**Feature Branch**: `002-layout-visual-design-2`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Criar um novo layout visual para o sistema Padrões de Atendimento, com base no material
disponível na pasta 'DESIGN 2.0'. Verificar esse material e especificar a implantação desta nova versão visual SEM mexer
nas funcionalidades nem no banco de dados. O usuário pediu para ser entrevistado durante a especificação." Complemento
durante a entrevista: "Além dessas funcionalidades, quero a opção de 'editar' para o administrador a mensagem sugerida
pelo usuário. + Tela que o colaborador consiga ver o feedback da solicitação (incluindo inclusive o comentário que o
administrador colocou), além de um histórico de solicitações em ambos os acessos."

**Referência visual**: `DESIGN - 2.0/Biblioteca DentalPlus - 8 telas.dc.html` ("Direção 2b aplicada — 8 telas": Login,
Visão geral, Biblioteca, Visualizar/Copiar, Solicitar alteração, Administração — Solicitações, Administração — Mensagens e
categorias, Administração — Contas e acessos). Arquivos de apoio: `Redesenho v2 - Identidade DentalPlus.dc.html`
(escolha entre as direções 2a e 2b), `Redesenho - Biblioteca.dc.html` (direções anteriores), `Atual - Padrões de
Atendimento.dc.html` (retrato do sistema atual) e os logos em `DESIGN - 2.0/assets/`.

**Mudança de escopo decidida na entrevista**: o pedido inicial era "sem mexer nas funcionalidades nem no banco". Na
entrevista, o responsável escolheu implementar **tudo o que o desenho mostra** e acrescentou a edição de sugestões pelo
administrador, a tela de retorno ao colaborador e o histórico de solicitações. Parte disso exige mudança no banco. Para
preservar o espírito do pedido inicial, o trabalho é dividido em etapas publicadas separadamente:

| Etapa | Conteúdo | Muda comportamento? | Muda banco? |
|---|---|---|---|
| 1 | Faixa da marca, Login, Biblioteca (lista + leitura), Visão geral | Só a forma de copiar na Biblioteca (FR-007) | Não |
| 2 | Janelas (visualizar/copiar, solicitar, confirmar) | Não | Não |
| 3 | Administração redesenhada | Não | Não |
| 4 | Variáveis; atalhos de teclado e contadores de caracteres quando prontos, senão em publicação própria logo depois | Sim (recursos novos) | Não |
| 5 | Edição da sugestão pelo administrador, retorno ao colaborador, históricos | Sim (recursos novos) | Sim |
| 6 | Estatísticas de uso | Sim (recursos novos) | Sim |

## Clarifications

### Session 2026-09-11

- Q: O que fazer com os recursos do desenho que o sistema não tem (preencher variáveis, estatísticas, atalhos, contador,
  "em análise")? → A: Implementar tudo o que o desenho mostra, mesmo que exija banco e funcionalidades novas.
- Q: Formato da Biblioteca? → A: Lista de mensagens à esquerda e leitura da mensagem selecionada à direita (tela 03).
- Q: Tema escuro? → A: Remover. O sistema passa a ter apenas o tema claro do desenho.
- Q: Forma de lançamento? → A: Por etapas, cada uma testada, publicada e reversível.
- Q: Como identificar as variáveis de uma mensagem? → A: Pelo próprio texto: palavras em maiúsculas entre colchetes,
  como `[NOME]`. Sem cadastro de variáveis.
- Q: Quem vê as estatísticas de uso? → A: Cada pessoa vê os próprios números e a média da equipe do mesmo acesso, sem
  nomes; o superadministrador vê os totais.
- Q: O que significa o selo "EM ANÁLISE"? → A: Não usar. Pedidos abertos continuam apenas "pendentes".
- Q: O que faz "Esqueceu a senha? Fale com um administrador"? → A: Apenas orienta: a senha é redefinida por um
  superadministrador, que gera uma senha temporária. Nenhum e-mail é enviado.
- Q: Quando o superadministrador editar a sugestão antes de aprovar, o que o colaborador vê? → A: O pedido fica "Aprovada
  com ajustes" e mostra lado a lado o que o colaborador enviou e o que foi publicado; a versão enviada fica guardada.
- Q: Quando o administrador pode ou deve comentar a decisão? → A: Comentário opcional ao aprovar (com ou sem ajustes) e
  obrigatório ao rejeitar, como o motivo de hoje.
- Q: O que é "histórico de solicitações em ambos os acessos"? → A: Nos dois perfis: o colaborador vê o histórico das
  próprias solicitações; o superadministrador vê o de todas, pendentes e decididas, com filtros.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Colaborador encontra e copia mensagens na nova Biblioteca (Priority: P1)

Etapa 1. A pessoa entra pela nova tela de login, vê a faixa azul da marca DentalPlus no topo com o menu (Biblioteca,
Visão geral e, para superadministradores, Administração), a busca em destaque e as categorias em "pílulas". Na
Biblioteca, as mensagens aparecem em lista; ao selecionar uma, o texto completo aparece ao lado, com o botão de copiar. A
Visão geral mostra favoritas e copiadas recentemente com o novo visual. Tudo o que existe hoje continua funcionando.

**Why this priority**: localizar e copiar a mensagem certa é a finalidade do produto e o fluxo mais usado. Esta etapa
entrega a nova identidade para todos os colaboradores sem depender de nenhum recurso novo nem de mudança no banco.

**Independent Test**: com as etapas seguintes ainda não publicadas, entrar como colaborador, trocar de acesso, buscar,
filtrar por categoria, ordenar, favoritar, selecionar uma mensagem, ler o texto completo e copiá-lo; entrar como
superadministrador e chegar à Administração pelo novo menu.

**Acceptance Scenarios**:

1. **Given** a tela de login, **When** a pessoa informa e-mail e senha válidos, **Then** entra no sistema e vê a faixa da
   marca com logo, selo, menu, seletor de acesso e suas iniciais.
2. **Given** a Biblioteca com mensagens, **When** a pessoa seleciona uma mensagem da lista, **Then** o painel de leitura
   mostra categoria, título, texto completo, etiquetas, número de usos e as ações Copiar, Solicitar edição (ou Editar) e
   Solicitar arquivamento (ou Arquivar), conforme o papel.
3. **Given** uma mensagem selecionada, **When** a pessoa aciona Copiar, **Then** o texto exato vai para a área de
   transferência e a confirmação de cópia aparece, como hoje.
4. **Given** a faixa de categorias, **When** a pessoa escolhe uma categoria ou "Favoritas", **Then** a lista mostra só as
   mensagens correspondentes e a contagem de cada pílula corresponde ao que está disponível.
5. **Given** o campo de busca em destaque, **When** a pessoa digita ou usa o atalho Ctrl K, **Then** a busca funciona como
   hoje (mesmos resultados, mesma tolerância a acentos e erros de digitação).
6. **Given** a Visão geral, **When** a pessoa abre a tela, **Then** vê a saudação com seu nome e o período do dia, as
   favoritas e as copiadas recentemente; clicar em um item copia a mensagem, como hoje.
7. **Given** um celular com 360 px de largura, **When** a pessoa usa a Biblioteca, **Then** a lista ocupa a tela, a leitura
   abre por cima ao selecionar uma mensagem e nada fica cortado ou exige rolagem lateral.

---

### User Story 2 - Janelas de copiar, solicitar e confirmar com o novo visual (Priority: P1)

Etapa 2. As janelas do sistema (visualizar e copiar, solicitar nova mensagem, sugerir edição, solicitar arquivamento,
confirmações, senha temporária e aviso de solicitações pendentes) passam a ter o cabeçalho azul da marca, os campos e os
botões do desenho, mantendo exatamente o mesmo comportamento.

**Why this priority**: são a segunda parte mais usada da interface e completam a experiência do colaborador.

**Independent Test**: abrir cada janela a partir da Biblioteca e da Administração, preencher, enviar, cancelar e fechar
com Escape; conferir que o foco começa e termina nos lugares certos e que os resultados são os mesmos de hoje.

**Acceptance Scenarios**:

1. **Given** uma mensagem, **When** a pessoa abre "Visualizar", **Then** a janela mostra categoria, usos, título e texto,
   com Fechar e Copiar mensagem.
2. **Given** a janela "Solicitar nova mensagem", **When** a pessoa preenche categoria, etiquetas, título e conteúdo e envia,
   **Then** o pedido vai para revisão e a janela informa que a biblioteca só muda depois da aprovação.
3. **Given** qualquer janela aberta, **When** a pessoa pressiona Escape ou Cancelar, **Then** a janela fecha sem salvar e o
   foco volta ao botão que a abriu, exceto durante uma operação em andamento, que continua bloqueando o fechamento.

---

### User Story 3 - Superadministrador usa a Administração redesenhada (Priority: P2)

Etapa 3. As seções de Administração (Solicitações, Mensagens, Categorias, Arquivados, Acessos e Contas) ganham o
cabeçalho da marca com título e resumo, pílulas de navegação entre seções e o formato "lista + painel lateral" do desenho.
Em Solicitações, o painel mostra o antes e o proposto lado a lado, com "Rejeitar com motivo" e "Aprovar e publicar". Em
Mensagens, uma tabela com uso e ações, e ao lado as categorias do acesso com suas contagens. Em Contas, a tabela mostra
iniciais, acessos, perfil e ações; contas sem acesso mostram "Conceder acesso". Ao lado, os acessos com situação.

**Why this priority**: afeta poucas pessoas (superadministradores), mas é necessária para a identidade ficar completa.

**Independent Test**: como superadministrador, aprovar e rejeitar pedidos, criar e editar mensagem e categoria, arquivar e
restaurar, criar acesso e conta, ajustar vínculos e redefinir senha, todos pela nova interface.

**Acceptance Scenarios**:

1. **Given** pedidos pendentes, **When** o superadministrador seleciona um pedido, **Then** o painel lateral mostra tipo,
   categoria, solicitante, data, o texto anterior e o proposto, as etiquetas e as ações de decisão.
2. **Given** uma conta sem nenhum acesso, **When** o superadministrador aciona "Conceder acesso", **Then** abre a mesma
   janela de vínculos que existe hoje, já com essa conta.
3. **Given** a seção Mensagens, **When** o superadministrador aciona Arquivar em uma linha, **Then** acontece a mesma
   confirmação e o mesmo arquivamento reversível de hoje.

---

### User Story 4 - Colaborador preenche variáveis antes de copiar (Priority: P2)

Etapa 4 (recurso novo, sem banco). Quando uma mensagem contém variáveis entre colchetes (por exemplo `[NOME]`, `[DATA]`), o
painel de leitura e a janela de copiar mostram um campo para cada variável. Enquanto a pessoa digita, o texto mostra os
valores destacados no lugar das variáveis. "Copiar preenchida" copia o texto com os valores; "Texto original" copia sem
alterar.

**Why this priority**: evita erros de edição manual depois de colar e economiza tempo em mensagens personalizadas.

**Independent Test**: selecionar uma mensagem com `[NOME]` e `[DATA]`, preencher os dois campos, copiar preenchida e colar
em outro lugar; conferir que nenhum colchete restou e que "Texto original" copia o conteúdo intacto.

**Acceptance Scenarios**:

1. **Given** uma mensagem com `[NOME]` duas vezes e `[DATA]` uma vez, **When** a pessoa a seleciona, **Then** aparecem
   exatamente dois campos, "Nome" e "Data", e o texto mostra as variáveis destacadas.
2. **Given** os dois campos preenchidos, **When** a pessoa aciona "Copiar preenchida", **Then** as três ocorrências são
   substituídas, a cópia conta como um uso da mensagem e a interface informa "2 variáveis preenchidas".
3. **Given** um campo vazio, **When** a pessoa aciona "Copiar preenchida", **Then** a variável vazia permanece entre
   colchetes no texto copiado e a interface avisa quantas ficaram sem preencher.
4. **Given** valores digitados, **When** a pessoa seleciona outra mensagem, fecha a janela ou sai do sistema, **Then** os
   valores são descartados e nunca são gravados.
5. **Given** a janela de solicitar ou editar mensagem, **When** a pessoa aciona um dos atalhos "Inserir variável" (`[NOME]`,
   `[DATA]`, `[VALOR]`), **Then** a variável é inserida na posição do cursor no conteúdo.

---

### User Story 5 - Administrador ajusta a sugestão e colaborador acompanha o retorno e o histórico (Priority: P2)

Etapa 5 (recursos novos, com mudança no banco). Ao revisar um pedido de criação ou de edição, o superadministrador pode
ajustar categoria, título, etiquetas e conteúdo antes de aprovar ("Editar e aprovar"). A versão enviada pelo colaborador
fica guardada. Ao decidir, ele pode deixar um comentário, que é obrigatório quando rejeita. O colaborador ganha a tela
"Suas solicitações", com o histórico dos próprios pedidos e, em cada um, o retorno: situação (pendente, aprovada,
aprovada com ajustes ou rejeitada), comentário do administrador e, quando houve ajuste, o que ele enviou ao lado do que foi
publicado. O superadministrador ganha o histórico de todas as solicitações, pendentes e decididas, com filtros.

**Why this priority**: hoje a pessoa não sabe o que aconteceu com o pedido depois de enviá-lo, e o administrador precisa
rejeitar e pedir um novo envio quando só falta um ajuste pequeno. O retorno fecha esse ciclo e reduz retrabalho.

**Independent Test**: como colaborador, enviar três pedidos; como superadministrador, aprovar um sem mudanças e com
comentário, ajustar e aprovar outro, e rejeitar o terceiro com motivo; como colaborador, conferir situação, comentário e
enviado x publicado de cada um; como superadministrador, encontrar os três no histórico usando os filtros.

**Acceptance Scenarios**:

1. **Given** um pedido pendente de criação, **When** o superadministrador aciona "Editar e aprovar", altera o título e o
   conteúdo e confirma, **Then** a mensagem é publicada com a versão ajustada, o pedido fica "Aprovada com ajustes" e a
   versão enviada pelo colaborador continua guardada.
2. **Given** um pedido pendente, **When** o superadministrador aprova sem alterar e escreve um comentário, **Then** o pedido
   fica "Aprovada" e o comentário aparece para o colaborador.
3. **Given** um pedido pendente, **When** o superadministrador tenta rejeitar sem motivo, **Then** a rejeição é impedida
   e o campo de motivo é indicado; com o motivo preenchido, o pedido fica "Rejeitada" e o motivo aparece ao colaborador.
4. **Given** um colaborador com pedidos decididos, **When** abre "Suas solicitações", **Then** vê os próprios pedidos, dos
   mais recentes para os mais antigos, com tipo, mensagem, acesso, data de envio, situação e data da decisão.
5. **Given** um pedido "Aprovada com ajustes", **When** o colaborador o abre, **Then** vê o comentário do administrador e,
   lado a lado, o que enviou e o que foi publicado.
6. **Given** o histórico do superadministrador, **When** ele filtra por situação, tipo, acesso, solicitante e
   período, **Then** vê apenas os pedidos correspondentes, pendentes e decididos, com decisão, quem decidiu, quando e o
   comentário.
7. **Given** pedidos de outras pessoas, **When** um colaborador abre "Suas solicitações", **Then** eles nunca aparecem.

---

### User Story 6 - Estatísticas de uso na Visão geral, na Biblioteca e na Administração (Priority: P3)

Etapa 6 (recurso novo, com mudança no banco). O sistema passa a registrar cada cópia (quem, qual mensagem, qual acesso e
quando). Com isso, a Visão geral mostra "Copiadas hoje" com a média da equipe, "Padrões no seu acesso" e "Suas
solicitações"; o painel de leitura mostra quantas vezes a mensagem foi copiada, quantas vezes pela própria pessoa na
semana e a última cópia dela; a Administração mostra totais, tempo médio de resposta a pedidos e decisões dos últimos 30
dias.

**Why this priority**: dá visibilidade sobre o uso, mas não é necessária para o trabalho diário; depende de mudança no
banco e de revisão de privacidade.

**Independent Test**: copiar mensagens com contas do mesmo acesso e conferir que cada uma vê só os próprios números, que a
média da equipe aparece conforme a regra de tamanho mínimo e que os totais do superadministrador batem com as cópias.

**Acceptance Scenarios**:

1. **Given** uma pessoa que copiou 3 mensagens hoje, **When** abre a Visão geral, **Then** "Copiadas hoje" mostra 3.
2. **Given** um acesso com pelo menos 3 pessoas ativas, **When** um colaborador abre a Visão geral, **Then** vê a média de
   cópias de hoje da equipe desse acesso, sem nomes nem números individuais de outras pessoas.
3. **Given** um acesso com menos de 3 pessoas ativas, **When** um colaborador abre a Visão geral, **Then** a média da equipe
   não aparece.
4. **Given** pedidos decididos nos últimos 30 dias, **When** o superadministrador abre Solicitações, **Then** vê quantos
   foram aprovados, aprovados com ajustes e rejeitados e o tempo médio entre envio e decisão.
5. **Given** a seção Contas, **When** o superadministrador a abre, **Then** vê o número de contas ativas, de acessos e de
   contas sem vínculo; cada acesso mostra quantas mensagens e quantas pessoas tem.

---

### User Story 7 - Atalhos de teclado e contadores de caracteres (Priority: P3)

Parte da Etapa 4 (recursos novos sem banco). Na Biblioteca, ↑ e ↓ movem a seleção na lista, Enter copia a mensagem
selecionada e E abre a sugestão de edição (ou a edição, para superadministradores). A dica "↑ ↓ navegar · ⏎ copiar · E
solicitar edição" aparece abaixo da lista. Os campos de título e conteúdo mostram quantos caracteres foram usados do limite.

**Why this priority**: acelera quem usa o teclado e evita erros de limite, mas não bloqueia o uso.

**Independent Test**: navegar e copiar só pelo teclado; digitar até o limite de título e de conteúdo.

**Acceptance Scenarios**:

1. **Given** a lista com foco, **When** a pessoa pressiona ↓ duas vezes e Enter, **Then** a terceira mensagem é selecionada
   e copiada.
2. **Given** o cursor dentro de um campo de texto ou uma janela aberta, **When** a pessoa digita E ou usa as setas, **Then**
   os atalhos da lista não são acionados.
3. **Given** o campo conteúdo com 312 caracteres, **When** a pessoa digita, **Then** vê "312 / 2000 caracteres" e não
   consegue passar do limite.

### Edge Cases

- Mensagem sem variáveis: nenhum campo aparece e só existe a ação Copiar.
- Texto entre colchetes que não é variável, como "[ver anexo]" em minúsculas: não vira campo.
- Mesma variável repetida: um único campo preenche todas as ocorrências.
- Mensagem arquivada por outra pessoa enquanto está aberta no painel de leitura: o painel informa que ela não está mais
  disponível e a lista é atualizada, como já acontece hoje com os erros de "não encontrado".
- Lista vazia (acesso sem mensagens ou busca sem resultado): o painel de leitura mostra orientação em vez de ficar em branco.
- Título ou nome de categoria muito longo: quebra de linha dentro da lista e do painel, sem sobrepor outros elementos.
- Pessoa que usava o tema escuro: passa a ver o tema claro; a preferência antiga é ignorada e não causa erro.
- Colaborador com vários acessos: estatísticas e média da equipe consideram o acesso ativo selecionado.
- "Hoje" e "nesta semana" seguem o fuso de São Paulo, não o do computador da pessoa.
- Falha ao registrar uma cópia (rede): a cópia para a área de transferência acontece do mesmo jeito; a falha no registro
  segue a política de erros existente e não indica sucesso falso.
- Pedido de arquivamento: só pode ser aprovado ou rejeitado; não há ajuste de conteúdo.
- A mensagem mudou depois que o pedido de edição foi enviado: "Editar e aprovar" segue a mesma regra de conflito de hoje
  (recarrega o estado atual e pede nova revisão) e não sobrescreve a mudança.
- No ajuste, o superadministrador escolhe uma categoria arquivada ou deixa título/conteúdo vazio ou acima do limite: a
  aprovação é impedida com a mesma validação da edição de mensagens.
- Pedidos decididos antes da Etapa 5 não têm versão enviada separada nem comentário de aprovação: aparecem nos históricos
  com a situação e o motivo de rejeição, sem erro e sem a comparação lado a lado.
- Conta de colaborador desativada: os pedidos dela continuam no histórico do superadministrador.
- Dois superadministradores decidem o mesmo pedido ao mesmo tempo: só a primeira decisão vale e o segundo recebe o aviso
  de pedido já revisado, como hoje.
- Logo ou selo que não carrega: o nome "DentalPlus" continua legível como texto alternativo.
- Tela "Sem acesso a nenhum departamento" e tela de sessão expirada: recebem o novo visual.
- Largura de 360 px: tabelas da Administração viram cartões empilhados, como hoje, e os painéis laterais passam para baixo
  ou abrem por cima.

## Requirements *(mandatory)*

### Functional Requirements

**Identidade visual e estrutura (Etapas 1 a 3, sem mudança de banco)**

- **FR-001**: O sistema MUST apresentar a faixa da marca no topo de todas as telas autenticadas, com logo e selo
  DentalPlus, menu (Biblioteca, Visão geral, "Suas solicitações" para colaboradores a partir da Etapa 5, e, só para
  superadministradores, Administração com a contagem de pedidos pendentes), seletor de acesso ("Acesso · nome" para colaboradores, "Operando em · nome" na Administração), iniciais da
  pessoa e acesso a Sair.
- **FR-002**: O sistema MUST substituir a barra lateral atual pela faixa da marca; as categorias passam a ser pílulas com
  contagem logo abaixo da faixa, incluindo "Todas" e "Favoritas".
- **FR-003**: O sistema MUST usar a paleta, a tipografia, os raios, as sombras e os logos do Design 2.0 de forma
  consistente em todas as telas, a partir de um único conjunto de definições visuais reutilizado.
- **FR-004**: A tela de login MUST seguir a tela 01: painel da marca com "Padrões de atendimento" e o texto de apoio,
  selo DentalPlus, campos de e-mail e senha com mostrar/ocultar, botão Entrar e a orientação "Esqueceu a senha? Fale com
  um administrador", que explica que a senha é redefinida por um superadministrador.
- **FR-005**: A Biblioteca MUST mostrar as mensagens em lista (título, categoria, usos, etiquetas e favorito) e, ao lado, um
  painel de leitura da mensagem selecionada com categoria, título, texto completo, etiquetas, usos e ações conforme o papel.
- **FR-006**: No computador, a primeira mensagem da lista MUST ficar selecionada ao abrir a Biblioteca; no celular, o painel
  de leitura MUST abrir por cima somente quando a pessoa seleciona uma mensagem.
- **FR-007**: Selecionar uma mensagem na lista MUST apenas mostrá-la no painel de leitura; copiar passa a ser feito pelo
  botão Copiar ou pela tecla Enter. Na Visão geral, clicar em um item continua copiando.
- **FR-008**: A Visão geral MUST mostrar a saudação com o primeiro nome e o período do dia (bom dia, boa tarde, boa noite),
  as favoritas e as copiadas recentemente no formato da tela 02.
- **FR-009**: As janelas do sistema MUST seguir as telas 04 e 05: cabeçalho azul da marca com título e contexto, conteúdo
  em fundo claro e ações alinhadas à direita, com a ação principal em destaque.
- **FR-010**: A Administração MUST seguir as telas 06, 07 e 08: cabeçalho com título e resumo da seção, pílulas para
  Solicitações, Mensagens, Categorias, Arquivados, Acessos e Contas, e o formato lista ou tabela com painel lateral.
- **FR-011**: Em Contas, contas sem nenhum acesso MUST mostrar a ação "Conceder acesso", que abre a janela de vínculos
  existente para essa conta.
- **FR-012**: O sistema MUST remover o tema escuro e o botão "Alternar tema"; uma preferência de tema escuro já salva no
  navegador MUST ser ignorada sem erro.
- **FR-013**: O sistema MUST remover os controles que deixam de fazer sentido sem a barra lateral (recolher menu) e manter
  todos os demais recursos atuais, incluindo o atalho Ctrl K, a paginação "Carregar mais", o aviso de solicitações
  pendentes ao entrar e as mensagens de confirmação e de erro.
- **FR-014**: As etapas 1 a 3 MUST preservar todos os comportamentos atuais: entrar e sair, trocar de acesso, buscar,
  filtrar, ordenar (favoritas primeiro, mais usadas, A → Z), favoritar, copiar, visualizar, solicitar criação, edição e
  arquivamento, aprovar e rejeitar, criar, editar, arquivar e restaurar mensagens e categorias, criar e ativar acessos,
  criar contas, ajustar vínculos e redefinir senhas, com as mesmas regras de permissão.
- **FR-015**: As etapas 1 a 4 MUST NOT alterar dados de produção, regras de permissão ou a estrutura do banco. Massa de
  teste local (`supabase/seed.sql` e fixtures) MAY ser ampliada.

**Variáveis (Etapa 4)**

- **FR-016**: O sistema MUST reconhecer como variável todo trecho entre colchetes formado só por letras maiúsculas
  (inclusive acentuadas), números e sublinhado, como `[NOME]`, `[DATA]`, `[VALOR]`, `[ENDEREÇO]`.
- **FR-017**: Para mensagens com variáveis, o painel de leitura e a janela de copiar MUST mostrar um campo por variável
  distinta, com rótulo derivado do nome ("Nome", "Data"), e o texto com as variáveis destacadas.
- **FR-018**: "Copiar preenchida" MUST substituir todas as ocorrências de cada variável preenchida, manter entre colchetes
  as não preenchidas e informar quantas foram preenchidas e quantas ficaram vazias; "Texto original" MUST copiar o conteúdo
  sem alteração. As duas contam como um uso da mensagem.
- **FR-019**: Os valores digitados nas variáveis MUST NOT ser gravados em nenhum lugar e MUST ser descartados ao trocar de
  mensagem, fechar a janela ou sair.
- **FR-020**: As janelas de solicitar e de editar mensagem MUST oferecer atalhos para inserir `[NOME]`, `[DATA]` e
  `[VALOR]` na posição do cursor.

**Teclado e limites (Etapa 4)**

- **FR-021**: Na Biblioteca, ↑ e ↓ MUST mover a seleção, Enter MUST copiar a mensagem selecionada e E MUST abrir a sugestão
  de edição (ou a edição, para superadministradores); os atalhos MUST ficar inativos com o cursor em campos de texto ou
  com uma janela aberta, e a dica de atalhos MUST aparecer abaixo da lista.
- **FR-022**: Os campos de título e conteúdo das janelas de solicitar e de editar MUST mostrar a contagem de caracteres em
  relação ao limite (100 e 2000) e impedir que ele seja ultrapassado.

**Revisão com ajustes, retorno e históricos (Etapa 5, com mudança no banco)**

- **FR-023**: Ao revisar um pedido de criação ou de edição, o superadministrador MUST poder ajustar categoria, título,
  etiquetas e conteúdo antes de aprovar; a mensagem publicada MUST usar a versão ajustada e passar pelas mesmas validações
  da edição de mensagens.
- **FR-024**: Pedidos de arquivamento MUST continuar apenas com aprovar ou rejeitar, sem ajuste.
- **FR-025**: O sistema MUST guardar a versão enviada pelo colaborador separada da versão publicada, com quem decidiu e
  quando; um pedido aprovado com qualquer diferença entre as duas versões MUST ficar com a situação "Aprovada com ajustes".
- **FR-026**: O comentário do superadministrador MUST ser opcional ao aprovar (com ou sem ajustes) e obrigatório ao
  rejeitar, com 1 a 500 caracteres.
- **FR-027**: O colaborador MUST ter a tela "Suas solicitações" com o histórico dos próprios pedidos, dos mais recentes para
  os mais antigos, mostrando tipo, mensagem, acesso, data de envio, situação e data da decisão; ao abrir um pedido,
  MUST ver o comentário do administrador e, quando houver ajuste, o que enviou ao lado do que foi publicado.
- **FR-028**: O colaborador MUST NOT ver pedidos de outras pessoas nem comentários sobre eles.
- **FR-029**: O superadministrador MUST ter o histórico de todas as solicitações, pendentes e decididas, com filtros por
  situação, tipo, acesso, solicitante e período, mostrando a decisão, quem decidiu, quando e o comentário.
- **FR-030**: Pedidos decididos antes desta etapa MUST aparecer nos dois históricos com as informações que já existem
  (situação e motivo da rejeição), sem erro; a janela de solicitação MUST indicar que o resultado aparecerá em "Suas
  solicitações", e a Visão geral MUST oferecer um atalho para essa tela. Na Etapa 5 o atalho aparece sem contagem; a
  contagem de pendentes chega com FR-035, na Etapa 6.

**Estatísticas (Etapa 6, com mudança no banco)**

- **FR-031**: O sistema MUST registrar cada cópia de mensagem com a pessoa, a mensagem, o acesso e o momento, respeitando
  as mesmas regras de acesso que já protegem as mensagens.
- **FR-032**: Um colaborador MUST ver somente os próprios números (copiadas hoje, cópias da mensagem por ele na semana,
  sua última cópia) e a média de cópias de hoje da equipe do acesso ativo; MUST NOT ver números individuais nem nomes de
  outras pessoas.
- **FR-033**: A média da equipe MUST aparecer somente quando o acesso tiver pelo menos 3 pessoas ativas.
- **FR-034**: O superadministrador MUST ver os totais de cópias por mensagem e por acesso, o número de pedidos pendentes, o
  tempo médio entre envio e decisão dos pedidos dos últimos 30 dias e quantos foram aprovados, aprovados com ajustes e
  rejeitados nesse período.
- **FR-035**: A Visão geral MUST mostrar os cartões "Copiadas hoje" (com a média da equipe, quando permitida), "Padrões no
  seu acesso" (com o número de categorias) e "Suas solicitações" (pendentes aguardando revisão).
- **FR-036**: Em Contas e Acessos, o sistema MUST mostrar contas ativas, número de acessos, contas sem vínculo e, para cada
  acesso, a situação, o número de mensagens e o número de pessoas.
- **FR-037**: "Hoje" e "nesta semana" MUST ser calculados no fuso de São Paulo.

**Qualidade transversal**

- **FR-038**: Todas as telas MUST funcionar por teclado, com foco visível, nomes acessíveis, janelas que prendem e devolvem
  o foco e estados que não dependem só de cor.
- **FR-039**: Todas as telas MUST funcionar de 360 px a 1440 px de largura sem rolagem lateral da página.
- **FR-040**: Textos e controles MUST manter contraste legível sobre o azul-marinho, o ciano e os fundos claros do desenho.
- **FR-041**: Cada etapa MUST poder ser publicada e revertida sem perda de dados e sem depender das etapas seguintes.
- **FR-042**: Os recursos visuais (fontes e imagens) MUST ser servidos pelo próprio sistema, sem depender de serviços
  externos para a página aparecer corretamente.
- **FR-043**: Após o login, o sistema MUST exibir uma vez por pessoa e por navegador, a cada etapa publicada, um aviso
  curto de novidades com 2 a 3 frases e uma ação de fechamento; o aviso MUST aparecer depois do aviso de solicitações
  pendentes e MUST NOT depender do banco.

### Key Entities *(include if feature involves data)*

- **Solicitação** (existente, ampliada na Etapa 5): pedido de criação, edição ou arquivamento. Passa a guardar a versão
  enviada pelo colaborador separada da versão publicada, o comentário da decisão (opcional ao aprovar, obrigatório ao
  rejeitar) e a situação "Aprovada com ajustes", além de quem decidiu e quando.
- **Registro de cópia** (novo, Etapa 6): cada vez que alguém copia uma mensagem. Relaciona pessoa, mensagem, acesso e
  momento; serve só para contagens e médias. Não guarda o texto copiado nem valores de variáveis.
- **Variável de mensagem** (derivada, não armazenada): trecho `[NOME]` encontrado no conteúdo de uma mensagem; existe
  apenas enquanto a mensagem está aberta.
- **Estatística de uso** (derivada): contagens e médias calculadas a partir dos registros de cópia, das mensagens e das
  solicitações.
- **Mensagem, Categoria, Acesso e Conta** (existentes): não mudam de estrutura.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após cada etapa visual, 100% dos fluxos listados em FR-014 continuam funcionando, confirmados pela suíte
  automatizada existente adaptada ao novo visual e por verificação manual em computador e celular.
- **SC-002**: As 8 telas de referência, as janelas e as telas de sessão expirada e sem acesso seguem o Design 2.0, com
  diferenças aprovadas pelo responsável em uma revisão lado a lado antes da publicação de cada etapa.
- **SC-003**: Em teste moderado com pelo menos 5 colaboradores, pelo menos 4 localizam e copiam uma mensagem pedida em
  menos de 15 segundos, sem ajuda, na nova Biblioteca.
- **SC-004**: O tempo para a Biblioteca ficar pronta, para a busca responder e para a cópia ser confirmada não piora mais
  de 10% em relação à versão atual, nas mesmas condições de medição.
- **SC-005**: Nenhuma tela apresenta rolagem lateral nem elemento sobreposto em 360 px e em 1440 px, e nenhuma verificação
  automática de acessibilidade aponta falhas críticas ou sérias.
- **SC-006**: Preencher duas variáveis e copiar a mensagem preenchida leva menos de 20 segundos, e o texto colado não
  contém nenhuma variável quando todos os campos foram preenchidos.
- **SC-007**: Em roteiro com pedidos aprovados, aprovados com ajustes e rejeitados, 100% mostram ao colaborador a situação,
  o comentário e, quando houver ajuste, o enviado e o publicado corretos.
- **SC-008**: O superadministrador encontra um pedido específico decidido nos últimos 90 dias no histórico em menos de 30
  segundos, usando os filtros.
- **SC-009**: Os números de "Copiadas hoje" e os totais da Administração correspondem a 100% das cópias realizadas em um
  roteiro de verificação com duas contas e dois acessos.
- **SC-010**: Em revisão de privacidade, colaboradores não conseguem ver pedidos, comentários, números individuais ou nomes
  de outras pessoas em nenhuma tela ou chamada.
- **SC-011**: Cada etapa pode ser revertida em até 5 minutos, sem perda de dados.

## Assumptions

- A referência é o arquivo "Biblioteca DentalPlus - 8 telas" (direção 2b); a direção 2a e as direções anteriores são apenas
  histórico. O filtro "Usadas hoje", que aparece só na direção 2a, não faz parte do escopo.
- Os nomes, e-mails, números e mensagens do desenho (Camila, Rafael, "128×", "9 hoje") são ilustrativos; as telas mostram
  os dados reais.
- O desenho foi feito para 1440 px; as versões para celular seguem os padrões responsivos que o sistema já usa, adaptados
  à nova identidade. As telas novas (Suas solicitações e histórico do superadministrador) seguem os mesmos padrões de lista
  e painel lateral do Design 2.0.
- Os logos e o selo de `DESIGN - 2.0/assets/` substituem os atuais.
- O rótulo de cada campo de variável é derivado do nome da variável ("[NOME]" → "Nome"); rótulos personalizados como "Nome
  do cliente" exigiriam cadastro de variáveis, que ficou fora do escopo.
- O comentário de rejeição substitui o "motivo" atual, com os mesmos limites; motivos já gravados passam a ser exibidos
  como comentário.
- Os históricos mostram todos os pedidos existentes, sem limite de data, em páginas.
- Registros de cópia são mantidos por 12 meses, prazo suficiente para as estatísticas semanais e mensais.
- A média da equipe considera as pessoas ativas vinculadas ao acesso, incluindo quem não copiou nada no dia.
- O superadministrador continua sendo quem redefine senhas; a orientação do login não cria nenhum pedido.

## Out of Scope

- Estado "em análise" para solicitações.
- Aviso por e-mail ou notificação quando um pedido é decidido.
- Cancelar ou editar um pedido depois de enviado, pelo colaborador.
- Pedido de redefinição de senha feito pela própria pessoa ou envio de e-mail.
- Ranking ou números individuais de desempenho por colaborador.
- Cadastro de variáveis permitidas ou rótulos personalizados.
- Tema escuro.
- Qualquer página pública ou indexável.

## Dependencies & Risks

- **Emenda da constituição (atendida em 2026-09-11)**: o princípio IV exigia contraste legível "nos temas claro e escuro".
  A constituição v3.0.0 passou a exigir um único tema claro, com contraste mínimo de 4,5:1 para texto comum e 3:1 para
  texto grande, ícones e contornos de controles, o que libera FR-012. Esse contraste mínimo vale para FR-040.
- **Mudança no banco (Etapas 5 e 6)**: guardar a versão enviada, o comentário e a situação "Aprovada com ajustes", aprovar
  com ajustes e registrar cópias exigem mudanças versionadas no banco, com regras de acesso, revisão de autorização e
  integridade, backup e caminho de retorno, conforme a constituição.
- **Mudança de hábito**: hoje clicar no cartão copia a mensagem; na nova Biblioteca, clicar seleciona e mostra a leitura
  (FR-007). É preciso avisar os colaboradores na publicação da Etapa 1.
- **Testes existentes**: as verificações automáticas atuais procuram elementos da interface antiga (barra lateral, cartões,
  alternância de tema) e precisam ser adaptadas junto com cada etapa.
- **Publicação por etapas**: parte dos arquivos da interface fica guardada no navegador por até 1 hora; publicações podem
  aparecer com atraso ou misturadas se a regra de cache não for ajustada antes da Etapa 1
  (ver `.specify/bugs/site-antigo-apos-migracao/assessment.md`).
