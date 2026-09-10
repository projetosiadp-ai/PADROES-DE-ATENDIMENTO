# Sincronização Documental e Portões de Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar especificação, plano e tarefas com a Constituição 2.0.0 e transformar os portões de aceite e release em evidências objetivas e executáveis.

**Architecture:** A especificação define critérios mensuráveis; o plano descreve a sequência e os bloqueios operacionais; `tasks.md` contém uma tarefa independente para cada evidência. Preparar um checklist não equivale a executar o respectivo portão.

**Tech Stack:** Markdown, PowerShell e comandos de validação já documentados no quickstart.

**Spec:** `.specify/memory/constitution.md` e `specs/001-evoluir-biblioteca-mensagens/spec.md`

## Global Constraints

- O sistema opera exclusivamente com os papéis `colaborador` e `superadministrador`.
- Nenhuma implantação, migração remota, reset destrutivo ou alteração de produção ocorre sem autorização humana explícita.
- Resultados de usabilidade contêm somente métricas agregadas, sem dados pessoais.
- Uma tarefa só recebe `[X]` depois que a evidência descrita estiver registrada.
- Esta sincronização não altera código-fonte, banco de dados nem configuração de implantação.

---

### Task 1: Tornar os critérios de aceite objetivos

**Files:**
- Modify: `specs/001-evoluir-biblioteca-mensagens/spec.md:223`

**Interfaces:**
- Consumes: modelo de dois papéis e portões de qualidade da Constituição 2.0.0.
- Produces: definições mensuráveis consumidas por `plan.md` e `tasks.md`.

- [ ] **Step 1: Precisar SC-007**

Substituir “sem degradação perceptível além das metas anteriores” pela exigência objetiva de que,
com 100 contas, 10 acessos e 1.000 mensagens, as medições continuem atendendo integralmente
SC-002, SC-003 e SC-004.

- [ ] **Step 2: Definir falha crítica em SC-009**

Definir falha crítica como qualquer ocorrência de acesso não autorizado, perda ou corrupção de
dados, aplicação duplicada, publicação parcial, confirmação falsa de sucesso ou impossibilidade de
concluir um fluxo essencial.

- [ ] **Step 3: Definir a passagem de aceite de SC-009**

Exigir suíte automatizada aplicável sem falhas e validação manual documentada dos fluxos de
autenticação, cópia, solicitação, aprovação, arquivamento, restauração e gestão de acesso.

- [ ] **Step 4: Documentar o protocolo de SC-001 e SC-010**

Registrar nas Assumptions que o teste usa 20 colaboradores representativos, o mesmo roteiro
moderado, nenhuma orientação após o início da tarefa, cronômetro até a confirmação da cópia e uma
escala de cinco pontos na qual apenas “fácil” e “muito fácil” contam para SC-010.

- [ ] **Step 5: Verificar terminologia e mensurabilidade**

Run:

```powershell
rg -n "administrador local|degradação perceptível|falha crítica|20 colaboradores|cinco pontos" specs/001-evoluir-biblioteca-mensagens/spec.md
```

Expected: nenhuma ocorrência de `administrador local` ou `degradação perceptível`; definições de
falha crítica, amostra e escala presentes.

- [ ] **Step 6: Commit**

```text
docs: make acceptance criteria measurable
```

---

### Task 2: Alinhar o plano à Constituição 2.0.0 e separar os portões

**Files:**
- Modify: `specs/001-evoluir-biblioteca-mensagens/plan.md:52`
- Modify: `specs/001-evoluir-biblioteca-mensagens/plan.md:201`
- Modify: `specs/001-evoluir-biblioteca-mensagens/plan.md:214`

**Interfaces:**
- Consumes: critérios objetivos produzidos pela Task 1.
- Produces: sequência operacional que orienta as tarefas finais da feature.

- [ ] **Step 1: Corrigir o Constitution Check**

Registrar que a Constituição 2.0.0 reconhece somente `colaborador` e `superadministrador` e que a
remoção de `administrador local` é uma exigência de conformidade, não uma exceção.

- [ ] **Step 2: Separar os cinco portões de encerramento**

Documentar, nesta ordem: validação local; teste moderado; validação do preview; preparação
pré-deploy com backup e dry-run; implantação autorizada seguida de smoke test.

- [ ] **Step 3: Definir bloqueios operacionais**

Especificar que preview, backup e dry-run bloqueiam a implantação; SC-001 e SC-010 bloqueiam o
aceite; o smoke test bloqueia a declaração de conclusão do release.

- [ ] **Step 4: Acrescentar rastreabilidade dos critérios de sucesso**

Adicionar uma tabela SC-001–SC-010 ligando cada critério às tarefas que produzem sua evidência,
sem usar intervalos que ocultem cobertura parcial.

- [ ] **Step 5: Verificar alinhamento**

Run:

```powershell
rg -n "Constituição 2.0.0|preview|backup|dry-run|smoke test|SC-001|SC-010" specs/001-evoluir-biblioteca-mensagens/plan.md
```

Expected: modelo de dois papéis e todos os portões aparecem explicitamente.

- [ ] **Step 6: Commit**

```text
docs: align release plan with constitution 2.0.0
```

---

### Task 3: Decompor evidências pendentes em tarefas verificáveis

**Files:**
- Modify: `specs/001-evoluir-biblioteca-mensagens/tasks.md:180`
- Modify: `specs/001-evoluir-biblioteca-mensagens/tasks.md:277`

**Interfaces:**
- Consumes: sequência de portões produzida pela Task 2.
- Produces: checkboxes independentes cuja conclusão demonstra prontidão para aceite e release.

- [ ] **Step 1: Manter T066 aberta e limitar ações destrutivas**

Esclarecer que comandos locais destrutivos só são executados após autorização explícita e que uma
recusa deve permanecer registrada como desvio, sem marcar a tarefa como concluída.

- [ ] **Step 2: Tornar T067 reproduzível**

Incluir os 20 participantes, roteiro único, ausência de orientação durante a tarefa, medição até a
confirmação da cópia, escala de cinco pontos e registro exclusivamente agregado.

- [ ] **Step 3: Preservar T068 como preparação**

Manter T068 concluída como criação do checklist, sem tratá-la como evidência de execução dos
portões que o checklist descreve.

- [ ] **Step 4: Adicionar T069 para validação do preview**

Adicionar tarefa aberta para publicar o preview autorizado, validar autenticação, matriz de
permissões, cabeçalhos, `noindex`, desktop, 360 px e registrar a evidência sem conteúdo interno.

- [ ] **Step 5: Adicionar T070 para preparação pré-deploy**

Adicionar tarefa aberta para confirmar backup recuperável, executar `db push --dry-run`, registrar
o identificador do deploy anterior e interromper o processo diante de qualquer desvio.

- [ ] **Step 6: Adicionar T071 para implantação e smoke test**

Adicionar tarefa aberta e condicionada à autorização explícita para executar a implantação
coordenada, validar os fluxos críticos em produção e acionar rollback se algum critério falhar.

- [ ] **Step 7: Atualizar rastreabilidade e dependências**

Mapear SC-001/SC-010 a T067; SC-009 a T066 e T069–T071; FR-029 a T003, T012–T014, T065,
T068 e T070–T071; FR-030 a T028, T064, T066, T068–T069.

- [ ] **Step 8: Verificar IDs e estados**

Run:

```powershell
rg -n "T06[6-9]|T070|T071|SC-001|SC-009|SC-010" specs/001-evoluir-biblioteca-mensagens/tasks.md
```

Expected: T066, T067 e T069–T071 abertas; T068 concluída; rastreabilidade atualizada.

- [ ] **Step 9: Commit**

```text
docs: split release gates into verifiable tasks
```

---

### Task 4: Validar a consistência cruzada

**Files:**
- Verify: `.specify/memory/constitution.md`
- Verify: `specs/001-evoluir-biblioteca-mensagens/spec.md`
- Verify: `specs/001-evoluir-biblioteca-mensagens/plan.md`
- Verify: `specs/001-evoluir-biblioteca-mensagens/tasks.md`

**Interfaces:**
- Consumes: Tasks 1–3 concluídas.
- Produces: conjunto documental pronto para nova análise não destrutiva.

- [ ] **Step 1: Verificar o modelo de papéis**

Run:

```powershell
rg -n "administrador local|admin local|is_admin_local" .specify/memory/constitution.md specs/001-evoluir-biblioteca-mensagens/spec.md specs/001-evoluir-biblioteca-mensagens/plan.md specs/001-evoluir-biblioteca-mensagens/tasks.md
```

Expected: ocorrências históricas ou de migração estão explicitamente marcadas como remoção ou
compatibilidade temporária; nenhuma concede capacidade ao papel removido.

- [ ] **Step 2: Verificar checkboxes duplicados ou IDs ausentes**

Run:

```powershell
rg -o "T[0-9]{3}" specs/001-evoluir-biblioteca-mensagens/tasks.md | Sort-Object -Unique
```

Expected: sequência T001–T071 presente, sem reutilização de ID para tarefas diferentes.

- [ ] **Step 3: Executar nova análise Spec Kit**

Run: `$speckit-analyze`

Expected: nenhuma violação constitucional e rastreabilidade explícita dos portões pendentes.

- [ ] **Step 4: Commit**

```text
docs: validate feature artifact consistency
```
