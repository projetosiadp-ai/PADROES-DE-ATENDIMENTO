# Desfazer exclusão, tags sem duplicata, performance e nit cosmético

## Contexto

Segunda leva da auditoria de UX (docs/superpowers/specs/2026-08-07-correcao-falhas-auditoria-design.md cobriu bugs/acessibilidade/UX; esta cobre as duas categorias que ficaram de fora: funcionalidades ausentes e performance — exceto exportar mensagens, que o usuário decidiu não fazer, e histórico de edição, adiado por exigir migration de banco).

Fora de escopo: exportar/imprimir mensagens (item 13, descartado), histórico de edição direta do admin (item 14, adiado — precisa de tabela nova + migration), qualquer mudança de schema/RLS.

## 1. Desfazer exclusão (mensagem e categoria)

Hoje `deleteMsg`/`deleteCat` chamam a API imediatamente. Passa a:

- `requestDeleteMsg`/`requestDeleteCat` (chamadas pelo botão "Excluir"): em vez de abrir o modal de confirmação existente e já excluir ao confirmar, adicionam o id a um novo `state.pendingDeleteIds` (Set) e dão baixa visual imediata — as listas computadas (`acessoMsgs`, `catRows`, etc.) passam a filtrar ids presentes em `pendingDeleteIds`. O fluxo de confirmação existente (`requestDelete` com modal) continua sendo o gatilho — a mudança é o que acontece *depois* de confirmar: em vez de chamar a API na hora, agenda com `setTimeout(6000)`.
- Toast ganha um botão de ação opcional: `showToast(msg, type, body, action)`, onde `action` é `{ label, onClick }`. Ao excluir, o toast mostra "Mensagem excluída" com botão "Desfazer".
- "Desfazer": remove o id de `pendingDeleteIds`, cancela o `setTimeout` pendente (guardado num `Map<id, timerId>` na instância) — a mensagem/categoria reaparece nas listas, nenhuma chamada à API acontece.
- Se o tempo passar sem desfazer: chama `api.deleteMensagem`/`api.deleteCategoria` de verdade, e só então `refreshAppData()` (mantendo o id em `pendingDeleteIds` até o refresh completar, pra não piscar o item de volta por uma fração de segundo entre o timeout e o refetch).
- Fluxo de solicitação de exclusão (usuário não-admin) fica como está — só a exclusão direta por admin ganha o desfazer, já que a solicitação já passa por um segundo humano (aprovação) como camada de segurança.

## 2. Tags sem duplicata

`addMsgTag()`: antes de adicionar, compara a tag digitada (`.trim().toLowerCase()`) com as já presentes em `msgForm.tags` (mesma normalização). Se já existe, limpa o campo de input sem adicionar de novo — sem toast de erro, é um no-op silencioso (não é uma falha do usuário, só idempotência).

## 3. Performance — evitar refetch completo em `copyMessage`

`copyMessage()` hoje termina com `Promise.all([incrementFrequencia, recordRecente]).then(() => refreshAppData(session))` — a ação mais frequente do app (todo clique em "Copiar") refaz a consulta inteira do banco (acessos + categorias + todas as mensagens + favoritos + recentes) só para refletir 1 incremento de frequência e 1 entrada de recente.

Passa a fazer patch local do estado depois que as duas chamadas resolvem, sem `refreshAppData`:
- `mensagens`: incrementa `frequencia` da mensagem copiada em memória (`+1`).
- `recentes`: reordena localmente — remove o id se já presente, insere no topo, mantém o corte de 5 (mesmo `limit(5)` que a query já aplicava).

As demais mutações (criar/editar/excluir mensagem/categoria/Acesso, aprovar/rejeitar solicitação, vincular usuário) continuam com `refreshAppData()` completo — são bem menos frequentes (cliques de admin, não de uso diário) e o ganho de performance não compensa o risco de o patch local divergir do servidor nesses fluxos mais complexos (múltiplas tabelas afetadas, RLS, etc.).

## 4. Debounce na busca

Novo estado `searchQueryDraft`/`adminSearchQueryDraft` (o que o `<input>` reflete, atualizado a cada tecla) separado de `searchQuery`/`adminSearchQuery` (o que realmente filtra). `onSearchChange` atualiza o draft imediatamente (pro campo não travar) e agenda `setState({ searchQuery: draft })` com `setTimeout(150ms)`, cancelando o anterior a cada tecla — mesmo padrão de debounce já usado no listener de `resize` da sidebar (`app.js`, seção do Admin responsivo). Isso faz a busca fuzzy (grade + dropdown) recalcular uma vez por pausa na digitação, não uma vez por tecla.

## 5. Nit cosmético — botão de copiar senha temporária

`onCopyTempPassword`/template do botão: troca `background:#166534` fixo por `background: ${u.tempPasswordCopied ? t.ok : '#166534'}` e o ícone/texto já alternam (`check`/`clipboard`, "Copiado"/"Copiar") — só faltava a cor acompanhar, igual ao padrão já usado em `copyBtnBg` dos cards.

## Arquivos afetados

- `app.js` — `showToast()` (parâmetro `action`), `requestDeleteMsg`/`deleteMsg`, `requestDeleteCat`/`deleteCat` (ou equivalentes), `addMsgTag()`, `copyMessage()`, `renderVals()` (filtro por `pendingDeleteIds`, estados de draft de busca), `onCopyTempPassword` (cor).
- Não toca `api.js`, `supabase/schema.sql`, `search-utils.mjs`.

## Verificação

- Excluir uma mensagem, clicar "Desfazer" antes de 6s, confirmar que ela volta e nenhuma chamada de API foi feita (frequência/estado inalterados).
- Excluir uma mensagem e esperar os 6s sem desfazer, confirmar que ela é removida de verdade (reload/refetch confirma).
- Adicionar a mesma tag duas vezes, confirmar que só aparece uma vez no card.
- Copiar uma mensagem, confirmar que a frequência incrementa e "Recentes" atualiza na Visão Geral sem disparar um refetch completo (checar rede/estado).
- Digitar rápido na busca, confirmar que o filtro só aplica depois de parar de digitar (~150ms), sem lag perceptível.
- Copiar a senha temporária, confirmar que o botão fica verde igual aos outros botões de copiar.
