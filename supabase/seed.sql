-- Deterministic local-only identities. Never reuse these credentials outside local tests.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'colaborador.alpha@local.test',
    extensions.crypt('LocalTest!123', extensions.gen_salt('bf')),
    '2026-09-02T12:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Colaborador Alpha"}',
    '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'colaborador.beta@local.test',
    extensions.crypt('LocalTest!123', extensions.gen_salt('bf')),
    '2026-09-02T12:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Colaborador Beta"}',
    '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'superadmin@local.test',
    extensions.crypt('LocalTest!123', extensions.gen_salt('bf')),
    '2026-09-02T12:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Superadministrador Local"}',
    '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'sem-acesso@local.test',
    extensions.crypt('LocalTest!123', extensions.gen_salt('bf')),
    '2026-09-02T12:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Conta sem acesso"}',
    '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', '', '', '', ''
  );

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '2026-09-02T12:00:00Z',
  '2026-09-02T12:00:00Z',
  '2026-09-02T12:00:00Z'
from auth.users u
where u.id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
);

update public.profiles
set role = case
    when id = '10000000-0000-4000-8000-000000000003' then 'superadmin'
    else 'colaborador'
  end,
  ativo = true
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
);

insert into public.acessos (id, nome, descricao, cor, ativo, created_at)
values
  ('20000000-0000-4000-8000-000000000001', 'Atendimento Local', 'Mensagens de atendimento', '#1BA7DC', true, '2026-09-02T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', 'Comercial Local', 'Mensagens comerciais', '#7C3AED', true, '2026-09-02T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000003', 'Acesso Inativo Local', 'Cenario de acesso desativado', '#64748B', false, '2026-09-02T12:00:00Z');

insert into public.acesso_membros (acesso_id, user_id, is_admin_local)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', false),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', false),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', false);

insert into public.categorias (id, acesso_id, nome, ordem, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Boas-vindas', 1, '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Legado arquivado', 2, '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Propostas', 1, '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z');

insert into public.mensagens (
  id, acesso_id, categoria_id, categoria, titulo, conteudo, tags, frequencia,
  created_by, created_at, updated_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Boas-vindas',
    'Boas-vindas deterministicas',
    'Olá! Como podemos ajudar?',
    array['boas-vindas', 'local'],
    7,
    '10000000-0000-4000-8000-000000000003',
    '2026-09-02T12:00:00Z',
    '2026-09-02T12:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'Legado arquivado',
    'Mensagem arquivada deterministica',
    'Conteúdo preservado para restauração.',
    array['arquivada', 'local'],
    3,
    '10000000-0000-4000-8000-000000000003',
    '2026-09-02T12:00:00Z',
    '2026-09-02T12:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    'Propostas',
    'Proposta comercial deterministica',
    'Podemos preparar uma proposta personalizada.',
    array['comercial', 'proposta'],
    2,
    '10000000-0000-4000-8000-000000000003',
    '2026-09-02T12:00:00Z',
    '2026-09-02T12:00:00Z'
  );

insert into public.favoritos (user_id, mensagem_id, created_at)
values
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-09-02T13:00:00Z'),
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2026-09-02T13:05:00Z');

insert into public.recentes (user_id, mensagem_id, used_at)
values
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-09-02T14:00:00Z'),
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2026-09-02T13:30:00Z');

update public.mensagens
set arquivado_em = '2026-09-02T15:00:00Z',
    arquivado_por = '10000000-0000-4000-8000-000000000003',
    updated_at = '2026-09-02T15:00:00Z'
where id = '40000000-0000-4000-8000-000000000002';

update public.categorias
set arquivado_em = '2026-09-02T15:05:00Z',
    arquivado_por = '10000000-0000-4000-8000-000000000003',
    updated_at = '2026-09-02T15:05:00Z'
where id = '30000000-0000-4000-8000-000000000002';
