begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'registros_atividade', 'existe registro de atividade append-only');
select has_column('public', 'registros_atividade', 'ator_id', 'atividade identifica o ator');
select has_column('public', 'registros_atividade', 'entidade_tipo', 'atividade identifica o tipo de entidade');
select has_column('public', 'registros_atividade', 'entidade_id', 'atividade identifica o alvo estavel');
select has_column('public', 'registros_atividade', 'detalhes', 'atividade limita metadados a um objeto JSON');

select ok(
  case
    when to_regclass('public.registros_atividade') is null then false
    else not has_table_privilege('authenticated', 'public.registros_atividade', 'insert')
  end,
  'clientes autenticados nao inserem atividade diretamente'
);
select ok(
  case
    when to_regclass('public.registros_atividade') is null then false
    else not has_table_privilege('authenticated', 'public.registros_atividade', 'update')
  end,
  'clientes autenticados nao alteram atividade'
);
select ok(
  case
    when to_regclass('public.registros_atividade') is null then false
    else not has_table_privilege('authenticated', 'public.registros_atividade', 'delete')
  end,
  'clientes autenticados nao removem atividade'
);

create or replace function pg_temp.audit_rejects_sensitive_details()
returns boolean
language plpgsql
as $$
begin
  if to_regclass('public.registros_atividade') is null then
    return false;
  end if;

  begin
    execute $sql$
      insert into public.registros_atividade
        (ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes)
      values
        (null, null, 'conta', 'teste', 'redefinir_senha', '{"temporaryPassword":"segredo"}'::jsonb)
    $sql$;
    return false;
  exception
    when check_violation then return true;
  end;
end;
$$;

select ok(pg_temp.audit_rejects_sensitive_details(), 'atividade rejeita senha, token e conteudo integral nos detalhes');

insert into auth.users (id, email)
values ('13000000-0000-4000-8000-000000000001', 'auditor@example.test');

update public.profiles
set nome = 'Auditor', role = 'superadmin', ativo = true
where id = '13000000-0000-4000-8000-000000000001';

insert into public.acessos (id, nome, ativo)
values ('23000000-0000-4000-8000-000000000001', 'Acesso auditado', true);

insert into public.categorias (id, acesso_id, nome)
values ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Categoria auditada');

insert into public.solicitacoes_mensagem (
  id, idempotency_key, acesso_id, tipo, categoria_id, categoria,
  titulo, conteudo, tags, solicitado_por
) values
  (
    '53000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'criacao', '33000000-0000-4000-8000-000000000001', 'Categoria auditada',
    'Criada por aprovacao', 'Conteudo aprovado', array['aprovada'],
    '13000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000001',
    'criacao', '33000000-0000-4000-8000-000000000001', 'Categoria auditada',
    'Criacao rejeitada', 'Conteudo rejeitado', array['rejeitada'],
    '13000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000001';

insert into public.mensagens (
  id, acesso_id, categoria_id, categoria, titulo, conteudo, tags, created_by
) values (
  '43000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Categoria auditada', 'Mensagem auditada', 'Conteudo inicial', array['auditoria'],
  (select auth.uid())
);

update public.mensagens
set titulo = 'Mensagem auditada editada'
where id = '43000000-0000-4000-8000-000000000001';

select * from public.arquivar_mensagem('43000000-0000-4000-8000-000000000001');
select * from public.restaurar_mensagem('43000000-0000-4000-8000-000000000001');
select * from public.aprovar_solicitacao('53000000-0000-4000-8000-000000000001');
select * from public.rejeitar_solicitacao('53000000-0000-4000-8000-000000000002', 'Nao atende ao padrao');

select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'mensagem' and entidade_id = '43000000-0000-4000-8000-000000000001' and acao = 'criar' and ator_id = auth.uid()),
  'criacao de mensagem gera atividade com ator'
);
select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'mensagem' and entidade_id = '43000000-0000-4000-8000-000000000001' and acao = 'editar' and ator_id = auth.uid()),
  'edicao de mensagem gera atividade com ator'
);
select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'mensagem' and entidade_id = '43000000-0000-4000-8000-000000000001' and acao = 'arquivar' and ator_id = auth.uid()),
  'arquivamento de mensagem gera atividade com ator'
);
select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'mensagem' and entidade_id = '43000000-0000-4000-8000-000000000001' and acao = 'restaurar' and ator_id = auth.uid()),
  'restauracao de mensagem gera atividade com ator'
);
select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'solicitacao' and entidade_id = '53000000-0000-4000-8000-000000000001' and acao = 'aprovar' and ator_id = auth.uid()),
  'aprovacao gera atividade transacional da solicitacao'
);
select ok(
  exists(select 1 from public.registros_atividade where entidade_tipo = 'solicitacao' and entidade_id = '53000000-0000-4000-8000-000000000002' and acao = 'rejeitar' and ator_id = auth.uid()),
  'rejeicao gera atividade transacional da solicitacao'
);

select * from finish();
rollback;
