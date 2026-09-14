# Resultados de validação — Design 2.0

## Etapa 0 (preparação) — 2026-09-14

### Linha de base de desempenho (T001)

Método: `npm run test:perf` (5 medições autenticadas por execução, rede 3G emulada, massa de escala de
`tests/fixtures/scale.mjs` com 1.000 mensagens) e `tests/lighthouse-runner.mjs` (3 execuções no shell público, perfil
móvel). "Antes" = código anterior à Etapa 0, obtido guardando as alterações com `git stash`; "depois" = Etapa 0
aplicada. As execuções foram alternadas (depois → antes → depois) para separar o efeito da mudança do ruído da máquina.

| Medida | Antes (mediana) | Depois (mediana) | Limite | Situação |
|---|---|---|---|---|
| Carga da Biblioteca, p75 em 3G | ~1.435 ms | ~1.455 ms | 2.000 ms | dentro |
| Busca, p95 | ~218 ms | ~249 ms | 500 ms | dentro |
| Confirmação de cópia, p95 | ~172 ms | ~189 ms | 1.000 ms | dentro |
| Transferência total por carga | 5.400 B | 5.700 B | — | +300 B |
| Lighthouse: scripts | 113.145 B | 113.071 B | 262.144 B | dentro |
| Lighthouse: total | 137.835 B | 165.718 B | 524.288 B | dentro |

Amostras (5 por execução, em ms) em `scratchpad`: `perf-antes*.txt`, `perf-depois*.txt`, `v2-*.txt`. A máquina de
medição é compartilhada com o Docker e apresenta variação alta: no mesmo lote, a versão **anterior** registrou de
1.349 ms a 2.455 ms de carga e de 92 ms a 610 ms de cópia. Por isso a comparação usa medianas de 20 a 25 amostras, e
não o p95 de uma execução isolada.

### Achado corrigido durante a etapa

As primeiras medições mostraram a Etapa 0 cerca de 35% mais lenta na busca e na cópia. Causa: o `preload` da fonte
Manrope baixava 25 KB no início, embora a fonte só passe a ser usada na Etapa 1 (os estilos base ficam sob `.dp-app`).
O `preload` foi movido para a Etapa 1 (T027). Depois disso, a diferença voltou para dentro da variação da máquina e o
acréscimo de transferência caiu para 300 B, apenas a folha de estilo.

O aumento de 28 KB no total do Lighthouse é o download das duas fontes no shell público, que já ficam em cache para a
Etapa 1; o orçamento de 512 KB continua com folga de três vezes.

### Testes automatizados

| Suíte | Resultado |
|---|---|
| `npm run test:unit` | 60 de 60 |
| `npm run test:e2e` | 34 de 34 (2ª execução); 6 pulados (projetos móveis com testes só de desktop) |
| `npm run test:a11y` | 6 de 6; 6 pulados |
| `npm run test:perf` | dentro de todos os limites (2ª execução) |

Na primeira execução em lote (as três suítes seguidas, com o Docker e o navegador disputando a mesma
máquina) três cenários falharam por tempo esgotado — `superadmin.spec.mjs:120`, `collaborator.spec.mjs:58`
e `collaborator.spec.mjs:88` — e o teste de desempenho registrou p75 de 2.281 ms por causa de uma medição
isolada de 4.448 ms. Ao repetir os mesmos arquivos isoladamente, os 18 cenários passaram e o desempenho
ficou em p75 de 1.649 ms. Nenhuma das falhas envolve código da Etapa 0 (que não altera comportamento nem
tela); são instabilidades da máquina de medição. A margem do limite de 2.000 ms é estreita neste
equipamento: vale repetir a suíte de desempenho isolada, sem o restante rodando junto.

### Ensaio de reversão (T014, SC-011)

A registrar na publicação da etapa.
