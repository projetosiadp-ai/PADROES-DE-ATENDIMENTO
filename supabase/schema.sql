


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."can_use_access"("p_access_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p_access_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.acessos a
      where a.id = p_access_id
        and a.ativo = true
        and (
          exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.role = 'superadmin'
              and p.ativo = true
          )
          or exists (
            select 1
            from public.profiles p
            join public.acesso_membros am on am.user_id = p.id
            where p.id = (select auth.uid())
              and p.role = 'colaborador'
              and p.ativo = true
              and am.acesso_id = a.id
          )
        )
    );
$$;


ALTER FUNCTION "private"."can_use_access"("p_access_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'superadmin'
        and p.ativo = true
    );
$$;


ALTER FUNCTION "private"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."registrar_mudanca_administrativa"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
  entity_type text;
  entity_id text;
  access_id uuid;
  action_name text;
begin
  entity_type := case tg_table_name
    when 'mensagens' then 'mensagem'
    when 'categorias' then 'categoria'
    when 'acessos' then 'acesso'
    when 'acesso_membros' then 'liberacao'
    when 'profiles' then 'conta'
    else 'solicitacao'
  end;

  entity_id := case tg_table_name
    when 'acesso_membros' then concat(row_data ->> 'user_id', ':', row_data ->> 'acesso_id')
    else row_data ->> 'id'
  end;

  access_id := case
    when tg_table_name = 'acessos' then (row_data ->> 'id')::uuid
    when row_data ? 'acesso_id' then (row_data ->> 'acesso_id')::uuid
    else null
  end;

  action_name := case
    when tg_op = 'INSERT' then 'criar'
    when tg_op = 'DELETE' then 'remover'
    when old_data ->> 'arquivado_em' is null and new_data ->> 'arquivado_em' is not null then 'arquivar'
    when old_data ->> 'arquivado_em' is not null and new_data ->> 'arquivado_em' is null then 'restaurar'
    else 'editar'
  end;

  insert into public.registros_atividade
    (ator_id, acesso_id, entidade_tipo, entidade_id, acao, detalhes)
  values (
    (select auth.uid()),
    access_id,
    entity_type,
    entity_id,
    action_name,
    jsonb_build_object('operacao', tg_op)
  );

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "private"."registrar_mudanca_administrativa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."request_tags_are_valid"("p_tags" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."request_tags_are_valid"("p_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") RETURNS TABLE("request_id" "uuid", "status" "text", "message_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "arquivado_em" timestamp with time zone,
    "arquivado_por" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categorias_arquivamento_consistente_check" CHECK ((("arquivado_em" IS NULL) = ("arquivado_por" IS NULL)))
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arquivar_categoria"("p_category_id" "uuid") RETURNS "public"."categorias"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."arquivar_categoria"("p_category_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "categoria" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "frequencia" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "categoria_id" "uuid" NOT NULL,
    "arquivado_em" timestamp with time zone,
    "arquivado_por" "uuid",
    CONSTRAINT "mensagens_arquivamento_consistente_check" CHECK ((("arquivado_em" IS NULL) = ("arquivado_por" IS NULL))),
    CONSTRAINT "mensagens_conteudo_check" CHECK (("char_length"("conteudo") <= 2000)),
    CONSTRAINT "mensagens_titulo_check" CHECK (("char_length"("titulo") <= 100))
);


ALTER TABLE "public"."mensagens" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arquivar_mensagem"("p_message_id" "uuid") RETURNS "public"."mensagens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."arquivar_mensagem"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    lower(new.email),
    'colaborador'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propagar_nome_categoria"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.nome is distinct from old.nome then
    update public.mensagens
    set categoria = new.nome
    where categoria_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."propagar_nome_categoria"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_uso_mensagem"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  mensagem_row public.mensagens;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select m.*
  into mensagem_row
  from public.mensagens m
  where m.id = p_message_id;

  if not found or mensagem_row.arquivado_em is not null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if not private.can_use_access(mensagem_row.acesso_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  update public.mensagens
  set frequencia = frequencia + 1
  where id = p_message_id;

  insert into public.recentes (user_id, mensagem_id, used_at)
  values ((select auth.uid()), p_message_id, now())
  on conflict (user_id, mensagem_id)
  do update set used_at = excluded.used_at;
end;
$$;


ALTER FUNCTION "public"."registrar_uso_mensagem"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") RETURNS TABLE("request_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restaurar_categoria"("p_category_id" "uuid") RETURNS "public"."categorias"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."restaurar_categoria"("p_category_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restaurar_mensagem"("p_message_id" "uuid") RETURNS "public"."mensagens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."restaurar_mensagem"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sincronizar_categoria_mensagem"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  categoria_row public.categorias;
begin
  select c.*
  into categoria_row
  from public.categorias c
  where c.acesso_id = new.acesso_id
    and c.arquivado_em is null
    and (
      c.id = new.categoria_id
      or (
        new.categoria_id is null
        and lower(btrim(c.nome)) = lower(btrim(new.categoria))
      )
    )
  order by (c.id = new.categoria_id) desc, c.created_at, c.id
  limit 1;

  if not found
    or categoria_row.acesso_id <> new.acesso_id then
    raise exception using errcode = '23514', message = 'VALIDATION:CATEGORY_NOT_ACTIVE_IN_ACCESS';
  end if;

  new.categoria_id := categoria_row.id;
  new.categoria := categoria_row.nome;
  return new;
end;
$$;


ALTER FUNCTION "public"."sincronizar_categoria_mensagem"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acesso_membros" (
    "acesso_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_admin_local" boolean DEFAULT false NOT NULL,
    CONSTRAINT "acesso_membros_admin_local_disabled_check" CHECK (("is_admin_local" = false))
);


ALTER TABLE "public"."acesso_membros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acessos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text" DEFAULT ''::"text" NOT NULL,
    "cor" "text" DEFAULT '#1BA7DC'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."acessos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favoritos" (
    "user_id" "uuid" NOT NULL,
    "mensagem_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favoritos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'colaborador'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['colaborador'::"text", 'superadmin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recentes" (
    "user_id" "uuid" NOT NULL,
    "mensagem_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registros_atividade" (
    "id" bigint NOT NULL,
    "ator_id" "uuid",
    "acesso_id" "uuid",
    "entidade_tipo" "text" NOT NULL,
    "entidade_id" "text" NOT NULL,
    "acao" "text" NOT NULL,
    "detalhes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "registros_atividade_detalhes_check" CHECK ((("jsonb_typeof"("detalhes") = 'object'::"text") AND (NOT ("detalhes" ?| ARRAY['password'::"text", 'senha'::"text", 'temporaryPassword'::"text", 'temporary_password'::"text", 'token'::"text", 'access_token'::"text", 'refresh_token'::"text", 'conteudo'::"text", 'conteudo_anterior'::"text", 'content'::"text"])))),
    CONSTRAINT "registros_atividade_entidade_tipo_check" CHECK (("entidade_tipo" = ANY (ARRAY['mensagem'::"text", 'categoria'::"text", 'acesso'::"text", 'liberacao'::"text", 'conta'::"text", 'solicitacao'::"text"])))
);


ALTER TABLE "public"."registros_atividade" OWNER TO "postgres";


ALTER TABLE "public"."registros_atividade" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."registros_atividade_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."solicitacoes_mensagem" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "mensagem_id" "uuid",
    "tipo" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "categoria" "text",
    "titulo" "text",
    "conteudo" "text",
    "tags" "text"[],
    "categoria_anterior" "text",
    "titulo_anterior" "text",
    "conteudo_anterior" "text",
    "tags_anterior" "text"[],
    "solicitado_por" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revisado_por" "uuid",
    "revisado_em" timestamp with time zone,
    "motivo_rejeicao" "text",
    "idempotency_key" "uuid" NOT NULL,
    "categoria_id" "uuid",
    "categoria_id_anterior" "uuid",
    CONSTRAINT "solicitacoes_mensagem_conteudo_check" CHECK ((("conteudo" IS NULL) OR ("char_length"("conteudo") <= 2000))),
    CONSTRAINT "solicitacoes_mensagem_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text", 'rejeitada'::"text"]))),
    CONSTRAINT "solicitacoes_mensagem_tipo_check" CHECK (("tipo" = ANY (ARRAY['criacao'::"text", 'edicao'::"text", 'arquivamento'::"text", 'exclusao'::"text"]))),
    CONSTRAINT "solicitacoes_mensagem_tipo_mensagem_ck" CHECK ((("status" <> 'pendente'::"text") OR (("tipo" = 'criacao'::"text") AND ("mensagem_id" IS NULL)) OR (("tipo" = ANY (ARRAY['edicao'::"text", 'arquivamento'::"text"])) AND ("mensagem_id" IS NOT NULL)))),
    CONSTRAINT "solicitacoes_mensagem_titulo_check" CHECK ((("titulo" IS NULL) OR ("char_length"("titulo") <= 100)))
);


ALTER TABLE "public"."solicitacoes_mensagem" OWNER TO "postgres";


ALTER TABLE ONLY "public"."acesso_membros"
    ADD CONSTRAINT "acesso_membros_pkey" PRIMARY KEY ("acesso_id", "user_id");



ALTER TABLE ONLY "public"."acessos"
    ADD CONSTRAINT "acessos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favoritos"
    ADD CONSTRAINT "favoritos_pkey" PRIMARY KEY ("user_id", "mensagem_id");



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recentes"
    ADD CONSTRAINT "recentes_pkey" PRIMARY KEY ("user_id", "mensagem_id");



ALTER TABLE ONLY "public"."registros_atividade"
    ADD CONSTRAINT "registros_atividade_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_formato_check" CHECK ((("status" <> 'pendente'::"text") OR (("tipo" = 'criacao'::"text") AND ("mensagem_id" IS NULL) AND ("categoria_id" IS NOT NULL) AND (("char_length"("btrim"("titulo")) >= 1) AND ("char_length"("btrim"("titulo")) <= 100)) AND (("char_length"("btrim"("conteudo")) >= 1) AND ("char_length"("btrim"("conteudo")) <= 2000)) AND ("categoria_id_anterior" IS NULL) AND ("categoria_anterior" IS NULL) AND ("titulo_anterior" IS NULL) AND ("conteudo_anterior" IS NULL) AND ("tags_anterior" IS NULL)) OR (("tipo" = 'edicao'::"text") AND ("mensagem_id" IS NOT NULL) AND ("categoria_id" IS NOT NULL) AND (("char_length"("btrim"("titulo")) >= 1) AND ("char_length"("btrim"("titulo")) <= 100)) AND (("char_length"("btrim"("conteudo")) >= 1) AND ("char_length"("btrim"("conteudo")) <= 2000)) AND ("categoria_id_anterior" IS NOT NULL) AND ("categoria_anterior" IS NOT NULL) AND ("titulo_anterior" IS NOT NULL) AND ("conteudo_anterior" IS NOT NULL)) OR (("tipo" = 'arquivamento'::"text") AND ("mensagem_id" IS NOT NULL) AND ("categoria_id" IS NULL) AND ("categoria" IS NULL) AND ("titulo" IS NULL) AND ("conteudo" IS NULL) AND ("tags" IS NULL) AND ("categoria_id_anterior" IS NOT NULL) AND ("categoria_anterior" IS NOT NULL) AND ("titulo_anterior" IS NOT NULL) AND ("conteudo_anterior" IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_tags_check" CHECK (("private"."request_tags_are_valid"("tags") AND "private"."request_tags_are_valid"("tags_anterior"))) NOT VALID;



CREATE INDEX "acesso_membros_user_id_idx" ON "public"."acesso_membros" USING "btree" ("user_id");



CREATE INDEX "categorias_acesso_id_idx" ON "public"."categorias" USING "btree" ("acesso_id");



CREATE INDEX "mensagens_acesso_categoria_ativas_idx" ON "public"."mensagens" USING "btree" ("acesso_id", "categoria_id") WHERE ("arquivado_em" IS NULL);



CREATE INDEX "mensagens_acesso_updated_ativas_idx" ON "public"."mensagens" USING "btree" ("acesso_id", "updated_at" DESC) WHERE ("arquivado_em" IS NULL);



CREATE INDEX "mensagens_categoria_id_idx" ON "public"."mensagens" USING "btree" ("categoria_id");



CREATE INDEX "mensagens_tags_gin_idx" ON "public"."mensagens" USING "gin" ("tags");



CREATE INDEX "recentes_user_used_at_idx" ON "public"."recentes" USING "btree" ("user_id", "used_at" DESC);



CREATE INDEX "registros_atividade_acesso_created_idx" ON "public"."registros_atividade" USING "btree" ("acesso_id", "created_at" DESC);



CREATE UNIQUE INDEX "solicitacoes_solicitante_idempotency_uidx" ON "public"."solicitacoes_mensagem" USING "btree" ("solicitado_por", "idempotency_key");



CREATE INDEX "solicitacoes_status_criado_em_idx" ON "public"."solicitacoes_mensagem" USING "btree" ("status", "criado_em");



CREATE OR REPLACE TRIGGER "audit_acesso_membros" AFTER INSERT OR DELETE ON "public"."acesso_membros" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "audit_acessos" AFTER INSERT OR UPDATE ON "public"."acessos" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "audit_categorias" AFTER INSERT OR UPDATE ON "public"."categorias" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "audit_mensagens_insert" AFTER INSERT ON "public"."mensagens" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "audit_mensagens_update" AFTER UPDATE OF "categoria_id", "titulo", "conteudo", "tags", "arquivado_em", "arquivado_por" ON "public"."mensagens" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "audit_profiles" AFTER UPDATE OF "nome", "email", "role", "ativo" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."registrar_mudanca_administrativa"();



CREATE OR REPLACE TRIGGER "categorias_propagar_nome" AFTER UPDATE OF "nome" ON "public"."categorias" FOR EACH ROW EXECUTE FUNCTION "public"."propagar_nome_categoria"();



CREATE OR REPLACE TRIGGER "mensagens_sincronizar_categoria" BEFORE INSERT OR UPDATE OF "categoria_id", "acesso_id" ON "public"."mensagens" FOR EACH ROW EXECUTE FUNCTION "public"."sincronizar_categoria_mensagem"();



ALTER TABLE ONLY "public"."acesso_membros"
    ADD CONSTRAINT "acesso_membros_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acesso_membros"
    ADD CONSTRAINT "acesso_membros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_arquivado_por_fkey" FOREIGN KEY ("arquivado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."favoritos"
    ADD CONSTRAINT "favoritos_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favoritos"
    ADD CONSTRAINT "favoritos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_arquivado_por_fkey" FOREIGN KEY ("arquivado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recentes"
    ADD CONSTRAINT "recentes_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recentes"
    ADD CONSTRAINT "recentes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registros_atividade"
    ADD CONSTRAINT "registros_atividade_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registros_atividade"
    ADD CONSTRAINT "registros_atividade_ator_id_fkey" FOREIGN KEY ("ator_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_categoria_id_anterior_fkey" FOREIGN KEY ("categoria_id_anterior") REFERENCES "public"."categorias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."acesso_membros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acesso_membros_delete_superadmin" ON "public"."acesso_membros" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "acesso_membros_insert_superadmin" ON "public"."acesso_membros" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "acesso_membros_select_own_or_superadmin" ON "public"."acesso_membros" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_superadmin"() AS "is_superadmin")));



ALTER TABLE "public"."acessos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acessos_insert_superadmin" ON "public"."acessos" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "acessos_select_authorized_active" ON "public"."acessos" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_superadmin"() AS "is_superadmin") OR (("ativo" = true) AND ( SELECT "private"."can_use_access"("acessos"."id") AS "can_use_access"))));



CREATE POLICY "acessos_update_superadmin" ON "public"."acessos" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categorias_insert_superadmin" ON "public"."categorias" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "categorias_select_authorized" ON "public"."categorias" FOR SELECT TO "authenticated" USING ((( SELECT "private"."can_use_access"("categorias"."acesso_id") AS "can_use_access") AND (( SELECT "private"."is_superadmin"() AS "is_superadmin") OR ("arquivado_em" IS NULL))));



CREATE POLICY "categorias_update_superadmin" ON "public"."categorias" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



ALTER TABLE "public"."favoritos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "favoritos_delete_own" ON "public"."favoritos" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "favoritos_insert_own_active" ON "public"."favoritos" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "favoritos"."mensagem_id") AND ("m"."arquivado_em" IS NULL) AND ( SELECT "private"."can_use_access"("m"."acesso_id") AS "can_use_access"))))));



CREATE POLICY "favoritos_select_own_active" ON "public"."favoritos" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "favoritos"."mensagem_id") AND ("m"."arquivado_em" IS NULL) AND ( SELECT "private"."can_use_access"("m"."acesso_id") AS "can_use_access"))))));



ALTER TABLE "public"."mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mensagens_insert_superadmin" ON "public"."mensagens" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "mensagens_select_authorized" ON "public"."mensagens" FOR SELECT TO "authenticated" USING ((( SELECT "private"."can_use_access"("mensagens"."acesso_id") AS "can_use_access") AND (( SELECT "private"."is_superadmin"() AS "is_superadmin") OR ("arquivado_em" IS NULL))));



CREATE POLICY "mensagens_update_superadmin" ON "public"."mensagens" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own_or_superadmin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_superadmin"() AS "is_superadmin")));



CREATE POLICY "profiles_update_superadmin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



ALTER TABLE "public"."recentes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recentes_delete_own" ON "public"."recentes" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "recentes_insert_own_active" ON "public"."recentes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "recentes"."mensagem_id") AND ("m"."arquivado_em" IS NULL) AND ( SELECT "private"."can_use_access"("m"."acesso_id") AS "can_use_access"))))));



CREATE POLICY "recentes_select_own_active" ON "public"."recentes" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "recentes"."mensagem_id") AND ("m"."arquivado_em" IS NULL) AND ( SELECT "private"."can_use_access"("m"."acesso_id") AS "can_use_access"))))));



CREATE POLICY "recentes_update_own_active" ON "public"."recentes" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."registros_atividade" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registros_atividade_select_superadmin" ON "public"."registros_atividade" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_superadmin"() AS "is_superadmin"));



CREATE POLICY "solicitacoes_insert_own_access" ON "public"."solicitacoes_mensagem" FOR INSERT TO "authenticated" WITH CHECK ((("solicitado_por" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text") AND ("revisado_por" IS NULL) AND ("revisado_em" IS NULL) AND ("motivo_rejeicao" IS NULL) AND ( SELECT "private"."can_use_access"("solicitacoes_mensagem"."acesso_id") AS "can_use_access") AND ((("tipo" = 'criacao'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."categorias" "c"
  WHERE (("c"."id" = "solicitacoes_mensagem"."categoria_id") AND ("c"."acesso_id" = "solicitacoes_mensagem"."acesso_id") AND ("c"."arquivado_em" IS NULL) AND ("c"."nome" = "solicitacoes_mensagem"."categoria"))))) OR (("tipo" = 'edicao'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "solicitacoes_mensagem"."mensagem_id") AND ("m"."acesso_id" = "solicitacoes_mensagem"."acesso_id") AND ("m"."arquivado_em" IS NULL) AND ("m"."categoria_id" = "solicitacoes_mensagem"."categoria_id_anterior") AND ("m"."categoria" = "solicitacoes_mensagem"."categoria_anterior") AND ("m"."titulo" = "solicitacoes_mensagem"."titulo_anterior") AND ("m"."conteudo" = "solicitacoes_mensagem"."conteudo_anterior") AND (NOT ("m"."tags" IS DISTINCT FROM "solicitacoes_mensagem"."tags_anterior"))))) AND (EXISTS ( SELECT 1
   FROM "public"."categorias" "c"
  WHERE (("c"."id" = "solicitacoes_mensagem"."categoria_id") AND ("c"."acesso_id" = "solicitacoes_mensagem"."acesso_id") AND ("c"."arquivado_em" IS NULL) AND ("c"."nome" = "solicitacoes_mensagem"."categoria"))))) OR (("tipo" = 'arquivamento'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "solicitacoes_mensagem"."mensagem_id") AND ("m"."acesso_id" = "solicitacoes_mensagem"."acesso_id") AND ("m"."arquivado_em" IS NULL) AND ("m"."categoria_id" = "solicitacoes_mensagem"."categoria_id_anterior") AND ("m"."categoria" = "solicitacoes_mensagem"."categoria_anterior") AND ("m"."titulo" = "solicitacoes_mensagem"."titulo_anterior") AND ("m"."conteudo" = "solicitacoes_mensagem"."conteudo_anterior") AND (NOT ("m"."tags" IS DISTINCT FROM "solicitacoes_mensagem"."tags_anterior")))))))));



ALTER TABLE "public"."solicitacoes_mensagem" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solicitacoes_select_own_or_superadmin" ON "public"."solicitacoes_mensagem" FOR SELECT TO "authenticated" USING ((("solicitado_por" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_superadmin"() AS "is_superadmin")));



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_use_access"("p_access_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_use_access"("p_access_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."can_use_access"("p_access_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."registrar_mudanca_administrativa"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."request_tags_are_valid"("p_tags" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."request_tags_are_valid"("p_tags" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") TO "authenticated";



GRANT ALL ON TABLE "public"."categorias" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."categorias" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arquivar_categoria"("p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arquivar_categoria"("p_category_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."arquivar_categoria"("p_category_id" "uuid") TO "authenticated";



GRANT ALL ON TABLE "public"."mensagens" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."mensagens" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arquivar_mensagem"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arquivar_mensagem"("p_message_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."arquivar_mensagem"("p_message_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."propagar_nome_categoria"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_uso_mensagem"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_uso_mensagem"("p_message_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."registrar_uso_mensagem"("p_message_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."restaurar_categoria"("p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restaurar_categoria"("p_category_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."restaurar_categoria"("p_category_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."restaurar_mensagem"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restaurar_mensagem"("p_message_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."restaurar_mensagem"("p_message_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sincronizar_categoria_mensagem"() TO "service_role";



GRANT ALL ON TABLE "public"."acesso_membros" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."acesso_membros" TO "authenticated";



GRANT ALL ON TABLE "public"."acessos" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."acessos" TO "authenticated";



GRANT ALL ON TABLE "public"."favoritos" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."favoritos" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."recentes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recentes" TO "authenticated";



GRANT ALL ON TABLE "public"."registros_atividade" TO "service_role";
GRANT SELECT ON TABLE "public"."registros_atividade" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."registros_atividade_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_mensagem" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."solicitacoes_mensagem" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
