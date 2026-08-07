# Correção de falhas — auditoria de bugs, acessibilidade e UX

## Contexto

Auditoria sistemática do `app.js` (via agente Explore) levantou 16 problemas concretos, agrupados em 5 categorias (bugs, acessibilidade, UX/consistência, funcionalidades ausentes, performance). O usuário priorizou as 3 primeiras categorias (10 itens) para esta rodada; funcionalidades ausentes (desfazer exclusão, dedupe de tags, exportar, histórico de edição) e performance (refetch completo, busca fuzzy sem debounce) ficam de fora, para uma rodada futura se necessário.

Fora de escopo: qualquer mudança de schema/RLS além do update em lote necessário para A2 (não precisa de migration, é um `UPDATE` adicional dentro da função existente `saveCategoria`).

## A. Bugs reais

### A1 — Tela de estado vazio quando o usuário não tem Acesso vinculado

Hoje, se `st.acessos` estiver vazio, `renderVals()` quebra (`activeAcesso` fica `undefined`, próxima linha lança `TypeError`, tela branca sem log visível).

Fix: em `renderVals()`, antes do cálculo de `activeAcesso`, checar `st.acessos.length === 0` (com usuário logado) e retornar um `v` mínimo com uma flag `isNoAcesso: true`. `view()` renderiza uma tela dedicada (mesma estrutura visual da tela de erro/loading): ícone + "Você não tem nenhum Acesso vinculado. Contate um administrador." + botão "Sair" (reaproveita `logout()`).

### A2 — Renomear categoria atualiza as mensagens vinculadas

`api.js` `saveCategoria({ id, acessoId, nome })`: quando `id` existe (edição), busca o nome atual da categoria *antes* do update, faz o update normal em `categorias`, e então roda um segundo update: `mensagens.set({ categoria: novoNome }).eq('categoria', nomeAntigo).eq('acesso_id', acessoId)`. Duas chamadas sequenciais ao Supabase dentro da mesma função — sem transação explícita (Supabase-js não expõe transação multi-tabela no client), mas o risco de inconsistência parcial é aceitável aqui (pior caso: categoria renomeada mas mensagens não, que é o bug atual — não piora nada).

### A3 — Guarda contra duplo envio nos formulários

Novo estado `saving: false` (compartilhado pelos 3 modais, já que só um fica aberto por vez). `saveMsg`/`saveCat`/`saveAcesso` seguem o padrão de `handleLogin`: `if (this.state.saving) return; this.setState({ saving: true }); try { ... } finally { this.setState({ saving: false }); }`. Botão de salvar em cada modal: `disabled` quando `v.saving`, texto muda para "Salvando…".

### A4 — Teclado nas abas do Admin

`tabPill()` em `viewAdmin()` ganha `data-keydown` próprio que ativa em Enter/Espaço (mesma lógica que o handler genérico de `[role="button"]` já faz, copiada localmente já que `role="tab"` não é coberto por ele).

## B. Acessibilidade

### B1 — Foco automático no primeiro campo dos modais

Os `data-focus="..."` já existem no HTML mas não são lidos. Adiciona um `data-ref` correspondente em cada primeiro campo relevante (`msgTitulo`, `catNome`, `acessoNome`) que chama `el.focus()` uma vez quando o modal abre — mesmo padrão já usado em `paletteInputRef`. Cuidado: só focar na *abertura* (não a cada re-render, para não roubar o foco de quem já está digitando em outro campo do mesmo modal).

### B2 — `aria-pressed` no botão de favoritar

Adiciona `aria-pressed="${m.isFav}"` junto do `aria-label` já existente, nos dois lugares (card grid e list).

### B3 — Copiar senha temporária com 1 clique

No bloco de senha temporária do modal de usuários, adiciona um botão de copiar (mesmo ícone/estilo `ic.clipboard` usado nos cards), com o mesmo feedback de "Copiado" por ~1.4s que `copyMessage` já usa.

## C. UX/consistência

### C1 — Toasts empilhados (múltiplos, não um substituindo o outro)

`state.toast` (objeto) vira `state.toasts` (array de `{ id, msg, type, body, bg, ink }`). `showToast()` gera um `id` incremental, adiciona ao array, e agenda a remoção *daquele id específico* (não limpa o array inteiro). Renderização: container fixo no canto inferior direito com `flex-direction:column-reverse` (mais novo embaixo, empilhando para cima) — reaproveita o template visual atual do toast, só iterando sobre `v.toasts` em vez de um único `v.toast`. Limite de 4 toasts visíveis simultaneamente (os mais antigos são removidos se exceder, sem esperar o timer).

### C2 — Empty states nas abas Mensagens e Categorias do Admin

Mesmo padrão visual que Solicitações já usa (`app.js:1481-1485`: ícone + título + descrição, borda tracejada). Mensagens: "Nenhuma mensagem cadastrada" + "Crie a primeira mensagem para este Acesso." Categorias: "Nenhuma categoria cadastrada" + "Crie uma categoria para organizar as mensagens."

### C3 — Mensagem de vazio correta na Biblioteca

`resultsCountLabel`/empty state atual sempre diz "ajuste a busca ou os filtros". Novo campo `v.libraryEmptyReason`: se `!st.searchQuery && !st.categoryFilter && acessoMsgs.length === 0` → "Nenhuma mensagem cadastrada ainda" (+ CTA "Nova mensagem" se o usuário puder criar); caso contrário (busca/filtro ativo sem resultado) → mantém o texto atual de "ajuste a busca".

## Arquivos afetados

- `app.js` — `renderVals()` (A1, A2 indireto, A3, C1, C3), `viewAdmin()` (A4, C2), `viewModals()` (A3 botões, B1 refs, B3 botão copiar), `viewLibrary()` (B2, C3), `saveMsg`/`saveCat`/`saveAcesso` (A3), `showToast` (C1)
- `api.js` — `saveCategoria()` (A2: segundo update em lote)
- Não toca `supabase/schema.sql` (sem migration — `categoria` continua texto livre, só passa a ser mantido em sincronia pelo client)

## Verificação

- A1: simular usuário sem Acesso (array vazio) no harness, confirmar tela de aviso em vez de crash.
- A2: renomear categoria com mensagens vinculadas, confirmar que os cards atualizam o nome sem precisar recarregar.
- A3: disparar duplo clique rápido em Salvar (mensagem/categoria/Acesso), confirmar que só uma chamada de API acontece.
- A4: navegar as abas do Admin só com Tab + Enter/Espaço, sem mouse.
- B1: abrir cada modal, confirmar que o primeiro campo já está focado (cursor piscando) sem clicar.
- B2: inspecionar `aria-pressed` no DOM do botão de favorito nos dois estados.
- B3: copiar senha temporária, confirmar feedback visual e conteúdo copiado.
- C1: disparar 2-3 toasts em sequência rápida (ex.: copiar 3 mensagens seguidas), confirmar que todos aparecem empilhados e cada um some no seu próprio tempo.
- C2/C3: testar Admin com Acesso vazio (sem categorias/mensagens) e Biblioteca com Acesso vazio, confirmar os textos corretos em cada caso.
