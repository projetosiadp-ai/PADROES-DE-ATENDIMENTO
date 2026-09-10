-- Submission contract for collaborator message requests.
-- Existing reviewed legacy rows remain valid; every new pending row must use
-- one of the three current request shapes.

update public.solicitacoes_mensagem
set tipo = 'arquivamento'
where tipo = 'exclusao'
  and status = 'pendente';

create or replace function private.request_tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tags is null or (
    not exists (
      select 1
      from unnest(p_tags) as item(tag)
      where btrim(item.tag) = ''
    )
    and (
      select count(*) = count(distinct lower(btrim(item.tag)))
      from unnest(p_tags) as item(tag)
    )
  );
$$;

revoke all on function private.request_tags_are_valid(text[]) from public, anon, authenticated;

alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_formato_check;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_formato_check
  check (
    status <> 'pendente'
    or (
      tipo = 'criacao'
      and mensagem_id is null
      and categoria_id is not null
      and char_length(btrim(titulo)) between 1 and 100
      and char_length(btrim(conteudo)) between 1 and 2000
      and categoria_id_anterior is null
      and categoria_anterior is null
      and titulo_anterior is null
      and conteudo_anterior is null
      and tags_anterior is null
    )
    or (
      tipo = 'edicao'
      and mensagem_id is not null
      and categoria_id is not null
      and char_length(btrim(titulo)) between 1 and 100
      and char_length(btrim(conteudo)) between 1 and 2000
      and categoria_id_anterior is not null
      and categoria_anterior is not null
      and titulo_anterior is not null
      and conteudo_anterior is not null
    )
    or (
      tipo = 'arquivamento'
      and mensagem_id is not null
      and categoria_id is null
      and categoria is null
      and titulo is null
      and conteudo is null
      and tags is null
      and categoria_id_anterior is not null
      and categoria_anterior is not null
      and titulo_anterior is not null
      and conteudo_anterior is not null
    )
  ) not valid;

alter table public.solicitacoes_mensagem
  drop constraint if exists solicitacoes_mensagem_tags_check;

alter table public.solicitacoes_mensagem
  add constraint solicitacoes_mensagem_tags_check
  check (
    private.request_tags_are_valid(tags)
    and private.request_tags_are_valid(tags_anterior)
  ) not valid;

drop policy if exists solicitacoes_insert_own_access on public.solicitacoes_mensagem;

create policy solicitacoes_insert_own_access
on public.solicitacoes_mensagem for insert
to authenticated
with check (
  solicitado_por = (select auth.uid())
  and status = 'pendente'
  and revisado_por is null
  and revisado_em is null
  and motivo_rejeicao is null
  and (select private.can_use_access(acesso_id))
  and (
    (
      tipo = 'criacao'
      and exists (
        select 1
        from public.categorias as c
        where c.id = categoria_id
          and c.acesso_id = solicitacoes_mensagem.acesso_id
          and c.arquivado_em is null
          and c.nome = solicitacoes_mensagem.categoria
      )
    )
    or (
      tipo = 'edicao'
      and exists (
        select 1
        from public.mensagens as m
        where m.id = mensagem_id
          and m.acesso_id = solicitacoes_mensagem.acesso_id
          and m.arquivado_em is null
          and m.categoria_id = categoria_id_anterior
          and m.categoria = categoria_anterior
          and m.titulo = titulo_anterior
          and m.conteudo = conteudo_anterior
          and m.tags is not distinct from tags_anterior
      )
      and exists (
        select 1
        from public.categorias as c
        where c.id = categoria_id
          and c.acesso_id = solicitacoes_mensagem.acesso_id
          and c.arquivado_em is null
          and c.nome = solicitacoes_mensagem.categoria
      )
    )
    or (
      tipo = 'arquivamento'
      and exists (
        select 1
        from public.mensagens as m
        where m.id = mensagem_id
          and m.acesso_id = solicitacoes_mensagem.acesso_id
          and m.arquivado_em is null
          and m.categoria_id = categoria_id_anterior
          and m.categoria = categoria_anterior
          and m.titulo = titulo_anterior
          and m.conteudo = conteudo_anterior
          and m.tags is not distinct from tags_anterior
      )
    )
  )
);
