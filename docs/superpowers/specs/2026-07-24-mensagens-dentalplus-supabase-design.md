# Design — Mensagens de Relacionamento DentalPlus (com Supabase)

**Data:** 2026-07-24
**Status:** Aprovado pelo usuário, pendente de execução
**Autor:** Sessão de brainstorming com Claude Code

## 1. Contexto

Existe um protótipo funcional (`index.html`) com layout, navegação e lógica de UI completos:
login, dashboard de mensagens padronizadas (busca, favoritos, recentes, categorias) e painel
administrativo (mensagens, categorias, acessos/equipes). Os dados hoje vivem em memória +
`localStorage`, sem compartilhamento entre dispositivos.

**Objetivo desta fase:** transformar o protótipo em uma aplicação real, com dados centralizados
em nuvem, autenticação de verdade e controle de permissões — reaproveitando 100% do layout e da
lógica de UI já validados.

## 2. Decisões confirmadas com o usuário

| Tema | Decisão |
|---|---|
| Uso | Equipe, vários dispositivos, dados centralizados |
| Backend/Banco | Supabase (Postgres + Auth + RLS) |
| Contas de usuário | Administrador cria/convida usuários — sem autocadastro |
| Comportamento ao excluir categoria | Idêntico ao protótipo: a mensagem mantém o rótulo da categoria (texto), só o filtro/chip some |
| Atualização entre dispositivos | Recarregar ao abrir a tela / após ações (sem tempo real por ora) |
| Hospedagem do frontend | Vercel |
| Credenciais iniciais | `admin@dentalplus` / `Dental@1234` (superadmin) e `relacionamento@dentalplus` / `Dental123` (atendente) |

## 3. Arquitetura

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  Frontend (estático)     │  HTTPS │        SUPABASE             │
│  HTML + JS puro          │ <────> │  • Auth (e-mail/senha)      │
│  supabase-js via CDN     │        │  • Postgres + RLS           │
│  Hospedado na Vercel     │        │  • Edge Function            │
└──────────────────────────┘        │    admin-create-user        │
                                     └─────────────────────────────┘
```

- Sem servidor próprio e sem etapa de build — mantém a simplicidade do protótipo atual.
- A `URL` e a `anon key` do Supabase ficam embutidas no frontend: isso é seguro por design no
  Supabase — quem protege os dados de fato é o RLS (Row Level Security) no banco, não o sigilo
  dessas chaves públicas.
- Sem framework novo: o motor de renderização (classe `App`, full re-render + preservação de
  foco) do protótipo é mantido; só a camada de dados passa a ser assíncrona.

## 4. Modelo de dados (Postgres)

### 4.1 Tabelas

**`profiles`** (espelha `auth.users`, criada via trigger em `auth.users` insert)
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| nome | text | |
| email | text | denormalizado para exibição/busca |
| role | text | `'superadmin' \| 'user'` |
| ativo | boolean | default `true` |
| created_at | timestamptz | default `now()` |

**`acessos`** (equipes/workspaces)
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| nome | text | |
| descricao | text | |
| cor | text | hex, ex. `#1BA7DC` |
| ativo | boolean | default `true` |
| created_at | timestamptz | |

**`acesso_membros`** (vínculo usuário ↔ acesso)
| coluna | tipo | notas |
|---|---|---|
| acesso_id | uuid FK → acessos | |
| user_id | uuid FK → profiles | |
| is_admin_local | boolean | default `false` |
| PK | (acesso_id, user_id) | |

**`categorias`**
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| acesso_id | uuid FK → acessos | |
| nome | text | |
| ordem | int | default `0` |
| created_at | timestamptz | |

**`mensagens`**
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| acesso_id | uuid FK → acessos | |
| categoria | **text** | **denormalizado, não é FK** — replica o comportamento do protótipo: excluir a categoria não altera mensagens já criadas |
| titulo | text | máx. 100 caracteres (validado no frontend) |
| conteudo | text | máx. 2000 caracteres (validado no frontend) |
| tags | text[] | default `'{}'` |
| frequencia | int | default `0` |
| created_by | uuid FK → profiles | |
| created_at / updated_at | timestamptz | |

**`favoritos`**
| coluna | tipo | notas |
|---|---|---|
| user_id | uuid FK → profiles | |
| mensagem_id | uuid FK → mensagens | |
| created_at | timestamptz | |
| PK | (user_id, mensagem_id) | |

**`recentes`**
| coluna | tipo | notas |
|---|---|---|
| user_id | uuid FK → profiles | |
| mensagem_id | uuid FK → mensagens | |
| used_at | timestamptz | default `now()`, atualizado via upsert a cada cópia |
| PK | (user_id, mensagem_id) | consulta usa `ORDER BY used_at DESC LIMIT 5` |

### 4.2 Função de banco

`increment_frequencia(msg_id uuid)` — `SECURITY DEFINER`, incrementa `frequencia` de forma
atômica (evita condição de corrida quando duas pessoas copiam a mesma mensagem quase ao mesmo
tempo). Valida que o chamador tem acesso ao `acesso_id` da mensagem antes de aplicar o update.

### 4.3 RLS (Row Level Security) — resumo das políticas

- **profiles**: cada usuário lê seu próprio registro; `superadmin` lê/edita todos.
- **acessos**: leitura permitida a membros (via `acesso_membros`) e a `superadmin`; escrita
  (criar/ativar/desativar) só por `superadmin`.
- **acesso_membros**: leitura das próprias linhas por qualquer usuário (para saber seus acessos e
  se é admin local) e leitura total por `superadmin`; escrita só por `superadmin`.
- **categorias**: leitura por membros do acesso; escrita (criar/editar/excluir) por admin local do
  acesso ou `superadmin`.
- **mensagens**: leitura por membros do acesso; escrita por admin local do acesso ou `superadmin`.
- **favoritos** / **recentes**: cada usuário só lê e escreve suas próprias linhas.

### 4.4 Dados de semente (seed)

Replicam exatamente o estado inicial do protótipo, para o app não nascer vazio:
- 1 acesso: **Relacionamento** (`cor #1BA7DC`, ativo)
- 6 categorias: Boas-vindas, Confirmação e Acompanhamento, Resolução de Problema, Pendências,
  Encerramento, Reclamações
- 8 mensagens (mesmos textos, tags e valores de `frequencia` do protótipo, para a ordenação
  "Mais usadas" já nascer coerente)
- 2 usuários (ver seção 5)

## 5. Autenticação & papéis

- **Login:** e-mail/senha via Supabase Auth (`signInWithPassword`), mesma tela do protótipo.
- **Credenciais iniciais:**
  - `admin@dentalplus` / `Dental@1234` → `role = superadmin`, membro do acesso Relacionamento
    com `is_admin_local = true`.
  - `relacionamento@dentalplus` / `Dental123` → `role = user`, membro do acesso Relacionamento,
    `is_admin_local = false`.
- **Papéis na aplicação** (idêntico ao protótipo):
  - `superadmin` → gerencia Acessos (equipes), cria usuários, edita tudo.
  - **admin local** (`is_admin_local` em `acesso_membros`) → edita mensagens/categorias apenas do
    acesso ao qual pertence.
  - `user` → só usa: busca, copia, favorita.
- **Criação de usuários (admin cria/convida):** Edge Function `admin-create-user`, executada com
  `service_role` no servidor Supabase, mas **só aceita chamadas de um `superadmin` autenticado**
  (valida o JWT do chamador antes de agir). Recebe `{nome, email, senha, role, acessoId,
  isAdminLocal}`, cria o usuário no Auth e a linha correspondente em `profiles` +
  `acesso_membros`.
- **Bootstrap dos 2 usuários iniciais:** criados uma única vez via painel do Supabase ou SQL
  seed (ver seção 7 — passo a cargo do usuário/orientado por mim).

### 5.1 Risco técnico identificado — domínio sem TLD

`admin@dentalplus` e `relacionamento@dentalplus` têm formato de e-mail, mas o domínio não tem um
`.algo` (ex. `.com`). A maioria das implementações do Supabase Auth aceita esse formato, mas não é
100% garantido.

**Plano:** tentar criar os usuários com esses e-mails exatamente como solicitado. **Se o Supabase
rejeitar o formato**, a solução já definida (sem precisar de nova rodada de decisão) é: manter as
credenciais visíveis/digitadas pelo usuário exatamente iguais, mas resolver internamente para um
e-mail tecnicamente válido (`relacionamento@dentalplus.local`, por exemplo) através de uma pequena
consulta prévia ao formulário de login — sem mudar a experiência de uso.

## 6. Frontend — o que muda em relação ao protótipo

O visual e a navegação **permanecem idênticos**. Muda apenas a camada de dados:

- Estado inicial fixo → **carregado do Supabase** ao logar (com estado de *loading*).
- `handleLogin` → `supabase.auth.signInWithPassword`; sessão persistida via
  `onAuthStateChange` (login automático ao reabrir, como hoje com `dp_session`).
- `saveMsg / deleteMsg / saveCat / saveAcesso / toggleAcessoStatus / toggleUserLink /
  toggleUserAdminLocal` → passam a ser chamadas assíncronas ao banco, seguidas de recarregar os
  dados afetados (sem tempo real, conforme decidido).
- Favoritos e recentes → gravados nas tabelas `favoritos`/`recentes` (não mais `localStorage`).
- Tema (claro/escuro) e densidade → **continuam no `localStorage`**, por serem preferência local
  do dispositivo, não dado compartilhado.
- Tratamento de erro: toasts de falha (ex. "Sem conexão", "Sem permissão para esta ação").
- Organização de arquivos (sem ferramenta de build):
  - `index.html` — shell, estilos, ponto de entrada
  - `config.js` — URL e `anon key` do Supabase
  - `api.js` — camada de acesso a dados (auth + CRUD + favoritos/recentes)
  - `app.js` — classe `App` (motor de renderização + views), portada do protótipo

## 7. Deploy & hospedagem

- **Banco/Auth:** projeto Supabase do usuário (plano gratuito).
- **Frontend:** Vercel. Caminho mais rápido para hoje: deploy direto da pasta via **Vercel CLI**
  (`vercel --prod`), sem depender de repositório Git. Repositório Git + integração contínua fica
  como melhoria futura opcional.
- Resultado esperado: uma URL do tipo `mensagens-dentalplus.vercel.app` acessível de qualquer
  dispositivo da equipe.

### 7.1 Divisão de responsabilidades

**Usuário faz** (não posso executar por regra de segurança — não crio contas nem digito
credenciais/senhas):
1. Criar conta gratuita no Supabase e um novo projeto → enviar `URL` e `anon key` (ambas
   públicas, sem risco).
2. Criar conta gratuita na Vercel (para publicar).
3. Confirmar/criar os 2 usuários iniciais no painel do Supabase, seguindo meu passo a passo.

**Eu faço:** esquema SQL completo (tabelas, RLS, função, seed), Edge Function de criação de
usuários, reescrita do frontend integrado ao Supabase, testes funcionais no navegador e
publicação na Vercel.

## 8. Testes / critérios de aceite

Checklist manual a validar antes de considerar "pronto":
- [ ] Login com `admin@dentalplus` → vê painel administrativo completo (Mensagens, Categorias,
      Acessos).
- [ ] Login com `relacionamento@dentalplus` → vê apenas o dashboard, sem acesso a admin.
- [ ] Criar, editar e excluir mensagem como admin; excluir categoria e confirmar que mensagens
      vinculadas mantêm o texto da categoria (comportamento idêntico ao protótipo).
- [ ] Buscar mensagens (inclusive busca aproximada/fuzzy) e copiar — frequência incrementa e
      "Recentes" atualiza.
- [ ] Favoritar/desfavoritar uma mensagem e recarregar a página — estado persiste (vem do banco).
- [ ] Logar em dois navegadores/dispositivos diferentes com o mesmo usuário e confirmar que os
      dados batem (após recarregar).
- [ ] Tema escuro/claro e densidade continuam funcionando e por dispositivo (localStorage).
- [ ] Tentar uma ação sem permissão (ex. usuário comum editando mensagem) → bloqueado pelo RLS,
      toast de erro amigável.

## 9. Fora de escopo (por ora)

- Atualização em tempo real entre dispositivos (pode ser adicionada depois com Supabase
  Realtime, sem mudar o modelo de dados).
- Recuperação de senha por e-mail (pode ser plugada depois via Supabase Auth, mas não é
  bloqueante para o uso hoje).
- Auditoria/histórico de alterações.
- App mobile nativo (o frontend responsivo já cobre uso em celular via navegador).
