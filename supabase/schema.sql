-- ============================================================
-- Mensagens de Relacionamento — schema Supabase (Postgres)
-- Aplicar de uma vez no SQL Editor do painel Supabase.
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
