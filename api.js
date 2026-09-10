// api.js
// Data access layer: the only module that talks to Supabase. Its exported surface is
// exactly specs/001-evoluir-biblioteca-mensagens/contracts/data-access.md, enforced by
// tests/data-access-contract.test.mjs.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { APP_ERROR_CODES, AppError, normalizeApiError } from './domain/api-errors.mjs';
import { REQUEST_TYPES } from './domain/requests.mjs';

export { APP_ERROR_CODES, AppError, normalizeApiError };

if (!globalThis.supabase?.createClient) {
  throw new Error('Cliente Supabase não carregado.');
}

const supabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOGIN_TS_KEY = 'dp_login_ts';
const SESSION_EXPIRED_KEY = 'dp_session_expired';
const LOGIN_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias

function fail(prefix, error) {
  throw normalizeApiError(error, { message: prefix });
}

/* ---------------- authentication and bootstrap ---------------- */

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail('Não foi possível entrar', error);
  try {
    localStorage.setItem(LOGIN_TS_KEY, String(Date.now()));
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch (e) {}
}

export async function signOut() {
  await supabase.auth.signOut();
  try { localStorage.removeItem(LOGIN_TS_KEY); } catch (e) {}
}

// Ends the session and leaves a one-shot notice for the login screen.
export async function expireSession() {
  try { sessionStorage.setItem(SESSION_EXPIRED_KEY, '1'); } catch (e) {}
  await signOut();
}

export function consumeSessionExpiredNotice() {
  try {
    const expired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return expired;
  } catch (e) {
    return false;
  }
}

export async function getSession() {
  // Local/cached lookup only — no network round trip.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Supabase's own refresh token has no fixed lifetime, so a login otherwise
  // persists forever. Enforce our own 5-day cap on top of it.
  let loginTs = null;
  try { loginTs = Number(localStorage.getItem(LOGIN_TS_KEY)); } catch (e) {}
  if (loginTs && Date.now() - loginTs > LOGIN_TTL_MS) {
    await expireSession();
    return null;
  }
  if (!loginTs) {
    try { localStorage.setItem(LOGIN_TS_KEY, String(Date.now())); } catch (e) {}
  }
  return session;
}

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase holds its auth lock while invoking this listener. Defer any
    // callback that may query Supabase so the lock is released first.
    setTimeout(() => callback(session), 0);
  });
  return () => subscription.unsubscribe();
}

export async function fetchSessionContext(userId, retryFutureJwt = true) {
  if (!userId) throw new AppError('AUTH_REQUIRED');

  const { data: profileWithMemberships, error: profileError } = await supabase
    .from('profiles')
    .select('id, nome, email, role, ativo, memberships:acesso_membros(user_id, acesso_id, access:acessos(id, nome, descricao, cor, ativo, created_at))')
    .eq('id', userId)
    .single();
  if (retryFutureJwt && /jwt issued at future/i.test(profileError?.message ?? '')) {
    await new Promise(resolve => setTimeout(resolve, 1_100));
    return fetchSessionContext(userId, false);
  }
  if (profileError) fail('Não foi possível carregar o perfil', profileError);
  const { memberships: embeddedMemberships = [], ...profile } = profileWithMemberships;
  const memberships = embeddedMemberships.map(({ user_id, acesso_id }) => ({ user_id, acesso_id }));
  let accesses = embeddedMemberships.map(({ access }) => access).filter(Boolean);
  if (profile.role === 'superadmin') {
    const { data, error } = await supabase.from('acessos')
      .select('id, nome, descricao, cor, ativo, created_at').order('nome', { ascending: true });
    if (error) fail('Não foi possível carregar os acessos', error);
    accesses = data;
  } else {
    accesses.sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
  }
  return { profile, accesses, memberships };
}

/* ---------------- active library ---------------- */

export async function fetchAccessLibraryCore(accessId) {
  if (!accessId) throw new AppError('VALIDATION');

  const [
    { data: categories, error: categoryError },
    { data: messages, error: messageError },
  ] = await Promise.all([
    supabase
      .from('categorias')
      .select('id, acesso_id, nome, ordem, created_at, updated_at')
      .eq('acesso_id', accessId)
      .is('arquivado_em', null)
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true }),
    supabase
      .from('mensagens')
      .select('id, acesso_id, categoria_id, categoria, titulo, conteudo, tags, frequencia, created_at, updated_at')
      .eq('acesso_id', accessId)
      .is('arquivado_em', null)
      .order('created_at', { ascending: false }),
  ]);

  if (categoryError) fail('Não foi possível carregar as categorias', categoryError);
  if (messageError) fail('Não foi possível carregar as mensagens', messageError);

  return { categories, messages };
}

export async function fetchAccessPersonalization(userId, accessId) {
  if (!userId || !accessId) throw new AppError('VALIDATION');
  const [{ data: favorites, error: favoriteError }, { data: recents, error: recentError }] = await Promise.all([
    supabase.from('favoritos').select('mensagem_id, mensagem:mensagens!inner(acesso_id)')
      .eq('user_id', userId).eq('mensagem.acesso_id', accessId),
    supabase.from('recentes').select('mensagem_id, used_at, mensagem:mensagens!inner(acesso_id)')
      .eq('user_id', userId).eq('mensagem.acesso_id', accessId)
      .order('used_at', { ascending: false }).limit(5),
  ]);
  if (favoriteError) fail('Não foi possível carregar os favoritos', favoriteError);
  if (recentError) fail('Não foi possível carregar os recentes', recentError);
  return {
    favoriteIds: favorites.map((favorite) => favorite.mensagem_id),
    recentIds: recents.map((recent) => recent.mensagem_id),
  };
}

export async function fetchAccessLibrary(userId, accessId) {
  const [core, personalization] = await Promise.all([
    fetchAccessLibraryCore(accessId),
    fetchAccessPersonalization(userId, accessId),
  ]);
  return { ...core, ...personalization };
}

export async function toggleFavorite(userId, messageId, isFavorite) {
  if (!userId || !messageId || typeof isFavorite !== 'boolean') {
    throw new AppError('VALIDATION');
  }

  const query = isFavorite
    ? supabase.from('favoritos').delete().eq('user_id', userId).eq('mensagem_id', messageId)
    : supabase.from('favoritos').insert({ user_id: userId, mensagem_id: messageId });
  const { error } = await query;
  if (error) fail(isFavorite ? 'Não foi possível remover o favorito' : 'Não foi possível favoritar', error);
}

export async function recordMessageUse(userId, messageId) {
  if (!userId || !messageId) {
    throw new AppError('VALIDATION');
  }

  const { error } = await supabase.rpc('registrar_uso_mensagem', { p_message_id: messageId });
  if (error) fail('Não foi possível registrar o uso da mensagem', error);
}

/* ---------------- message requests ---------------- */

export async function submitMessageRequest({
  idempotencyKey,
  accessId,
  type,
  messageId = null,
  categoryId = null,
  title = null,
  tags = null,
  content = null,
  previous = null,
}) {
  if (!idempotencyKey || !accessId || !REQUEST_TYPES.includes(type)) {
    throw new AppError('VALIDATION');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) fail('Sua sessão expirou. Entre novamente.', userError);
  const userId = userData?.user?.id;
  if (!userId) throw new AppError('AUTH_REQUIRED');

  let categoryName = null;
  if (type !== 'arquivamento') {
    if (!categoryId) throw new AppError('VALIDATION');
    const { data: category, error: categoryError } = await supabase
      .from('categorias')
      .select('nome')
      .eq('id', categoryId)
      .eq('acesso_id', accessId)
      .is('arquivado_em', null)
      .single();
    if (categoryError) fail('Não foi possível validar a categoria', categoryError);
    categoryName = category.nome;
  }

  const payload = {
    idempotency_key: idempotencyKey,
    acesso_id: accessId,
    tipo: type,
    mensagem_id: type === 'criacao' ? null : messageId,
    categoria_id: type === 'arquivamento' ? null : categoryId,
    categoria: type === 'arquivamento' ? null : categoryName,
    titulo: type === 'arquivamento' ? null : title,
    conteudo: type === 'arquivamento' ? null : content,
    tags: type === 'arquivamento' ? null : (tags ?? []),
    categoria_id_anterior: previous?.categoria_id ?? null,
    categoria_anterior: previous?.categoria ?? null,
    titulo_anterior: previous?.titulo ?? null,
    conteudo_anterior: previous?.conteudo ?? null,
    tags_anterior: previous?.tags ?? null,
    solicitado_por: userId,
  };

  const { data, error } = await supabase
    .from('solicitacoes_mensagem')
    .insert(payload)
    .select('id, status')
    .single();
  if (!error) return data;

  const normalized = normalizeApiError(error);
  if (normalized.code !== 'CONFLICT') {
    fail('Não foi possível enviar a proposta para revisão', error);
  }

  const { data: existing, error: existingError } = await supabase
    .from('solicitacoes_mensagem')
    .select('id, status')
    .eq('solicitado_por', userId)
    .eq('idempotency_key', idempotencyKey)
    .single();
  if (existingError) fail('Não foi possível confirmar a proposta já enviada', existingError);
  return existing;
}

export async function listPendingRequests() {
  const { data, error } = await supabase
    .from('solicitacoes_mensagem')
    .select('*, acessos(nome), solicitante:profiles!solicitacoes_mensagem_solicitado_por_fkey(nome)')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true });
  if (error) fail('Não foi possível carregar as solicitações pendentes', error);
  return data;
}

export async function approveMessageRequest(requestId) {
  if (!requestId) throw new AppError('VALIDATION');
  const { data, error } = await supabase.rpc('aprovar_solicitacao', { p_id: requestId }).single();
  if (error) fail('Não foi possível aprovar a solicitação', error);
  return data;
}

export async function rejectMessageRequest(requestId, reason) {
  const normalizedReason = String(reason ?? '').trim();
  if (!requestId || normalizedReason.length < 1 || normalizedReason.length > 500) {
    throw new AppError('VALIDATION');
  }
  const { data, error } = await supabase
    .rpc('rejeitar_solicitacao', { p_id: requestId, p_motivo: normalizedReason })
    .single();
  if (error) fail('Não foi possível rejeitar a solicitação', error);
  return data;
}

/* ---------------- superadministrator content operations ---------------- */

// `categoria` (legacy text) is filled by the mensagens_sincronizar_categoria trigger.
// Updates target only active rows, so editing an item archived meanwhile fails as NOT_FOUND.
export async function saveMessage({ id = null, accessId = null, categoryId, title, tags = [], content }) {
  const fields = {
    categoria_id: categoryId,
    titulo: String(title ?? '').trim(),
    conteudo: String(content ?? '').trim(),
    tags: Array.isArray(tags) ? tags : [],
  };
  if (!categoryId || !fields.titulo || !fields.conteudo || (!id && !accessId)) {
    throw new AppError('VALIDATION');
  }
  const query = id
    ? supabase.from('mensagens').update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id).is('arquivado_em', null)
    : supabase.from('mensagens').insert({ ...fields, acesso_id: accessId });
  const { data, error } = await query.select().single();
  if (error) fail(id ? 'Não foi possível editar a mensagem' : 'Não foi possível criar a mensagem', error);
  return data;
}

async function runLifecycleRpc(name, parameter, id, errorMessage) {
  if (!id) throw new AppError('VALIDATION');
  const { data, error } = await supabase.rpc(name, { [parameter]: id }).single();
  if (error) fail(errorMessage, error);
  return data;
}

export const archiveMessage = (messageId) => runLifecycleRpc('arquivar_mensagem', 'p_message_id', messageId, 'Não foi possível arquivar a mensagem');
export const restoreMessage = (messageId) => runLifecycleRpc('restaurar_mensagem', 'p_message_id', messageId, 'Não foi possível restaurar a mensagem');

// Renames propagate to mensagens.categoria through the categorias_propagar_nome trigger.
export async function saveCategory({ id = null, accessId = null, name, order }) {
  const fields = {
    nome: String(name ?? '').trim(),
    ...(Number.isInteger(order) ? { ordem: order } : {}),
  };
  if (!fields.nome || (!id && !accessId)) throw new AppError('VALIDATION');
  const query = id
    ? supabase.from('categorias').update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id).is('arquivado_em', null)
    : supabase.from('categorias').insert({ ...fields, acesso_id: accessId });
  const { data, error } = await query.select().single();
  if (error) fail(id ? 'Não foi possível editar a categoria' : 'Não foi possível criar a categoria', error);
  return data;
}

export const archiveCategory = (categoryId) => runLifecycleRpc('arquivar_categoria', 'p_category_id', categoryId, 'Não foi possível arquivar a categoria');
export const restoreCategory = (categoryId) => runLifecycleRpc('restaurar_categoria', 'p_category_id', categoryId, 'Não foi possível restaurar a categoria');

export async function listArchivedContent(accessId) {
  if (!accessId) throw new AppError('VALIDATION');
  const [categoriesResult, messagesResult] = await Promise.all([
    supabase.from('categorias').select('*').eq('acesso_id', accessId).not('arquivado_em', 'is', null).order('arquivado_em', { ascending: false }),
    supabase.from('mensagens').select('*').eq('acesso_id', accessId).not('arquivado_em', 'is', null).order('arquivado_em', { ascending: false }),
  ]);
  if (categoriesResult.error) fail('Não foi possível carregar as categorias arquivadas', categoriesResult.error);
  if (messagesResult.error) fail('Não foi possível carregar as mensagens arquivadas', messagesResult.error);
  return { categories: categoriesResult.data, messages: messagesResult.data };
}

/* ---------------- superadministrator access and account operations ---------------- */

export async function createAccess({ name, description = '', color = '#1BA7DC' }) {
  const nome = String(name ?? '').trim();
  if (!nome) throw new AppError('VALIDATION');
  const { data, error } = await supabase.from('acessos')
    .insert({ nome, descricao: String(description ?? '').trim(), cor: color }).select().single();
  if (error) fail('Não foi possível criar o acesso', error);
  return data;
}

export async function setAccessActive(accessId, active) {
  if (!accessId || typeof active !== 'boolean') throw new AppError('VALIDATION');
  const { data, error } = await supabase.from('acessos')
    .update({ ativo: active }).eq('id', accessId).select().single();
  if (error) fail('Não foi possível atualizar o status do acesso', error);
  return data;
}

export async function listProfiles() {
  const { data, error } = await supabase.from('profiles')
    .select('id, nome, email, role, ativo').order('nome');
  if (error) fail('Não foi possível carregar as contas', error);
  return data;
}

export async function listAccessUsers(accessId) {
  if (!accessId) throw new AppError('VALIDATION');
  const { data: members, error: memberError } = await supabase.from('acesso_membros').select('user_id').eq('acesso_id', accessId);
  if (memberError) fail('Não foi possível carregar os usuários do acesso', memberError);
  if (members.length === 0) return [];
  const userIds = members.map(member => member.user_id);
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, nome, email, role, ativo').in('id', userIds);
  if (profileError) fail('Não foi possível carregar os usuários do acesso', profileError);
  return members.map(member => {
    const profile = profiles.find(item => item.id === member.user_id) || {};
    return { userId: member.user_id, name: profile.nome || '—', email: profile.email || '—', role: profile.role, active: profile.ativo };
  });
}

export async function setAccessMembership(userId, accessId, linked) {
  if (!userId || !accessId || typeof linked !== 'boolean') throw new AppError('VALIDATION');
  if (linked) {
    const { error } = await supabase.from('acesso_membros')
      .upsert({ user_id: userId, acesso_id: accessId }, { onConflict: 'acesso_id,user_id' });
    if (error) fail('Não foi possível conceder o acesso', error);
  } else {
    const { error } = await supabase.from('acesso_membros')
      .delete().eq('user_id', userId).eq('acesso_id', accessId);
    if (error) fail('Não foi possível remover o acesso', error);
  }
}

async function invokeAdminFunction(name, body, fallbackMessage) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;

  let responseBody = null;
  try { responseBody = await error.context?.json(); } catch {}
  const safeMessage = typeof responseBody?.error === 'string' ? responseBody.error : fallbackMessage;
  throw normalizeApiError({
    name: error.name,
    message: safeMessage,
    status: error.context?.status,
  }, { message: safeMessage });
}

export async function adminCreateUser({ name, email, temporaryPassword, accessIds, role = 'colaborador' }) {
  const data = await invokeAdminFunction('admin-create-user', {
    name, email, temporaryPassword, accessIds, role,
  }, 'Não foi possível criar a conta.');
  return { userId: data.userId };
}

export async function adminResetPassword(userId) {
  const data = await invokeAdminFunction('admin-reset-password', { userId }, 'Não foi possível redefinir a senha.');
  return { temporaryPassword: data.temporaryPassword };
}
