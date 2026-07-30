// api.js
// Data access layer: every call to Supabase goes through here. app.js never
// touches the supabase client directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOGIN_TS_KEY = 'dp_login_ts';
const LOGIN_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias

function fail(prefix, error) {
  throw new Error(`${prefix}: ${error?.message || error}`);
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail('Não foi possível entrar', error);
  try { localStorage.setItem(LOGIN_TS_KEY, String(Date.now())); } catch (e) {}
}

export async function signOut() {
  await supabase.auth.signOut();
  try { localStorage.removeItem(LOGIN_TS_KEY); } catch (e) {}
}

export async function getSession() {
  // Local/cached lookup only — no network round trip. Callers that need the
  // profile fetch it via fetchAppData(), in parallel with everything else.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Supabase's own refresh token has no fixed lifetime, so a login otherwise
  // persists forever. Enforce our own 5-day cap on top of it.
  let loginTs = null;
  try { loginTs = Number(localStorage.getItem(LOGIN_TS_KEY)); } catch (e) {}
  if (loginTs && Date.now() - loginTs > LOGIN_TTL_MS) {
    await signOut();
    return null;
  }
  if (!loginTs) {
    try { localStorage.setItem(LOGIN_TS_KEY, String(Date.now())); } catch (e) {}
  }
  return session;
}

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

export async function fetchAppData(userId) {
  // Profile and acesso_membros don't depend on each other — fire both at once
  // instead of waiting on one before starting the other (was the main source
  // of extra login latency: 2 sequential round trips collapsed into 1).
  const [{ data: profile, error: pErr }, { data: acessoMembros, error: amErr }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('acesso_membros').select('*').eq('user_id', userId),
  ]);
  if (pErr) fail('Não foi possível carregar o perfil', pErr);
  if (amErr) fail('Não foi possível carregar seus acessos', amErr);

  const acessoIds = acessoMembros.map(m => m.acesso_id);
  if (acessoIds.length === 0) return { profile, acessos: [], acessoMembros: [], categorias: [], mensagens: [], favoritos: [], recentes: [] };

  const [{ data: acessos, error: aErr }, { data: categorias, error: cErr }, { data: mensagens, error: mErr },
         { data: favoritos, error: fErr }, { data: recentes, error: rErr }] = await Promise.all([
    supabase.from('acessos').select('*').in('id', acessoIds),
    supabase.from('categorias').select('*').in('acesso_id', acessoIds).order('ordem'),
    supabase.from('mensagens').select('*').in('acesso_id', acessoIds).order('created_at', { ascending: false }),
    supabase.from('favoritos').select('mensagem_id').eq('user_id', userId),
    supabase.from('recentes').select('mensagem_id').eq('user_id', userId).order('used_at', { ascending: false }).limit(5),
  ]);
  if (aErr) fail('Não foi possível carregar os acessos', aErr);
  if (cErr) fail('Não foi possível carregar as categorias', cErr);
  if (mErr) fail('Não foi possível carregar as mensagens', mErr);
  if (fErr) fail('Não foi possível carregar os favoritos', fErr);
  if (rErr) fail('Não foi possível carregar os recentes', rErr);

  return { profile, acessos, acessoMembros, categorias, mensagens, favoritos, recentes };
}

export async function saveMensagem({ id, acessoId, categoria, titulo, tags, conteudo }) {
  if (id) {
    const { data, error } = await supabase.from('mensagens').update({ categoria, titulo, tags, conteudo, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) fail('Não foi possível salvar a mensagem', error);
    return data;
  } else {
    const { data, error } = await supabase.from('mensagens').insert({ acesso_id: acessoId, categoria, titulo, tags, conteudo }).select().single();
    if (error) fail('Não foi possível criar a mensagem', error);
    return data;
  }
}

export async function deleteMensagem(id) {
  const { error } = await supabase.from('mensagens').delete().eq('id', id);
  if (error) fail('Não foi possível excluir a mensagem', error);
}

export async function saveCategoria({ id, acessoId, nome }) {
  if (id) {
    const { error } = await supabase.from('categorias').update({ nome }).eq('id', id);
    if (error) fail('Não foi possível salvar a categoria', error);
  } else {
    const { error } = await supabase.from('categorias').insert({ acesso_id: acessoId, nome });
    if (error) fail('Não foi possível criar a categoria', error);
  }
}

export async function deleteCategoria(id) {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) fail('Não foi possível excluir a categoria', error);
}

export async function saveAcesso({ nome, descricao, cor }) {
  const { data, error } = await supabase.from('acessos').insert({ nome, descricao, cor }).select().single();
  if (error) fail('Não foi possível criar o acesso', error);
  const defaults = ['Boas-vindas', 'Resolução de Problema', 'Pendências', 'Encerramento'];
  const { error: catErr } = await supabase.from('categorias').insert(defaults.map((n, i) => ({ acesso_id: data.id, nome: n, ordem: i })));
  if (catErr) fail('Acesso criado, mas falhou ao criar categorias padrão', catErr);
}

export async function toggleAcessoStatus(id, ativo) {
  const { error } = await supabase.from('acessos').update({ ativo }).eq('id', id);
  if (error) fail('Não foi possível atualizar o status do acesso', error);
}

export async function toggleUserLink(userId, acessoId, linked) {
  if (linked) {
    const { error } = await supabase.from('acesso_membros').delete().eq('user_id', userId).eq('acesso_id', acessoId);
    if (error) fail('Não foi possível desvincular o usuário', error);
  } else {
    const { error } = await supabase.from('acesso_membros').insert({ user_id: userId, acesso_id: acessoId, is_admin_local: false });
    if (error) fail('Não foi possível vincular o usuário', error);
  }
}

export async function toggleUserAdminLocal(userId, acessoId, value) {
  const { error } = await supabase.from('acesso_membros').update({ is_admin_local: value }).eq('user_id', userId).eq('acesso_id', acessoId);
  if (error) fail('Não foi possível atualizar o admin local', error);
}

export async function toggleFavorito(userId, mensagemId, isFav) {
  if (isFav) {
    const { error } = await supabase.from('favoritos').delete().eq('user_id', userId).eq('mensagem_id', mensagemId);
    if (error) fail('Não foi possível remover o favorito', error);
  } else {
    const { error } = await supabase.from('favoritos').insert({ user_id: userId, mensagem_id: mensagemId });
    if (error) fail('Não foi possível favoritar', error);
  }
}

export async function recordRecente(userId, mensagemId) {
  const { error } = await supabase.from('recentes').upsert({ user_id: userId, mensagem_id: mensagemId, used_at: new Date().toISOString() });
  if (error) fail('Não foi possível registrar o uso recente', error);
}

export async function incrementFrequencia(mensagemId) {
  const { error } = await supabase.rpc('increment_frequencia', { msg_id: mensagemId });
  if (error) fail('Não foi possível atualizar a frequência', error);
}

export async function adminCreateUser(input) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: input });
  if (error) return { ok: false, error: error.message };
  return data;
}
