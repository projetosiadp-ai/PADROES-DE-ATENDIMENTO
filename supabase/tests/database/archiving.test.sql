begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_column('public', 'categorias', 'arquivado_em', 'categorias registra quando foi arquivada');
select has_column('public', 'categorias', 'arquivado_por', 'categorias registra quem arquivou');
select has_column('public', 'mensagens', 'categoria_id', 'mensagens referencia a categoria normalizada');
select has_column('public', 'mensagens', 'arquivado_em', 'mensagens registra quando foi arquivada');
select has_column('public', 'mensagens', 'arquivado_por', 'mensagens registra quem arquivou');

insert into auth.users (id, email)
values ('11000000-0000-4000-8000-000000000001', 'arquivador@example.test');

update public.profiles
set nome = 'Arquivador', role = 'superadmin'
where id = '11000000-0000-4000-8000-000000000001';

insert into public.acessos (id, nome)
values ('21000000-0000-4000-8000-000000000001', 'Acesso de arquivamento');

insert into public.categorias (id, acesso_id, nome)
values ('22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Categoria preservada');

insert into public.categorias (id, acesso_id, nome)
values ('22000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'Categoria vazia');

insert into public.mensagens (id, acesso_id, categoria, titulo, conteudo)
values ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Categoria preservada', 'Mensagem preservada', 'Conteudo preservado');

insert into public.favoritos (user_id, mensagem_id)
values ('11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001');

insert into public.recentes (user_id, mensagem_id)
values ('11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001');

create or replace function pg_temp.archive_state_is_consistent()
returns boolean
language plpgsql
as $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mensagens' and column_name = 'arquivado_em'
  ) then
    return false;
  end if;

  begin
    execute $sql$
      update public.mensagens
      set arquivado_em = now(), arquivado_por = null
      where id = '31000000-0000-4000-8000-000000000001'
    $sql$;
    return false;
  exception
    when check_violation then return true;
  end;
end;
$$;

create or replace function pg_temp.archive_preserves_associations()
returns boolean
language plpgsql
as $$
declare
  result boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mensagens' and column_name = 'arquivado_por'
  ) then
    return false;
  end if;

  execute $sql$
    update public.mensagens
    set arquivado_em = now(),
        arquivado_por = '11000000-0000-4000-8000-000000000001'
    where id = '31000000-0000-4000-8000-000000000001'
  $sql$;

  select
    exists (select 1 from public.mensagens where id = '31000000-0000-4000-8000-000000000001')
    and exists (select 1 from public.favoritos where mensagem_id = '31000000-0000-4000-8000-000000000001')
    and exists (select 1 from public.recentes where mensagem_id = '31000000-0000-4000-8000-000000000001')
  into result;

  return result;
exception
  when undefined_column then return false;
end;
$$;

select ok(pg_temp.archive_state_is_consistent(), 'data e ator de arquivamento mudam juntos');
select ok(pg_temp.archive_preserves_associations(), 'arquivamento preserva mensagem, favorito e uso recente');
select is(
  (select id from public.mensagens where titulo = 'Mensagem preservada'),
  '31000000-0000-4000-8000-000000000001'::uuid,
  'arquivamento preserva o identificador da mensagem'
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select * from public.restaurar_mensagem('31000000-0000-4000-8000-000000000001')$$,
  'superadministrador restaura mensagem arquivada'
);

select results_eq(
  $$
    select m.id, m.arquivado_em is null,
      exists(select 1 from public.favoritos f where f.mensagem_id = m.id),
      exists(select 1 from public.recentes r where r.mensagem_id = m.id)
    from public.mensagens m
    where m.id = '31000000-0000-4000-8000-000000000001'
  $$,
  $$values ('31000000-0000-4000-8000-000000000001'::uuid, true, true, true)$$,
  'restauracao preserva o mesmo id, favorito e uso recente'
);

select throws_ok(
  $$select * from public.restaurar_mensagem('31000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'CONFLICT:MESSAGE_ALREADY_ACTIVE',
  'restaurar mensagem ativa retorna conflito'
);

select throws_ok(
  $$select * from public.arquivar_categoria('22000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'CONFLICT:CATEGORY_NOT_EMPTY:1',
  'categoria com mensagem ativa nao pode ser arquivada'
);

select lives_ok(
  $$select * from public.arquivar_categoria('22000000-0000-4000-8000-000000000002')$$,
  'categoria vazia pode ser arquivada'
);

select results_eq(
  $$
    select arquivado_em is not null, arquivado_por
    from public.categorias
    where id = '22000000-0000-4000-8000-000000000002'
  $$,
  $$values (true, '11000000-0000-4000-8000-000000000001'::uuid)$$,
  'arquivamento de categoria registra data e ator'
);

select lives_ok(
  $$select * from public.restaurar_categoria('22000000-0000-4000-8000-000000000002')$$,
  'categoria arquivada e restaurada sem trocar o identificador'
);

select * from finish();
rollback;
