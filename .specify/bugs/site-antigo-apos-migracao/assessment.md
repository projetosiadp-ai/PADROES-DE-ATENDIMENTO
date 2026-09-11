# Bug Assessment: site antigo em produção após a migração do banco

- **Slug**: site-antigo-apos-migracao
- **Created**: 2026-09-11
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> Produção após aplicar as 5 migrações e publicar as Edge Functions (2026-09-11). Erros relatados pelo usuário no site em produção:
> 1) Ao clicar em copiar a mensagem: "Não foi possível atualizar a frequência: Could not find the function public.increment_frequencia(msg_id) in the schema cache"
> 2) Ao solicitar que uma nova mensagem seja encaminhada para aprovação: "Não foi possível enviar a solicitação de criação: new row violates row-level security policy for table "solicitacoes_mensagem""
> 3) Ao tentar excluir uma mensagem: "Não foi possível excluir a mensagem: permission denied for table mensagens"

Contexto: em 2026-09-10 a Vercel foi revertida (Instant Rollback) para o deploy do commit `538f00c`. Em 2026-09-11
o banco de produção (`hikxdpfctldkidhjjexj`) recebeu as migrações `20260902000200` a `20260904170254` e as Edge
Functions foram republicadas. O passo seguinte do plano era promover na Vercel o deploy do commit `a21002c`.

## Symptom

Copiar mensagem, enviar pedido de criação e excluir mensagem falham com erros do banco. Esperado: copiar registra
uso, o pedido entra na fila de aprovação e o administrador arquiva (não exclui) a mensagem.

## Reproduction

1. Abrir o site de produção numa aba carregada com o frontend do commit `538f00c`.
2. Copiar uma mensagem → erro 1. Como colaborador, pedir mensagem nova → erro 2. Como administrador, excluir mensagem → erro 3.
3. [NEEDS CLARIFICATION: qual deploy aparece como "Current" em Vercel → Deployments no momento do teste; se a aba foi recarregada com Ctrl+F5 depois da promoção.]

## Suspected Code Paths

As três mensagens de erro existem **somente** no frontend antigo; nenhuma aparece no código atual (`a21002c`).

- `538f00c:api.js:203-206` — `incrementFrequencia` chama `rpc('increment_frequencia', { msg_id })`; a função foi removida em `supabase/migrations/20260902000300_authorization_and_usage.sql:334` → erro 1.
- `538f00c:api.js:208-213` — `solicitarCriacaoMensagem` insere sem `categoria_id` nem `idempotency_key`; a política `solicitacoes_insert_own_access` (`supabase/migrations/20260904164137_message_request_submission.sql:88-149`) exige `categoria_id` de categoria ativa do acesso → erro 2.
- `538f00c:api.js:105-108` — `deleteMensagem` faz `DELETE` em `mensagens`; `20260902000300_authorization_and_usage.sql:78` revoga tudo e a linha 93 concede apenas `select, insert, update` → erro 3.
- Código atual, que não tem esses caminhos: `api.js:184` usa `registrar_uso_mensagem`; `api.js:225,229` envia `idempotency_key` e `categoria_id`; `api.js:323` arquiva via `arquivar_mensagem`.

## Root Cause Hypothesis

O navegador está executando o frontend antigo (`538f00c`) contra o banco já migrado. As causas possíveis são duas: o deploy
`a21002c` ainda não foi promovido (o rollback mantém o `538f00c` como produção), ou a aba foi aberta antes da promoção.
Uma SPA carregada continua com o JavaScript antigo em memória até ser recarregada. Cache HTTP longo não explica o
problema: o `538f00c` não tinha `vercel.json`, e o padrão da Vercel para arquivos estáticos força revalidação.
Confiança: **alta** (as três strings de erro só existem em `538f00c:api.js`).

## Proposed Remediation

**Preferred** (operacional, sem mudança de código): em Vercel → Deployments, promover o deploy do commit `a21002c`
(⋯ → Promote) e confirmar que ele aparece como Current/Production. Depois, pedir a todos os usuários que recarreguem
o site com Ctrl+F5 ou fechem e reabram a aba. Para verificar, abrir `https://<domínio de produção>/api.js`: o arquivo
**não** pode conter `increment_frequencia` e **deve** conter `registrar_uso_mensagem`.

**Alternatives**:
- Reverter o banco com o backup `2026-09-10_1523` para voltar a ser compatível com o site antigo. Descartado: exige
  migração compensatória, perde tudo o que foi gravado depois das migrações e contraria o plano de liberação.

**Files likely to change** (endurecimento opcional, não necessário para resolver o incidente):
- `vercel.json` — `domain/`, `ui/` e `views/` usam `max-age=3600, stale-while-revalidate=86400`, enquanto `app.js` e
  `api.js` usam `max-age=0`. Numa próxima publicação, o navegador pode misturar módulos novos e antigos por até 1 h
  (ou 1 dia com SWR). Preferível `max-age=0, must-revalidate` para todo o código, ou versionar as URLs dos módulos.
- `index.html` / `app.js` — marcador de versão (ex.: `<meta name="app-version">`) para conferir o deploy ativo e,
  opcionalmente, pedir recarga quando o servidor tiver versão mais nova.

**Tests to add or update**:
- Verificação pós-deploy: buscar `/api.js` de produção e falhar se contiver `increment_frequencia` ou se o marcador de versão diferir do commit esperado.
- Teste de configuração (node --test) garantindo que nenhum diretório de código em `vercel.json` tenha `max-age` maior que 0 sem versionamento de URL.

## Risks & Considerations

- Enquanto o site antigo estiver no ar: consultar e copiar funcionam (a cópia mostra o erro de frequência); pedidos de
  mensagens e ações administrativas falham. Nenhum dado é corrompido: as operações são recusadas pelo banco.
- Abas abertas antes da promoção continuam no código antigo até recarregar; é preciso avisar os usuários.
- A regra de cache de 1 h em `domain/`, `ui/` e `views/` só passa a valer depois que o `a21002c` estiver no ar; o risco de mistura é para as próximas publicações.

## Confirmação (2026-09-11)

- Captura da Vercel enviada pelo usuário: o deploy `a21002c` aparece como **Status: Ready · Latest** e
  **Environment: Production · Staged**. "Staged" significa que ele foi gerado para produção, mas não recebeu os domínios
  de produção, porque o Instant Rollback suspende a promoção automática. Isso confirma a hipótese: o site no ar continua
  sendo o `538f00c`.
- Os endereços `*.vercel.app` do projeto (`padroes-de-atendimento-projetosiadp-ais-projects.vercel.app` e
  `padroes-de-atendimento-g7u5kjoej-…`) respondem `302` para `vercel.com/sso-api` (Deployment Protection). Não dá para
  conferir o conteúdo sem login na Vercel.

## Open Questions

- [NEEDS CLARIFICATION: domínio público usado pelos colaboradores, para verificar `/api.js` depois da promoção.]
