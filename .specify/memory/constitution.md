<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles:
  - II. Autorização no Servidor e Menor Privilégio: modelo de três papéis substituído
    pelo modelo exclusivo de colaborador e superadministrador
- Added sections: none
- Removed sections: none
- Follow-up TODOs:
  - Sincronizar os portões operacionais de release e os critérios de aceite em
    specs/001-evoluir-biblioteca-mensagens/spec.md, plan.md e tasks.md
-->
# Mensagens de Atendimento DentalPlus Constitution

## Core Principles

### I. Utilidade Operacional e Integridade do Conteúdo

O sistema MUST permitir que funcionários autorizados encontrem, compreendam e copiem uma
mensagem padrão com o mínimo de atrito. Busca, categorias, favoritos, recentes e ordenação MUST
preservar o significado do conteúdo em português brasileiro e produzir resultados previsíveis.
Criação, edição, exclusão e aprovação MUST manter autoria, estado e histórico suficientes para
evitar publicação acidental ou perda silenciosa. Mudanças visuais MUST preservar o fluxo principal
de localizar e copiar mensagens, salvo quando uma especificação aprovada redefinir esse fluxo.

Rationale: a finalidade do produto é reduzir tempo e variação no atendimento sem comprometer a
correção da comunicação institucional.

### II. Autorização no Servidor e Menor Privilégio

Autenticação e autorização MUST ser impostas pelo Supabase Auth, Row Level Security e funções de
servidor; controles da interface são apenas uma conveniência e nunca a barreira de segurança.
O sistema MUST operar exclusivamente com os papéis `colaborador` e `superadministrador`. Toda
leitura ou mutação MUST respeitar o Acesso da pessoa e seu papel. Colaboradores MUST NOT publicar,
aprovar ou administrar contas, acessos e liberações; essas capacidades pertencem somente ao
superadministrador. Funções `SECURITY DEFINER` MUST fixar o `search_path`, validar o chamador e
conceder `EXECUTE` somente aos papéis necessários. Credenciais privilegiadas, tokens de sessão e
conteúdo interno MUST NOT ser incorporados ao frontend, logs ou artefatos públicos.

Rationale: a aplicação contém conteúdo e operações internas; a segurança precisa sobreviver a
chamadas diretas à API e à manipulação do cliente.

### III. Arquitetura Simples com Fronteiras Explícitas

A interface MUST acessar o Supabase por meio da camada de dados, mantendo apresentação e estado
separados das consultas e mutações remotas. Regras de domínio críticas e operações que exigem
atomicidade MUST residir no Postgres ou em Edge Functions, com uma única fonte de verdade por
regra. A solução MUST permanecer compatível com frontend hospedado na Vercel e backend no
Supabase até que uma decisão arquitetural aprovada inclua motivação, migração e rollback.
Dependências, abstrações e ferramentas de build novas MUST demonstrar benefício mensurável para
manutenção, segurança, desempenho ou experiência; duplicação de regras e complexidade preventiva
MUST NOT ser introduzidas.

Rationale: fronteiras pequenas e explícitas reduzem divergências entre cliente, políticas de banco
e operações administrativas sem congelar uma arquitetura que precise evoluir.

### IV. Experiência Inclusiva, Responsiva e Consistente

Todos os fluxos essenciais MUST funcionar por teclado e em larguras de celular e desktop. Controles
MUST usar semântica HTML adequada ou papéis ARIA completos, apresentar foco visível, nomes
acessíveis e estados perceptíveis sem depender apenas de cor. Modais MUST gerenciar foco e
fechamento previsivelmente. Estados de carregamento, vazio, erro, sucesso, confirmação e ação em
andamento MUST ser explícitos. Alterações de interface MUST reutilizar tokens e padrões visuais do
produto, manter contraste legível nos temas claro e escuro e evitar deslocamentos ou animações que
atrapalhem a tarefa.

Rationale: o produto é uma ferramenta diária de trabalho e precisa ser rápido, compreensível e
utilizável por pessoas, dispositivos e métodos de entrada diferentes.

### V. Mudanças Verificáveis e Operação Confiável

Cada mudança MUST ter critérios de aceite observáveis e verificação proporcional ao risco. Lógica
pura e correções de regressão MUST receber testes automatizados; alterações de autenticação, RLS,
funções privilegiadas, fluxos de aprovação, responsividade ou acessibilidade MUST incluir testes de
integração ou um roteiro manual reproduzível quando automação não for viável. O deploy de produção
MUST ocorrer somente após os testes relevantes passarem, a configuração de produção ser validada
e existir um caminho de rollback. Falhas de rede ou permissão MUST resultar em mensagem acionável
e MUST NOT deixar a interface indicando sucesso incorretamente.

Rationale: uma ferramenta interna em produção precisa evoluir sem regressões silenciosas, perda de
dados ou bloqueio do atendimento.

## Restrições de Plataforma, Dados e Descoberta

- O frontend atual é HTML, CSS e JavaScript em módulos ES, sem etapa de build; `app.js` gerencia a
  interface, `api.js` concentra acesso remoto e `search-utils.mjs` contém lógica pura testável.
  Refatorações MAY alterar essa composição somente por decisão documentada e migração incremental.
- Supabase Postgres, Auth, RLS e Edge Functions são a fonte autoritativa de dados e permissões.
  Mudanças de schema MUST ser versionadas, revisáveis e compatíveis com dados existentes ou trazer
  um plano explícito de migração e rollback.
- A chave pública `anon` MAY estar no cliente; `service_role` e outros segredos MUST permanecer
  exclusivamente no ambiente seguro do servidor. Dados sensíveis MUST NOT ser armazenados em
  `localStorage`; preferências não sensíveis de interface MAY ser armazenadas localmente.
- Como o produto é interno, páginas e conteúdo autenticado MUST NOT ser indexados por mecanismos
  de busca. Metadados públicos MUST identificar o produto corretamente, evitar exposição de
  mensagens internas e declarar a política de indexação adequada. Uma futura superfície pública
  voltada a aquisição exige especificação e revisão de privacidade separadas.
- Recursos externos carregados no navegador MUST usar HTTPS, ter origem conhecida e ser avaliados
  quanto a disponibilidade, privacidade, desempenho e política de segurança de conteúdo.
- O frontend MUST continuar implantável na Vercel e o backend no Supabase. Configurações específicas
  de ambiente MUST ser documentadas e nunca depender de valores privilegiados versionados.

## Fluxo de Desenvolvimento e Portões de Qualidade

1. Toda melhoria começa com uma especificação que define problema, usuários afetados, critérios de
   aceite, riscos, fora de escopo e impacto em segurança, dados, acessibilidade, desempenho e SEO.
2. Mudanças MUST preservar as fronteiras vigentes ou registrar por que a arquitetura será alterada.
   Alterações de schema, RLS ou Edge Functions exigem revisão explícita de autorização e integridade.
3. Antes da implementação, o plano de verificação MUST identificar testes automatizados e cenários
   manuais necessários. Correções de bugs MUST incluir teste de regressão quando tecnicamente viável.
4. Antes do deploy, o responsável MUST executar a suíte automatizada aplicável e validar manualmente
   os fluxos críticos afetados em desktop e celular, nos temas pertinentes e com teclado quando houver
   interação. Evidências ou resultados MUST ser registrados na tarefa, revisão ou documento da mudança.
5. Mudanças de produção MUST ser pequenas e reversíveis. Migrações destrutivas, alterações de papel
   ou remoções de dados exigem backup ou estratégia de recuperação e aprovação humana explícita.
6. Após o deploy, fluxos afetados MUST receber uma verificação rápida no ambiente de produção sem
   expor dados internos. Incidentes e regressões MUST gerar correção documentada e prevenção repetível.

## Governance

Esta constituição prevalece sobre convenções informais e documentos de implementação quando houver
conflito. Cada especificação, plano e revisão MUST demonstrar conformidade com os princípios e
portões aplicáveis; exceções MUST registrar escopo, justificativa, risco, responsável e prazo para
remoção. Complexidade adicional e redução de controles de segurança ou qualidade exigem aprovação
explícita do mantenedor do produto.

Emendas MUST ser propostas como alteração deste arquivo, explicar o impacto nas práticas existentes
e ser aprovadas pelo responsável do projeto antes de orientar novas implementações. Quando uma
emenda exigir mudança no sistema, ela MUST incluir plano de adoção ou migração; a emenda por si só
não autoriza alterações em produção.

O versionamento segue SemVer para governança: MAJOR para remoção ou redefinição incompatível de
princípios; MINOR para princípio, seção ou obrigação materialmente nova; PATCH para esclarecimentos
sem mudança normativa. A data de ratificação permanece a da primeira adoção e `Last Amended` muda
em toda alteração de conteúdo. A conformidade MUST ser revisada em cada feature e em auditoria geral
antes de mudanças arquiteturais ou de segurança relevantes.

**Version**: 2.0.0 | **Ratified**: 2026-09-02 | **Last Amended**: 2026-09-09
