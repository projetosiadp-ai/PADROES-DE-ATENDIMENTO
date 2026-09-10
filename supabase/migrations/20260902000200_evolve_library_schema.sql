-- Additive schema evolution. Legacy columns remain available during rollout.

-- The legacy check only accepts ('superadmin', 'user'): drop it before converting roles.
alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'colaborador'
where role = 'user';

alter table public.profiles
  alter column role set default 'colaborador';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('colaborador', 'superadmin'));

update public.acesso_membros
set is_admin_local = false
where is_admin_local;

alter table public.acesso_membros
  alter column is_admin_local set default false;

alter table public.acesso_membros
  drop constraint if exists acesso_membros_admin_local_disabled_check;

alter table public.acesso_membros
  add constraint acesso_membros_admin_local_disabled_check
  check (is_admin_local = false);

alter table public.categorias
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.categorias
  drop constraint if exists categorias_arquivamento_consistente_check;

alter table public.categorias
  add constraint categorias_arquivamento_consistente_check
  check ((arquivado_em is null) = (arquivado_por is null));

alter table public.categorias
  drop constraint if exists categorias_arquivado_por_fkey;

alter table public.categorias
  add constraint categorias_arquivado_por_fkey
  foreign key (arquivado_por) references public.profiles(id) on delete set null;

alter table public.mensagens
  add column if not exists categoria_id uuid,
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid;

-- Recover categories for legacy free-text values that do not have a matching row.
insert into public.categorias (acesso_id, nome)
select distinct
  m.acesso_id,
  coalesce(nullif(btrim(m.categoria), ''), 'Categoria recuperada')
from public.mensagens m
where not exists (
  select 1
  from public.categorias c
  where c.acesso_id = m.acesso_id
    and lower(btrim(c.nome)) = lower(coalesce(nullif(btrim(m.categoria), ''), 'Categoria recuperada'))
);

with resolved as (
  select
    m.id as mensagem_id,
    (
      select c.id
      from public.categorias c
      where c.acesso_id = m.acesso_id
        and lower(btrim(c.nome)) = lower(coalesce(nullif(btrim(m.categoria), ''), 'Categoria recuperada'))
      order by c.created_at, c.id
      limit 1
    ) as categoria_id,
    (
      select c.nome
      from public.categorias c
      where c.acesso_id = m.acesso_id
        and lower(btrim(c.nome)) = lower(coalesce(nullif(btrim(m.categoria), ''), 'Categoria recuperada'))
      order by c.created_at, c.id
      limit 1
    ) as categoria_nome
  from public.mensagens m
  where m.categoria_id is null
)
update public.mensagens m
set categoria_id = resolved.categoria_id,
    categoria = resolved.categoria_nome
from resolved
where m.id = resolved.mensagem_id;

do $$
begin
  if exists (select 1 from public.mensagens where categoria_id is null) then
    raise exception 'CATEGORY_BACKFILL_FAILED: every message must resolve to a category';
  end if;
end;
$$;

alter table public.mensagens
  alter column categoria_id set not null;

alter table public.mensagens
  drop constraint if exists mensagens_categoria_id_fkey;

alter table public.mensagens
  add constraint mensagens_categoria_id_fkey
  foreign key (categoria_id) references public.categorias(id) on delete restrict;

alter table public.mensagens
  drop constraint if exists mensagens_arquivado_por_fkey;

alter table public.mensagens
  add constraint mensagens_arquivado_por_fkey
  foreign key (arquivado_por) references public.profiles(id) on delete set null;

alter table public.mensagens
  drop constraint if exists mensagens_arquivamento_consistente_check;

alter table public.mensagens
  add constraint mensagens_arquivamento_consistente_check
  check ((arquivado_em is null) = (arquivado_por is null));

create or replace function public.sincronizar_categoria_mensagem()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  categoria_row public.categorias;
begin
  select c.*
  into categoria_row
  from public.categorias c
  where c.acesso_id = new.acesso_id
    and c.arquivado_em is null
    and (
      c.id = new.categoria_id
      or (
        new.categoria_id is null
        and lower(btrim(c.nome)) = lower(btrim(new.categoria))
      )
    )
  order by (c.id = new.categoria_id) desc, c.created_at, c.id
  limit 1;

  if not found
    or categoria_row.acesso_id <> new.acesso_id then
    raise exception using errcode = '23514', message = 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS';
  end if;

  new.categoria_id := categoria_row.id;
  new.categoria := categoria_row.nome;
  return new;
end;
$$;

drop trigger if exists mensagens_sincronizar_categoria on public.mensagens;
create trigger mensagens_sincronizar_categoria
before insert or update of categoria_id, acesso_id on public.mensagens
for each row execute function public.sincronizar_categoria_mensagem();

create or replace function public.propagar_nome_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nome is distinct from old.nome then
    update public.mensagens
    set categoria = new.nome
    where categoria_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists categorias_propagar_nome on public.categorias;
create trigger categorias_propagar_nome
after update of nome on public.categorias
for each row execute function public.propagar_nome_categoria();

alter table public.solicitacoes_mensagem
  add column if not exists idempotency_key uuid,
  add column if not exists categoria_id uuid,
  add column if not exists categoria_id_anterior uuid;

update public.solicitacoes_mensagem
set idempotency_key = gen_random_uuid()
where idempotency_key is null;

alter table public.solicitacoes_mensagem
  alter column idempotency_key set not null;

-- The legacy checks reject 'arquivamento': drop them before converting pending deletions.
alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_tipo_check;

alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_tipo_mensagem_ck;

update public.solicitacoes_mensagem
set tipo = 'arquivamento'
where tipo = 'exclusao'
  and status = 'pendente';

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_tipo_check
  check (tipo in ('criacao', 'edicao', 'arquivamento', 'exclusao'));

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_tipo_mensagem_ck
  check (
    status <> 'pendente'
    or (tipo = 'criacao' and mensagem_id is null)
    or (tipo in ('edicao', 'arquivamento') and mensagem_id is not null)
  );

alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_categoria_id_fkey;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_categoria_id_fkey
  foreign key (categoria_id) references public.categorias(id) on delete restrict;

alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_categoria_id_anterior_fkey;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_categoria_id_anterior_fkey
  foreign key (categoria_id_anterior) references public.categorias(id) on delete restrict;

create unique index if not exists solicitacoes_solicitante_idempotency_uidx
  on public.solicitacoes_mensagem (solicitado_por, idempotency_key);

create table if not exists public.registros_atividade (
  id bigint generated always as identity primary key,
  ator_id uuid references public.profiles(id) on delete set null,
  acesso_id uuid references public.acessos(id) on delete set null,
  entidade_tipo text not null
    check (entidade_tipo in ('mensagem', 'categoria', 'acesso', 'liberacao', 'conta', 'solicitacao')),
  entidade_id text not null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(detalhes) = 'object'
      and not (detalhes ?| array[
        'password', 'senha', 'temporaryPassword', 'temporary_password',
        'token', 'access_token', 'refresh_token',
        'conteudo', 'conteudo_anterior', 'content'
      ])
    ),
  created_at timestamptz not null default now()
);

alter table public.registros_atividade enable row level security;

create index if not exists acesso_membros_user_id_idx
  on public.acesso_membros (user_id);
create index if not exists categorias_acesso_id_idx
  on public.categorias (acesso_id);
create index if not exists mensagens_categoria_id_idx
  on public.mensagens (categoria_id);
create index if not exists mensagens_acesso_categoria_ativas_idx
  on public.mensagens (acesso_id, categoria_id)
  where arquivado_em is null;
create index if not exists mensagens_acesso_updated_ativas_idx
  on public.mensagens (acesso_id, updated_at desc)
  where arquivado_em is null;
create index if not exists mensagens_tags_gin_idx
  on public.mensagens using gin (tags);
create index if not exists recentes_user_used_at_idx
  on public.recentes (user_id, used_at desc);
create index if not exists solicitacoes_status_criado_em_idx
  on public.solicitacoes_mensagem (status, criado_em);
create index if not exists registros_atividade_acesso_created_idx
  on public.registros_atividade (acesso_id, created_at desc);
