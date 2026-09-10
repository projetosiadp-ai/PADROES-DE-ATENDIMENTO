


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    -- marca primeiro (ver comentario (3) acima), so entao apaga
    update public.solicitacoes_mensagem
      set status = 'aprovada', revisado_por = auth.uid(), revisado_em = now()
      where id = p_id;

    delete from public.mensagens where id = v_sol.mensagem_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";

CREATE TRIGGER "on_auth_user_created"
    AFTER INSERT ON "auth"."users"
    FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();


CREATE OR REPLACE FUNCTION "public"."increment_frequencia"("msg_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."increment_frequencia"("msg_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_acesso_admin"("p_acesso_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin'
  ) or exists (
    select 1 from public.acesso_membros
    where acesso_id = p_acesso_id and user_id = auth.uid() and is_admin_local = true
  );
$$;


ALTER FUNCTION "public"."is_acesso_admin"("p_acesso_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_acesso_member"("p_acesso_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_superadmin() or exists (
    select 1 from public.acesso_membros
    where acesso_id = p_acesso_id and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_acesso_member"("p_acesso_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."acesso_membros" (
    "acesso_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_admin_local" boolean DEFAULT false NOT NULL
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


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favoritos" (
    "user_id" "uuid" NOT NULL,
    "mensagem_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favoritos" OWNER TO "postgres";


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
    CONSTRAINT "mensagens_conteudo_check" CHECK (("char_length"("conteudo") <= 2000)),
    CONSTRAINT "mensagens_titulo_check" CHECK (("char_length"("titulo") <= 100))
);


ALTER TABLE "public"."mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['superadmin'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recentes" (
    "user_id" "uuid" NOT NULL,
    "mensagem_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recentes" OWNER TO "postgres";


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
    CONSTRAINT "solicitacoes_mensagem_conteudo_check" CHECK ((("conteudo" IS NULL) OR ("char_length"("conteudo") <= 2000))),
    CONSTRAINT "solicitacoes_mensagem_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text", 'rejeitada'::"text"]))),
    CONSTRAINT "solicitacoes_mensagem_tipo_check" CHECK (("tipo" = ANY (ARRAY['criacao'::"text", 'edicao'::"text", 'exclusao'::"text"]))),
    CONSTRAINT "solicitacoes_mensagem_tipo_mensagem_ck" CHECK ((("status" <> 'pendente'::"text") OR (("tipo" = 'criacao'::"text") AND ("mensagem_id" IS NULL)) OR (("tipo" = ANY (ARRAY['edicao'::"text", 'exclusao'::"text"])) AND ("mensagem_id" IS NOT NULL)))),
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



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acesso_membros"
    ADD CONSTRAINT "acesso_membros_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acesso_membros"
    ADD CONSTRAINT "acesso_membros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favoritos"
    ADD CONSTRAINT "favoritos_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favoritos"
    ADD CONSTRAINT "favoritos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recentes"
    ADD CONSTRAINT "recentes_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recentes"
    ADD CONSTRAINT "recentes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."acessos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."solicitacoes_mensagem"
    ADD CONSTRAINT "solicitacoes_mensagem_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."acesso_membros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acesso_membros_select_own_or_superadmin" ON "public"."acesso_membros" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "acesso_membros_write_superadmin" ON "public"."acesso_membros" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



ALTER TABLE "public"."acessos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acessos_select_members_or_superadmin" ON "public"."acessos" FOR SELECT USING ("public"."is_acesso_member"("id"));



CREATE POLICY "acessos_write_superadmin" ON "public"."acessos" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categorias_select_members" ON "public"."categorias" FOR SELECT USING ("public"."is_acesso_member"("acesso_id"));



CREATE POLICY "categorias_write_admins" ON "public"."categorias" USING ("public"."is_acesso_admin"("acesso_id")) WITH CHECK ("public"."is_acesso_admin"("acesso_id"));



ALTER TABLE "public"."favoritos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "favoritos_own" ON "public"."favoritos" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "favoritos"."mensagem_id") AND "public"."is_acesso_member"("m"."acesso_id"))))));



ALTER TABLE "public"."mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mensagens_select_members" ON "public"."mensagens" FOR SELECT USING ("public"."is_acesso_member"("acesso_id"));



CREATE POLICY "mensagens_write_admins" ON "public"."mensagens" USING ("public"."is_acesso_admin"("acesso_id")) WITH CHECK ("public"."is_acesso_admin"("acesso_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own_or_superadmin" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "profiles_update_superadmin" ON "public"."profiles" FOR UPDATE USING ("public"."is_superadmin"());



ALTER TABLE "public"."recentes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recentes_own" ON "public"."recentes" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."mensagens" "m"
  WHERE (("m"."id" = "recentes"."mensagem_id") AND "public"."is_acesso_member"("m"."acesso_id"))))));



CREATE POLICY "solicitacoes_insert_members" ON "public"."solicitacoes_mensagem" FOR INSERT WITH CHECK ((("solicitado_por" = "auth"."uid"()) AND "public"."is_acesso_member"("acesso_id")));



ALTER TABLE "public"."solicitacoes_mensagem" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solicitacoes_select_members_or_superadmin" ON "public"."solicitacoes_mensagem" FOR SELECT USING ("public"."is_acesso_member"("acesso_id"));



CREATE POLICY "solicitacoes_update_superadmin" ON "public"."solicitacoes_mensagem" FOR UPDATE USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_solicitacao"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_frequencia"("msg_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_frequencia"("msg_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_frequencia"("msg_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_acesso_admin"("p_acesso_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_acesso_admin"("p_acesso_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_acesso_admin"("p_acesso_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_acesso_member"("p_acesso_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_acesso_member"("p_acesso_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_acesso_member"("p_acesso_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejeitar_solicitacao"("p_id" "uuid", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."acesso_membros" TO "anon";
GRANT ALL ON TABLE "public"."acesso_membros" TO "authenticated";
GRANT ALL ON TABLE "public"."acesso_membros" TO "service_role";



GRANT ALL ON TABLE "public"."acessos" TO "anon";
GRANT ALL ON TABLE "public"."acessos" TO "authenticated";
GRANT ALL ON TABLE "public"."acessos" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON TABLE "public"."favoritos" TO "anon";
GRANT ALL ON TABLE "public"."favoritos" TO "authenticated";
GRANT ALL ON TABLE "public"."favoritos" TO "service_role";



GRANT ALL ON TABLE "public"."mensagens" TO "anon";
GRANT ALL ON TABLE "public"."mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recentes" TO "anon";
GRANT ALL ON TABLE "public"."recentes" TO "authenticated";
GRANT ALL ON TABLE "public"."recentes" TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_mensagem" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_mensagem" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_mensagem" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






