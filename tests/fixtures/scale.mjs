import { pathToFileURL } from 'node:url';

import { assertLocalUrl, LOCAL_SUPABASE_URL } from './auth.mjs';
import { deterministicUuid, TEST_IDS } from './data.mjs';

const LOCAL_SECRET_KEY_FALLBACK = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const SCALE_PASSWORD = 'ScaleLocal!123';
const FIXED_TIME = '2026-09-02T16:00:00.000Z';

export const SCALE_ACCESS_ID = deterministicUuid(1, 6);
export const SCALE_ACCOUNT = Object.freeze({
  email: 'scale.user.001@local.test',
  password: SCALE_PASSWORD,
});

export function buildScaleFixture() {
  const accounts = Array.from({ length: 100 }, (_, index) => ({
    email: `scale.user.${String(index + 1).padStart(3, '0')}@local.test`,
    password: SCALE_PASSWORD,
    name: `Colaborador Escala ${String(index + 1).padStart(3, '0')}`,
  }));
  const accesses = Array.from({ length: 10 }, (_, index) => ({
    id: deterministicUuid(index + 1, 6),
    nome: `Escala ${String(index + 1).padStart(2, '0')}`,
    descricao: 'Massa local para validação de escala.',
    cor: ['#09679F', '#6D28D9', '#047857', '#B45309', '#B82D2D'][index % 5],
    ativo: true,
    created_at: FIXED_TIME,
  }));
  const categories = accesses.map((access, index) => ({
    id: deterministicUuid(index + 1, 7),
    acesso_id: access.id,
    nome: `Categoria Escala ${String(index + 1).padStart(2, '0')}`,
    ordem: 1,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  }));
  const messages = Array.from({ length: 1_000 }, (_, index) => {
    const accessIndex = Math.floor(index / 100);
    const sequence = index + 1;
    return {
      id: deterministicUuid(sequence, 8),
      acesso_id: accesses[accessIndex].id,
      categoria_id: categories[accessIndex].id,
      categoria: categories[accessIndex].nome,
      titulo: `Mensagem de escala ${String(sequence).padStart(4, '0')}`,
      conteudo: `Conteúdo determinístico da mensagem de escala ${String(sequence).padStart(4, '0')}.`,
      tags: ['escala', `acesso-${String(accessIndex + 1).padStart(2, '0')}`],
      frequencia: sequence % 31,
      created_by: TEST_IDS.superadmin,
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
    };
  });
  return { accounts, accesses, categories, messages };
}

async function request(path, { method = 'GET', body, prefer } = {}) {
  const serviceKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || LOCAL_SECRET_KEY_FALLBACK;
  const response = await fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function upsert(table, rows, conflict = 'id') {
  await request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

async function ensureAccounts(accounts) {
  const listed = await request('/auth/v1/admin/users?page=1&per_page=1000');
  const existing = new Map((listed?.users ?? listed ?? []).map(user => [user.email, user]));
  const resolved = [];

  for (let offset = 0; offset < accounts.length; offset += 10) {
    const batch = accounts.slice(offset, offset + 10);
    const users = await Promise.all(batch.map(async account => {
      if (existing.has(account.email)) return existing.get(account.email);
      return request('/auth/v1/admin/users', {
        method: 'POST',
        body: {
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { nome: account.name },
        },
      });
    }));
    resolved.push(...users);
  }
  return resolved.map((user, index) => ({ ...accounts[index], id: user.id ?? user.user?.id }));
}

export async function seedScaleFixture() {
  assertLocalUrl(LOCAL_SUPABASE_URL, 'Supabase local');
  const fixture = buildScaleFixture();
  const accounts = await ensureAccounts(fixture.accounts);
  if (accounts.some(account => !account.id)) throw new Error('Não foi possível resolver todos os IDs das contas de escala.');

  await upsert('profiles', accounts.map(account => ({
    id: account.id,
    nome: account.name,
    email: account.email,
    role: 'colaborador',
    ativo: true,
  })));
  await upsert('acessos', fixture.accesses);
  await upsert('categorias', fixture.categories);

  for (let offset = 0; offset < fixture.messages.length; offset += 200) {
    await upsert('mensagens', fixture.messages.slice(offset, offset + 200));
  }

  const memberships = accounts.map((account, index) => ({
    acesso_id: fixture.accesses[index % fixture.accesses.length].id,
    user_id: account.id,
  }));
  await upsert('acesso_membros', memberships, 'acesso_id,user_id');
  await request(`/rest/v1/acesso_membros?acesso_id=eq.${SCALE_ACCESS_ID}&user_id=eq.${TEST_IDS.collaborator}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });

  return { accounts: accounts.length, accesses: fixture.accesses.length, messages: fixture.messages.length };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  seedScaleFixture()
    .then(counts => console.log(`Massa local pronta: ${counts.accounts} contas, ${counts.accesses} acessos, ${counts.messages} mensagens.`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
