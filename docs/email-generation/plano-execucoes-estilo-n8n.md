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

### 5.1 — Tempo real ✅ ENTREGUE (migration 20261127)

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

### 5.2 — Execução como entidade ✅ ENTREGUE (migration 20261129)

`email_generation_executions` (store, flow, email, batch, `mode`
manual|producao, `triggered_by`, `overrides`, `config_snapshot`, status,
`stopped_at_node`, timestamps) + `email_generation_runs.execution_id`
(nullable — as ~40 mil runs anteriores não têm execução, e inventar uma
seria fabricar histórico).

**Só o modo MANUAL grava linha, e isso é decisão, não atalho.** Produção não
pode ter override por construção (`gateFor` devolve gate neutro em
`mode='producao'`, sempre), então a linha seria telemetria pura — e a de
produção já existe (runs, status do e-mail, batch). O custo de gravá-la é
real: uma execução de produção atravessa cron → n8n → webhook → rota de
fase 2, e teria de ser FECHADA em cinco saídas (sucesso, erro, watchdog,
cobertura insuficiente, budget estourado). Linha `running` órfã é o estado
zumbi que este repo já pagou caro. Aqui a única linha viva é a que um humano
criou e um humano vê.

**Consequência declarada:** a lista da esquerda continua agrupando produção
por e-mail (§3.1 segue valendo para o histórico de produção). O que ela
ganhou é o selo da execução manual viva, o que ela mudou, e o botão de
cancelar.

Invariantes no banco: índice único parcial `uniq_ege_manual_viva` (uma
execução manual viva por e-mail — duas pessoas testando o mesmo e-mail com
overrides diferentes produziriam um HTML que não corresponde a nenhuma das
duas, então o segundo disparo toma 409), trigger de `updated_at` com
`clock_timestamp()` (não `now()`, que é o início da transação), RPC
`email_execution_manual_viva` com predicados LITERAIS, e RLS `TO
authenticated` com escopo por org — a tabela nasce fechada em vez de nascer
com o débito das irmãs (`email_generation_runs` ainda é
`TO authenticated USING (true)`).

### 5.3 — Overrides por execução ✅ ENTREGUE

`{disabled, pinned, stop_after, start_from}` no `overrides` da execução.
Régua e gate no módulo PURO `agents/execucao/overrides.ts`, usado pela TELA
e pelo SERVIDOR: a tela explica antes de gastar, o servidor garante que
ninguém contorna por `curl`.

**A linha dura vive numa função:** `gateFor(node, overrides, mode)` devolve
gate NEUTRO quando `mode !== 'manual'`. Não consulta intenção, consulta
modo — vale para override gravado por engano, por corrida ou por um `curl`
com o modo errado.

**A régua de degradação por nó** (`DEGRADACAO`) tem três valores:
`passa_adiante` (o step seguinte usa a entrada — o que o
`resolveAgentSwitch` já fazia), `roda_degradado` (segue com menos, e o
motivo diz o quê) e `recusa`. As quatro recusas são Curador, Blueprint,
Copy e Dispatch: a premissa "cai no template global, que tem hero" é FALSA
(o global do welcome-1 tem 21.314 chars, zero placeholders e nenhum
marcador `cfy:hero`), então deixar rodar para descobrir custa a fase 1
inteira e termina em `hero_failed` de qualquer jeito. Um teste garante que
**todo** nó do grafo tem degradação declarada — nó novo sem entrada reprova
em vez de aparecer na tela sem explicação.

**Pin destrava a recusa**, e é a única coisa que destrava: desativar o
Curador é lacuna; pinar o Curador é dizer "a referência gravada serve".

Onde os gates entram: fase 2 no `runFormattingChain` (combinados com o
toggle global do Editor — e o motivo vai para a run, `agent_disabled` ×
`pinado`, senão um pin apareceria no log como se alguém tivesse desligado o
agente para todo mundo); fase 1 no `generateBlueprintAndReference` (Seletor,
Estruturador e o curto-circuito de fase 1 pinada, que é o que faz "rodar só
a Tipografia" custar a Tipografia em vez de ~220s).

### 5.4 — Pin e execução parcial ✅ ENTREGUE

**Pin = "não execute; a saída gravada vale".** Para a fase 1 é o artefato
persistido (`store_email_references`, `store_email_blueprints`); para a copy
é o conteúdo de `email_blocks`; para os steps de HTML é o HTML do estágio.
Repor o `parsed_output` de uma run ARBITRÁRIA (o "edit output data" do n8n)
ficou de fora: exigiria escrever de volta nos artefatos, e escrever artefato
a partir de run velha é como se inventa divergência entre o que a tela
mostra e o que o pipeline leu.

**Pin sem artefato é tão fatal quanto desativar sem pin,** e a régua pura
não pode ver isso — ela sabe que "pinar o Blueprint" declara que o blueprint
existe, mas não pode conferir. Daí a segunda régua, com I/O
(`verificarPins`): pinar referência, blueprint ou copy que não existem é
recusado; `start_from` sem HTML persistido também, porque a cadeia trata
"estágio sem HTML" como estado inconsistente e RECOMEÇA do zero — o pedido
seria ignorado em silêncio.

Os três modos: `stop_after` (roda e para), "rodar só X"
(`overridesSoEsteNo`: pina tudo antes + `stop_after` + `start_from`) e
"retomar de X" (`start_from` traduzido para `html_pipeline_stage`, o resume
que a cadeia já tinha). Um teste garante que o atalho **nunca** produz
override que o servidor recusa — senão o botão existiria para falhar.

**O watchdog aprendeu a respeitar a pausa.** `stop_after` deixa o e-mail em
`rendering` com o estágio persistido: de fora é indistinguível de geração
travada, e a distinção está no status da EXECUÇÃO. Os dois fronts que
tocavam esses e-mails (o sweep de `timeout_phase2` e a retomada in-process)
agora excluem os pausados — sem isso, parar no nó X e sair para almoçar
devolvia a execução `failed:timeout_phase2`. Fail-open com lista vazia:
sem a migration o watchdog volta ao comportamento de sempre.

**Na tela:** o painel do nó ganhou "Nesta execução" (Desativar · Pinar ·
Parar aqui · Rodar só este), o rascunho pinta no canvas quem não vai rodar
ANTES do disparo (reusa o status `pulado` em vez de inventar um sexto), e a
barra de disparo mostra o resumo e as recusas nó a nó — com o botão
desabilitado enquanto houver recusa. Desativar e pinar são exclusivos na
tela: os dois impedem o nó de rodar, e mostrar os dois selos faria o
operador não saber qual valeu.

**Duas chamadas no disparo, de propósito:** `POST
/api/admin/agents/executions/manual` grava a execução e o estágio de
retomada, e devolve qual disparo fazer; o disparo é o que JÁ EXISTE
(`generate-email`, com fase 1 síncrona, split interno da fase 2 e fallback
sem `INTERNAL_SECRET`). Reimplementá-lo criaria um segundo caminho que
divergiria do primeiro na primeira mudança. O runner encontra a execução
sozinho pelo `email_id` — nenhum parâmetro novo atravessa as três fronteiras
de processo.

## 6. Fora de escopo, declarado

- Editar o pipeline no canvas (reordenar steps, tirar agente do fluxo). O
  pipeline é **código** — a ordem está no `phase2-runner`, não em dado.
- Pin editável à mão e pin de run ARBITRÁRIA (o "edit output data" do n8n).
- Pin/desativação por **slot** do agente de imagem (ele agrega ~16 runs).
- Separar "gasto com teste" de "gasto com cliente" nos painéis de custo.
- Linha de execução para o modo **produção** (e, com ela, a lista da
  esquerda keyed por execução em vez de por e-mail) — ver §5.2.
- Marcador de **nó sujo** do n8n: o `config_snapshot` já guarda o
  `agent_config_id` por agente, então o dado existe; falta a tela comparar
  com a config ativa e marcar a run cuja saída não representa mais o prompt
  em vigor.
- `start_from` com granularidade maior que os três degraus de
  `html_pipeline_stage`: retomar da Tipografia e retomar das Cores caem no
  mesmo ponto ('image'), e isso está documentado em `ESTAGIO_ANTES` em vez
  de fingido.
