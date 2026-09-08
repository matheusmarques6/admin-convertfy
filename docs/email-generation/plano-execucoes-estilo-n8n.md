# Execuções ao vivo e execução parcial, estilo n8n (set/2026)

Pedido: a aba Execuções do Estúdio (`/admin/agents/studio?tab=execs`) deve
ser **tempo real de fato**, e deve ser possível **entrar numa execução,
desativar o que se quiser e testar até onde se quiser** — como no n8n.

Este documento registra o que o n8n faz, o que já existe aqui, as quatro
razões pelas quais isto não é trabalho de UI, as decisões tomadas e o
estado de cada camada.

---

## 1. O modelo do n8n (o que importa copiar)

| Peça | Como funciona |
|---|---|
| **Execução** | Entidade de primeira classe: guarda `runData` por nó **e** o snapshot do workflow que rodou. É o que permite "Copy to editor" (sucesso) / "Debug in editor" (falha) e as duas opções de retry — *com o workflow salvo* × *com o workflow original* |
| **Tipos** | manual (canvas) · parcial (subconjunto) · produção (trigger). **Produção ignora todo dado pinado** — pin e mock são declarados "for development only" |
| **Execute step** | Roda o nó **e todos os anteriores necessários** para preencher a entrada dele. Não é "roda só este nó" ([issue #17670](https://github.com/n8n-io/n8n/issues/17670) é a reclamação recorrente disso) |
| **Pin data** | Congela a saída de um nó; nas rodadas seguintes o n8n substitui o dado pinado em vez de executar. Só nó com uma saída *main*; nada de binário; JSON **editável** |
| **Dirty nodes** | Nó que rodou com sucesso mas cuja saída passou a ser velha. Editar parâmetro suja o **próprio** nó; inserir/apagar nó suja o **seguinte**; ligar conector suja o **destino**; desativar nó suja o **seguinte**; editar dado pinado suja o **seguinte**. Em loop, o nó inicial do loop também |
| **Deactivate node** | Nó desativado é pulado e repassa o dado adiante |
| **Tempo real** | Push do backend para a UI: `N8N_PUSH_BACKEND` = `websocket` (default desde a 1.0) ou `sse` |

Fontes: [tipos de execução](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions),
[dirty nodes](https://docs.n8n.io/build/understand-workflows/understand-executions/understand-dirty-nodes),
[pin e mock](https://docs.n8n.io/build/work-with-data/pin-and-mock-data),
[debug de execução passada](https://docs.n8n.io/build/understand-workflows/understand-executions/debug-executions).

## 2. O que já existia aqui

| Peça | Estado |
|---|---|
| Push em tempo real | **Existia e a aba não usava**: `/api/sse/admin/agents/runs` + `useAgentRunsLive`. A aba lia SWR a 10s |
| Nó "rodando" | **Existia**: `startGenerationRun` grava a linha com `status:'running'` **antes** de invocar o modelo |
| Deactivate node | **Existia, global**: `resolveAgentSwitch(email_agent_configs.is_active)` → step pulado, run `skipped`, HTML inalterado |
| Retomar de um ponto | **Existia**: `html_pipeline_stage` ('hero'\|'text'\|'image') + retry 1× por step |
| `runData` por nó | **Existia**: `input_vars`, `rendered_prompt`, `raw_output`, `parsed_output` por run |
| Snapshot do workflow | **Parcial**: `agent_config_id` por run |
| Execução como entidade | Não |
| Pin / execução parcial | Não |

## 3. Os quatro problemas estruturais

**3.1 — Não existe "uma execução".** Execução = linha de
`email_flow_emails`, e as runs vêm de `agent_studio_latest_runs` = a run
*mais recente* por (e-mail, agente), **sem filtrar batch**. Abrir uma
execução pode mostrar o Curador de um batch e o Cores de outro.
`email_generation_runs.batch_id` existe, mas
`email_flow_emails.generation_batch_id` só é gravado quando a copy volta do
n8n. Sem entidade de execução, "entrar numa execução" mostra uma colagem e
"reexecutar esta execução" não tem objeto.

**3.2 — Uma execução não é um processo, são três.** Fase 1 no cron
`email-dispatch-queue`; copy no n8n (externo, volta por webhook); fase 2
numa rota com budget de 760s. O n8n tem um processo Node vivo do início ao
fim. Logo: não há onde "pausar em memória" — só persistir e retomar (o que
o `html_pipeline_stage` já faz), e "executar até o nó X" atravessa
fronteira de processo em três pontos.

**3.3 — Desativar é global.** O toggle do Editor desliga o agente para
**todas** as gerações, produção incluída. O n8n resolve com a linha manual
× produção; aqui essa linha não existia (a aba Teste dispara o mesmo
pipeline de produção).

**3.4 — O custo é assimétrico.** No n8n re-rodar os anteriores é uma
chamada HTTP. Aqui a fase 1 leva ~220s e uma execução completa custou
$0,769 medidos. Um "Execute step" que re-executa os anteriores custa a
execução inteira — **o pin não é conveniência, é requisito**.

## 4. Decisões tomadas (08/09)

1. **Linha dura manual × produção.** Pin e desativação por execução só
   valem em execução manual; produção ignora.
2. **Desativar vale para TODOS os nós**, com a régua de degradação escrita
   e a recusa **antes de gastar** (§5.3).
3. **Os três modos parciais**: parar em X, rodar só X, retomar de X.
4. **Grafo só operável** — `STUDIO_NODES`/`STUDIO_EDGES` seguem em código;
   editar o pipeline pela tela está fora de escopo.
5. **Tempo real por RPC de delta + SSE a 2s.**
6. **Pin do pipeline inteiro, fase 1 incluída.**

Resolvidos por padrão, sujeitos a correção: nó acende no início do step,
sem progresso interno; ferramenta de dev atrás do gate `canManagePrompts`;
imagem pina/desativa como nó inteiro na v1 (por slot depois); pin da
**saída**, não editável na v1; pin vive na execução, com "reusar os pins da
anterior" no disparo; execução manual marcada e filtrável na telemetria,
sem separar os painéis de custo; uma execução manual por e-mail por vez.

## 5. As camadas

### 5.1 — Tempo real ✅ ENTREGUE (migration 20261126)

O caminho óbvio — baixar o intervalo do SWR — era o errado. A query da
listagem filtra com `.or("generation_batch_id.not.is.null, status.in.(…)")`
e o único índice de `email_flow_emails (updated_at DESC)`
(`idx_efe_generated_recent`) é **parcial** em `generation_batch_id IS NOT
NULL`: um OR não é servido por ele. Repetir isso de 2 em 2s por aba aberta
é o padrão que custou 372 min de CPU no incidente do inbox (as cinco regras
estão em `CLAUDE.md`).

Então o SSE faz **duas perguntas**:

1. `agent_studio_executions_delta(p_since, p_limit)` — "mexeu algo?",
   devolve só ids. Três pernas `UNION ALL`, uma por índice: e-mail com
   batch (`idx_efe_generated_recent`), e-mail **em voo**
   (`idx_efe_em_voo_updated`, novo, predicado literal) e run mexida
   (`idx_gen_runs_updated`). Um OR único forçaria seq scan nas três.
2. Só quando a resposta é não-vazia, `fetchAgentExecutions({emailIds})`
   monta o payload.

Conexão ociosa: duas varreduras de índice a cada 2s e **zero byte** no
cliente. A perna 3 é a que acende o nó no instante em que o agente começa.

**Limite declarado:** não existe progresso *dentro* de um step. Uma chamada
de LLM não reporta nada entre o começo e o fim, então o nó fica "rodando"
por 30–240s sem fração. Barra ali seria medida inventada.

Peças: `types/agent-executions.ts` (o tipo é um só para servidor e
cliente), `lib/services/agent-executions.service.ts` (um montador para REST
e SSE — duas montagens divergentes apareceriam como "o nó mudou de status
sozinho"), `app/api/sse/admin/agents/executions/route.ts`,
`hooks/use-agent-executions-live.ts`.

A reconciliação tem uma armadilha própria, com teste dedicado: **um evento
de run não move o `updated_at` do e-mail**, só a lista de runs. Desempatar
por `updated_at` — como o `useAgentRunsLive` faz — descartaria em silêncio
justamente o evento que acende o nó. Daí `execRecency` =
`max(updated_at, maior created_at das runs)`, e o upsert do SSE ser
autoritativo. Empate contra o snapshot REST vai para o snapshot: com o SSE
morto nenhum evento local chega, a recência local nunca passa a do snapshot
e o fallback assume sozinho.

O checkbox "Auto refresh" saiu: ligava um poll de 10s, e a pergunta de quem
olha a lista é "isto está vivo?", não "quero atualizar?". O que ele
protegia — a lista se mexer embaixo do que se está lendo — virou **seleção
explícita** no primeiro carregamento, não congelamento do dado.

### 5.2 — Execução como entidade ⬜ PENDENTE

`email_generation_executions` (id, email_id, batch_id, `mode`
manual|producao, `triggered_by`, snapshot dos modos e dos
`agent_config_id`, status, custo, `paused_at`, `stop_after`) +
`email_generation_runs.execution_id`. A lista da esquerda passa a ser de
execuções, não de e-mails, e §3.1 deixa de existir.

O snapshot dos `agent_config_id` é o que permite o marcador de **sujo** do
n8n: run cujo `agent_config_id` difere da config ativa hoje é uma saída que
não representa mais o prompt em vigor.

### 5.3 — Overrides por execução ⬜ PENDENTE

`overrides` na execução: `{ disabled: [...], pinned: {...}, stop_after }`.
Os pontos de leitura já existem (`resolveAgentSwitch`, `*_mode` de
`email_generation_settings`) e passam a ler *override-da-execução →
global*, com override **ignorado** quando `mode='producao'`.

**A régua de degradação, por nó.** Desativar um step que reescreve HTML é
trivial: segue o HTML do step anterior (é o que o `resolveAgentSwitch` já
faz). Desativar um nó da fase 1 não tem "passa adiante", e a decisão é
**recusar o disparo antes de gastar**, dizendo o que falta:

| Nó desativado | Sem pin da saída |
|---|---|
| Seletor | Roda: sem alvo, todos recebem ausência declarada (`alvo-render.ts`) |
| Estruturador | Roda: a sequência volta a ser a da aba Arquitetura |
| Curador | **Recusa** — sem variante não há montagem, e `coberturaSuficiente` apaga a referência |
| Montador | Roda: já é `off` por padrão (migration 20261107) |
| Blueprint | **Recusa** — sem `fields[]` a copy não tem endereço e o merge ancora zero |
| Copy (n8n) | **Recusa** — sem copy os placeholders chegam crus ao e-mail |
| Steps de HTML | Roda: segue o HTML anterior |
| QA / QA Vision | Roda: e-mail sai sem o selo de qualidade |

A recusa é a lição do incidente 07/09: a premissa "cai no template global,
que tem hero" é **falsa** (o global do welcome-1 tem 21.314 chars, zero
placeholders e nenhum marcador `cfy:hero`), então deixar rodar para
descobrir custa a fase 1 inteira e termina em `hero_failed` garantido.

### 5.4 — Pin e execução parcial ⬜ PENDENTE

Pin = copiar `parsed_output`/`raw_output` de uma run para o override da
próxima execução manual. Escopo v1: **pipeline inteiro**, fase 1 incluída —
é o que elimina os ~220s de qualquer teste e o que torna possível desativar
um nó da fase 1.

Os três modos: `stop_after: X` (roda e para), "rodar só X" (tudo antes
pinado + `stop_after: X`), "retomar de X" (parte do estado que já existe).

**O watchdog precisa mudar junto.** Ele hoje varre geração parada em
`rendering`/`qa_running` e marca `failed`. Execução manual **pausada de
propósito** não pode ser varrida — senão você para no nó X, sai para
almoçar e volta com a execução morta.

## 6. Fora de escopo, declarado

- Editar o pipeline no canvas (reordenar steps, tirar agente do fluxo). O
  pipeline é **código** — a ordem está no `phase2-runner`, não em dado.
- Pin editável à mão (o "edit output data" do n8n) — v2.
- Pin/desativação por **slot** do agente de imagem (ele agrega ~16 runs).
- Separar "gasto com teste" de "gasto com cliente" nos painéis de custo.
