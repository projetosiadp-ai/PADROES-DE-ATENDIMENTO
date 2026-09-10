create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'superadmin'
        and p.ativo = true
    );
$$;

create or replace function private.can_use_access(p_access_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_access_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.acessos a
      where a.id = p_access_id
        and a.ativo = true
        and (
          exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.role = 'superadmin'
              and p.ativo = true
          )
          or exists (
            select 1
            from public.profiles p
            join public.acesso_membros am on am.user_id = p.id
            where p.id = (select auth.uid())
              and p.role = 'colaborador'
              and p.ativo = true
              and am.acesso_id = a.id
          )
        )
    );
$$;

revoke all on function private.is_superadmin() from public, anon;
revoke all on function private.can_use_access(uuid) from public, anon;
grant execute on function private.is_superadmin() to authenticated, service_role;
grant execute on function private.can_use_access(uuid) to authenticated, service_role;

drop policy if exists acesso_membros_select_own_or_superadmin on public.acesso_membros;
drop policy if exists acesso_membros_write_superadmin on public.acesso_membros;
drop policy if exists acessos_select_members_or_superadmin on public.acessos;
drop policy if exists acessos_write_superadmin on public.acessos;
drop policy if exists categorias_select_members on public.categorias;
drop policy if exists categorias_write_admins on public.categorias;
drop policy if exists favoritos_own on public.favoritos;
drop policy if exists mensagens_select_members on public.mensagens;
drop policy if exists mensagens_write_admins on public.mensagens;
drop policy if exists profiles_select_own_or_superadmin on public.profiles;
drop policy if exists profiles_update_superadmin on public.profiles;
drop policy if exists recentes_own on public.recentes;
drop policy if exists solicitacoes_insert_members on public.solicitacoes_mensagem;
drop policy if exists solicitacoes_select_members_or_superadmin on public.solicitacoes_mensagem;
drop policy if exists solicitacoes_update_superadmin on public.solicitacoes_mensagem;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.acessos to authenticated;
grant select, insert, delete on public.acesso_membros to authenticated;
grant select, insert, update on public.categorias to authenticated;
grant select, insert, update on public.mensagens to authenticated;
grant select, insert, delete on public.favoritos to authenticated;
grant select, insert, update, delete on public.recentes to authenticated;
grant select, insert on public.solicitacoes_mensagem to authenticated;
grant select on public.registros_atividade to authenticated;

create policy profiles_select_own_or_superadmin
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select private.is_superadmin()));

create policy profiles_update_superadmin
on public.profiles for update
to authenticated
using ((select private.is_superadmin()))
with check ((select private.is_superadmin()));

create policy acessos_select_authorized_active
on public.acessos for select
to authenticated
using (
  (select private.is_superadmin())
  or (ativo = true and (select private.can_use_access(id)))
);

create policy acessos_insert_superadmin
on public.acessos for insert
to authenticated
with check ((select private.is_superadmin()));

create policy acessos_update_superadmin
on public.acessos for update
to authenticated
using ((select private.is_superadmin()))
with check ((select private.is_superadmin()));

create policy acesso_membros_select_own_or_superadmin
on public.acesso_membros for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_superadmin()));

create policy acesso_membros_insert_superadmin
on public.acesso_membros for insert
to authenticated
with check ((select private.is_superadmin()));

create policy acesso_membros_delete_superadmin
on public.acesso_membros for delete
to authenticated
using ((select private.is_superadmin()));

create policy categorias_select_authorized
on public.categorias for select
to authenticated
using (
  (select private.can_use_access(acesso_id))
  and ((select private.is_superadmin()) or arquivado_em is null)
);

create policy categorias_insert_superadmin
on public.categorias for insert
to authenticated
with check ((select private.is_superadmin()));

create policy categorias_update_superadmin
on public.categorias for update
to authenticated
using ((select private.is_superadmin()))
with check ((select private.is_superadmin()));

create policy mensagens_select_authorized
on public.mensagens for select
to authenticated
using (
  (select private.can_use_access(acesso_id))
  and ((select private.is_superadmin()) or arquivado_em is null)
);

create policy mensagens_insert_superadmin
on public.mensagens for insert
to authenticated
with check ((select private.is_superadmin()));

create policy mensagens_update_superadmin
on public.mensagens for update
to authenticated
using ((select private.is_superadmin()))
with check ((select private.is_superadmin()));

create policy favoritos_select_own_active
on public.favoritos for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.mensagens m
    where m.id = mensagem_id
      and m.arquivado_em is null
      and (select private.can_use_access(m.acesso_id))
  )
);

create policy favoritos_insert_own_active
on public.favoritos for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.mensagens m
    where m.id = mensagem_id
      and m.arquivado_em is null
      and (select private.can_use_access(m.acesso_id))
  )
);

create policy favoritos_delete_own
on public.favoritos for delete
to authenticated
using (user_id = (select auth.uid()));

create policy recentes_select_own_active
on public.recentes for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.mensagens m
    where m.id = mensagem_id
      and m.arquivado_em is null
      and (select private.can_use_access(m.acesso_id))
  )
);

create policy recentes_insert_own_active
on public.recentes for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.mensagens m
    where m.id = mensagem_id
      and m.arquivado_em is null
      and (select private.can_use_access(m.acesso_id))
  )
);

create policy recentes_update_own_active
on public.recentes for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy recentes_delete_own
on public.recentes for delete
to authenticated
using (user_id = (select auth.uid()));

create policy solicitacoes_select_own_or_superadmin
on public.solicitacoes_mensagem for select
to authenticated
using (solicitado_por = (select auth.uid()) or (select private.is_superadmin()));

create policy solicitacoes_insert_own_access
on public.solicitacoes_mensagem for insert
to authenticated
with check (
  solicitado_por = (select auth.uid())
  and status = 'pendente'
  and (select private.can_use_access(acesso_id))
);

create policy registros_atividade_select_superadmin
on public.registros_atividade for select
to authenticated
using ((select private.is_superadmin()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    lower(new.email),
    'colaborador'
  );
  return new;
end;
$$;

create or replace function public.registrar_uso_mensagem(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mensagem_row public.mensagens;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select m.*
  into mensagem_row
  from public.mensagens m
  where m.id = p_message_id;

  if not found or mensagem_row.arquivado_em is not null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if not private.can_use_access(mensagem_row.acesso_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  update public.mensagens
  set frequencia = frequencia + 1
  where id = p_message_id;

  insert into public.recentes (user_id, mensagem_id, used_at)
  values ((select auth.uid()), p_message_id, now())
  on conflict (user_id, mensagem_id)
  do update set used_at = excluded.used_at;
end;
$$;

revoke all on function public.registrar_uso_mensagem(uuid) from public, anon;
grant execute on function public.registrar_uso_mensagem(uuid) to authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

drop function if exists public.increment_frequencia(uuid);
drop function if exists public.aprovar_solicitacao(uuid);
drop function if exists public.rejeitar_solicitacao(uuid, text);
drop function if exists public.is_acesso_admin(uuid);
drop function if exists public.is_acesso_member(uuid);
drop function if exists public.is_superadmin();

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create or replace function private.registrar_mudanca_administrativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
  entity_type text;
  entity_id text;
  access_id uuid;
  action_name text;
begin
  entity_type := case tg_table_name
    when 'mensagens' then 'mensagem'
    when 'categorias' then 'categoria'
    when 'acessos' then 'acesso'
    when 'acesso_membros' then 'liberacao'
    when 'profiles' then 'conta'
    else 'solicitacao'
  end;

  entity_id := case tg_table_name
    when 'acesso_membros' then concat(row_data ->> 'user_id', ':', row_data ->> 'acesso_id')
    else row_data ->> 'id'
  end;

  access_id := case
    when tg_table_name = 'acessos' then (row_data ->> 'id')::uuid
    when row_data ? 'acesso_id' then (row_data ->> 'acesso_id')::uuid
    else null
  end;

  action_name := case
    when tg_op = 'INSERT' then 'criar'
    when tg_op = 'DELETE' then 'remover'
    when old_data ->> 'arquivado_em' is null and new_data ->> 'arquivado_em' is not null then 'arquivar'
    when old_data ->> 'arquivado_em' is not null and new_data ->> 'arquivado_em' is null then 'restaurar'
    else 'editar'
  end;

  insert into public.registros_atividade
    (ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes)
  values (
    (select auth.uid()),
    access_id,
    entity_type,
    entity_id,
    action_name,
    jsonb_build_object('operacao', tg_op)
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.registrar_mudanca_administrativa() from public, anon, authenticated;

drop trigger if exists audit_mensagens_insert on public.mensagens;
create trigger audit_mensagens_insert
after insert on public.mensagens
for each row execute function private.registrar_mudanca_administrativa();

drop trigger if exists audit_mensagens_update on public.mensagens;
create trigger audit_mensagens_update
after update of categoria_id, titulo, conteudo, tags, arquivado_em, arquivado_por on public.mensagens
for each row execute function private.registrar_mudanca_administrativa();

drop trigger if exists audit_categorias on public.categorias;
create trigger audit_categorias
after insert or update on public.categorias
for each row execute function private.registrar_mudanca_administrativa();

drop trigger if exists audit_acessos on public.acessos;
create trigger audit_acessos
after insert or update on public.acessos
for each row execute function private.registrar_mudanca_administrativa();

drop trigger if exists audit_acesso_membros on public.acesso_membros;
create trigger audit_acesso_membros
after insert or delete on public.acesso_membros
for each row execute function private.registrar_mudanca_administrativa();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
after update of nome, email, role, ativo on public.profiles
for each row execute function private.registrar_mudanca_administrativa();
