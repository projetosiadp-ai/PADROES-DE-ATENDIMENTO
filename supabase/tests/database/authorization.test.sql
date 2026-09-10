begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'colaborador-a@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'colaborador-b@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'superadmin@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'inativo@example.test')
on conflict (id) do nothing;

update public.profiles
set nome = case id
  when '10000000-0000-4000-8000-000000000001'::uuid then 'Colaborador A'
  when '10000000-0000-4000-8000-000000000002'::uuid then 'Colaborador B'
  when '10000000-0000-4000-8000-000000000003'::uuid then 'Superadministrador'
  else 'Conta inativa'
end,
role = case
  when id = '10000000-0000-4000-8000-000000000003'::uuid then 'superadmin'
  else role
end,
ativo = id <> '10000000-0000-4000-8000-000000000004'::uuid;

insert into public.acessos (id, nome, ativo)
values
  ('20000000-0000-4000-8000-000000000001', 'Acesso A', true),
  ('20000000-0000-4000-8000-000000000002', 'Acesso B', true),
  ('20000000-0000-4000-8000-000000000003', 'Acesso inativo', false)
on conflict (id) do update
set nome = excluded.nome,
    ativo = excluded.ativo;

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', false),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', false),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', false)
on conflict (acesso_id, user_id) do update
set is_admin_local = false;

insert into public.categorias (id, acesso_id, nome)
values
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Geral'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Geral'),
  ('21000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Geral');

insert into public.mensagens (id, acesso_id, categoria, titulo, conteudo)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Geral', 'Mensagem A', 'Conteudo A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Geral', 'Mensagem B', 'Conteudo B'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Geral', 'Mensagem inativa', 'Conteudo inativo');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq(
  $$select role from public.profiles where id = (select auth.uid())$$,
  array['colaborador'::text],
  'novas contas recebem somente o papel colaborador'
);

select results_eq(
  $$
    select id
    from public.acessos
    where id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  array['20000000-0000-4000-8000-000000000001'::uuid],
  'colaborador ve somente o acesso ativo ao qual esta vinculado'
);

select results_eq(
  $$
    select id
    from public.mensagens
    where id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  array['30000000-0000-4000-8000-000000000001'::uuid],
  'colaborador nao ve mensagens de outro acesso nem de acesso inativo'
);

select throws_ok(
  $$
    insert into public.mensagens (
      id, acesso_id, categoria_id, categoria, titulo, conteudo
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      'Geral', 'Publicacao indevida', 'Nao deve ser publicada'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "mensagens"',
  'colaborador nao publica mensagem diretamente'
);

select throws_ok(
  $$
    update public.solicitacoes_mensagem
    set status = 'aprovada'
    where solicitado_por = (select auth.uid())
  $$,
  '42501',
  'permission denied for table solicitacoes_mensagem',
  'colaborador nao aprova solicitacao diretamente'
);

select results_eq(
  $$
    with alterados as (
      update public.profiles
      set role = 'superadmin'
      where id = (select auth.uid())
      returning id
    )
    select id from alterados
  $$,
  array[]::uuid[],
  'colaborador nao promove a propria conta'
);

select throws_ok(
  $$insert into public.acessos (nome) values ('Acesso indevido')$$,
  '42501',
  'new row violates row-level security policy for table "acessos"',
  'colaborador nao cria acesso diretamente'
);

select throws_ok(
  $$
    insert into public.acesso_membros (acesso_id, user_id)
    values ('20000000-0000-4000-8000-000000000002', (select auth.uid()))
  $$,
  '42501',
  'new row violates row-level security policy for table "acesso_membros"',
  'colaborador nao cria vinculo diretamente'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';

select is((select count(*) from public.acessos), 0::bigint, 'conta inativa nao pode usar acessos');
select is((select count(*) from public.mensagens), 0::bigint, 'conta inativa nao pode ler mensagens');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select results_eq(
  $$
    select id
    from public.acessos
    where id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  array[
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid
  ],
  'superadmin ve todos os acessos sem precisar de vinculo'
);

select results_eq(
  $$
    select id
    from public.mensagens
    where id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  array[
    '30000000-0000-4000-8000-000000000001'::uuid,
    '30000000-0000-4000-8000-000000000002'::uuid
  ],
  'superadmin nao recebe conteudo de acesso inativo'
);

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', false);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$select id from public.acessos order by id$$,
  array[
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid
  ],
  'novo vinculo libera somente o acesso concedido ao colaborador'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
update public.acessos set ativo = false where id = '20000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$select id from public.acessos order by id$$,
  array['20000000-0000-4000-8000-000000000002'::uuid],
  'desativar acesso remove imediatamente sua visibilidade'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
update public.acessos set ativo = true where id = '20000000-0000-4000-8000-000000000001';
delete from public.acesso_membros
where acesso_id = '20000000-0000-4000-8000-000000000002'
  and user_id = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$select id from public.acessos order by id$$,
  array['20000000-0000-4000-8000-000000000001'::uuid],
  'remover vinculo revoga somente o acesso removido e preserva os demais'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
update public.profiles set ativo = false where id = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select is((select count(*) from public.acessos), 0::bigint, 'desativar conta revoga todos os acessos');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
update public.profiles set ativo = true where id = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$select id from public.acessos order by id$$,
  array['20000000-0000-4000-8000-000000000001'::uuid],
  'reativar conta restaura somente os vinculos ainda existentes'
);

reset role;
set local role anon;
set local request.jwt.claim.sub = '';

select ok(
  not has_table_privilege('anon', 'public.mensagens', 'select'),
  'anonimo nao recebe leitura de mensagens pela Data API'
);

select * from finish();
rollback;
