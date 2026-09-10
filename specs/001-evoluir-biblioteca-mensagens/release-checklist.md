# Checklist de release e rollback

Nenhuma etapa deste documento autoriza acesso ou alteração em produção. Campos de evidência devem ser
preenchidos pelo responsável da liberação após aprovação explícita.

## 1. Preview

- [ ] Registrar URL e identificador imutável do preview.
- [ ] Confirmar que o preview usa ambiente Supabase não produtivo e massa sem dados de clientes.
- [ ] Executar login, busca, cópia, envio de solicitação e aprovação.
- [ ] Exercitar colaborador e superadministrador em desktop e 360 px.
- [ ] Conferir CSP, `X-Robots-Tag`, `X-Content-Type-Options`, `Referrer-Policy` e anti-framing.
- [ ] Anexar resultados de unidade, pgTAP, Playwright, axe e Lighthouse.

## 2. Banco antes da publicação

- [ ] Registrar timestamp, identificador e política de retenção do backup confirmado.
- [ ] Executar `npx supabase migration list --linked` somente após autorização para o projeto-alvo.
- [ ] Executar `npx supabase db push --linked --dry-run` e anexar a saída revisada.
- [ ] Confirmar que o dry-run contém somente migrações aprovadas e nenhuma operação destrutiva não planejada.
- [ ] Registrar aprovador técnico e aprovador de negócio.

## 3. Frontend antes da publicação

- [ ] Registrar o identificador/URL do último deploy estável: `________________`.
- [ ] Confirmar que esse deploy pode ser promovido novamente sem rebuild.
- [ ] Registrar o identificador/commit candidato: `________________`.
- [ ] Confirmar variáveis públicas do Supabase e ausência de segredo no artefato cliente.

## 4. Execução e smoke

- [ ] Aplicar migrações aprovadas e anexar resultado.
- [ ] Publicar o frontend candidato.
- [ ] Validar login e expiração de sessão.
- [ ] Validar isolamento de acesso com duas contas.
- [ ] Validar busca, filtro, favorito, recente e cópia exata.
- [ ] Validar solicitação, aprovação/rejeição e conflito concorrente.
- [ ] Validar arquivamento/restauração e gestão de conta/vínculo.
- [ ] Revalidar cabeçalhos e `noindex` no domínio publicado.

## 5. Observação e rollback

- [ ] Definir responsável pela decisão de rollback: `________________`.
- [ ] Definir janela de observação e canais de alerta: `________________`.
- [ ] Se houver falha crítica, promover imediatamente o deploy anterior registrado.
- [ ] Para banco, usar somente migração compensatória revisada ou recuperação do backup confirmado.
- [ ] Nunca improvisar `DELETE`, `DROP`, reset ou SQL destrutivo em produção.
- [ ] Registrar horário, motivo, executor e resultado de qualquer rollback.

