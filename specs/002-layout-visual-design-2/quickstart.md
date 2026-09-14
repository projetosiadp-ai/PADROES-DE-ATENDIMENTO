# Quickstart: validar cada etapa do Design 2.0

Guia de validação. Detalhes de comportamento em [contracts/ui-behavior.md](contracts/ui-behavior.md); cores e contraste em
[contracts/design-tokens.md](contracts/design-tokens.md); banco em [contracts/database-rpcs.md](contracts/database-rpcs.md).

## Pré-requisitos

- Docker Desktop ligado e o banco local no ar: `npx supabase start`.
- Conferir que o executor de funções está no ar (ele não volta sozinho depois de reiniciar o Docker):
  `docker ps --filter "name=supabase_edge_runtime_padroes-de-atendimento"`; se estiver parado,
  `docker start supabase_edge_runtime_padroes-de-atendimento`.
- Banco local recriado com os dados de teste: `npx supabase db reset`.
- Dependências instaladas: `npm ci`.

## Verificação local de toda etapa

```powershell
npm run test:unit        # lógica pura, tokens, variáveis, contrato de dados
npm run test:db          # pgTAP (inclui os testes novos nas Etapas 5 e 6)
npm run test:e2e         # jornadas, desktop e 360 px
npm run test:a11y        # axe sem violações críticas ou sérias
npx playwright test --grep @visual   # fotos de referência
npm run test:perf        # SC-004: comparar com a medição da versão anterior (≤ 10% de piora)
```

Esperado: tudo verde. Diferença nas fotos só é aceita quando a mudança é intencional; nesse caso,
`npx playwright test --grep @visual --update-snapshots` e revisão das imagens no commit.

## Prévia e aprovação

1. Enviar o ramo da etapa (`002-etapa-N-<nome>`) ao repositório pessoal.
2. Abrir o link de prévia gerado pela Vercel (exige login na Vercel).
3. A prévia usa o **banco de produção**: navegar, buscar, filtrar, abrir leituras e copiar. Não solicitar, aprovar,
   arquivar nem criar contas na prévia; esses fluxos já foram validados localmente.
4. Comparar lado a lado com `DESIGN - 2.0/Biblioteca DentalPlus - 8 telas.dc.html` (SC-002) e aprovar ou pedir ajustes.
5. Aprovado: integrar o ramo ao `main`, enviar aos dois repositórios, conferir o deploy **Current** na Vercel.

## Roteiros por etapa

| Etapa | Local | Prévia / produção |
|---|---|---|
| 0 Preparação | `npm run test:unit` confere cache em `vercel.json`, fontes e tokens | Cabeçalhos: `curl.exe -sI https://padroes-de-atendimento.vercel.app/views/library-view.mjs` mostra `max-age=0, must-revalidate` |
| 1 Faixa, login, Biblioteca, Visão geral | Todas as jornadas de colaborador e superadmin; 360 px; teclado; fotos; aviso de novidades uma vez | Login, trocar acesso, buscar, selecionar, copiar; celular |
| 2 Janelas | Abrir, preencher, enviar, cancelar e fechar com Escape cada janela | Abrir "Visualizar" e copiar |
| 3 Administração | Aprovar, rejeitar, criar/editar/arquivar/restaurar, criar acesso e conta, vínculos, senha, "Conceder acesso" | Navegar pelas seções sem gravar |
| 4 Variáveis e atalhos | Mensagem com `[NOME]`/`[DATA]`: preencher, copiar preenchida, colar; vazias mantidas; ↑ ↓ Enter E; contadores | Copiar preenchida uma mensagem real e colar |
| 5 Revisão e históricos | pgTAP `request_review`; aprovar sem ajuste com comentário, ajustar e aprovar, rejeitar sem motivo (bloqueado) e com motivo; "Suas solicitações"; histórico com filtros | Ver ao menos um pedido antigo nos dois históricos sem erro |
| 6 Estatísticas | pgTAP `usage_stats`; roteiro de duas contas e dois acessos (SC-009); média só com ≥ 3 colaboradores | Conferir "Copiadas hoje" após uma cópia |

## Etapas com banco (5 e 6)

Na janela combinada com o responsável:

1. Backup lógico de produção na pasta de backups, com assinaturas registradas no `LEIA-ME.md`.
2. Ensaio local com a cópia do backup: `db reset --no-seed --version <última aplicada>`, carga dos dados, `migration up`,
   contagens antes/depois e verificação das políticas por conta.
3. Liberar no `.claude/settings.local.json` apenas os comandos exatos da etapa; `npx supabase db push --linked --dry-run`
   e revisão da lista.
4. `npx supabase db push --linked --yes`.
5. Prévia do frontend da etapa (a migração é compatível com o frontend que está no ar) e aprovação.
6. Integração ao `main` e deploy.

## Retorno (rollback)

- Frontend: Vercel → Deployments → deploy anterior → Instant Rollback (≤ 5 minutos, SC-011).
- Banco: as migrações são aditivas; o frontend anterior continua funcionando com elas. Remoção das colunas/tabela novas
  só por migração compensatória revisada. Restauração completa pelo backup da etapa, como último recurso.
