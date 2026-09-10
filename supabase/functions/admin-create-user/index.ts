const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const allowedRoles = new Set(["colaborador", "superadmin"]);

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function restHeaders(serviceRoleKey: string, prefer?: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Método não permitido." });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond(401, { error: "Não autenticado." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond(500, { error: "Serviço de contas indisponível." });

    const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anonKey },
    });
    if (!callerResponse.ok) return respond(401, { error: "Sessão inválida." });
    const caller = await callerResponse.json();

    const callerQuery = new URLSearchParams({ select: "role,ativo", id: `eq.${caller.id}` });
    const callerProfileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?${callerQuery}`, {
      headers: restHeaders(serviceRoleKey),
    });
    const callerProfiles = callerProfileResponse.ok ? await callerProfileResponse.json() : [];
    if (callerProfiles[0]?.role !== "superadmin" || callerProfiles[0]?.ativo !== true) {
      return respond(403, { error: "Apenas superadministradores ativos podem criar contas." });
    }

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const temporaryPassword = typeof body?.temporaryPassword === "string" ? body.temporaryPassword : "";
    const role = body?.role ?? "colaborador";
    const accessIds = Array.isArray(body?.accessIds)
      ? [...new Set(body.accessIds.filter((id: unknown) => typeof id === "string" && id.length > 0))]
      : [];
    if (!name || !email || temporaryPassword.length < 8 || !allowedRoles.has(role)) {
      return respond(400, { error: "Informe nome, e-mail, senha temporária válida e papel permitido." });
    }

    if (accessIds.length) {
      const accessQuery = new URLSearchParams({ select: "id", id: `in.(${accessIds.join(",")})` });
      const accessResponse = await fetch(`${supabaseUrl}/rest/v1/acessos?${accessQuery}`, { headers: restHeaders(serviceRoleKey) });
      const accesses = accessResponse.ok ? await accessResponse.json() : [];
      if (accesses.length !== accessIds.length) return respond(400, { error: "Um ou mais acessos informados são inválidos." });
    }

    const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders(serviceRoleKey),
      body: JSON.stringify({ email, password: temporaryPassword, email_confirm: true, user_metadata: { nome: name } }),
    });
    if (!createResponse.ok) return respond(400, { error: "Não foi possível criar a conta. Verifique se o e-mail já está em uso." });
    const created = await createResponse.json();
    const userId = created.id;
    const rollback = () => fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE", headers: restHeaders(serviceRoleKey),
    });

    const profileQuery = new URLSearchParams({ id: `eq.${userId}` });
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?${profileQuery}`, {
      method: "PATCH", headers: restHeaders(serviceRoleKey),
      body: JSON.stringify({ nome: name, email, role, ativo: true }),
    });
    if (!updateResponse.ok) {
      await rollback();
      return respond(500, { error: "Não foi possível concluir a criação da conta." });
    }

    if (accessIds.length) {
      const membershipResponse = await fetch(`${supabaseUrl}/rest/v1/acesso_membros`, {
        method: "POST", headers: restHeaders(serviceRoleKey),
        body: JSON.stringify(accessIds.map(accessId => ({ acesso_id: accessId, user_id: userId }))),
      });
      if (!membershipResponse.ok) {
        await rollback();
        return respond(500, { error: "Não foi possível concluir os vínculos da conta." });
      }
    }

    return respond(200, { userId });
  } catch {
    return respond(500, { error: "Não foi possível concluir a criação da conta." });
  }
});
