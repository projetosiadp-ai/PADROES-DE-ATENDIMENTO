begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email)
values
  ('12000000-0000-4000-8000-000000000001', 'solicitante-a@example.test'),
  ('12000000-0000-4000-8000-000000000002', 'solicitante-b@example.test'),
  ('12000000-0000-4000-8000-000000000003', 'revisor@example.test')
on conflict (id) do nothing;

update public.profiles
set nome = case id
  when '12000000-0000-4000-8000-000000000001'::uuid then 'Solicitante A'
  else 'Solicitante B'
end,
role = 'colaborador',
ativo = true
where id in (
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002'
);

update public.profiles
set nome = 'Revisor', role = 'superadmin', ativo = true
where id = '12000000-0000-4000-8000-000000000003';

insert into public.acessos (id, nome, ativo)
values
  ('22000000-0000-4000-8000-000000000001', 'Solicitacoes A', true),
  ('22000000-0000-4000-8000-000000000002', 'Solicitacoes B', true)
on conflict (id) do update
set nome = excluded.nome,
    ativo = excluded.ativo;

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', false),
  ('22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', false)
on conflict (acesso_id, user_id) do update
set is_admin_local = false;

insert into public.categorias (id, acesso_id, nome)
values
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Categoria A'),
  ('23000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'Categoria B');

insert into public.mensagens (
  id, acesso_id, categoria_id, categoria, titulo, conteudo, tags, created_by
)
values
  (
    '24000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'Categoria A', 'Mensagem A', 'Conteudo original A', array['original', 'a'],
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '24000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000002',
    'Categoria B', 'Mensagem B', 'Conteudo original B', array['original', 'b'],
    '12000000-0000-4000-8000-000000000002'
  ),
  (
    '24000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'Categoria A', 'Mensagem para arquivar', 'Conteudo para arquivar', array['arquivar'],
    '12000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
      titulo, conteudo, tags, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A',
      'Nova mensagem',
      'Novo conteudo ainda nao publicado',
      array['nova'],
      (select auth.uid())
    )
  $$,
  'colaborador pode criar solicitacao valida no proprio acesso'
);

select results_eq(
  $$
    select tipo, status, titulo, conteudo
    from public.solicitacoes_mensagem
    where id = '25000000-0000-4000-8000-000000000001'
  $$,
  $$values ('criacao'::text, 'pendente'::text, 'Nova mensagem'::text, 'Novo conteudo ainda nao publicado'::text)$$,
  'criacao preserva a proposta e permanece pendente'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000002',
      '26000000-0000-4000-8000-000000000002',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      (select auth.uid())
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitacoes_mensagem"',
  'criacao exige categoria, titulo e conteudo propostos'
);

select lives_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, mensagem_id, tipo,
      categoria_id, categoria, titulo, conteudo, tags,
      categoria_id_anterior, categoria_anterior, titulo_anterior,
      conteudo_anterior, tags_anterior, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000003',
      '26000000-0000-4000-8000-000000000003',
      '22000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001',
      'edicao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Mensagem A revisada', 'Conteudo proposto A', array['revisada'],
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Mensagem A', 'Conteudo original A', array['original', 'a'],
      (select auth.uid())
    )
  $$,
  'colaborador pode solicitar edicao com retratos anterior e proposto'
);

select results_eq(
  $$
    select titulo_anterior, conteudo_anterior, tags_anterior
    from public.solicitacoes_mensagem
    where id = '25000000-0000-4000-8000-000000000003'
  $$,
  $$values ('Mensagem A'::text, 'Conteudo original A'::text, array['original', 'a']::text[])$$,
  'edicao preserva o retrato anterior da mensagem'
);

select lives_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, mensagem_id, tipo,
      categoria_id_anterior, categoria_anterior, titulo_anterior,
      conteudo_anterior, tags_anterior, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000004',
      '26000000-0000-4000-8000-000000000004',
      '22000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000003',
      'arquivamento',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Mensagem para arquivar', 'Conteudo para arquivar', array['arquivar'],
      (select auth.uid())
    )
  $$,
  'colaborador pode solicitar arquivamento preservando o retrato anterior'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, mensagem_id, tipo,
      categoria_id, categoria, titulo, conteudo, tags,
      categoria_id_anterior, categoria_anterior, titulo_anterior,
      conteudo_anterior, tags_anterior, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000005',
      '26000000-0000-4000-8000-000000000005',
      '22000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000002',
      'edicao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Mensagem cruzada', 'Nao deve ser aceita', array['cruzada'],
      '23000000-0000-4000-8000-000000000002',
      'Categoria B', 'Mensagem B', 'Conteudo original B', array['original', 'b'],
      (select auth.uid())
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitacoes_mensagem"',
  'alvo de edicao deve pertencer ao mesmo acesso autorizado'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
      titulo, conteudo, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000006',
      '26000000-0000-4000-8000-000000000006',
      '22000000-0000-4000-8000-000000000002',
      'criacao',
      '23000000-0000-4000-8000-000000000002',
      'Categoria B', 'Sem acesso', 'Nao deve ser aceita',
      (select auth.uid())
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitacoes_mensagem"',
  'colaborador nao solicita mudanca em acesso nao autorizado'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
      titulo, conteudo, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000007',
      '26000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A',
      'Duplicada', 'Nao deve duplicar',
      (select auth.uid())
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "solicitacoes_solicitante_idempotency_uidx"',
  'mesma chave idempotente nao cria segunda solicitacao'
);

select results_eq(
  $$
    select titulo, conteudo, arquivado_em
    from public.mensagens
    where id = '24000000-0000-4000-8000-000000000001'
  $$,
  $$values ('Mensagem A'::text, 'Conteudo original A'::text, null::timestamptz)$$,
  'solicitacoes pendentes nao alteram a mensagem publicada'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id,
      titulo, conteudo, solicitado_por, revisado_por, revisado_em
    ) values (
      '25000000-0000-4000-8000-000000000008',
      '26000000-0000-4000-8000-000000000008',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      '23000000-0000-4000-8000-000000000001',
      'Falsa revisao', 'Nao deve ser aceita',
      (select auth.uid()), (select auth.uid()), now()
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitacoes_mensagem"',
  'colaborador nao insere solicitacao ja revisada'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, mensagem_id, tipo,
      categoria_id, categoria, titulo, conteudo, tags, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000009',
      '26000000-0000-4000-8000-000000000009',
      '22000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001',
      'edicao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Sem retrato anterior', 'Nao deve ser aceita', array['edicao'],
      (select auth.uid())
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "solicitacoes_mensagem"',
  'edicao exige retrato anterior completo'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
      titulo, conteudo, tags, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000010',
      '26000000-0000-4000-8000-000000000010',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Tags invalidas', 'Nao deve ser aceita', array['duplicada', ' ', 'duplicada'],
      (select auth.uid())
    )
  $$,
  '23514',
  'new row for relation "solicitacoes_mensagem" violates check constraint "solicitacoes_mensagem_tags_check"',
  'tags vazias ou duplicadas sao rejeitadas'
);

select lives_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
      titulo, conteudo, tags, solicitado_por
    ) values (
      '25000000-0000-4000-8000-000000000011',
      '26000000-0000-4000-8000-000000000011',
      '22000000-0000-4000-8000-000000000001',
      'criacao',
      '23000000-0000-4000-8000-000000000001',
      'Categoria A', 'Mensagem rejeitada', 'Conteudo rejeitado', array['rejeitar'],
      (select auth.uid())
    )
  $$,
  'solicitacao valida fica disponivel para rejeicao motivada'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000003';

select lives_ok(
  $$select * from public.aprovar_solicitacao('25000000-0000-4000-8000-000000000001')$$,
  'superadministrador aprova criacao pendente uma unica vez'
);

select results_eq(
  $$
    select s.status, m.titulo, m.conteudo, m.arquivado_em is null
    from public.solicitacoes_mensagem s
    join public.mensagens m on m.id = s.mensagem_id
    where s.id = '25000000-0000-4000-8000-000000000001'
  $$,
  $$values ('aprovada'::text, 'Nova mensagem'::text, 'Novo conteudo ainda nao publicado'::text, true)$$,
  'aprovar criacao publica exatamente o snapshot proposto'
);

select lives_ok(
  $$select * from public.aprovar_solicitacao('25000000-0000-4000-8000-000000000003')$$,
  'superadministrador aprova edicao pendente'
);

select results_eq(
  $$
    select id, titulo, conteudo, tags
    from public.mensagens
    where id = '24000000-0000-4000-8000-000000000001'
  $$,
  $$values (
    '24000000-0000-4000-8000-000000000001'::uuid,
    'Mensagem A revisada'::text,
    'Conteudo proposto A'::text,
    array['revisada']::text[]
  )$$,
  'aprovar edicao preserva o id e aplica o snapshot proposto'
);

select lives_ok(
  $$select * from public.aprovar_solicitacao('25000000-0000-4000-8000-000000000004')$$,
  'superadministrador aprova arquivamento pendente'
);

select results_eq(
  $$
    select arquivado_em is not null, arquivado_por
    from public.mensagens
    where id = '24000000-0000-4000-8000-000000000003'
  $$,
  $$values (true, '12000000-0000-4000-8000-000000000003'::uuid)$$,
  'aprovar arquivamento retira a mensagem da biblioteca sem exclui-la'
);

select lives_ok(
  $$select * from public.rejeitar_solicitacao('25000000-0000-4000-8000-000000000011', '  Fora do padrao editorial  ')$$,
  'superadministrador rejeita solicitacao com motivo'
);

select results_eq(
  $$
    select status, motivo_rejeicao, revisado_por, revisado_em is not null
    from public.solicitacoes_mensagem
    where id = '25000000-0000-4000-8000-000000000011'
  $$,
  $$values (
    'rejeitada'::text,
    'Fora do padrao editorial'::text,
    '12000000-0000-4000-8000-000000000003'::uuid,
    true
  )$$,
  'rejeicao grava motivo normalizado, ator e data'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('25000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'CONFLICT:REQUEST_ALREADY_REVIEWED',
  'segunda aprovacao concorrente nao reaplica a solicitacao'
);

select throws_ok(
  $$select * from public.rejeitar_solicitacao('25000000-0000-4000-8000-000000000011', 'Outro motivo')$$,
  'P0001',
  'CONFLICT:REQUEST_ALREADY_REVIEWED',
  'estado final rejeitado e imutavel'
);

select * from finish();
rollback;
