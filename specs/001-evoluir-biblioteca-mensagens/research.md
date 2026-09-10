# Research: Evolução da Biblioteca de Mensagens

## 1. Estratégia de evolução

**Decision**: Preservar o frontend estático e a plataforma atual, extraindo módulos somente nas
áreas modificadas. `app.js` permanece como orquestrador; regras puras, infraestrutura de UI e
renderizadores passam a módulos ES focados.

**Rationale**: A aplicação já está em produção e entrega o fluxo principal. A abordagem reduz risco,
permite rollback do frontend e atende à constituição sem introduzir uma etapa de build em runtime.

**Alternatives considered**:

- reescrever em framework: rejeitado pelo custo de migração e ausência de benefício necessário;
- refatorar todo o monólito antes das features: rejeitado por adiar valor e ampliar regressões;
- não modularizar: rejeitado porque `app.js` já concentra estado, ações e todas as views.

## 2. Migrações e ambientes

**Decision**: Tornar `supabase/migrations/` a fonte versionada de mudanças. Como o projeto nasceu com
`schema.sql`, primeiro capturar o estado remoto com `supabase db pull`, reconstruí-lo localmente com
`supabase db reset` e somente depois criar a migração da feature. Antes de produção, executar
`supabase db push --dry-run`; nunca usar `db reset --linked` em produção.

**Rationale**: O fluxo oficial recomenda alinhar o histórico remoto, testar a cadeia local e aplicar
somente migrações pendentes. Isso dá rastreabilidade e um caminho verificável de recuperação.

**Alternatives considered**:

- continuar aplicando `schema.sql` manualmente: rejeitado por não registrar ordem nem estado aplicado;
- editar produção pelo painel: rejeitado por criar divergência não revisável;
- reconstruir produção: rejeitado por ser destrutivo.

**Primary sources**: [Database migrations](https://supabase.com/docs/guides/local-development/database-migrations),
[Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

## 3. Dois papéis e transição do admin local

**Decision**: Migrar o valor persistido `user` para `colaborador`; manter `superadmin`. As políticas
de escrita passam a exigir superadministrador. A coluna `is_admin_local` será normalizada para
`false`, ignorada por código e políticas e mantida durante o primeiro ciclo de rollout para rollback
rápido; sua remoção física fica para uma migração posterior.

**Rationale**: Satisfaz a decisão do produto sem destruir imediatamente informação histórica nem
exigir uma migração incompatível no mesmo instante do deploy.

**Alternatives considered**:

- manter `user` apenas como nome interno: rejeitado por perpetuar linguagem ambígua;
- remover a coluna no primeiro deploy: rejeitado por dificultar rollback;
- converter admins locais em superadmins: rejeitado por ampliar privilégios.

## 4. Relação entre mensagem e categoria

**Decision**: Adicionar `mensagens.categoria_id` como relação canônica. O backfill combina
`acesso_id + categoria`; nomes órfãos geram uma categoria recuperada no mesmo acesso. A coluna texto
`categoria` permanece sincronizada e depreciada durante a transição, evitando quebra entre versões.

**Rationale**: Arquivar, restaurar e renomear categoria exige identidade estável. A relação atual por
texto demanda duas gravações sem transação e permite mensagens órfãs.

**Alternatives considered**:

- continuar usando texto: rejeitado por inconsistência e renomeação não atômica;
- remover a coluna texto imediatamente: rejeitado por incompatibilidade com o frontend precedente;
- apagar mensagens órfãs: rejeitado por violar preservação de dados.

## 5. Arquivamento e auditoria

**Decision**: Mensagens e categorias recebem `arquivado_em` e `arquivado_por`; ativo significa
`arquivado_em IS NULL`. Favoritos e recentes permanecem armazenados, mas consultas ativas não exibem
arquivados. Um registro de atividade append-only recebe mudanças administrativas via triggers. Uma
categoria só pode ser arquivada quando não houver mensagens ativas vinculadas.

**Rationale**: Ator e data permitem restauração e auditoria sem duplicar entidades. Triggers cobrem
ações diretas e via funções, e o bloqueio de categoria evita desaparecimento silencioso de mensagens.

**Alternatives considered**:

- `ativo boolean` isolado: rejeitado por não registrar quando nem por quem;
- tabela de lixeira separada: rejeitada por duplicar schema e complicar restauração;
- exclusão física com undo curto: rejeitada pela decisão do produto e risco operacional.

## 6. Idempotência e concorrência

**Decision**: Cada envio de solicitação recebe `idempotency_key` gerado no cliente e único por
solicitante. A aprovação bloqueia a solicitação para atualização e só aceita estado `pendente`;
repetições retornam conflito sem reaplicar a mudança. Aprovação de arquivamento atualiza a mensagem,
nunca a exclui.

**Rationale**: A trava local `saving` evita clique duplo, mas não resolve resposta de rede incerta nem
dois revisores simultâneos. A garantia precisa estar no banco.

**Alternatives considered**:

- confiar somente no botão desabilitado: rejeitado por não cobrir retries e múltiplos clientes;
- deduplicar por conteúdo: rejeitado porque propostas idênticas podem ser legítimas;
- aceitar aprovação repetida como sucesso: rejeitado porque oculta conflito de estado.

## 7. Autorização e funções privilegiadas

**Decision**: Ativar e testar RLS em toda tabela exposta, declarar `TO authenticated` e grants por
operação. Helpers e funções `SECURITY DEFINER` indispensáveis fixam `search_path = ''`, usam nomes
qualificados, validam o chamador e revogam execução pública. Funções que não precisam contornar RLS
usam `SECURITY INVOKER`.

**Rationale**: A documentação atual exige grants, políticas e testes em conjunto e alerta para
funções definidoras em schemas expostos. O projeto precisa manter poucas exceções chamáveis pela
aplicação, com defesa explícita e cobertura pgTAP.

**Alternatives considered**:

- autorizar apenas pela interface: rejeitado por ser contornável;
- manter políticas genéricas `FOR ALL`: rejeitado por dificultar prova de menor privilégio;
- tornar todas as RPCs definidoras: rejeitado por ampliar superfície privilegiada.

**Primary sources**: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Database Functions](https://supabase.com/docs/guides/database/functions),
[Testing Your Database](https://supabase.com/docs/guides/database/testing).

## 8. Carregamento e desempenho

**Decision**: No login, carregar somente perfil, acessos e o conteúdo do acesso ativo. Outros acessos
e a área administrativa são carregados sob demanda. Consultas selecionam campos necessários e
filtram arquivados no servidor. Cópia aguarda apenas a área de transferência; métricas de frequência
e recência seguem em segundo plano. Fixar a versão do cliente remoto e reduzir origens/recursos de
terceiros no caminho crítico.

**Rationale**: O sistema atual carrega mensagens de todos os acessos antes de liberar a UI. O conjunto
por acesso reduz bytes e trabalho no dispositivo sem paginação complexa para a escala de 1.000 itens.

**Alternatives considered**:

- carregar tudo e apenas comprimir: rejeitado porque não reduz consultas nem processamento;
- paginação obrigatória: rejeitada porque prejudica busca local e é desnecessária nessa escala;
- bloquear a confirmação da cópia pela telemetria: rejeitado por violar a meta de 1 segundo.

**Primary sources**: [Chrome performance throttling](https://developer.chrome.com/docs/devtools/lighthouse/),
[Third-party JavaScript](https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript),
[Clipboard writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

## 9. Testes e portões de qualidade

**Decision**: Usar quatro camadas: Node para regras puras; Supabase CLI 2.116.0 + pgTAP para schema,
RLS e concorrência; Playwright 1.62.1 + axe 4.13.0 para jornadas, teclado, temas, viewport de 360 px e
cinco execuções autenticadas de desempenho; Lighthouse CI 0.15.1 para o shell público e regressão de
payload.

**Rationale**: Cada risco fica testado na camada que realmente o impõe. Dependências são somente de
desenvolvimento e não aumentam o JavaScript enviado aos colaboradores.

**Alternatives considered**:

- checklist exclusivamente manual: rejeitado por não impedir regressão;
- apenas testes de navegador: rejeitado por não provar RLS e atomicidade;
- ferramenta de build completa: rejeitada por não ser necessária para executar os testes.

**Primary sources**: [Supabase database testing](https://supabase.com/docs/guides/database/testing),
[Playwright emulation](https://playwright.dev/docs/emulation),
[WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci).

## 10. Headers, cache e não indexação

**Decision**: Criar `vercel.json` versionado com `X-Robots-Tag: noindex, nofollow, noarchive`,
`X-Content-Type-Options: nosniff`, política de referrer, proteção contra framing e CSP compatível com
as origens efetivamente usadas. HTML e configuração usam revalidação; assets versionados usam cache
longo. `index.html` também declara `robots` como defesa em profundidade.

**Rationale**: O produto é interno, mas o shell está publicamente alcançável antes do login. Headers
versionados tornam o comportamento reproduzível em preview e produção.

**Alternatives considered**:

- configurar apenas no painel: rejeitado por não ser revisável nem reproduzível;
- somente meta tag: rejeitada por cobrir apenas HTML;
- bloquear tudo por senha da hospedagem: fora do escopo e dependente do plano contratado.

**Primary source**: [Vercel static configuration](https://vercel.com/docs/project-configuration/vercel-json).
