begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

-- Pessoas: dois colaboradores em acessos diferentes e um superadministrador.
insert into auth.users (id, email)
values
  ('13000000-0000-4000-8000-000000000001', 'revisao-colab-a@example.test'),
  ('13000000-0000-4000-8000-000000000002', 'revisao-colab-b@example.test'),
  ('13000000-0000-4000-8000-000000000003', 'revisao-super@example.test')
on conflict (id) do nothing;

update public.profiles
set nome = case id
  when '13000000-0000-4000-8000-000000000001'::uuid then 'Colab Revisao A'
  else 'Colab Revisao B'
end,
role = 'colaborador',
ativo = true
where id in ('13000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002');

update public.profiles
set nome = 'Super Revisao', role = 'superadmin', ativo = true
where id = '13000000-0000-4000-8000-000000000003';

insert into public.acessos (id, nome, ativo)
values
  ('27000000-0000-4000-8000-000000000001', 'Revisao A', true),
  ('27000000-0000-4000-8000-000000000002', 'Revisao B', true)
on conflict (id) do update set nome = excluded.nome, ativo = excluded.ativo;

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
values
  ('27000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', false),
  ('27000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', false)
on conflict (acesso_id, user_id) do update set is_admin_local = false;

insert into public.categorias (id, acesso_id, nome, arquivado_em, arquivado_por)
values
  ('28000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Revisao Um', null, null),
  ('28000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', 'Revisao Dois', null, null),
  ('28000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', 'Revisao Arquivada', now(),
   '13000000-0000-4000-8000-000000000003'),
  ('28000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000002', 'Revisao Outro Acesso', null, null);

insert into public.mensagens (id, acesso_id, categoria_id, categoria, titulo, conteudo, tags, created_by)
values
  ('29000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Editar com ajuste', 'Texto antes', array['antes'],
   '13000000-0000-4000-8000-000000000003'),
  ('29000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Para arquivar', 'Texto arquivavel', array['arq'],
   '13000000-0000-4000-8000-000000000003'),
  ('29000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Vai mudar', 'Texto que muda', array['muda'],
   '13000000-0000-4000-8000-000000000003');

-- Solicitações pendentes, no formato atual.
insert into public.solicitacoes_mensagem (
  id, idempotency_key, acesso_id, mensagem_id, tipo,
  categoria_id, categoria, titulo, conteudo, tags,
  categoria_id_anterior, categoria_anterior, titulo_anterior, conteudo_anterior, tags_anterior,
  solicitado_por
) values
  ('2a000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
   '27000000-0000-4000-8000-000000000001', null, 'criacao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Chamada antiga', 'Aprovada so com o id', array['antiga'],
   null, null, null, null, null, '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002',
   '27000000-0000-4000-8000-000000000001', null, 'criacao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Sem ajuste', 'Aprovada com comentario', array['comentada'],
   null, null, null, null, null, '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003',
   '27000000-0000-4000-8000-000000000001', null, 'criacao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Titulo enviado', 'Conteudo enviado', array['enviada'],
   null, null, null, null, null, '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000004',
   '27000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'edicao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Editar com ajuste', 'Texto proposto', array['proposta'],
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Editar com ajuste', 'Texto antes', array['antes'],
   '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000005',
   '27000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000002', 'arquivamento',
   null, null, null, null, null,
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Para arquivar', 'Texto arquivavel', array['arq'],
   '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000006', '2b000000-0000-4000-8000-000000000006',
   '27000000-0000-4000-8000-000000000001', null, 'criacao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Validacoes', 'Conteudo valido', array['valida'],
   null, null, null, null, null, '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000007',
   '27000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000003', 'edicao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Vai mudar', 'Proposta desatualizada', array['muda'],
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Vai mudar', 'Texto que muda', array['muda'],
   '13000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000008', '2b000000-0000-4000-8000-000000000008',
   '27000000-0000-4000-8000-000000000002', null, 'criacao',
   '28000000-0000-4000-8000-000000000004', 'Revisao Outro Acesso', 'De outra pessoa', 'Nao visivel ao colaborador A', null,
   null, null, null, null, null, '13000000-0000-4000-8000-000000000002'),
  ('2a000000-0000-4000-8000-000000000009', '2b000000-0000-4000-8000-000000000009',
   '27000000-0000-4000-8000-000000000001', null, 'criacao',
   '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Para rejeitar', 'Conteudo rejeitado', null,
   null, null, null, null, null, '13000000-0000-4000-8000-000000000001');

-- Backfill: toda decisão existente de criação/edição tem versão publicada e toda rejeição
-- com motivo tem comentário.
select is(
  (select count(*)::integer from public.solicitacoes_mensagem
   where status = 'aprovada' and tipo in ('criacao', 'edicao') and titulo_publicado is null),
  0,
  'backfill preenche a versao publicada das aprovacoes antigas'
);

select is(
  (select count(*)::integer from public.solicitacoes_mensagem
   where status = 'rejeitada' and nullif(btrim(motivo_rejeicao), '') is not null and comentario_revisao is null),
  0,
  'backfill copia o motivo das rejeicoes antigas para o comentario'
);

select is(
  (select count(*)::integer from public.solicitacoes_mensagem
   where ajustada and (status <> 'aprovada' or tipo not in ('criacao', 'edicao') or titulo_publicado is null)),
  0,
  'toda linha ajustada e uma aprovacao de criacao ou edicao com versao publicada'
);

-- Colaborador ----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000001')$$,
  'P0001', 'FORBIDDEN',
  'colaborador nao aprova solicitacoes'
);

select throws_ok(
  $$
    insert into public.solicitacoes_mensagem (
      id, idempotency_key, acesso_id, tipo, categoria_id, categoria, titulo, conteudo,
      solicitado_por, comentario_revisao, ajustada
    ) values (
      '2a000000-0000-4000-8000-000000000010', '2b000000-0000-4000-8000-000000000010',
      '27000000-0000-4000-8000-000000000001', 'criacao',
      '28000000-0000-4000-8000-000000000001', 'Revisao Um', 'Falso retorno', 'Nao deve entrar',
      (select auth.uid()), 'Aprovado por mim mesmo', true
    )
  $$,
  '23514',
  null,
  'colaborador nao envia solicitacao com comentario ou ajuste de revisao'
);

reset role;

-- Superadministrador -----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000003';

select results_eq(
  $$select status, ajustada from public.aprovar_solicitacao(p_id => '2a000000-0000-4000-8000-000000000001')$$,
  $$values ('aprovada'::text, false)$$,
  'chamada antiga so com p_id continua aprovando sem ajustes'
);

select results_eq(
  $$
    select titulo_publicado, conteudo_publicado, tags_publicadas, categoria_id_publicada, comentario_revisao
    from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000001'
  $$,
  $$values ('Chamada antiga'::text, 'Aprovada so com o id'::text, array['antiga']::text[],
            '28000000-0000-4000-8000-000000000001'::uuid, null::text)$$,
  'aprovacao sem ajuste grava a proposta como versao publicada e sem comentario'
);

select results_eq(
  $$select ajustada from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000002', null, '  Texto aprovado, obrigado  ')$$,
  $$values (false)$$,
  'aprovar sem ajuste com comentario'
);

select results_eq(
  $$select status, ajustada, comentario_revisao from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000002'$$,
  $$values ('aprovada'::text, false, 'Texto aprovado, obrigado'::text)$$,
  'comentario opcional da aprovacao fica guardado normalizado'
);

select results_eq(
  $$
    select ajustada from public.aprovar_solicitacao(
      '2a000000-0000-4000-8000-000000000003',
      '{"titulo": "  Titulo ajustado  ", "conteudo": "Conteudo ajustado pelo administrador"}'::jsonb,
      'Ajustei o titulo'
    )
  $$,
  $$values (true)$$,
  'aprovar criacao com ajustes devolve ajustada'
);

select results_eq(
  $$
    select s.titulo, s.conteudo, s.titulo_publicado, s.conteudo_publicado, s.tags_publicadas, s.ajustada,
           m.titulo, m.conteudo
    from public.solicitacoes_mensagem s
    join public.mensagens m on m.id = s.mensagem_id
    where s.id = '2a000000-0000-4000-8000-000000000003'
  $$,
  $$values ('Titulo enviado'::text, 'Conteudo enviado'::text, 'Titulo ajustado'::text,
            'Conteudo ajustado pelo administrador'::text, array['enviada']::text[], true,
            'Titulo ajustado'::text, 'Conteudo ajustado pelo administrador'::text)$$,
  'mensagem publicada usa a versao ajustada e a proposta enviada continua guardada'
);

select results_eq(
  $$
    select ajustada from public.aprovar_solicitacao(
      '2a000000-0000-4000-8000-000000000004',
      '{"categoria_id": "28000000-0000-4000-8000-000000000002", "tags": [" nova ", "proposta"]}'::jsonb
    )
  $$,
  $$values (true)$$,
  'aprovar edicao com ajuste de categoria e etiquetas'
);

select results_eq(
  $$
    select id, categoria_id, categoria, conteudo, tags
    from public.mensagens where id = '29000000-0000-4000-8000-000000000001'
  $$,
  $$values ('29000000-0000-4000-8000-000000000001'::uuid, '28000000-0000-4000-8000-000000000002'::uuid,
            'Revisao Dois'::text, 'Texto proposto'::text, array['nova', 'proposta']::text[])$$,
  'edicao ajustada preserva o id e aplica a categoria e as etiquetas finais'
);

select results_eq(
  $$
    select categoria_id, categoria_id_publicada, categoria_publicada, tags, tags_publicadas
    from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000004'
  $$,
  $$values ('28000000-0000-4000-8000-000000000001'::uuid, '28000000-0000-4000-8000-000000000002'::uuid,
            'Revisao Dois'::text, array['proposta']::text[], array['nova', 'proposta']::text[])$$,
  'edicao guarda proposta e versao publicada separadas'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000005', '{"titulo": "Nao"}'::jsonb)$$,
  'P0001', 'VALIDATION:ADJUSTMENTS_NOT_ALLOWED',
  'arquivamento nao aceita ajustes'
);

select results_eq(
  $$select status, arquivado_em from public.solicitacoes_mensagem s
    join public.mensagens m on m.id = s.mensagem_id
    where s.id = '2a000000-0000-4000-8000-000000000005'$$,
  $$values ('pendente'::text, null::timestamptz)$$,
  'ajuste recusado em arquivamento nao decide nem arquiva'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006',
    '{"categoria_id": "28000000-0000-4000-8000-000000000003"}'::jsonb)$$,
  'P0001', 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS',
  'ajuste para categoria arquivada e recusado'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006',
    '{"categoria_id": "28000000-0000-4000-8000-000000000004"}'::jsonb)$$,
  'P0001', 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS',
  'ajuste para categoria de outro acesso e recusado'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006', '{"categoria_id": "nao-e-uuid"}'::jsonb)$$,
  'P0001', 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS',
  'categoria invalida no ajuste e recusada'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006', '{"titulo": "   "}'::jsonb)$$,
  'P0001', 'VALIDATION:TITLE',
  'titulo vazio no ajuste e recusado'
);

select throws_ok(
  format($$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006', %L::jsonb)$$,
         jsonb_build_object('conteudo', repeat('x', 2001))),
  'P0001', 'VALIDATION:CONTENT',
  'conteudo acima de 2000 caracteres no ajuste e recusado'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006', '{"tags": ["a", "A "]}'::jsonb)$$,
  'P0001', 'VALIDATION:TAGS',
  'etiquetas repetidas no ajuste sao recusadas'
);

select throws_ok(
  format($$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000006', null, %L)$$, repeat('c', 501)),
  'P0001', 'VALIDATION:REVIEW_COMMENT',
  'comentario acima de 500 caracteres e recusado'
);

select results_eq(
  $$
    select ajustada from public.aprovar_solicitacao(
      '2a000000-0000-4000-8000-000000000006',
      '{"titulo": "Validacoes", "conteudo": "Conteudo valido", "tags": ["valida"]}'::jsonb,
      '   '
    )
  $$,
  $$values (false)$$,
  'ajuste identico a proposta nao marca ajustada'
);

select results_eq(
  $$select comentario_revisao from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000006'$$,
  $$values (null::text)$$,
  'comentario so com espacos vira nulo'
);

reset role;
update public.mensagens set conteudo = 'Alterado por outra pessoa'
where id = '29000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000003';

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000007', '{"titulo": "Ajuste tardio"}'::jsonb)$$,
  'P0001', 'CONFLICT:REQUEST_STALE',
  'editar e aprovar sobre mensagem alterada segue a regra de conflito'
);

select results_eq(
  $$select titulo, conteudo from public.mensagens where id = '29000000-0000-4000-8000-000000000003'$$,
  $$values ('Vai mudar'::text, 'Alterado por outra pessoa'::text)$$,
  'conflito nao sobrescreve a mudanca feita por outra pessoa'
);

select throws_ok(
  $$select * from public.aprovar_solicitacao('2a000000-0000-4000-8000-000000000003', '{"titulo": "De novo"}'::jsonb)$$,
  'P0001', 'CONFLICT:REQUEST_ALREADY_REVIEWED',
  'dupla decisao com ajustes e recusada'
);

select throws_ok(
  $$select * from public.rejeitar_solicitacao('2a000000-0000-4000-8000-000000000009', '   ')$$,
  'P0001', 'VALIDATION:REJECTION_REASON',
  'rejeitar exige comentario'
);

select lives_ok(
  $$select * from public.rejeitar_solicitacao('2a000000-0000-4000-8000-000000000009', '  Ja existe um padrao igual  ')$$,
  'rejeitar com motivo'
);

select results_eq(
  $$select status, comentario_revisao, motivo_rejeicao, ajustada, titulo_publicado
    from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000009'$$,
  $$values ('rejeitada'::text, 'Ja existe um padrao igual'::text, 'Ja existe um padrao igual'::text, false, null::text)$$,
  'rejeicao grava o comentario e mantem motivo_rejeicao para o frontend anterior'
);

select lives_ok(
  $$select * from public.rejeitar_solicitacao('2a000000-0000-4000-8000-000000000008', 'Comentario sobre pedido de B')$$,
  'rejeita pedido de outro colaborador'
);

select is(
  (select detalhes from public.registros_atividade
   where entidade_tipo = 'solicitacao' and entidade_id = '2a000000-0000-4000-8000-000000000003' and acao = 'aprovar'),
  jsonb_build_object('tipo', 'criacao',
    'mensagem_id', (select mensagem_id from public.solicitacoes_mensagem where id = '2a000000-0000-4000-8000-000000000003'),
    'ajustada', true, 'comentario_tamanho', 16),
  'registro de atividade guarda so tipo, mensagem, ajustada e tamanho do comentario'
);

reset role;

-- Leitura do colaborador -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000001';

select results_eq(
  $$select comentario_revisao, titulo, titulo_publicado from public.solicitacoes_mensagem
    where id = '2a000000-0000-4000-8000-000000000003'$$,
  $$values ('Ajustei o titulo'::text, 'Titulo enviado'::text, 'Titulo ajustado'::text)$$,
  'colaborador le comentario, versao enviada e publicada das proprias solicitacoes'
);

select is(
  (select count(*)::integer from public.solicitacoes_mensagem
   where id = '2a000000-0000-4000-8000-000000000008' or comentario_revisao = 'Comentario sobre pedido de B'),
  0,
  'colaborador nao le solicitacoes nem comentarios de outras pessoas'
);

reset role;

select * from finish();
rollback;
