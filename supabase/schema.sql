-- ============================================================
-- Mensagens de Relacionamento — schema Supabase (Postgres)
-- Aplicar de uma vez no SQL Editor do painel Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'user' check (role in ('superadmin','user')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente sempre que um usuário é criado no Auth
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- acessos (equipes/workspaces) ----------
create table public.acessos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  cor text not null default '#1BA7DC',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- acesso_membros (vínculo usuário <-> acesso) ----------
create table public.acesso_membros (
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin_local boolean not null default false,
  primary key (acesso_id, user_id)
);

-- ---------- categorias ----------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- mensagens ----------
-- "categoria" é TEXTO solto, de propósito: excluir uma categoria nunca deve
-- alterar mensagens já criadas (comportamento idêntico ao protótipo).
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  categoria text not null,
  titulo text not null check (char_length(titulo) <= 100),
  conteudo text not null check (char_length(conteudo) <= 2000),
  tags text[] not null default '{}',
  frequencia int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- favoritos ----------
create table public.favoritos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);

-- ---------- recentes ----------
create table public.recentes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);

-- ---------- helper: sou superadmin? ----------
-- SECURITY DEFINER + dono da tabela = bypassa RLS internamente. Isso é essencial:
-- uma policy da própria tabela "profiles" NUNCA pode fazer um subselect cru em
-- "profiles" (causa recursão infinita) — tem que passar por uma função assim.
create function public.is_superadmin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;

-- ---------- helper: posso USAR este acesso? (ler mensagens, favoritar, etc.) ----------
-- Fonte única da verdade da regra "membro do Acesso OU superadmin". Toda policy e
-- função que depende dessa regra chama esta função em vez de repetir o `exists` em
-- acesso_membros.
--
-- Por que isso importa: antes, a leitura de `mensagens` dizia "membro OU superadmin"
-- enquanto o `with check` de favoritos/recentes e o guard de increment_frequencia
-- diziam só "membro". Como o superadmin enxerga os Acessos aos quais não tem vínculo
-- em acesso_membros, favoritar/copiar uma mensagem desses Acessos estourava
-- "new row violates row-level security policy". Com a regra num lugar só, leitura e
-- escrita não podem mais divergir sem alguém perceber.
create function public.is_acesso_member(p_acesso_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_superadmin() or exists (
    select 1 from public.acesso_membros
    where acesso_id = p_acesso_id and user_id = auth.uid()
  );
$$;

-- ---------- helper: sou admin (local ou superadmin) deste acesso? ----------
create function public.is_acesso_admin(p_acesso_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_superadmin() or exists (
    select 1 from public.acesso_membros
    where acesso_id = p_acesso_id and user_id = auth.uid() and is_admin_local = true
  );
$$;

-- ---------- incrementar frequência (atômico, valida acesso) ----------
create function public.increment_frequencia(msg_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_acesso_id uuid;
begin
  select acesso_id into v_acesso_id from public.mensagens where id = msg_id;
  if v_acesso_id is null then
    raise exception 'mensagem não encontrada';
  end if;
  if not public.is_acesso_member(v_acesso_id) then
    raise exception 'sem acesso a esta mensagem';
  end if;
  update public.mensagens set frequencia = frequencia + 1 where id = msg_id;
end;
$$;

-- ---------- solicitacoes_mensagem (staging para o fluxo de aprovação) ----------
-- Usuários comuns (não admin local, não superadmin) não escrevem em `mensagens`
-- diretamente: toda criação/edição/exclusão que eles fazem vira uma linha aqui,
-- pendente, até um superadmin aprovar ou rejeitar. Fica como tabela separada
-- (staging) em vez de uma coluna `status` em `mensagens` para que `mensagens`
-- só contenha conteúdo já publicado — evita vazar rascunhos pendentes via
-- favoritos/recentes/incremento de frequência.
create table public.solicitacoes_mensagem (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.acessos(id) on delete cascade,
  -- SET NULL (e não CASCADE): apagar a mensagem não pode apagar o registro de quem
  -- pediu e quem aprovou. Com CASCADE, aprovar uma solicitação de EXCLUSÃO fazia o
  -- próprio histórico sumir junto com a mensagem, silenciosamente.
  -- Os snapshots *_anterior preservam o conteúdo do que foi excluído.
  mensagem_id uuid references public.mensagens(id) on delete set null,
  tipo text not null check (tipo in ('criacao','edicao','exclusao')),
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada')),

  -- snapshot proposto (o que deveria valer se aprovado)
  -- os limites espelham os de `mensagens`: se a validação só existisse lá, um
  -- pedido fora do padrão só falharia na hora de APROVAR — ou seja, o erro cairia
  -- no colo de quem revisa, e não de quem pediu, sem forma de resolver pela tela.
  categoria text,
  titulo text check (titulo is null or char_length(titulo) <= 100),
  conteudo text check (conteudo is null or char_length(conteudo) <= 2000),
  tags text[],

  -- snapshot anterior (para exibir antes/depois em edição/exclusão)
  categoria_anterior text,
  titulo_anterior text,
  conteudo_anterior text,
  tags_anterior text[],

  solicitado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  revisado_por uuid references public.profiles(id),
  revisado_em timestamptz,
  motivo_rejeicao text,

  -- A regra de formato vale apenas ENQUANTO A SOLICITAÇÃO ESTÁ PENDENTE. Depois de
  -- revisada, a linha vira registro histórico e legitimamente muda de forma:
  --   - 'criacao' aprovada passa a apontar para a mensagem que acabou de ser criada
  --   - 'exclusao' aprovada tem mensagem_id zerado pela FK quando a mensagem some
  -- Sem o `status <> 'pendente'`, aprovar uma criação estourava
  -- "violates check constraint solicitacoes_mensagem_tipo_mensagem_ck".
  constraint solicitacoes_mensagem_tipo_mensagem_ck check (
    status <> 'pendente'
    or (tipo = 'criacao' and mensagem_id is null)
    or (tipo in ('edicao','exclusao') and mensagem_id is not null)
  )
);

-- ---------- aprovar/rejeitar solicitação (atômico, só superadmin) ----------
-- Aplica o efeito em `mensagens` (insert/update/delete conforme o tipo) e marca
-- o status da solicitação numa única transação — o cliente comum nunca precisa
-- de permissão de escrita direta em `mensagens`.
-- A ORDEM das operações é diferente por tipo, e isso é proposital:
--   criacao  -> insere a mensagem primeiro, porque só depois existe o id para gravar
--   edicao   -> atualiza a mensagem e marca a solicitação
--   exclusao -> marca a solicitação ANTES de apagar. No instante do delete a FK zera
--               mensagem_id, e uma linha ainda 'pendente' com mensagem_id nulo
--               violaria solicitacoes_mensagem_tipo_mensagem_ck.
create function public.aprovar_solicitacao(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_sol public.solicitacoes_mensagem;
  v_nova_msg uuid;
begin
  if not public.is_superadmin() then
    raise exception 'apenas superadmin pode aprovar solicitações';
  end if;

  select * into v_sol from public.solicitacoes_mensagem where id = p_id and status = 'pendente';
  if not found then
    raise exception 'solicitação não encontrada ou já revisada';
  end if;

  if v_sol.tipo = 'criacao' then
    insert into public.mensagens (acesso_id, categoria, titulo, conteudo, tags, created_by)
    values (v_sol.acesso_id, v_sol.categoria, v_sol.titulo, v_sol.conteudo, coalesce(v_sol.tags, '{}'), v_sol.solicitado_por)
    returning id into v_nova_msg;

    update public.solicitacoes_mensagem
      set status = 'aprovada', mensagem_id = v_nova_msg, revisado_por = auth.uid(), revisado_em = now()
      where id = p_id;

  elsif v_sol.tipo = 'edicao' then
    update public.mensagens
      set categoria = v_sol.categoria, titulo = v_sol.titulo, conteudo = v_sol.conteudo,
          tags = coalesce(v_sol.tags, '{}'), updated_at = now()
      where id = v_sol.mensagem_id;
    if not found then
      raise exception 'a mensagem desta solicitação não existe mais';
    end if;

    update public.solicitacoes_mensagem
      set status = 'aprovada', revisado_por = auth.uid(), revisado_em = now()
      where id = p_id;

  elsif v_sol.tipo = 'exclusao' then
    update public.solicitacoes_mensagem
      set status = 'aprovada', revisado_por = auth.uid(), revisado_em = now()
      where id = p_id;

    delete from public.mensagens where id = v_sol.mensagem_id;
  end if;
end;
$$;

create function public.rejeitar_solicitacao(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'apenas superadmin pode rejeitar solicitações';
  end if;

  update public.solicitacoes_mensagem
    set status = 'rejeitada', motivo_rejeicao = p_motivo, revisado_por = auth.uid(), revisado_em = now()
    where id = p_id and status = 'pendente';

  if not found then
    raise exception 'solicitação não encontrada ou já revisada';
  end if;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.acessos enable row level security;
alter table public.acesso_membros enable row level security;
alter table public.categorias enable row level security;
alter table public.mensagens enable row level security;
alter table public.favoritos enable row level security;
alter table public.recentes enable row level security;
alter table public.solicitacoes_mensagem enable row level security;

create policy "profiles_select_own_or_superadmin" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_superadmin()
  );
create policy "profiles_update_superadmin" on public.profiles
  for update using (public.is_superadmin());

create policy "acessos_select_members_or_superadmin" on public.acessos
  for select using (public.is_acesso_member(acessos.id));
create policy "acessos_write_superadmin" on public.acessos
  for all using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "acesso_membros_select_own_or_superadmin" on public.acesso_membros
  for select using (
    user_id = auth.uid()
    or public.is_superadmin()
  );
create policy "acesso_membros_write_superadmin" on public.acesso_membros
  for all using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "categorias_select_members" on public.categorias
  for select using (public.is_acesso_member(categorias.acesso_id));
create policy "categorias_write_admins" on public.categorias
  for all using (public.is_acesso_admin(acesso_id))
  with check (public.is_acesso_admin(acesso_id));

create policy "mensagens_select_members" on public.mensagens
  for select using (public.is_acesso_member(mensagens.acesso_id));
create policy "mensagens_write_admins" on public.mensagens
  for all using (public.is_acesso_admin(acesso_id))
  with check (public.is_acesso_admin(acesso_id));

-- with check valida também que a mensagem referenciada é de um Acesso que o usuário
-- pode usar — sem isso, dava para inserir um favorito/recente apontando para o UUID
-- de uma mensagem de outro acesso (não vaza conteúdo, pois a leitura continua
-- bloqueada pelo RLS de "mensagens", mas é uma referência indevida).
-- A checagem usa is_acesso_member — exatamente a mesma regra do select de
-- "mensagens" —, então nunca dá para ver uma mensagem e não conseguir favoritá-la.
create policy "favoritos_own" on public.favoritos
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.mensagens m
      where m.id = favoritos.mensagem_id and public.is_acesso_member(m.acesso_id)
    )
  );

create policy "recentes_own" on public.recentes
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.mensagens m
      where m.id = recentes.mensagem_id and public.is_acesso_member(m.acesso_id)
    )
  );

create policy "solicitacoes_select_members_or_superadmin" on public.solicitacoes_mensagem
  for select using (public.is_acesso_member(solicitacoes_mensagem.acesso_id));

create policy "solicitacoes_insert_members" on public.solicitacoes_mensagem
  for insert with check (
    solicitado_por = auth.uid()
    and public.is_acesso_member(solicitacoes_mensagem.acesso_id)
  );

-- Ninguém atualiza a tabela diretamente (mesmo superadmin) — só via as functions
-- SECURITY DEFINER acima, que aplicam o efeito em `mensagens` atomicamente junto
-- com a mudança de status. Esta policy existe como defesa em profundidade caso
-- alguém tente um UPDATE direto via REST/SQL fora das functions.
create policy "solicitacoes_update_superadmin" on public.solicitacoes_mensagem
  for update using (public.is_superadmin())
  with check (public.is_superadmin());

-- ============================================================
-- Hardening de EXECUTE — funções SECURITY DEFINER não devem ficar
-- expostas via /rest/v1/rpc/ para PUBLIC (que anon/authenticated herdam
-- por padrão). Restringe cada uma ao mínimo necessário.
-- ============================================================
revoke execute on function public.handle_new_user() from public;
-- ninguém precisa chamar isso diretamente — só o trigger a usa.

revoke execute on function public.increment_frequencia(uuid) from public;
grant execute on function public.increment_frequencia(uuid) to authenticated;

revoke execute on function public.is_acesso_admin(uuid) from public;
grant execute on function public.is_acesso_admin(uuid) to authenticated;

revoke execute on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

revoke execute on function public.aprovar_solicitacao(uuid) from public;
grant execute on function public.aprovar_solicitacao(uuid) to authenticated;

revoke execute on function public.rejeitar_solicitacao(uuid, text) from public;
grant execute on function public.rejeitar_solicitacao(uuid, text) to authenticated;

-- ============================================================
-- SEED — acesso, categorias e mensagens do protótipo
-- ============================================================
insert into public.acessos (id, nome, descricao, cor, ativo) values
  ('11111111-1111-1111-1111-111111111111', 'Relacionamento', 'Padrão de mensagens da equipe de Relacionamento', '#1BA7DC', true);

insert into public.categorias (acesso_id, nome, ordem) values
  ('11111111-1111-1111-1111-111111111111', 'Boas-vindas', 1),
  ('11111111-1111-1111-1111-111111111111', 'Confirmação e Acompanhamento', 2),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 3),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 4),
  ('11111111-1111-1111-1111-111111111111', 'Encerramento', 5),
  ('11111111-1111-1111-1111-111111111111', 'Reclamações', 6);

insert into public.mensagens (acesso_id, categoria, titulo, tags, conteudo, frequencia) values
  ('11111111-1111-1111-1111-111111111111', 'Boas-vindas', 'Boas-vindas ao atendimento', array['saudação','primeiro contato'], 'Olá! Seja bem-vindo(a) ao atendimento DentalPlus. Estou à disposição para ajudá-lo(a) com o que precisar hoje.', 38),
  ('11111111-1111-1111-1111-111111111111', 'Confirmação e Acompanhamento', 'Confirmação de agendamento', array['agendamento','consulta','confirmação'], 'Confirmamos o agendamento da sua consulta. Pedimos que chegue com 15 minutos de antecedência e traga um documento com foto.', 52),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 'Solicitação resolvida', array['resolvido','suporte'], 'Agradecemos por entrar em contato. Sua solicitação foi resolvida com sucesso. Qualquer dúvida, estamos à disposição.', 45),
  ('11111111-1111-1111-1111-111111111111', 'Resolução de Problema', 'Reembolso processado', array['reembolso','financeiro'], 'Seu pedido de reembolso foi analisado e processado. O valor será creditado em até 5 dias úteis na forma de pagamento original cadastrada em seu plano.', 29),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 'Aguardando retorno do laboratório', array['pendência','laboratório','prazo'], 'Informamos que sua solicitação está em análise junto ao laboratório credenciado. Retornaremos assim que houver atualização, dentro do prazo de até 3 dias úteis.', 21),
  ('11111111-1111-1111-1111-111111111111', 'Pendências', 'Aguardando documentação do beneficiário', array['pendência','documentos'], 'Para darmos continuidade, favor enviar os documentos pendentes do beneficiário. Assim que recebidos, seguiremos com a análise.', 17),
  ('11111111-1111-1111-1111-111111111111', 'Encerramento', 'Agradecimento e encerramento', array['despedida','encerramento'], 'Agradecemos o contato! Ficamos à disposição para qualquer nova necessidade. Tenha um ótimo dia.', 60),
  ('11111111-1111-1111-1111-111111111111', 'Reclamações', 'Registro de insatisfação recebido', array['reclamação','insatisfação'], 'Lamentamos o ocorrido e agradecemos por relatar sua experiência. Sua manifestação foi registrada e será analisada com prioridade pela nossa equipe.', 14);

-- ============================================================
-- Verificação — rodar logo após aplicar. Esperado: acessos=1, categorias=6, mensagens=8
-- ============================================================
select
  (select count(*) from public.acessos) as acessos,
  (select count(*) from public.categorias) as categorias,
  (select count(*) from public.mensagens) as mensagens;
