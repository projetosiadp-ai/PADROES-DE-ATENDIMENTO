-- Etapa 5 (Design 2.0): revisão com ajustes, comentário da decisão e versão publicada.
-- Aditiva e compatível com o frontend em produção: chamadas antigas de aprovar_solicitacao só
-- com p_id continuam válidas, e rejeitar_solicitacao mantém a assinatura e segue gravando
-- motivo_rejeicao durante a transição.

alter table public.solicitacoes_mensagem
  add column if not exists categoria_id_publicada uuid
    references public.categorias(id) on delete restrict,
  add column if not exists categoria_publicada text,
  add column if not exists titulo_publicado text,
  add column if not exists conteudo_publicado text,
  add column if not exists tags_publicadas text[],
  add column if not exists comentario_revisao text,
  add column if not exists ajustada boolean not null default false;

-- Backfill: decisões antigas não tinham versão publicada separada nem comentário de aprovação.
update public.solicitacoes_mensagem
set categoria_id_publicada = categoria_id,
    categoria_publicada = categoria,
    titulo_publicado = btrim(titulo),
    conteudo_publicado = btrim(conteudo),
    tags_publicadas = coalesce(tags, '{}'::text[]),
    ajustada = false
where status = 'aprovada'
  and tipo in ('criacao', 'edicao')
  and titulo_publicado is null;

update public.solicitacoes_mensagem
set comentario_revisao = left(btrim(motivo_rejeicao), 500)
where status = 'rejeitada'
  and comentario_revisao is null
  and nullif(btrim(motivo_rejeicao), '') is not null;

-- Pedido pendente nunca carrega dados de revisão: impede que o colaborador envie comentário,
-- versão publicada ou "ajustada" junto com a solicitação.
alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_pendente_sem_revisao_check
  check (
    status <> 'pendente'
    or (
      categoria_id_publicada is null
      and categoria_publicada is null
      and titulo_publicado is null
      and conteudo_publicado is null
      and tags_publicadas is null
      and comentario_revisao is null
      and ajustada = false
    )
  );

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_ajustada_check
  check (not ajustada or (status = 'aprovada' and tipo in ('criacao', 'edicao')));

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_arquivamento_sem_publicacao_check
  check (
    tipo in ('criacao', 'edicao')
    or (
      categoria_id_publicada is null
      and categoria_publicada is null
      and titulo_publicado is null
      and conteudo_publicado is null
      and tags_publicadas is null
    )
  );

-- As regras abaixo valem para decisões novas; NOT VALID evita que linhas antigas fora do
-- formato atual bloqueiem a migração.
alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_revisao_textos_check
  check (
    (titulo_publicado is null or char_length(btrim(titulo_publicado)) between 1 and 100)
    and (conteudo_publicado is null or char_length(btrim(conteudo_publicado)) between 1 and 2000)
    and (comentario_revisao is null or char_length(btrim(comentario_revisao)) between 1 and 500)
    and private.request_tags_are_valid(tags_publicadas)
  ) not valid;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_rejeitada_comentario_check
  check (status <> 'rejeitada' or comentario_revisao is not null) not valid;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_publicada_completa_check
  check (
    status <> 'aprovada'
    or tipo not in ('criacao', 'edicao')
    or (
      categoria_id_publicada is not null
      and categoria_publicada is not null
      and titulo_publicado is not null
      and conteudo_publicado is not null
    )
  ) not valid;

-- Leituras paginadas de "Suas solicitações" e do histórico.
create index if not exists solicitacoes_solicitante_criado_em_idx
  on public.solicitacoes_mensagem (solicitado_por, criado_em desc);
create index if not exists solicitacoes_criado_em_idx
  on public.solicitacoes_mensagem (criado_em desc);

drop function if exists public.aprovar_solicitacao(uuid);

create function public.aprovar_solicitacao(
  p_id uuid,
  p_ajustes jsonb default null,
  p_comentario text default null
)
returns table(request_id uuid, status text, message_id uuid, ajustada boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  request_row public.solicitacoes_mensagem;
  applied_message_id uuid;
  normalized_comment text := nullif(btrim(coalesce(p_comentario, '')), '');
  final_category_id uuid;
  final_category_name text;
  final_title text;
  final_content text;
  final_tags text[];
  was_adjusted boolean := false;
begin
  if not private.is_superadmin() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if normalized_comment is not null and char_length(normalized_comment) > 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION:REVIEW_COMMENT';
  end if;
  if p_ajustes is not null and jsonb_typeof(p_ajustes) <> 'object' then
    raise exception using errcode = 'P0001', message = 'VALIDATION:ADJUSTMENTS';
  end if;

  select s.* into request_row
  from public.solicitacoes_mensagem s
  where s.id = p_id
  for update;

  if not found or request_row.status <> 'pendente' then
    raise exception using errcode = 'P0001', message = 'CONFLICT:REQUEST_ALREADY_REVIEWED';
  end if;

  if p_ajustes is not null and request_row.tipo not in ('criacao', 'edicao') then
    raise exception using errcode = 'P0001', message = 'VALIDATION:ADJUSTMENTS_NOT_ALLOWED';
  end if;

  if request_row.tipo in ('criacao', 'edicao') then
    -- Versão final = proposta sobrescrita pelas chaves presentes em p_ajustes.
    final_category_id := request_row.categoria_id;
    final_title := btrim(request_row.titulo);
    final_content := btrim(request_row.conteudo);
    final_tags := coalesce(request_row.tags, '{}'::text[]);

    if p_ajustes is not null then
      if p_ajustes ? 'categoria_id' then
        begin
          final_category_id := (p_ajustes->>'categoria_id')::uuid;
        exception when invalid_text_representation then
          raise exception using errcode = 'P0001', message = 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS';
        end;
      end if;
      if p_ajustes ? 'titulo' then
        final_title := btrim(coalesce(p_ajustes->>'titulo', ''));
      end if;
      if p_ajustes ? 'conteudo' then
        final_content := btrim(coalesce(p_ajustes->>'conteudo', ''));
      end if;
      if p_ajustes ? 'tags' then
        if jsonb_typeof(p_ajustes->'tags') <> 'array' then
          raise exception using errcode = 'P0001', message = 'VALIDATION:TAGS';
        end if;
        select coalesce(array_agg(btrim(item.tag) order by item.position), '{}'::text[])
        into final_tags
        from jsonb_array_elements_text(p_ajustes->'tags') with ordinality as item(tag, position);
      end if;
    end if;

    if final_title is null or char_length(final_title) not between 1 and 100 then
      raise exception using errcode = 'P0001', message = 'VALIDATION:TITLE';
    end if;
    if final_content is null or char_length(final_content) not between 1 and 2000 then
      raise exception using errcode = 'P0001', message = 'VALIDATION:CONTENT';
    end if;
    if not private.request_tags_are_valid(final_tags) then
      raise exception using errcode = 'P0001', message = 'VALIDATION:TAGS';
    end if;

    select c.nome into final_category_name
    from public.categorias c
    where c.id = final_category_id
      and c.acesso_id = request_row.acesso_id
      and c.arquivado_em is null;
    if not found then
      raise exception using errcode = 'P0001', message = 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS';
    end if;

    was_adjusted := p_ajustes is not null and (
      final_category_id is distinct from request_row.categoria_id
      or final_title is distinct from btrim(request_row.titulo)
      or final_content is distinct from btrim(request_row.conteudo)
      or final_tags is distinct from coalesce(request_row.tags, '{}'::text[])
    );
  end if;

  if request_row.tipo = 'criacao' then
    insert into public.mensagens (
      acesso_id, categoria_id, categoria, titulo, conteudo, tags, created_by
    ) values (
      request_row.acesso_id, final_category_id, final_category_name,
      final_title, final_content, final_tags, (select auth.uid())
    ) returning id into applied_message_id;
  elsif request_row.tipo = 'edicao' then
    update public.mensagens m
    set categoria_id = final_category_id,
        categoria = final_category_name,
        titulo = final_title,
        conteudo = final_content,
        tags = final_tags,
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
  set status = 'aprovada',
      mensagem_id = applied_message_id,
      revisado_por = (select auth.uid()),
      revisado_em = now(),
      motivo_rejeicao = null,
      categoria_id_publicada = final_category_id,
      categoria_publicada = final_category_name,
      titulo_publicado = final_title,
      conteudo_publicado = final_content,
      tags_publicadas = case when request_row.tipo in ('criacao', 'edicao') then final_tags end,
      ajustada = was_adjusted,
      comentario_revisao = normalized_comment
  where s.id = p_id;

  insert into public.registros_atividade (
    ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes
  ) values (
    (select auth.uid()), request_row.acesso_id, 'solicitacao', p_id::text, 'aprovar',
    jsonb_build_object(
      'tipo', request_row.tipo,
      'mensagem_id', applied_message_id,
      'ajustada', was_adjusted,
      'comentario_tamanho', coalesce(char_length(normalized_comment), 0)
    )
  );

  return query select p_id, 'aprovada'::text, applied_message_id, was_adjusted;
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
      motivo_rejeicao = normalized_reason,
      comentario_revisao = normalized_reason
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

-- As regras de etiquetas chamam esta função; sem a permissão, gravações feitas pelo service_role
-- (rotinas administrativas e fixtures locais) eram recusadas.
grant execute on function private.request_tags_are_valid(text[]) to service_role;

revoke all on function public.aprovar_solicitacao(uuid, jsonb, text) from public, anon;
revoke all on function public.rejeitar_solicitacao(uuid, text) from public, anon;

grant execute on function public.aprovar_solicitacao(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.rejeitar_solicitacao(uuid, text) to authenticated, service_role;
