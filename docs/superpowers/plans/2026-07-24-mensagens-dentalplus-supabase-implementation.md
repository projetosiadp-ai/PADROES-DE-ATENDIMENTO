# Mensagens DentalPlus × Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the working prototype (`index.html`, currently backed by in-memory state + `localStorage`) to a real, multi-device application backed by Supabase (Postgres + Auth + Row Level Security), deployed on Vercel — with zero change to the visual layout or UI logic.

**Architecture:** Static frontend (vanilla JS ES modules, no build step) talking directly to Supabase over HTTPS using `supabase-js` (CDN). All authorization is enforced by Postgres Row Level Security, not by the frontend. A single Supabase Edge Function (`admin-create-user`) is the only privileged operation, gated by the caller's `superadmin` role.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Supabase (Postgres, Auth, Edge Functions), `@supabase/supabase-js` v2 via CDN, Vercel (static hosting), Node.js (for the one automatable test suite).

## Global Constraints

- No build tool, no bundler, no framework — plain ES modules loaded via `<script type="module">`.
- `mensagens.categoria` is a plain **text** column, never a foreign key — deleting a category must never change existing messages (verbatim prototype behavior).
- No realtime sync — data reloads on screen open / after an action, never via subscriptions.
- Theme (`darkMode`) and density stay in `localStorage` — device preference, not shared data.
- User creation is superadmin-only, via the `admin-create-user` Edge Function — no public sign-up.
- Seed credentials: `admin@dentalplus` / `Dental@1234` (superadmin) and `relacionamento@dentalplus` / `Dental123` (user), both members of the "Relacionamento" acesso.
- Deploy target: Vercel (frontend), Supabase (backend) — no other hosting.
- I (the agent) never create accounts or type passwords/credentials into any login form or CLI prompt on the user's behalf — every task below marks who performs it.

---

## Task 1: Pure search/format utilities (TDD, no Supabase dependency)

**Files:**
- Create: `search-utils.mjs`
- Test: `tests/logic.test.mjs`

**Interfaces:**
- Produces: `normalize(s): string`, `levenshtein(a: string, b: string): number`, `fuzzyTok(q: string, target: string): boolean`, `matchesSearch(msg: {titulo, categoria, tags, conteudo}, query: string): boolean`, `titleSegments(titulo: string, query: string, highlightStyle: string): Array<{text: string, style: string}>` — all pure functions, no `this`, no DOM, no network. Consumed later by `app.js` (Task 8).

- [ ] **Step 1: Write the test file (it will fail — the module doesn't exist yet)**

```js
// tests/logic.test.mjs
import assert from 'node:assert/strict';
import { normalize, levenshtein, fuzzyTok, matchesSearch, titleSegments } from '../search-utils.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n  ', e.message); }
}

test('normalize removes accents and lowercases', () => {
  assert.strictEqual(normalize('Confirmação'), 'confirmacao');
});

test('levenshtein distance of identical strings is 0', () => {
  assert.strictEqual(levenshtein('teste', 'teste'), 0);
});

test('levenshtein distance of one substitution is 1', () => {
  assert.strictEqual(levenshtein('reembolso', 'reenbolso'), 1);
});

test('fuzzyTok matches a near-miss typo on a token of length >= 4', () => {
  assert.strictEqual(fuzzyTok('reenbolso', 'reembolso'), true);
});

test('fuzzyTok does not match unrelated short tokens', () => {
  assert.strictEqual(fuzzyTok('oi', 'ola'), false);
});

test('matchesSearch finds a message by content substring', () => {
  const msg = { titulo: 'Reembolso processado', categoria: 'Resolução de Problema', tags: ['financeiro'], conteudo: 'Seu pedido de reembolso foi processado.' };
  assert.strictEqual(matchesSearch(msg, 'reembolso'), true);
});

test('matchesSearch returns false when no token matches', () => {
  const msg = { titulo: 'Reembolso processado', categoria: 'Resolução de Problema', tags: ['financeiro'], conteudo: 'Seu pedido foi processado.' };
  assert.strictEqual(matchesSearch(msg, 'agendamento'), false);
});

test('titleSegments highlights the matched substring with the given style', () => {
  const segs = titleSegments('Confirmação de agendamento', 'agendamento', 'HIGHLIGHT');
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[1].text, 'agendamento');
  assert.strictEqual(segs[1].style, 'HIGHLIGHT');
});

test('titleSegments returns a single plain segment when the query is empty', () => {
  const segs = titleSegments('Boas-vindas', '', 'HIGHLIGHT');
  assert.deepStrictEqual(segs, [{ text: 'Boas-vindas', style: '' }]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node tests/logic.test.mjs`
Expected: `Cannot find module '../search-utils.mjs'` (or similar `ERR_MODULE_NOT_FOUND`), non-zero exit code.

- [ ] **Step 3: Write `search-utils.mjs`**

```js
// search-utils.mjs
// Pure helpers used by app.js for search/highlighting. No DOM, no `this`, no network —
// this is what makes them unit-testable from Node without a browser.

export function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
  }
  return d[m][n];
}

export function fuzzyTok(q, target) {
  if (target.includes(q)) return true;
  if (q.length >= 4 && Math.abs(target.length - q.length) <= 2 && levenshtein(q, target) <= 1) return true;
  return false;
}

export function matchesSearch(msg, query) {
  const q = normalize(query).trim();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const content = normalize(msg.conteudo);
  const titleWords = normalize(msg.titulo).split(/\s+/);
  const tagWords = msg.tags.map(t => normalize(t));
  const cat = normalize(msg.categoria);
  return tokens.every(tok =>
    content.includes(tok) || cat.includes(tok) ||
    titleWords.some(w => fuzzyTok(tok, w)) ||
    tagWords.some(t => t.includes(tok) || fuzzyTok(tok, t))
  );
}

export function titleSegments(titulo, query, highlightStyle) {
  const q = (query || '').trim();
  if (!q) return [{ text: titulo, style: '' }];
  const idx = titulo.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return [{ text: titulo, style: '' }];
  const before = titulo.slice(0, idx), match = titulo.slice(idx, idx + q.length), after = titulo.slice(idx + q.length);
  const segs = [];
  if (before) segs.push({ text: before, style: '' });
  segs.push({ text: match, style: highlightStyle || '' });
  if (after) segs.push({ text: after, style: '' });
  return segs;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node tests/logic.test.mjs`
Expected: 9 lines of `ok - ...`, then `9 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add search-utils.mjs tests/logic.test.mjs
git commit -m "test: extract pure search/format utilities with unit tests"
```

---

## Task 2: Supabase SQL schema (tables, RLS, function, seed data)

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `profiles`, `acessos`, `acesso_membros`, `categorias`, `mensagens`, `favoritos`, `recentes`; function `public.increment_frequencia(msg_id uuid)`; function `public.is_acesso_admin(p_acesso_id uuid)`; trigger `on_auth_user_created`. Consumed by Task 3 (manual apply), Task 4 (Edge Function reads `profiles`/`acesso_membros`), Task 7 (`api.js` queries these tables/RPCs directly by name).
- No automated test (requires a live Supabase project, created in Task 3) — verified by the row-count query embedded at the end of the file.

- [ ] **Step 1: Write the full schema file**

```sql
-- ============================================================
-- Mensagens de Relacionamento — schema Supabase (Postgres)
-- Aplicar de uma vez no SQL Editor do painel Supabase (Task 3).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'user' check (role in ('superadmin','user')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente sempre que um usuário é criado no Auth
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- acessos (equipes/workspaces) ----------
create table public.acessos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  cor text not null default '#1BA7DC',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- acesso_membros (vínculo usuário <-> acesso) ----------
create table public.acesso_membros (
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin_local boolean not null default false,
  primary key (acesso_id, user_id)
);

-- ---------- categorias ----------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- mensagens ----------
-- "categoria" é TEXTO solto, de propósito: excluir uma categoria nunca deve
-- alterar mensagens já criadas (comportamento idêntico ao protótipo).
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  categoria text not null,
  titulo text not null check (char_length(titulo) <= 100),
  conteudo text not null check (char_length(conteudo) <= 2000),
  tags text[] not null default '{}',
  frequencia int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- favoritos ----------
create table public.favoritos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);

-- ---------- recentes ----------
create table public.recentes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);

-- ---------- incrementar frequência (atômico, valida acesso) ----------
create function public.increment_frequencia(msg_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_acesso_id uuid;
begin
  select acesso_id into v_acesso_id from public.mensagens where id = msg_id;
  if v_acesso_id is null then
    raise exception 'mensagem não encontrada';
  end if;
  if not exists (
    select 1 from public.acesso_membros where acesso_id = v_acesso_id and user_id = auth.uid()
  ) then
    raise exception 'sem acesso a esta mensagem';
  end if;
  update public.mensagens set frequencia = frequencia + 1 where id = msg_id;
end;
$$;

-- ---------- helper: sou admin (local ou superadmin) deste acesso? ----------
create function public.is_acesso_admin(p_acesso_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin'
  ) or exists (
    select 1 from public.acesso_membros
    where acesso_id = p_acesso_id and user_id = auth.uid() and is_admin_local = true
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.acessos enable row level security;
alter table public.acesso_membros enable row level security;
alter table public.categorias enable row level security;
alter table public.mensagens enable row level security;
alter table public.favoritos enable row level security;
alter table public.recentes enable row level security;

create policy "profiles_select_own_or_superadmin" on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );
create policy "profiles_update_superadmin" on public.profiles
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

create policy "acessos_select_members_or_superadmin" on public.acessos
  for select using (
    exists (select 1 from public.acesso_membros am where am.acesso_id = acessos.id and am.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );
create policy "acessos_write_superadmin" on public.acessos
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

create policy "acesso_membros_select_own_or_superadmin" on public.acesso_membros
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );
create policy "acesso_membros_write_superadmin" on public.acesso_membros
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

create policy "categorias_select_members" on public.categorias
  for select using (
    exists (select 1 from public.acesso_membros am where am.acesso_id = categorias.acesso_id and am.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );
create policy "categorias_write_admins" on public.categorias
  for all using (public.is_acesso_admin(acesso_id))
  with check (public.is_acesso_admin(acesso_id));

create policy "mensagens_select_members" on public.mensagens
  for select using (
    exists (select 1 from public.acesso_membros am where am.acesso_id = mensagens.acesso_id and am.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
  );
create policy "mensagens_write_admins" on public.mensagens
  for all using (public.is_acesso_admin(acesso_id))
  with check (public.is_acesso_admin(acesso_id));

create policy "favoritos_own" on public.favoritos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recentes_own" on public.recentes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- SEED — acesso, categorias e mensagens do protótipo
-- ============================================================
insert into public.acessos (id, nome, descricao, cor, ativo) values
  ('11111111-1111-1111-1111-111111111111', 'Relacionamento', 'Padrão de mensagens da equipe de Relacionamento', '#1BA7DC', true);

insert into public.categorias (acesso_id, nome, ordem) values
  ('11111111-1111-1111-1111-111111111111', 'Boas-vindas', 1),
  ('11111111-1111-1111-1111-111111111111', 'Confirmação e Acompanhamento', 2),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 3),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 4),
  ('11111111-1111-1111-1111-111111111111', 'Encerramento', 5),
  ('11111111-1111-1111-1111-111111111111', 'Reclamações', 6);

insert into public.mensagens (acesso_id, categoria, titulo, tags, conteudo, frequencia) values
  ('11111111-1111-1111-1111-111111111111', 'Boas-vindas', 'Boas-vindas ao atendimento', array['saudação','primeiro contato'], 'Olá! Seja bem-vindo(a) ao atendimento DentalPlus. Estou à disposição para ajudá-lo(a) com o que precisar hoje.', 38),
  ('11111111-1111-1111-1111-111111111111', 'Confirmação e Acompanhamento', 'Confirmação de agendamento', array['agendamento','consulta','confirmação'], 'Confirmamos o agendamento da sua consulta. Pedimos que chegue com 15 minutos de antecedência e traga um documento com foto.', 52),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 'Solicitação resolvida', array['resolvido','suporte'], 'Agradecemos por entrar em contato. Sua solicitação foi resolvida com sucesso. Qualquer dúvida, estamos à disposição.', 45),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 'Reembolso processado', array['reembolso','financeiro'], 'Seu pedido de reembolso foi analisado e processado. O valor será creditado em até 5 dias úteis na forma de pagamento original cadastrada em seu plano.', 29),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 'Aguardando retorno do laboratório', array['pendência','laboratório','prazo'], 'Informamos que sua solicitação está em análise junto ao laboratório credenciado. Retornaremos assim que houver atualização, dentro do prazo de até 3 dias úteis.', 21),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 'Aguardando documentação do beneficiário', array['pendência','documentos'], 'Para darmos continuidade, favor enviar os documentos pendentes do beneficiário. Assim que recebidos, seguiremos com a análise.', 17),
  ('11111111-1111-1111-1111-111111111111', 'Encerramento', 'Agradecimento e encerramento', array['despedida','encerramento'], 'Agradecemos o contato! Ficamos à disposição para qualquer nova necessidade. Tenha um ótimo dia.', 60),
  ('11111111-1111-1111-1111-111111111111', 'Reclamações', 'Registro de insatisfação recebido', array['reclamação','insatisfação'], 'Lamentamos o ocorrido e agradecemos por relatar sua experiência. Sua manifestação foi registrada e será analisada com prioridade pela nossa equipe.', 14);

-- ============================================================
-- Verificação — rodar logo após aplicar. Esperado: acessos=1, categorias=6, mensagens=8
-- ============================================================
select
  (select count(*) from public.acessos) as acessos,
  (select count(*) from public.categorias) as categorias,
  (select count(*) from public.mensagens) as mensagens;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema, RLS policies, and seed data"
```

---

## Task 3 (Ação do usuário): Criar projeto Supabase, aplicar o schema, criar os 2 usuários

> Este task não pode ser executado pelo agente — envolve criar uma conta e digitar senhas. Siga os passos exatamente; me avise no chat quando terminar cada um.

**Arquivos:** nenhum (ações no painel web do Supabase).

**Interfaces:**
- Produces: projeto Supabase ativo, `SUPABASE_URL` + `anon key` (para Task 6), 2 usuários Auth criados e vinculados ao acesso "Relacionamento" com os papéis corretos (consumidos pelo login em Task 8).

- [ ] **Passo 1:** Criar conta gratuita em `supabase.com` e um novo projeto (qualquer nome/região). Aguardar o projeto ficar "Active".
- [ ] **Passo 2:** Em **Project Settings → API**, copiar **Project URL** e a chave **anon public** — envie os dois valores no chat (são públicos, sem risco).
- [ ] **Passo 3:** Em **SQL Editor → New query**, colar todo o conteúdo de `supabase/schema.sql` (Task 2) e clicar **Run**. Confirmar que a última linha retornou `acessos=1, categorias=6, mensagens=8`.
- [ ] **Passo 4:** Em **Authentication → Users → Add user → Create new user**, criar o primeiro usuário:
  - Email: `admin@dentalplus`
  - Password: `Dental@1234`
  - Marcar **Auto Confirm User**
  - Clicar **Create user**
  - ⚠️ Se aparecer erro de e-mail inválido (por causa do domínio sem `.com`), copie a mensagem de erro exata e me envie no chat — o plano B é usar `admin@dentalplus.com.br` e eu ajusto os demais arquivos.
- [ ] **Passo 5:** Repetir o Passo 4 para o segundo usuário: email `relacionamento@dentalplus`, senha `Dental123`, **Auto Confirm User** marcado.
- [ ] **Passo 6:** De volta ao **SQL Editor**, colar e rodar:

```sql
update public.profiles set role = 'superadmin' where email = 'admin@dentalplus';

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
select '11111111-1111-1111-1111-111111111111', id, true
from public.profiles where email = 'admin@dentalplus';

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
select '11111111-1111-1111-1111-111111111111', id, false
from public.profiles where email = 'relacionamento@dentalplus';

-- verificação — esperado: 2 linhas
select p.email, p.role, am.is_admin_local
from public.profiles p
join public.acesso_membros am on am.user_id = p.id;
```

- [ ] **Passo 7:** Confirmar que a verificação do Passo 6 retornou as 2 linhas esperadas (`admin@dentalplus | superadmin | true` e `relacionamento@dentalplus | user | false`), e avisar no chat que terminou.

---

## Task 4: Edge Function `admin-create-user`

**Files:**
- Create: `supabase/functions/admin-create-user/index.ts`

**Interfaces:**
- Consumes: env vars `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase Edge Functions runtime — no manual secret needed); tables `profiles`, `acesso_membros` (Task 2).
- Produces: HTTP endpoint invoked from the frontend as `supabase.functions.invoke('admin-create-user', { body: { nome, email, senha, role, acessoId, isAdminLocal } })` (consumed by `api.js`, Task 7). Returns `{ ok: true, userId }` on success or `{ error: string }` with a 4xx/5xx status.

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/admin-create-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { nome, email, senha, role, acessoId, isAdminLocal } = body;
    if (!nome || !email || !senha || !acessoId) {
      return new Response(JSON.stringify({ error: "Preencha nome, e-mail, senha e acesso." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Falha ao criar usuário." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === "superadmin") {
      await adminClient.from("profiles").update({ role: "superadmin" }).eq("id", created.user.id);
    }

    await adminClient.from("acesso_membros").insert({
      acesso_id: acessoId, user_id: created.user.id, is_admin_local: !!isAdminLocal,
    });

    return new Response(JSON.stringify({ ok: true, userId: created.user.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/admin-create-user/index.ts
git commit -m "feat: add admin-create-user Edge Function"
```

---

## Task 5 (Ação do usuário): Publicar a Edge Function no painel Supabase

> Publicar via dashboard evita depender de Docker/CLI local — mais rápido para hoje.

**Arquivos:** nenhum (ação no painel web).

**Interfaces:**
- Consumes: `supabase/functions/admin-create-user/index.ts` (Task 4).
- Produces: função ativa em produção, invocável pelo frontend (Task 7).

- [ ] **Passo 1:** No painel Supabase, ir em **Edge Functions → Deploy a new function → Via editor**.
- [ ] **Passo 2:** Nome exato: `admin-create-user`.
- [ ] **Passo 3:** Colar todo o conteúdo de `supabase/functions/admin-create-user/index.ts` no editor.
- [ ] **Passo 4:** Clicar **Deploy**.
- [ ] **Passo 5:** Abrir a aba **Logs** da função e confirmar que o deploy não mostrou erro de sintaxe (deve aparecer "Deployed" sem linha vermelha). Avisar no chat que terminou.

---

## Task 6: `config.js` com as credenciais públicas do Supabase

**Files:**
- Create: `config.js`

**Interfaces:**
- Produces: `SUPABASE_URL: string`, `SUPABASE_ANON_KEY: string` — consumed by Task 7 (`api.js`).
- Consumes: os valores reais informados pelo usuário na Task 3, Passo 2.

- [ ] **Step 1: Create the file with placeholders**

```js
// config.js
// Valores públicos do projeto Supabase (Project Settings → API).
// Não são segredos — a segurança real vem do RLS no banco (ver supabase/schema.sql).
export const SUPABASE_URL = 'SUBSTITUIR_PELA_URL_DO_PROJETO';
export const SUPABASE_ANON_KEY = 'SUBSTITUIR_PELA_ANON_KEY';
```

- [ ] **Step 2: Replace the placeholders with the real values from Task 3**

Once the user has provided their Project URL and anon key in chat (Task 3, Passo 2), edit `config.js` and replace both placeholder strings with the real values.

- [ ] **Step 3: Commit**

```bash
git add config.js
git commit -m "feat: add Supabase project configuration"
```

---

## Task 7: `api.js` — camada de dados (auth, fetch, mutações)

**Files:**
- Create: `api.js`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Task 6); Supabase tables/RPC from Task 2; Edge Function from Tasks 4–5.
- Produces (all async, all throw `Error(message)` on failure — callers catch and show a toast):
  - `signIn(email, password): Promise<void>`
  - `signOut(): Promise<void>`
  - `getSession(): Promise<{ user, profile } | null>`
  - `onAuthChange(callback: (session) => void): () => void` (returns an unsubscribe function)
  - `fetchAppData(userId): Promise<{ acessos, acessoMembros, categorias, mensagens, favoritos, recentes }>` scoped to the acessos the user belongs to
  - `saveMensagem(input): Promise<void>`, `deleteMensagem(id): Promise<void>`
  - `saveCategoria(input): Promise<void>`, `deleteCategoria(id): Promise<void>`
  - `saveAcesso(input): Promise<void>`, `toggleAcessoStatus(id, ativo): Promise<void>`
  - `toggleUserLink(userId, acessoId, linked): Promise<void>`, `toggleUserAdminLocal(userId, acessoId, value): Promise<void>`
  - `toggleFavorito(userId, mensagemId, isFav): Promise<void>`
  - `recordRecente(userId, mensagemId): Promise<void>`
  - `incrementFrequencia(mensagemId): Promise<void>`
  - `adminCreateUser(input): Promise<{ ok: boolean, userId?: string, error?: string }>`
- Consumed entirely by `app.js` (Task 8).

- [ ] **Step 1: Write `api.js`**

```js
// api.js
// Data access layer: every call to Supabase goes through here. app.js never
// touches the supabase client directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function fail(prefix, error) {
  throw new Error(`${prefix}: ${error?.message || error}`);
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail('Não foi possível entrar', error);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) fail('Não foi possível carregar o perfil', error);
  return { user: session.user, profile };
}

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

export async function fetchAppData(userId) {
  const { data: acessoMembros, error: amErr } = await supabase.from('acesso_membros').select('*').eq('user_id', userId);
  if (amErr) fail('Não foi possível carregar seus acessos', amErr);

  const acessoIds = acessoMembros.map(m => m.acesso_id);
  if (acessoIds.length === 0) return { acessos: [], acessoMembros: [], categorias: [], mensagens: [], favoritos: [], recentes: [] };

  const [{ data: acessos, error: aErr }, { data: categorias, error: cErr }, { data: mensagens, error: mErr },
         { data: favoritos, error: fErr }, { data: recentes, error: rErr }] = await Promise.all([
    supabase.from('acessos').select('*').in('id', acessoIds),
    supabase.from('categorias').select('*').in('acesso_id', acessoIds).order('ordem'),
    supabase.from('mensagens').select('*').in('acesso_id', acessoIds).order('created_at', { ascending: false }),
    supabase.from('favoritos').select('mensagem_id').eq('user_id', userId),
    supabase.from('recentes').select('mensagem_id').eq('user_id', userId).order('used_at', { ascending: false }).limit(5),
  ]);
  if (aErr) fail('Não foi possível carregar os acessos', aErr);
  if (cErr) fail('Não foi possível carregar as categorias', cErr);
  if (mErr) fail('Não foi possível carregar as mensagens', mErr);
  if (fErr) fail('Não foi possível carregar os favoritos', fErr);
  if (rErr) fail('Não foi possível carregar os recentes', rErr);

  return { acessos, acessoMembros, categorias, mensagens, favoritos, recentes };
}

export async function saveMensagem({ id, acessoId, categoria, titulo, tags, conteudo }) {
  if (id) {
    const { error } = await supabase.from('mensagens').update({ categoria, titulo, tags, conteudo, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) fail('Não foi possível salvar a mensagem', error);
  } else {
    const { error } = await supabase.from('mensagens').insert({ acesso_id: acessoId, categoria, titulo, tags, conteudo });
    if (error) fail('Não foi possível criar a mensagem', error);
  }
}

export async function deleteMensagem(id) {
  const { error } = await supabase.from('mensagens').delete().eq('id', id);
  if (error) fail('Não foi possível excluir a mensagem', error);
}

export async function saveCategoria({ id, acessoId, nome }) {
  if (id) {
    const { error } = await supabase.from('categorias').update({ nome }).eq('id', id);
    if (error) fail('Não foi possível salvar a categoria', error);
  } else {
    const { error } = await supabase.from('categorias').insert({ acesso_id: acessoId, nome });
    if (error) fail('Não foi possível criar a categoria', error);
  }
}

export async function deleteCategoria(id) {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) fail('Não foi possível excluir a categoria', error);
}

export async function saveAcesso({ nome, descricao, cor }) {
  const { data, error } = await supabase.from('acessos').insert({ nome, descricao, cor }).select().single();
  if (error) fail('Não foi possível criar o acesso', error);
  const defaults = ['Boas-vindas', 'Resolução de Problema', 'Pendências', 'Encerramento'];
  const { error: catErr } = await supabase.from('categorias').insert(defaults.map((n, i) => ({ acesso_id: data.id, nome: n, ordem: i })));
  if (catErr) fail('Acesso criado, mas falhou ao criar categorias padrão', catErr);
}

export async function toggleAcessoStatus(id, ativo) {
  const { error } = await supabase.from('acessos').update({ ativo }).eq('id', id);
  if (error) fail('Não foi possível atualizar o status do acesso', error);
}

export async function toggleUserLink(userId, acessoId, linked) {
  if (linked) {
    const { error } = await supabase.from('acesso_membros').delete().eq('user_id', userId).eq('acesso_id', acessoId);
    if (error) fail('Não foi possível desvincular o usuário', error);
  } else {
    const { error } = await supabase.from('acesso_membros').insert({ user_id: userId, acesso_id: acessoId, is_admin_local: false });
    if (error) fail('Não foi possível vincular o usuário', error);
  }
}

export async function toggleUserAdminLocal(userId, acessoId, value) {
  const { error } = await supabase.from('acesso_membros').update({ is_admin_local: value }).eq('user_id', userId).eq('acesso_id', acessoId);
  if (error) fail('Não foi possível atualizar o admin local', error);
}

export async function toggleFavorito(userId, mensagemId, isFav) {
  if (isFav) {
    const { error } = await supabase.from('favoritos').delete().eq('user_id', userId).eq('mensagem_id', mensagemId);
    if (error) fail('Não foi possível remover o favorito', error);
  } else {
    const { error } = await supabase.from('favoritos').insert({ user_id: userId, mensagem_id: mensagemId });
    if (error) fail('Não foi possível favoritar', error);
  }
}

export async function recordRecente(userId, mensagemId) {
  const { error } = await supabase.from('recentes').upsert({ user_id: userId, mensagem_id: mensagemId, used_at: new Date().toISOString() });
  if (error) fail('Não foi possível registrar o uso recente', error);
}

export async function incrementFrequencia(mensagemId) {
  const { error } = await supabase.rpc('increment_frequencia', { msg_id: mensagemId });
  if (error) fail('Não foi possível atualizar a frequência', error);
}

export async function adminCreateUser(input) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: input });
  if (error) return { ok: false, error: error.message };
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add api.js
git commit -m "feat: add Supabase data access layer (api.js)"
```

---

## Task 8: Reescrever `app.js` como módulo ES ligado ao `api.js`

**Files:**
- Create: `app.js` (extracted and rewired from the current inline `<script>` in `index.html`)

**Interfaces:**
- Consumes: everything exported by `api.js` (Task 7) and `search-utils.mjs` (Task 1).
- Produces: `class App` with the same public shape as today (`constructor(root)`, `mount()`) — used by `index.html` (Task 9) as `new App(document.getElementById('app')).mount()`.

The render engine (`setState`, `h`, `render`, focus-preservation) and the entire `view`/`viewHeader`/`viewDashboard`/`viewAdmin`/`viewModals` template methods stay **byte-for-byte identical** to the current `index.html` (lines 95–982) — only the constructor, `mount`, and the action methods change, because those are the only places that touched local arrays / `localStorage` for shared data.

- [ ] **Step 1: Write the new `app.js`**

```js
// app.js
import * as api from './api.js';
import { normalize, matchesSearch, titleSegments as titleSegmentsPure } from './search-utils.mjs';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

class App {
  constructor(root) {
    this.root = root;
    this._reg = {};
    this._regN = 0;
    this.searchEl = null;
    this.state = {
      loading: true,
      loadError: '',
      darkMode: false,
      density: 'comfortable',
      currentUser: null,     // { user, profile } from api.getSession()
      profileId: null,
      activeAcessoId: null,
      searchQuery: '',
      adminSearchQuery: '',
      categoryFilter: null,
      expandedIds: {},
      copiedId: null,
      favoriteIds: [],       // mensagem_id[] for the current user
      recentIds: [],         // mensagem_id[] for the current user, most recent first
      toast: { show: false, msg: '', type: 'success' },
      confirm: { open: false, title: '', message: '', action: null },
      showMsgModal: false, editingMsgId: null,
      msgForm: { categoria: '', titulo: '', tagInput: '', tags: [], conteudo: '' },
      showCatModal: false, editingCatId: null, catForm: { nome: '' },
      showAcessoModal: false, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' },
      showUsersModal: false, usersModalAcessoId: null,
      acessos: [],
      acessoMembros: [],
      categorias: [],
      mensagens: [],
      loginEmail: '', loginPassword: '', loginError: ''
    };
  }

  /* ---------------- render engine (unchanged) ---------------- */

  setState(patch, cb) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    Object.assign(this.state, next);
    this.render();
    if (cb) cb();
  }

  h(fn) {
    const k = 'h' + (this._regN++);
    this._reg[k] = fn;
    return k;
  }

  render() {
    let focusInfo = null;
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.focus) {
      focusInfo = { key: a.dataset.focus, start: a.selectionStart, end: a.selectionEnd };
    }

    this._reg = {};
    this._regN = 0;
    const v = this.renderVals();
    this.root.innerHTML = this.view(v);

    const R = this._reg;
    this.root.querySelectorAll('[data-click]').forEach(el =>
      el.addEventListener('click', (e) => R[el.getAttribute('data-click')](e)));
    this.root.querySelectorAll('[data-input]').forEach(el =>
      el.addEventListener('input', (e) => R[el.getAttribute('data-input')](e)));
    this.root.querySelectorAll('[data-change]').forEach(el =>
      el.addEventListener('change', (e) => R[el.getAttribute('data-change')](e)));
    this.root.querySelectorAll('[data-keydown]').forEach(el =>
      el.addEventListener('keydown', (e) => R[el.getAttribute('data-keydown')](e)));
    this.root.querySelectorAll('[data-ref]').forEach(el => R[el.getAttribute('data-ref')](el));

    if (focusInfo) {
      const el = this.root.querySelector('[data-focus="' + focusInfo.key + '"]');
      if (el) {
        el.focus();
        try { el.setSelectionRange(focusInfo.start, focusInfo.end); } catch (e) {}
      }
    }
  }

  async mount() {
    try {
      const dm = localStorage.getItem('dp_darkmode'); if (dm) this.state.darkMode = dm === '1';
      const den = localStorage.getItem('dp_density'); if (den) this.state.density = den;
    } catch (e) {}

    this.render();

    api.onAuthChange(async (session) => {
      if (!session) {
        this.setState({ currentUser: null, profileId: null, loading: false });
        return;
      }
      await this.loadSessionAndData();
    });

    try {
      const session = await api.getSession();
      if (session) await this.loadSessionAndData();
      else this.setState({ loading: false });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message });
    }

    this._keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.searchEl) this.searchEl.focus();
      } else if (e.key === 'Escape') {
        if (this.state.searchQuery) this.setState({ searchQuery: '' });
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  async loadSessionAndData() {
    const session = await api.getSession();
    if (!session) { this.setState({ currentUser: null, profileId: null, loading: false }); return; }
    await this.refreshAppData(session);
  }

  async refreshAppData(session) {
    try {
      const data = await api.fetchAppData(session.user.id);
      const firstAcessoId = data.acessos[0] ? data.acessos[0].id : null;
      this.setState({
        currentUser: session,
        profileId: session.user.id,
        acessos: data.acessos,
        acessoMembros: data.acessoMembros,
        categorias: data.categorias,
        mensagens: data.mensagens,
        favoriteIds: data.favoritos.map(f => f.mensagem_id),
        recentIds: data.recentes.map(r => r.mensagem_id),
        activeAcessoId: this.state.activeAcessoId && data.acessos.some(a => a.id === this.state.activeAcessoId)
          ? this.state.activeAcessoId : firstAcessoId,
        loading: false, loadError: ''
      });
    } catch (e) {
      this.setState({ loading: false, loadError: e.message });
      this.showToast(e.message, 'error');
    }
  }

  /* ---------------- search helpers (delegated to search-utils.mjs) ---------------- */

  matchesSearch(msg, query) { return matchesSearch(msg, query); }
  titleSegments(titulo, query) {
    return titleSegmentsPure(titulo, query, `background:${this.theme().cyan}33; border-radius:3px; padding:0 2px;`);
  }

  theme() {
    const dark = this.state.darkMode;
    return {
      navy: '#0F2C6B', cyan: '#1BA7DC',
      pageBg: dark ? '#0B1220' : '#F5F8FC',
      cardBg: dark ? '#151E2E' : '#FFFFFF',
      inputBg: dark ? '#0F1826' : '#FFFFFF',
      text: dark ? '#E7ECF3' : '#12203F',
      textSecondary: dark ? '#8B98AC' : '#64748B',
      border: dark ? '#22304A' : '#E2E8F0'
    };
  }

  showToast(msg, type) {
    clearTimeout(this._toastTimer);
    this.setState({ toast: { show: true, msg, type: type || 'success', bg: type === 'error' ? '#DC2626' : '#0F2C6B' } });
    this._toastTimer = setTimeout(() => this.setState({ toast: { show: false, msg: '', type: 'success' } }), 3000);
  }

  /* ---------------- computed bindings ---------------- */

  renderVals() {
    const st = this.state;
    const theme = this.theme();
    const session = st.currentUser;

    if (st.loading) {
      return { isLogin: false, isApp: false, isLoading: true, theme, confirm: st.confirm, toast: st.toast,
        showMsgModal: false, showCatModal: false, showAcessoModal: false, showUsersModal: false };
    }

    if (!session) {
      return {
        isLogin: true, isApp: false, isLoading: false,
        theme,
        loginEmail: st.loginEmail, loginPassword: st.loginPassword, loginError: st.loginError,
        onLoginEmailChange: (e) => this.setState({ loginEmail: e.target.value }),
        onLoginPasswordChange: (e) => this.setState({ loginPassword: e.target.value }),
        handleLogin: () => this.handleLogin(),
        onLoginKeyDown: (e) => { if (e.key === 'Enter') this.handleLogin(); },
        fillUserDemo: () => this.setState({ loginEmail: 'relacionamento@dentalplus', loginPassword: 'Dental123', loginError: '' }),
        fillAdminDemo: () => this.setState({ loginEmail: 'admin@dentalplus', loginPassword: 'Dental@1234', loginError: '' }),
        noop: (e) => e.preventDefault(),
        confirm: st.confirm, toast: st.toast,
        showMsgModal: false, showCatModal: false, showAcessoModal: false, showUsersModal: false
      };
    }

    const profile = session.profile;
    const activeAcesso = st.acessos.find(a => a.id === st.activeAcessoId) || st.acessos[0];
    const acessoMsgs = st.mensagens.filter(m => m.acesso_id === activeAcesso.id);
    const acessoCats = st.categorias.filter(c => c.acesso_id === activeAcesso.id);
    const userAcessoLinks = st.acessoMembros.filter(m => {
      const acc = st.acessos.find(a => a.id === m.acesso_id);
      return acc && acc.ativo;
    });
    const isSuperAdmin = profile.role === 'superadmin';
    const localAdminEntry = st.acessoMembros.find(m => m.acesso_id === activeAcesso.id);
    const isAdmin = isSuperAdmin || (localAdminEntry && localAdminEntry.is_admin_local);

    const copyMessage = (msg) => {
      navigator.clipboard && navigator.clipboard.writeText(msg.conteudo).catch(() => {});
      this.setState({ copiedId: msg.id });
      setTimeout(() => this.setState({ copiedId: null }), 1400);
      this.showToast('Mensagem copiada!', 'success');
      Promise.all([api.incrementFrequencia(msg.id), api.recordRecente(profile.id, msg.id)])
        .then(() => this.refreshAppData(session))
        .catch(e => this.showToast(e.message, 'error'));
    };
    const toggleFav = (id) => {
      const isFav = st.favoriteIds.includes(id);
      api.toggleFavorito(profile.id, id, isFav)
        .then(() => this.refreshAppData(session))
        .catch(e => this.showToast(e.message, 'error'));
    };
    const toggleExpand = (id) => this.setState({ expandedIds: { ...st.expandedIds, [id]: !st.expandedIds[id] } });

    const buildCard = (m) => {
      const isFav = st.favoriteIds.includes(m.id);
      const expanded = !!st.expandedIds[m.id];
      const threshold = 130;
      const isLong = m.conteudo.length > threshold;
      const displayContent = isLong && !expanded ? m.conteudo.slice(0, threshold).trim() + '…' : m.conteudo;
      return {
        id: m.id, categoria: m.categoria, catInitial: m.categoria.charAt(0).toUpperCase(),
        titleSegments: this.titleSegments(m.titulo, st.searchQuery),
        displayContent, showToggle: isLong, toggleLabel: expanded ? 'ver menos' : 'ver mais',
        onToggleExpand: () => toggleExpand(m.id),
        tagChips: m.tags, frequencia: m.frequencia,
        favIcon: isFav ? '★' : '☆', favColor: isFav ? '#F59E0B' : theme.textSecondary,
        onToggleFav: () => toggleFav(m.id),
        onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓ Copiado!' : 'Copiar',
        copyBtnBg: st.copiedId === m.id ? '#16A34A' : theme.navy,
        onEdit: () => this.openEditMsg(m),
        borderColor: isFav ? '#F59E0B' : theme.border,
        shadow: isFav ? '0 0 0 1px #F59E0B22' : 'none'
      };
    };

    const filtered = acessoMsgs
      .filter(m => !st.categoryFilter || m.categoria === st.categoryFilter)
      .filter(m => this.matchesSearch(m, st.searchQuery));
    const q = st.searchQuery.trim().toLowerCase();
    filtered.sort((a, b) => {
      if (q) {
        const aExact = a.titulo.toLowerCase().includes(q) ? 1 : 0;
        const bExact = b.titulo.toLowerCase().includes(q) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      return b.frequencia - a.frequencia;
    });

    const mostUsed = [...acessoMsgs].sort((a, b) => b.frequencia - a.frequencia).slice(0, 5)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const recentList = st.recentIds.map(id => acessoMsgs.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));
    const favList = st.favoriteIds.map(id => acessoMsgs.find(m => m.id === id)).filter(Boolean)
      .map(m => ({ titulo: m.titulo, onCopy: () => copyMessage(m), copyLabel: st.copiedId === m.id ? '✓' : 'Copiar' }));

    const categoriaChips = acessoCats.map(c => ({
      nome: c.nome,
      bg: st.categoryFilter === c.nome ? theme.navy : theme.pageBg,
      color: st.categoryFilter === c.nome ? '#fff' : theme.text,
      onClick: () => this.setState({ categoryFilter: st.categoryFilter === c.nome ? null : c.nome })
    }));

    const density = st.density;
    const gridStyle = `display:grid; grid-template-columns:repeat(auto-fill,minmax(${density === 'compact' ? 260 : 300}px,1fr)); gap:${density === 'compact' ? 12 : 16}px;`;
    const cardPadding = density === 'compact' ? '14px' : '18px';

    const adminQ = st.adminSearchQuery.trim().toLowerCase();
    const adminMsgRows = acessoMsgs.filter(m => !adminQ || m.titulo.toLowerCase().includes(adminQ) || m.conteudo.toLowerCase().includes(adminQ))
      .map(m => ({
        categoria: m.categoria, titulo: m.titulo, conteudo: m.conteudo, tagsLabel: m.tags.join(', '), frequencia: m.frequencia,
        onEdit: () => this.openEditMsg(m),
        onDelete: () => this.requestDelete('Excluir mensagem', `Tem certeza que deseja excluir "${m.titulo}"? Esta ação não pode ser desfeita.`, () => this.deleteMsg(m.id))
      }));

    const catRows = acessoCats.map(c => ({
      nome: c.nome,
      countLabel: acessoMsgs.filter(m => m.categoria === c.nome).length + ' mensagens',
      onEdit: () => this.openEditCat(c),
      onDelete: () => this.requestDelete('Excluir categoria', `Excluir a categoria "${c.nome}"? As mensagens vinculadas manterão o nome, mas o filtro será removido.`, () => this.deleteCat(c.id))
    }));

    const acessoRows = st.acessos.map(a => {
      const linkedCount = st.acessoMembros.filter(m => m.acesso_id === a.id).length;
      const msgCount = st.mensagens.filter(m => m.acesso_id === a.id).length;
      return {
        id: a.id, nome: a.nome, cor: a.cor, initial: a.nome.charAt(0).toUpperCase(),
        statsLabel: `${msgCount} mensagens · ${linkedCount} usuários`,
        statusLabel: a.ativo ? 'Ativo' : 'Inativo',
        statusBg: a.ativo ? '#DCFCE7' : '#FEE2E2', statusColor: a.ativo ? '#166534' : '#B91C1C',
        toggleLabel: a.ativo ? 'Desativar' : 'Ativar',
        onToggleStatus: () => this.toggleAcessoStatus(a.id, a.ativo),
        onUsers: () => this.setState({ showUsersModal: true, usersModalAcessoId: a.id })
      };
    });

    const msgFormTagChips = st.msgForm.tags.map((t, i) => ({
      label: t, onRemove: () => this.setState(s => ({ msgForm: { ...s.msgForm, tags: s.msgForm.tags.filter((_, idx) => idx !== i) } }))
    }));

    return {
      isLogin: false, isApp: true, isLoading: false, theme,
      appView: st.appView || 'dashboard',
      isDashboard: (st.appView || 'dashboard') === 'dashboard', isAdminView: st.appView === 'admin',
      adminTab: st.adminTab || 'mensagens',
      isAdminMsgs: (st.adminTab || 'mensagens') === 'mensagens', isAdminCats: st.adminTab === 'categorias', isAdminAcessos: st.adminTab === 'acessos',
      tabMsgsBg: (st.adminTab || 'mensagens') === 'mensagens' ? theme.navy : 'transparent', tabMsgsColor: (st.adminTab || 'mensagens') === 'mensagens' ? '#fff' : theme.text,
      tabCatsBg: st.adminTab === 'categorias' ? theme.navy : 'transparent', tabCatsColor: st.adminTab === 'categorias' ? '#fff' : theme.text,
      tabAcessosBg: st.adminTab === 'acessos' ? theme.navy : 'transparent', tabAcessosColor: st.adminTab === 'acessos' ? '#fff' : theme.text,
      isSuperAdmin, isAdmin,
      goDashboard: () => this.setState({ appView: 'dashboard', userMenuOpen: false }),
      goAdmin: () => this.setState({ appView: 'admin', userMenuOpen: false, adminTab: 'mensagens' }),
      setAdminTabMsgs: () => this.setState({ adminTab: 'mensagens' }),
      setAdminTabCats: () => this.setState({ adminTab: 'categorias' }),
      setAdminTabAcessos: () => this.setState({ adminTab: 'acessos' }),

      currentUser: { nome: profile.nome, iniciais: profile.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(), perfilLabel: isSuperAdmin ? 'Administrador' : (isAdmin ? 'Admin local' : 'Usuário') },
      userMenuOpen: !!st.userMenuOpen, toggleUserMenu: () => this.setState({ userMenuOpen: !st.userMenuOpen }),
      logout: () => api.signOut(),

      activeAcesso, activeAcessoId: activeAcesso.id,
      showAcessoSelector: userAcessoLinks.length > 1,
      userAcessosOptions: userAcessoLinks.map(l => st.acessos.find(a => a.id === l.acesso_id)).filter(Boolean),
      onChangeActiveAcesso: (e) => this.setState({ activeAcessoId: e.target.value, categoryFilter: null }),

      searchQuery: st.searchQuery, searchInputRef: (el) => { this.searchEl = el; },
      onSearchChange: (e) => this.setState({ searchQuery: e.target.value }),
      shortcutLabel: /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl K',

      densityComfortableBg: density === 'comfortable' ? theme.pageBg : 'transparent',
      densityCompactBg: density === 'compact' ? theme.pageBg : 'transparent',
      setDensityComfortable: () => { this.setState({ density: 'comfortable' }); try { localStorage.setItem('dp_density', 'comfortable'); } catch (e) {} },
      setDensityCompact: () => { this.setState({ density: 'compact' }); try { localStorage.setItem('dp_density', 'compact'); } catch (e) {} },
      darkModeIcon: st.darkMode ? '☀' : '☾',
      toggleDarkMode: () => { const val = !st.darkMode; this.setState({ darkMode: val }); try { localStorage.setItem('dp_darkmode', val ? '1' : '0'); } catch (e) {} },

      chipAllBg: !st.categoryFilter ? theme.navy : theme.pageBg, chipAllColor: !st.categoryFilter ? '#fff' : theme.text,
      setCategoryAll: () => this.setState({ categoryFilter: null }),
      categoriaChips,

      mostUsedList: mostUsed, recentList, hasRecent: recentList.length > 0,
      favList,

      resultsCountLabel: `${filtered.length} mensagem${filtered.length === 1 ? '' : 's'} encontrada${filtered.length === 1 ? '' : 's'}`,
      hasResults: filtered.length > 0,
      gridStyle, cardPadding,
      cardList: filtered.map(buildCard),

      categorias: acessoCats,
      adminSearchQuery: st.adminSearchQuery, onAdminSearchChange: (e) => this.setState({ adminSearchQuery: e.target.value }),
      adminMsgRows, catRows, acessoRows,
      openCreateMsg: () => this.openCreateMsg(),
      usersModalAcessoNome: (st.acessos.find(a => a.id === st.usersModalAcessoId) || {}).nome || '',
      usersModalRows: [],
      closeUsersModal: () => this.setState({ showUsersModal: false }),

      showMsgModal: st.showMsgModal, msgModalTitle: st.editingMsgId ? 'Editar mensagem' : 'Nova mensagem',
      msgForm: st.msgForm, msgFormTagChips, msgContentCount: st.msgForm.conteudo.length,
      onMsgCategoriaChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, categoria: e.target.value } })),
      onMsgTituloChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, titulo: e.target.value.slice(0, 100) } })),
      onMsgTagInputChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, tagInput: e.target.value } })),
      onMsgTagKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addMsgTag(); } },
      addMsgTag: () => this.addMsgTag(),
      onMsgConteudoChange: (e) => this.setState(s => ({ msgForm: { ...s.msgForm, conteudo: e.target.value.slice(0, 2000) } })),
      closeMsgModal: () => this.setState({ showMsgModal: false }),
      saveMsg: () => this.saveMsg(),

      showCatModal: st.showCatModal, catModalTitle: st.editingCatId ? 'Editar categoria' : 'Nova categoria', catForm: st.catForm,
      openCreateCat: () => this.setState({ showCatModal: true, editingCatId: null, catForm: { nome: '' } }),
      onCatNomeChange: (e) => this.setState({ catForm: { nome: e.target.value } }),
      closeCatModal: () => this.setState({ showCatModal: false }),
      saveCat: () => this.saveCat(),

      showAcessoModal: st.showAcessoModal, acessoForm: st.acessoForm,
      openCreateAcesso: () => this.setState({ showAcessoModal: true, acessoForm: { nome: '', descricao: '', cor: '#1BA7DC' } }),
      onAcessoNomeChange: (e) => this.setState(s => ({ acessoForm: { ...s.acessoForm, nome: e.target.value } })),
      onAcessoDescChange: (e) => this.setState(s => ({ acessoForm: { ...s.acessoForm, descricao: e.target.value } })),
      acessoColorOptions: ['#1BA7DC', '#0F2C6B', '#4F46E5', '#16A34A', '#D97706'].map(c => ({
        value: c, border: st.acessoForm.cor === c ? '2px solid #12203F' : '2px solid transparent',
        onSelect: () => this.setState(s => ({ acessoForm: { ...s.acessoForm, cor: c } }))
      })),
      closeAcessoModal: () => this.setState({ showAcessoModal: false }),
      saveAcesso: () => this.saveAcesso(),

      confirm: st.confirm, closeConfirm: () => this.setState({ confirm: { open: false, title: '', message: '', action: null } }),
      runConfirm: () => { if (st.confirm.action) st.confirm.action(); this.setState({ confirm: { open: false, title: '', message: '', action: null } }); },
      toast: st.toast
    };
  }

  /* ---------------- actions ---------------- */

  async handleLogin() {
    try {
      await api.signIn(this.state.loginEmail.trim(), this.state.loginPassword);
      this.setState({ loginError: '' });
    } catch (e) {
      this.setState({ loginError: e.message });
    }
  }

  openCreateMsg() {
    const cats = this.state.categorias.filter(c => c.acesso_id === this.state.activeAcessoId);
    this.setState({ showMsgModal: true, editingMsgId: null, msgForm: { categoria: cats[0] ? cats[0].nome : '', titulo: '', tagInput: '', tags: [], conteudo: '' } });
  }
  openEditMsg(msg) {
    this.setState({ showMsgModal: true, editingMsgId: msg.id, msgForm: { categoria: msg.categoria, titulo: msg.titulo, tagInput: '', tags: [...msg.tags], conteudo: msg.conteudo } });
  }
  addMsgTag() {
    const val = this.state.msgForm.tagInput.trim();
    if (!val) return;
    this.setState(s => ({ msgForm: { ...s.msgForm, tags: [...s.msgForm.tags, val], tagInput: '' } }));
  }
  async saveMsg() {
    const f = this.state.msgForm;
    if (!f.titulo.trim() || !f.conteudo.trim()) { this.showToast('Preencha título e conteúdo.', 'error'); return; }
    try {
      await api.saveMensagem({ id: this.state.editingMsgId, acessoId: this.state.activeAcessoId, categoria: f.categoria, titulo: f.titulo, tags: f.tags, conteudo: f.conteudo });
      this.setState({ showMsgModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Mensagem salva com sucesso!', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async deleteMsg(id) {
    try {
      await api.deleteMensagem(id);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Mensagem excluída.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  openEditCat(cat) { this.setState({ showCatModal: true, editingCatId: cat.id, catForm: { nome: cat.nome } }); }
  async saveCat() {
    const nome = this.state.catForm.nome.trim();
    if (!nome) { this.showToast('Informe o nome da categoria.', 'error'); return; }
    try {
      await api.saveCategoria({ id: this.state.editingCatId, acessoId: this.state.activeAcessoId, nome });
      this.setState({ showCatModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Categoria salva.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async deleteCat(id) {
    try {
      await api.deleteCategoria(id);
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Categoria excluída.', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async saveAcesso() {
    const f = this.state.acessoForm;
    if (!f.nome.trim()) { this.showToast('Informe o nome do Acesso.', 'error'); return; }
    try {
      await api.saveAcesso({ nome: f.nome.trim(), descricao: f.descricao, cor: f.cor });
      this.setState({ showAcessoModal: false });
      await this.refreshAppData(this.state.currentUser);
      this.showToast('Acesso criado com sucesso!', 'success');
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  async toggleAcessoStatus(id, currentAtivo) {
    try {
      await api.toggleAcessoStatus(id, !currentAtivo);
      await this.refreshAppData(this.state.currentUser);
    } catch (e) { this.showToast(e.message, 'error'); }
  }
  requestDelete(title, message, action) { this.setState({ confirm: { open: true, title, message, action } }); }

  /* ---------------- view (template — identical to prototype) ---------------- */

  view(v) {
    if (v.isLoading) {
      return `<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${v.theme.pageBg}; color:${v.theme.textSecondary}; font-family:'Nunito',sans-serif;">Carregando…</div>`;
    }
    const t = v.theme;
    const H = (fn) => this.h(fn);
    let body = '';

    if (v.isLogin) {
      body += `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:${t.pageBg}; padding:24px;">
        <div style="width:100%; max-width:400px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:16px; padding:40px 36px; box-shadow:0 20px 50px -20px rgba(11,45,107,0.25);">
          <div style="display:flex; justify-content:center; margin-bottom:28px;">
            <img src="assets/dentalplus-logo.png" alt="DentalPlus" style="height:52px; width:auto;" />
          </div>
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:20px; font-weight:800; color:${t.text};">Mensagens de Relacionamento</div>
            <div style="font-size:14px; color:${t.textSecondary}; margin-top:4px;">Acesse com sua conta para continuar</div>
          </div>
          ${v.loginError ? `<div style="background:#FEE2E2; color:#B91C1C; font-size:13px; font-weight:600; padding:10px 14px; border-radius:10px; margin-bottom:16px;">${esc(v.loginError)}</div>` : ''}
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">E-mail</label>
              <input type="email" data-focus="loginEmail" placeholder="seuemail@empresa.com" value="${esc(v.loginEmail)}" data-input="${H(v.onLoginEmailChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:13px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Senha</label>
              <input type="password" data-focus="loginPassword" placeholder="••••••••" value="${esc(v.loginPassword)}" data-input="${H(v.onLoginPasswordChange)}" data-keydown="${H(v.onLoginKeyDown)}" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
            </div>
            <button data-click="${H(v.handleLogin)}" style="margin-top:8px; padding:13px; border-radius:10px; border:none; background:${t.navy}; color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit;">Entrar</button>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:16px;">
            <a href="#" data-click="${H(v.noop)}" style="font-size:13px; color:${t.cyan}; text-decoration:none; font-weight:600;">Esqueci minha senha</a>
          </div>
          <div style="margin-top:28px; padding-top:20px; border-top:1px solid ${t.border};">
            <div style="font-size:12px; color:${t.textSecondary}; margin-bottom:10px; font-weight:700;">CONTAS DE DEMONSTRAÇÃO</div>
            <div style="display:flex; gap:8px;">
              <button data-click="${H(v.fillUserDemo)}" style="flex:1; padding:9px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit;">Usuário comum</button>
              <button data-click="${H(v.fillAdminDemo)}" style="flex:1; padding:9px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit;">Administrador</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    if (v.isApp) {
      body += `<div>` + this.viewHeader(v, t, H);
      if (v.isDashboard) body += this.viewDashboard(v, t, H);
      if (v.isAdminView) body += this.viewAdmin(v, t, H);
      body += `</div>`;
    }

    body += this.viewModals(v, t, H);

    return `<div style="min-height:100vh; background:${t.pageBg}; color:${t.text}; transition:background .2s,color .2s;">${body}</div>`;
  }

  viewHeader(v, t, H) {
    return `
    <div style="position:sticky; top:0; z-index:40; background:${t.cardBg}; border-bottom:1px solid ${t.border}; padding:14px 24px;">
      <div style="display:flex; align-items:center; gap:20px; max-width:1400px; margin:0 auto; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:12px; cursor:pointer;" data-click="${H(v.goDashboard)}">
          <img src="assets/dentalplus-logo.png" alt="DentalPlus" style="height:30px; width:auto;" />
          <div style="width:1px; height:26px; background:${t.border};"></div>
          <div style="font-size:15px; font-weight:800; color:${t.text}; line-height:1.2;">Mensagens — ${esc(v.activeAcesso.nome)}</div>
        </div>
        ${v.showAcessoSelector ? `
          <select data-change="${H(v.onChangeActiveAcesso)}" style="padding:8px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-weight:700; font-family:inherit;">
            ${v.userAcessosOptions.map(opt => `<option value="${esc(opt.id)}" ${opt.id === v.activeAcessoId ? 'selected' : ''}>${esc(opt.nome)}</option>`).join('')}
          </select>` : ''}
        <div style="flex:1; min-width:220px; position:relative; max-width:640px;">
          <div style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:15px; height:15px; border:2px solid ${t.textSecondary}; border-radius:50%;"></div>
          <div style="position:absolute; left:22px; top:63%; width:8px; height:2px; background:${t.textSecondary}; transform:rotate(45deg); border-radius:2px;"></div>
          <input data-ref="${H(v.searchInputRef)}" data-focus="search" type="text" placeholder="Buscar por título, conteúdo, tag ou categoria…" value="${esc(v.searchQuery)}" data-input="${H(v.onSearchChange)}" style="width:100%; padding:13px 70px 13px 40px; border-radius:12px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:14px; font-family:inherit;" />
          <div style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:11px; font-weight:700; color:${t.textSecondary}; background:${t.pageBg}; border:1px solid ${t.border}; padding:3px 8px; border-radius:6px;">${esc(v.shortcutLabel)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
          <button data-click="${H(v.setDensityComfortable)}" title="Confortável" style="width:34px; height:34px; border-radius:8px; border:1px solid ${t.border}; background:${v.densityComfortableBg}; color:${t.text}; cursor:pointer; font-size:15px;">☰</button>
          <button data-click="${H(v.setDensityCompact)}" title="Compacta" style="width:34px; height:34px; border-radius:8px; border:1px solid ${t.border}; background:${v.densityCompactBg}; color:${t.text}; cursor:pointer; font-size:15px;">▤</button>
          <button data-click="${H(v.toggleDarkMode)}" title="Alternar tema" style="width:34px; height:34px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; cursor:pointer; font-size:15px;">${v.darkModeIcon}</button>
          <div style="position:relative;">
            <div data-click="${H(v.toggleUserMenu)}" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:6px 10px; border-radius:10px; border:1px solid ${t.border};">
              <div style="width:28px; height:28px; border-radius:50%; background:${t.cyan}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;">${esc(v.currentUser.iniciais)}</div>
              <div style="line-height:1.15;">
                <div style="font-size:13px; font-weight:700;">${esc(v.currentUser.nome)}</div>
                <div style="font-size:11px; color:${t.textSecondary};">${esc(v.currentUser.perfilLabel)}</div>
              </div>
            </div>
            ${v.userMenuOpen ? `
              <div style="position:absolute; right:0; top:44px; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:10px; box-shadow:0 12px 30px -10px rgba(0,0,0,0.25); min-width:200px; padding:8px; z-index:50;">
                ${v.isAdmin ? `<div data-click="${H(v.goAdmin)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:${t.text};">Painel Administrativo</div>` : ''}
                <div data-click="${H(v.logout)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:#DC2626;">Sair</div>
              </div>` : ''}
          </div>
        </div>
      </div>
      <div style="max-width:1400px; margin:12px auto 0; display:flex; gap:8px; flex-wrap:wrap;">
        <div data-click="${H(v.setCategoryAll)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${v.chipAllBg}; color:${v.chipAllColor};">Todas</div>
        ${v.categoriaChips.map(chip => `<div data-click="${H(chip.onClick)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${chip.bg}; color:${chip.color};">${esc(chip.nome)}</div>`).join('')}
      </div>
    </div>`;
  }

  viewDashboard(v, t, H) {
    const miniRow = (m) => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-radius:8px; background:${t.pageBg};">
        <div style="font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.titulo)}</div>
        <button data-click="${H(m.onCopy)}" style="flex-shrink:0; border:none; background:${t.navy}; color:#fff; font-size:11px; font-weight:700; padding:5px 10px; border-radius:6px; cursor:pointer;">${esc(m.copyLabel)}</button>
      </div>`;

    const card = (m) => `
      <div style="background:${t.cardBg}; border:1px solid ${m.borderColor}; border-radius:14px; padding:${v.cardPadding}; display:flex; flex-direction:column; gap:10px; transition:transform .15s; box-shadow:${m.shadow};">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:26px; height:26px; border-radius:8px; background:${t.cyan}22; color:${t.cyan}; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${esc(m.catInitial)}</div>
            <div style="font-size:11px; font-weight:700; color:${t.textSecondary};">${esc(m.categoria)}</div>
          </div>
          <button data-click="${H(m.onToggleFav)}" aria-label="Favoritar" style="border:none; background:transparent; cursor:pointer; font-size:18px; color:${m.favColor}; line-height:1;">${m.favIcon}</button>
        </div>
        <div style="font-size:15px; font-weight:800; color:${t.text};">${m.titleSegments.map(seg => `<span style="${seg.style}">${esc(seg.text)}</span>`).join('')}</div>
        <div style="font-size:13px; color:${t.textSecondary}; line-height:1.5; white-space:pre-wrap;">${esc(m.displayContent)}</div>
        ${m.showToggle ? `<div data-click="${H(m.onToggleExpand)}" style="font-size:12px; font-weight:700; color:${t.cyan}; cursor:pointer;">${esc(m.toggleLabel)}</div>` : ''}
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${m.tagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.textSecondary}; background:${t.pageBg}; padding:4px 9px; border-radius:999px;">${esc(tag)}</div>`).join('')}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px; padding-top:10px; border-top:1px solid ${t.border};">
          <div style="font-size:11px; color:${t.textSecondary}; font-weight:600;">usada ${esc(m.frequencia)}x</div>
          <div style="display:flex; gap:8px;">
            ${v.isAdmin ? `<button data-click="${H(m.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.textSecondary}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer;">Editar</button>` : ''}
            <button data-click="${H(m.onCopy)}" style="border:none; background:${m.copyBtnBg}; color:#fff; font-size:12px; font-weight:700; padding:7px 14px; border-radius:8px; cursor:pointer;">${esc(m.copyLabel)}</button>
          </div>
        </div>
      </div>`;

    return `
    <div style="max-width:1400px; margin:0 auto; padding:24px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:28px;">
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:#D97706; margin-bottom:10px;">🔥 MAIS USADAS</div>
          <div style="display:flex; flex-direction:column; gap:6px;">${v.mostUsedList.map(miniRow).join('')}</div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:${t.cyan}; margin-bottom:10px;">🕒 RECENTES</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.hasRecent ? v.recentList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Suas cópias recentes aparecem aqui.</span></div>`}
          </div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:16px;">
          <div style="font-size:13px; font-weight:800; color:#4F46E5; margin-bottom:10px;">★ FAVORITAS</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${v.favList.length ? v.favList.map(miniRow).join('') : `<div><span style="font-size:13px; color:${t.textSecondary};">Marque mensagens com a estrela para vê-las aqui.</span></div>`}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="font-size:14px; font-weight:700; color:${t.textSecondary};">${esc(v.resultsCountLabel)}</div>
      </div>
      ${v.hasResults
        ? `<div style="${v.gridStyle}">${v.cardList.map(card).join('')}</div>`
        : `<div>
            <div style="text-align:center; padding:60px 20px; background:${t.cardBg}; border:1px dashed ${t.border}; border-radius:16px;">
              <div style="font-size:16px; font-weight:800; color:${t.text}; margin-bottom:6px;">Nenhum resultado encontrado</div>
              <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:18px;">Tente uma categoria ou uma das mensagens mais usadas abaixo.</div>
              <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                ${v.categoriaChips.map(chip => `<div data-click="${H(chip.onClick)}" style="padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700; cursor:pointer; background:${t.pageBg}; color:${t.text}; border:1px solid ${t.border};">${esc(chip.nome)}</div>`).join('')}
              </div>
            </div>
          </div>`}
    </div>`;
  }

  viewAdmin(v, t, H) {
    const cols = '140px 1fr 1fr 140px 90px 130px';
    let content = '';

    if (v.isAdminMsgs) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
          <div style="font-size:20px; font-weight:800;">Mensagens</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <input type="text" data-focus="adminSearch" placeholder="Buscar…" value="${esc(v.adminSearchQuery)}" data-input="${H(v.onAdminSearchChange)}" style="padding:9px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            <button data-click="${H(v.openCreateMsg)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Nova mensagem</button>
          </div>
        </div>
        <div style="background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; overflow:hidden;">
          <div style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:11px; font-weight:800; color:${t.textSecondary}; background:${t.pageBg}; text-transform:uppercase;">
            <div>Categoria</div><div>Título</div><div>Conteúdo</div><div>Tags</div><div>Freq.</div><div>Ações</div>
          </div>
          ${v.adminMsgRows.map(row => `
            <div style="display:grid; grid-template-columns:${cols}; gap:10px; padding:12px 16px; font-size:13px; border-top:1px solid ${t.border}; align-items:center;">
              <div style="font-weight:700; color:${t.cyan};">${esc(row.categoria)}</div>
              <div style="font-weight:700;">${esc(row.titulo)}</div>
              <div style="color:${t.textSecondary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(row.conteudo)}</div>
              <div style="color:${t.textSecondary}; font-size:12px;">${esc(row.tagsLabel)}</div>
              <div>${esc(row.frequencia)}</div>
              <div style="display:flex; gap:6px;">
                <button data-click="${H(row.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:5px 9px; border-radius:6px; cursor:pointer;">Editar</button>
                <button data-click="${H(row.onDelete)}" style="border:none; background:#FEE2E2; color:#B91C1C; font-size:11px; font-weight:700; padding:5px 9px; border-radius:6px; cursor:pointer;">Excluir</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminCats) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Categorias de situação</div>
          <button data-click="${H(v.openCreateCat)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Nova categoria</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${v.catRows.map(cat => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:12px 16px;">
              <div>
                <div style="font-weight:700; font-size:14px;">${esc(cat.nome)}</div>
                <div style="font-size:12px; color:${t.textSecondary};">${esc(cat.countLabel)}</div>
              </div>
              <div style="display:flex; gap:6px;">
                <button data-click="${H(cat.onEdit)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Editar</button>
                <button data-click="${H(cat.onDelete)}" style="border:none; background:#FEE2E2; color:#B91C1C; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Excluir</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (v.isAdminAcessos) {
      content = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <div style="font-size:20px; font-weight:800;">Acessos</div>
          <button data-click="${H(v.openCreateAcesso)}" style="border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; padding:10px 16px; border-radius:8px; cursor:pointer;">+ Novo Acesso</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${v.acessoRows.map(a => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:12px; padding:14px 18px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:36px; height:36px; border-radius:10px; background:${a.cor}; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:14px;">${esc(a.initial)}</div>
                <div>
                  <div style="font-weight:800; font-size:14px;">${esc(a.nome)}</div>
                  <div style="font-size:12px; color:${t.textSecondary};">${esc(a.statsLabel)}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:999px; background:${a.statusBg}; color:${a.statusColor};">${esc(a.statusLabel)}</div>
                <button data-click="${H(a.onUsers)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">Usuários</button>
                <button data-click="${H(a.onToggleStatus)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:11px; font-weight:700; padding:6px 10px; border-radius:6px; cursor:pointer;">${esc(a.toggleLabel)}</button>
              </div>
            </div>`).join('')}
        </div>`;
    }

    return `
    <div style="max-width:1300px; margin:0 auto; padding:24px; display:flex; gap:24px; align-items:flex-start;">
      <div style="width:220px; flex-shrink:0; background:${t.cardBg}; border:1px solid ${t.border}; border-radius:14px; padding:12px; position:sticky; top:96px;">
        <div data-click="${H(v.goDashboard)}" style="font-size:13px; font-weight:700; color:${t.textSecondary}; padding:10px 12px; cursor:pointer;">← Voltar ao painel</div>
        <div style="height:1px; background:${t.border}; margin:8px 0;"></div>
        <div data-click="${H(v.setAdminTabMsgs)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabMsgsBg}; color:${v.tabMsgsColor};">Mensagens</div>
        <div data-click="${H(v.setAdminTabCats)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:4px; background:${v.tabCatsBg}; color:${v.tabCatsColor};">Categorias</div>
        ${v.isSuperAdmin ? `<div data-click="${H(v.setAdminTabAcessos)}" style="padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:700; background:${v.tabAcessosBg}; color:${v.tabAcessosColor};">Acessos</div>` : ''}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:${t.textSecondary}; margin-bottom:14px;">Operando em: <span style="color:${t.cyan};">${esc(v.activeAcesso.nome)}</span></div>
        ${content}
      </div>
    </div>`;
  }

  viewModals(v, t, H) {
    let out = '';

    if (v.showMsgModal) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:520px; background:${t.cardBg}; border-radius:16px; padding:28px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:18px;">${esc(v.msgModalTitle)}</div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Categoria / Situação</label>
              <select data-change="${H(v.onMsgCategoriaChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;">
                ${v.categorias.map(c => `<option value="${esc(c.nome)}" ${c.nome === v.msgForm.categoria ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Título (máx. 100 caracteres)</label>
              <input type="text" data-focus="msgTitulo" maxlength="100" value="${esc(v.msgForm.titulo)}" data-input="${H(v.onMsgTituloChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Tags</label>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                ${v.msgFormTagChips.map(tag => `<div style="font-size:11px; font-weight:700; color:${t.text}; background:${t.pageBg}; padding:5px 10px; border-radius:999px; display:flex; align-items:center; gap:6px;">${esc(tag.label)}<span data-click="${H(tag.onRemove)}" style="cursor:pointer; color:${t.textSecondary};">×</span></div>`).join('')}
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" data-focus="msgTagInput" placeholder="adicionar tag e Enter" value="${esc(v.msgForm.tagInput)}" data-input="${H(v.onMsgTagInputChange)}" data-keydown="${H(v.onMsgTagKeyDown)}" style="flex:1; padding:9px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
                <button data-click="${H(v.addMsgTag)}" style="border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:12px; font-weight:700; padding:0 14px; border-radius:8px; cursor:pointer;">Add</button>
              </div>
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Conteúdo (${esc(v.msgContentCount)}/2000)</label>
              <textarea data-focus="msgConteudo" maxlength="2000" rows="5" data-input="${H(v.onMsgConteudoChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit; resize:vertical;">${esc(v.msgForm.conteudo)}</textarea>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
            <button data-click="${H(v.closeMsgModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveMsg)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Salvar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showCatModal) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:400px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:16px;">${esc(v.catModalTitle)}</div>
          <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Nome da categoria</label>
          <input type="text" data-focus="catNome" value="${esc(v.catForm.nome)}" data-input="${H(v.onCatNomeChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button data-click="${H(v.closeCatModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveCat)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Salvar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showAcessoModal) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:420px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:16px;">Novo Acesso</div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Nome do Acesso</label>
              <input type="text" data-focus="acessoNome" placeholder="ex: Financeiro" value="${esc(v.acessoForm.nome)}" data-input="${H(v.onAcessoNomeChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:6px;">Descrição (opcional)</label>
              <input type="text" data-focus="acessoDesc" value="${esc(v.acessoForm.descricao)}" data-input="${H(v.onAcessoDescChange)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid ${t.border}; background:${t.inputBg}; color:${t.text}; font-size:13px; font-family:inherit;" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:${t.textSecondary}; display:block; margin-bottom:8px;">Cor de identificação</label>
              <div style="display:flex; gap:8px;">
                ${v.acessoColorOptions.map(c => `<div data-click="${H(c.onSelect)}" style="width:30px; height:30px; border-radius:8px; background:${c.value}; cursor:pointer; border:${c.border};"></div>`).join('')}
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button data-click="${H(v.closeAcessoModal)}" style="padding:10px 18px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.saveAcesso)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Criar Acesso</button>
          </div>
        </div>
      </div>`;
    }

    if (v.showUsersModal) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px;">
        <div style="width:100%; max-width:460px; background:${t.cardBg}; border-radius:16px; padding:26px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:18px; font-weight:800; margin-bottom:4px;">Usuários vinculados</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:16px;">${esc(v.usersModalAcessoNome)}</div>
          <div style="font-size:13px; color:${t.textSecondary};">A edição de vínculos de usuários por acesso está disponível na Task de acompanhamento pós-lançamento (fora do escopo de hoje).</div>
          <div style="display:flex; justify-content:flex-end; margin-top:20px;">
            <button data-click="${H(v.closeUsersModal)}" style="padding:10px 18px; border-radius:8px; border:none; background:${t.navy}; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Concluir</button>
          </div>
        </div>
      </div>`;
    }

    if (v.confirm.open) {
      out += `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:center; justify-content:center; z-index:110; padding:20px;">
        <div style="width:100%; max-width:380px; background:${t.cardBg}; border-radius:16px; padding:24px; animation:dp-modal-in .18s ease-out;">
          <div style="font-size:16px; font-weight:800; margin-bottom:8px;">${esc(v.confirm.title)}</div>
          <div style="font-size:13px; color:${t.textSecondary}; margin-bottom:20px; line-height:1.5;">${esc(v.confirm.message)}</div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button data-click="${H(v.closeConfirm)}" style="padding:9px 16px; border-radius:8px; border:1px solid ${t.border}; background:transparent; color:${t.text}; font-size:13px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button data-click="${H(v.runConfirm)}" style="padding:9px 16px; border-radius:8px; border:none; background:#DC2626; color:#fff; font-size:13px; font-weight:700; cursor:pointer;">Confirmar</button>
          </div>
        </div>
      </div>`;
    }

    if (v.toast.show) {
      out += `<div style="position:fixed; bottom:24px; right:24px; z-index:200; background:${v.toast.bg}; color:#fff; padding:13px 20px; border-radius:10px; font-size:13px; font-weight:700; box-shadow:0 12px 30px -8px rgba(0,0,0,0.35); animation:dp-toast-in .2s ease-out;">${esc(v.toast.msg)}</div>`;
    }

    return out;
  }
}

new App(document.getElementById('app')).mount();
```

> Note: the "Usuários vinculados" modal body is simplified to a status message (linking/unlinking users to acessos is deferred — `toggleUserLink`/`toggleUserAdminLocal` exist in `api.js` from Task 7 for a follow-up task, but wiring the modal's per-row checkboxes needs a `fetchUsersForAcesso` query not required for today's 2-user launch). This is the one deliberate scope trim against the prototype — call it out to the user when demoing.

- [ ] **Step 2: Manual verification — login as both accounts**

Open the app in a browser (after Task 9 wires up `index.html`). Log in with `relacionamento@dentalplus` / `Dental123`: dashboard shows the 8 seeded messages, no admin menu item. Log out, log in with `admin@dentalplus` / `Dental@1234`: dashboard shows the same messages, user menu shows "Painel Administrativo".

- [ ] **Step 3: Manual verification — CRUD and favorites**

As admin: open a message, click Editar, change the título, Salvar — confirm the card updates. Click ☆ on a card to favorite it — confirm it appears under "★ FAVORITAS". Reload the page — confirm the favorite persists (it's now in Postgres, not `localStorage`).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: rewrite app.js as Supabase-backed ES module"
```

---

## Task 9: Enxugar `index.html` para o shell do app

**Files:**
- Modify: `index.html:18-980` (replace the inline `<script>` block and `<div id="app">` wiring with module imports)

**Interfaces:**
- Consumes: `app.js` (Task 8).
- Produces: the page the browser loads; no other file depends on `index.html`.

- [ ] **Step 1: Replace the body of `index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mensagens de Relacionamento — DentalPlus</title>
<link rel="icon" href="assets/dentalplus-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Nunito', sans-serif; }
  ::selection { background: #1BA7DC55; }
  @keyframes dp-toast-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes dp-modal-in { from { transform: translateY(16px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
</style>
</head>
<body>
<div id="app"></div>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

Serve the folder over HTTP (module scripts fail under `file://` in most browsers) — `python -m http.server 8765` — and open `http://localhost:8765/index.html`. Confirm the login screen renders and the browser console has no module-resolution errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: trim index.html to shell, load app.js as ES module"
```

---

## Task 10: Passagem completa de testes manuais (checklist do spec)

**Files:** none (verification pass across the whole app).

**Interfaces:**
- Consumes: the fully wired app from Tasks 1–9.

- [ ] **Step 1:** Run through the acceptance checklist from the spec (`docs/superpowers/specs/2026-07-24-mensagens-dentalplus-supabase-design.md`, section 8) against `http://localhost:8765`:
  - Login `admin@dentalplus` → full admin panel visible.
  - Login `relacionamento@dentalplus` → dashboard only, no admin menu item.
  - Create, edit, delete a message as admin.
  - Delete a category → messages that used it keep their `categoria` text (query `select categoria from mensagens` in the SQL Editor to confirm nothing changed).
  - Search and copy a message → frequência increments (visible in the admin Mensagens table) and it appears under "Recentes".
  - Favorite a message, reload the page → favorite persists.
  - Log in as the same user in a second browser (or incognito window) → same data after reload.
  - Toggle dark mode and density → persists per browser (not shared).
  - As `relacionamento@dentalplus`, try to reach `/` with `appView: 'admin'` via devtools state — confirm Postgres still rejects any write attempt (RLS), surfaced as an error toast.
- [ ] **Step 2: Commit** (no code change expected; if the pass surfaces a bug, fix it in the relevant file from Tasks 7–9 and commit that fix here)

```bash
git add -A
git commit -m "test: manual acceptance pass against live Supabase data" --allow-empty
```

---

## Task 11 (Ação do usuário + agente): Preparar a Vercel

**Files:** none.

**Interfaces:**
- Produces: authenticated local Vercel CLI session, used by Task 12.

- [ ] **Passo 1 (agente):** Instalar a CLI da Vercel.

Run: `npm install -g vercel`
Expected: instala sem pedir login (comando não sensível).

- [ ] **Passo 2 (usuário):** Rodar no terminal e autorizar no navegador que abrir (login pessoal, não posso fazer por você):

```bash
vercel login
```

Confirmar que o terminal mostra "Success! ... logged in".

---

## Task 12: Deploy do frontend na Vercel

**Files:**
- Create: `DEPLOY.md`

**Interfaces:**
- Consumes: authenticated Vercel CLI session (Task 11).
- Produces: public production URL, recorded in `DEPLOY.md`.

- [ ] **Step 1: Deploy**

Run (from the project root):

```bash
vercel --prod --yes --name mensagens-dentalplus
```

Expected: output ends with a line like `Production: https://mensagens-dentalplus-xxxx.vercel.app`.

- [ ] **Step 2: Record the URL**

```markdown
# Deploy

- URL de produção: <cole a URL retornada pelo comando acima>
- Data do primeiro deploy: 2026-07-24
- Hospedagem: Vercel (frontend) + Supabase (banco/auth)
```

- [ ] **Step 3: Final smoke test on the live URL**

Open the production URL, log in with both `admin@dentalplus` / `Dental@1234` and `relacionamento@dentalplus` / `Dental123`, confirm both dashboards load with the seeded messages.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: record production deploy URL"
```

---

## Self-Review Notes

- **Spec coverage:** Contexto (Task 8/9 preserve UI), Decisões (credentials in Tasks 3/8, categoria-as-text in Task 2, Vercel in Task 12), Arquitetura (Tasks 6–9), Modelo de dados (Task 2), Autenticação (Tasks 3–5, 7–8), Frontend (Tasks 7–9), Deploy (Tasks 11–12), Testes (Task 10), Fora de escopo (untouched) — all covered.
- **Placeholder scan:** `config.js` intentionally ships with two placeholder strings that Step 2 of Task 6 replaces with real values supplied by the user in chat — this is a documented external-input dependency, not a missing implementation.
- **Type/name consistency:** `api.js` function names (`saveMensagem`, `deleteMensagem`, `saveCategoria`, `deleteCategoria`, `saveAcesso`, `toggleAcessoStatus`, `toggleFavorito`, `recordRecente`, `incrementFrequencia`, `adminCreateUser`) match exactly what `app.js` (Task 8) imports and calls. `search-utils.mjs` exports (`normalize`, `levenshtein`, `fuzzyTok`, `matchesSearch`, `titleSegments`) match both the test file (Task 1) and `app.js`'s import (Task 8).
- **Known scope trim (flagged, not hidden):** the "Usuários vinculados" modal in `viewModals` no longer lists per-user checkboxes (it needs a `fetchUsersForAcesso` API call not built today, since the 2-user launch doesn't require it). `toggleUserLink`/`toggleUserAdminLocal` remain in `api.js` for whoever picks this up next.
