-- Transactional content lifecycle and request review.

create or replace function public.arquivar_mensagem(p_message_id uuid)
returns public.mensagens
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.mensagens;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select m.* into result
  from public.mensagens m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if result.arquivado_em is not null then
    raise exception using errcode = 'P0001', message = 'CONFLICT:MESSAGE_ALREADY_ARCHIVED';
  end if;

  update public.mensagens
  set arquivado_em = now(), arquivado_por = (select auth.uid()), updated_at = now()
  where id = p_message_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.restaurar_mensagem(p_message_id uuid)
returns public.mensagens
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.mensagens;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select m.* into result
  from public.mensagens m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if result.arquivado_em is null then
    raise exception using errcode = 'P0001', message = 'CONFLICT:MESSAGE_ALREADY_ACTIVE';
  end if;
  if not exists (
    select 1 from public.categorias c
    where c.id = result.categoria_id and c.acesso_id = result.acesso_id and c.arquivado_em is null
  ) then
    raise exception using errcode = 'P0001', message = 'CONFLICT:CATEGORY_NOT_ACTIVE';
  end if;

  update public.mensagens
  set arquivado_em = null, arquivado_por = null, updated_at = now()
  where id = p_message_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.arquivar_categoria(p_category_id uuid)
returns public.categorias
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.categorias;
  active_count integer;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select c.* into result
  from public.categorias c
  where c.id = p_category_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if result.arquivado_em is not null then
    raise exception using errcode = 'P0001', message = 'CONFLICT:CATEGORY_ALREADY_ARCHIVED';
  end if;

  select count(*)::integer into active_count
  from public.mensagens m
  where m.categoria_id = p_category_id and m.arquivado_em is null;
  if active_count > 0 then
    raise exception using errcode = 'P0001', message = 'CONFLICT:CATEGORY_NOT_EMPTY:' || active_count;
  end if;

  update public.categorias
  set arquivado_em = now(), arquivado_por = (select auth.uid()), updated_at = now()
  where id = p_category_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.restaurar_categoria(p_category_id uuid)
returns public.categorias
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.categorias;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select c.* into result
  from public.categorias c
  where c.id = p_category_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if result.arquivado_em is null then
    raise exception using errcode = 'P0001', message = 'CONFLICT:CATEGORY_ALREADY_ACTIVE';
  end if;

  update public.categorias
  set arquivado_em = null, arquivado_por = null, updated_at = now()
  where id = p_category_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.aprovar_solicitacao(p_id uuid)
returns table(request_id uuid, status text, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.solicitacoes_mensagem;
  applied_message_id uuid;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select s.* into request_row
  from public.solicitacoes_mensagem s
  where s.id = p_id
  for update;

  if not found or request_row.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'CONFLICT:REQUEST_ALREADY_REVIEWED';
  end if;

  if request_row.tipo = 'criacao' then
    insert into public.mensagens (
      acesso_id, categoria_id, categoria, titulo, conteudo, tags, created_by
    ) values (
      request_row.acesso_id, request_row.categoria_id, request_row.categoria,
      btrim(request_row.titulo), btrim(request_row.conteudo), coalesce(request_row.tags, '{}'::text[]),
      (select auth.uid())
    ) returning id into applied_message_id;
  elsif request_row.tipo = 'edicao' then
    update public.mensagens m
    set categoria_id = request_row.categoria_id,
        categoria = request_row.categoria,
        titulo = btrim(request_row.titulo),
        conteudo = btrim(request_row.conteudo),
        tags = coalesce(request_row.tags, '{}'::text[]),
        updated_at = now()
    where m.id = request_row.mensagem_id
      and m.acesso_id = request_row.acesso_id
      and m.arquivado_em is null
      and m.categoria_id = request_row.categoria_id_anterior
      and m.categoria = request_row.categoria_anterior
      and m.titulo = request_row.titulo_anterior
      and m.conteudo = request_row.conteudo_anterior
      and m.tags is not distinct from request_row.tags_anterior
    returning m.id into applied_message_id;
    if applied_message_id is null then
      raise exception using errcode = 'P0001', message = 'CONFLICT:REQUEST_STALE';
    end if;
  elsif request_row.tipo in ('arquivamento', 'exclusao') then
    update public.mensagens m
    set arquivado_em = now(), arquivado_por = (select auth.uid()), updated_at = now()
    where m.id = request_row.mensagem_id
      and m.acesso_id = request_row.acesso_id
      and m.arquivado_em is null
      and m.categoria_id = request_row.categoria_id_anterior
      and m.categoria = request_row.categoria_anterior
      and m.titulo = request_row.titulo_anterior
      and m.conteudo = request_row.conteudo_anterior
      and m.tags is not distinct from request_row.tags_anterior
    returning m.id into applied_message_id;
    if applied_message_id is null then
      raise exception using errcode = 'P0001', message = 'CONFLICT:REQUEST_STALE';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'VALIDATION:REQUEST_TYPE';
  end if;

  update public.solicitacoes_mensagem s
  set status = 'aprovada', mensagem_id = applied_message_id,
      revisado_por = (select auth.uid()), revisado_em = now(), motivo_rejeicao = null
  where s.id = p_id;

  insert into public.registros_atividade (
    ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes
  ) values (
    (select auth.uid()), request_row.acesso_id, 'solicitacao', p_id::text, 'aprovar',
    jsonb_build_object('tipo', request_row.tipo, 'mensagem_id', applied_message_id)
  );

  return query select p_id, 'aprovada'::text, applied_message_id;
end;
$$;

create or replace function public.rejeitar_solicitacao(p_id uuid, p_motivo text)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.solicitacoes_mensagem;
  normalized_reason text := btrim(p_motivo);
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if normalized_reason is null or char_length(normalized_reason) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION:REJECTION_REASON';
  end if;

  select s.* into request_row
  from public.solicitacoes_mensagem s
  where s.id = p_id
  for update;

  if not found or request_row.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'CONFLICT:REQUEST_ALREADY_REVIEWED';
  end if;

  update public.solicitacoes_mensagem s
  set status = 'rejeitada', revisado_por = (select auth.uid()), revisado_em = now(),
      motivo_rejeicao = normalized_reason
  where s.id = p_id;

  insert into public.registros_atividade (
    ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes
  ) values (
    (select auth.uid()), request_row.acesso_id, 'solicitacao', p_id::text, 'rejeitar',
    jsonb_build_object('tipo', request_row.tipo, 'motivo_tamanho', char_length(normalized_reason))
  );

  return query select p_id, 'rejeitada'::text;
end;
$$;

revoke all on function public.arquivar_mensagem(uuid) from public, anon;
revoke all on function public.restaurar_mensagem(uuid) from public, anon;
revoke all on function public.arquivar_categoria(uuid) from public, anon;
revoke all on function public.restaurar_categoria(uuid) from public, anon;
revoke all on function public.aprovar_solicitacao(uuid) from public, anon;
revoke all on function public.rejeitar_solicitacao(uuid, text) from public, anon;

grant execute on function public.arquivar_mensagem(uuid) to authenticated, service_role;
grant execute on function public.restaurar_mensagem(uuid) to authenticated, service_role;
grant execute on function public.arquivar_categoria(uuid) to authenticated, service_role;
grant execute on function public.restaurar_categoria(uuid) to authenticated, service_role;
grant execute on function public.aprovar_solicitacao(uuid) to authenticated, service_role;
grant execute on function public.rejeitar_solicitacao(uuid, text) to authenticated, service_role;
