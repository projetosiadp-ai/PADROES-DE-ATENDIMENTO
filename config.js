// config.js
// Valores públicos do projeto Supabase (Project Settings → API).
// Não são segredos — a segurança real vem do RLS no banco (ver supabase/schema.sql).
const IS_LOCAL = ['127.0.0.1', 'localhost', '::1'].includes(globalThis.location?.hostname);

export const SUPABASE_URL = IS_LOCAL
  ? 'http://127.0.0.1:54421'
  : 'https://hikxdpfctldkidhjjexj.supabase.co';
export const SUPABASE_ANON_KEY = IS_LOCAL
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  : 'sb_publishable_gZCaP4yeM4EQU0GHKSPYnA_fC3B1WsY';
