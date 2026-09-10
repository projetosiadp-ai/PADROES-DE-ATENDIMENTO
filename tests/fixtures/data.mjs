import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { assertLocalUrl } from './auth.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const TEST_IDS = Object.freeze({
  collaborator: '10000000-0000-4000-8000-000000000001',
  otherCollaborator: '10000000-0000-4000-8000-000000000002',
  superadmin: '10000000-0000-4000-8000-000000000003',
  noAccess: '10000000-0000-4000-8000-000000000004',
  accessAlpha: '20000000-0000-4000-8000-000000000001',
  accessBeta: '20000000-0000-4000-8000-000000000002',
  categoryAlpha: '30000000-0000-4000-8000-000000000001',
  categoryArchived: '30000000-0000-4000-8000-000000000002',
  messageAlpha: '40000000-0000-4000-8000-000000000001',
  messageArchived: '40000000-0000-4000-8000-000000000002',
});

export const TEST_DATA = Object.freeze({
  accessAlpha: Object.freeze({ id: TEST_IDS.accessAlpha, nome: 'Atendimento Local', ativo: true }),
  accessBeta: Object.freeze({ id: TEST_IDS.accessBeta, nome: 'Comercial Local', ativo: true }),
  messageAlpha: Object.freeze({
    id: TEST_IDS.messageAlpha,
    acesso_id: TEST_IDS.accessAlpha,
    categoria_id: TEST_IDS.categoryAlpha,
    categoria: 'Boas-vindas',
    titulo: 'Boas-vindas deterministicas',
    conteudo: 'Olá! Como podemos ajudar?',
    tags: Object.freeze(['boas-vindas', 'local']),
  }),
  messageBeta: Object.freeze({
    id: '40000000-0000-4000-8000-000000000003',
    acesso_id: TEST_IDS.accessBeta,
    categoria_id: '30000000-0000-4000-8000-000000000003',
    categoria: 'Propostas',
    titulo: 'Proposta comercial deterministica',
    conteudo: 'Podemos preparar uma proposta personalizada.',
    tags: Object.freeze(['comercial', 'proposta']),
  }),
});

export function deterministicUuid(sequence, namespace = 9) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new TypeError('sequence deve ser um inteiro não negativo.');
  }
  if (!Number.isInteger(namespace) || namespace < 0 || namespace > 9) {
    throw new TypeError('namespace deve ser um dígito entre 0 e 9.');
  }
  return `${namespace}0000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

export async function resetLocalDatabase({ databaseUrl = 'http://127.0.0.1:54421' } = {}) {
  assertLocalUrl(databaseUrl, 'Supabase local');

  const executable = path.join(
    REPOSITORY_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'supabase.cmd' : 'supabase',
  );

  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['db', 'reset'], {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`supabase db reset terminou com código ${code}.`));
    });
  });
}
