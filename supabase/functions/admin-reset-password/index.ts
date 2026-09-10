const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function serviceHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

function generateTemporaryPassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%"];
  const randomValues = crypto.getRandomValues(new Uint32Array(32));
  let cursor = 0;
  const pick = (characters: string) => characters[randomValues[cursor++] % characters.length];
  const password = groups.map(pick);
  const all = groups.join("");
  while (password.length < 16) password.push(pick(all));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomValues[cursor++] % (index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join("");
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
      headers: serviceHeaders(serviceRoleKey),
    });
    const callerProfiles = callerProfileResponse.ok ? await callerProfileResponse.json() : [];
    if (callerProfiles[0]?.role !== "superadmin" || callerProfiles[0]?.ativo !== true) {
      return respond(403, { error: "Apenas superadministradores ativos podem redefinir senhas." });
    }

    const body = await req.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!userId) return respond(400, { error: "Informe a conta-alvo." });
    const targetQuery = new URLSearchParams({ select: "id,role", id: `eq.${userId}` });
    const targetResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?${targetQuery}`, {
      headers: serviceHeaders(serviceRoleKey),
    });
    const targets = targetResponse.ok ? await targetResponse.json() : [];
    if (!targets[0] || !["colaborador", "superadmin"].includes(targets[0].role)) {
      return respond(404, { error: "Conta-alvo não encontrada." });
    }

    const temporaryPassword = generateTemporaryPassword();
    const updateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({ password: temporaryPassword }),
    });
    if (!updateResponse.ok) return respond(400, { error: "Não foi possível redefinir a senha da conta." });
    return respond(200, { temporaryPassword });
  } catch {
    return respond(500, { error: "Não foi possível redefinir a senha da conta." });
  }
});
