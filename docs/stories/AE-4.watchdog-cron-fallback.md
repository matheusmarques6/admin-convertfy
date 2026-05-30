---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: In Review
Epic: AE - Agent Email Generation
Fase: Cron / Resiliência
Estimate: M
---

# Story AE-4 — Watchdog cron: detecta travados + fallback in-process para copy

## User Story

**Como** plataforma,
**quero** um cron que detecte emails travados em estados intermediários,
**para que** o pipeline se auto-recupere de falhas do n8n ou timeouts da fase 2 sem intervenção manual.

---

## Contexto

A arquitetura escolhida no ADR não tem worker dedicado. A fase 2 roda via `waitUntil` que tem limite ~5min na Vercel Pro. Se a função morre antes do final, o email fica `rendering` ou `qa_running` indefinidamente.

O watchdog roda a cada 5 minutos e age em 3 frentes:
1. **Consome sinais** de `email_generation_queue_signals` (gerados pela trigger SQL ao confirmar briefing — AE-1/AE-2)
2. **Detecta copy travada** (`copy_generating` > 15min sem callback do n8n) — dispara chain de copy in-process com Claude direto
3. **Marca falhas de fase 2** (`rendering | qa_running` > 10min) — status `failed` com `failure_reason='timeout_phase2'`

---

## Acceptance Criteria

### AC AE-4.1 — Cron endpoint
- [x] Path: `src/app/api/cron/email-generation-watchdog/route.ts`
- [x] Método `GET`, `dynamic = 'force-dynamic'`, `maxDuration = 300`
- [x] Auth: `requireCronAuth(request)` (padrão do projeto)
- [x] Retorna `{ success, signals_processed, copy_recovered, phase2_timed_out, started_at, finished_at }` (e mais: `signals_failed`, `max_attempts_exhausted`, `stale_copy_ready`, `duration_ms`)
- [x] Registrado em `vercel.json` com schedule `*/5 * * * *`

### AC AE-4.2 — Consome sinais pendentes (fase 1)
- [x] Query: SELECT `id` de `email_generation_queue_signals` WHERE status='pending' ORDER BY created_at ASC LIMIT 20. **Nota:** PostgREST nao expoe `FOR UPDATE SKIP LOCKED`; a concorrencia eh garantida no `consumeQueueSignal` via UPDATE atomico `eq(status,'pending')` (AE-2).
- [x] Para cada sinal: chama `consumeQueueSignal(signal.id)` (função da story AE-2)
- [x] Errors em consumo individual NÃO param o cron — log e continua (try/catch por sinal, mais try/catch envolvendo a frente toda)

### AC AE-4.3 — Detecta copy travada (fase 2)
- [x] UPDATE atomico em `email_flow_emails` claimando `status='copy_generating' AND copy_started_at < now()-15min AND attempts < MAX_GENERATION_ATTEMPTS (3)` -> `status='copy_generating_recovery'`. Concorrencia via WHERE — PostgREST nao expoe `FOR UPDATE SKIP LOCKED`, mas o UPDATE eh transacional e dois crons concorrentes resultam em apenas 1 ganhar a row.
- [x] Para cada row claimed: dispara `after(runCopyChainInProcess({ emailId, storeId, triggeredBy: 'watchdog:copy_fallback' }))` com fallback `void runCopyChainInProcess(...).catch(...)` quando `after` indisponivel.
- [x] Limite de 10 por execucao.
- [ ] **Pendente DB real:** incremento de `attempts` no UPDATE de claim — o increment ja eh feito pelo `startOnboarding` (AE-2) via `increment_email_attempts` RPC, mas nao reaplicamos aqui para evitar duplicar contagem. Trade-off: emails que entram em recovery passam de attempt 1 para 2 (cap em 3); recovery so pode rodar 2x antes do exhaust. **Aceitavel para MVP** — pode ser ajustado em iteracao futura se a janela de 2 fallbacks por email for curta.

### AC AE-4.4 — Função runCopyChainInProcess
- [x] Em `src/lib/agents/copy-chain-fallback.service.ts`
- [x] Carrega contexto (briefing, brand identity, blueprint, top products, copy agent config). Helper local — reusa o padrao de `loadGenerationContext` sem duplicar todo o flat-vars.
- [x] Chama Claude reusando `createCopyChain(config)` (LangChain `ChatAnthropic`) com prompt ativo de `email_agent_configs WHERE agent_type='copy' AND is_active=true`. Defaults via `DEFAULT_COPY_SYSTEM_PROMPT` / `DEFAULT_COPY_USER_TEMPLATE`.
- [x] Persiste `subject`, `preheader`, `blocks.content` (UPSERT por `block_id` ou fallback por `position`).
- [x] Marca `status='copy_ready', copy_ready_at=now()` (mesmo shape do webhook do n8n).
- [x] Dispara fase 2 in-process via `after(runPhase2InBackground({...}))` com fallback fire-and-forget.
- [x] Registra `email_generation_runs` com `agent='copy', model=$claudeModel, parsed_output={subject, preheader, blocks_written, blocks_total, fallback: true}` + tokens estimados + cost via `computeCostCents`.
- [x] Em qualquer falha (parse, chain, persistencia): marca `status='failed', failure_reason='copy_fallback_failed'` + log de erro.

### AC AE-4.5 — Marca fase 2 travada como failed
- [x] 2 UPDATEs separados (rendering + qa_running) com timing column especifica + `lt < now() - 10min` -> `status='failed', failure_reason='timeout_phase2', failed_at=now()`. PostgREST nao permite a clausula composta `OR` nativamente entre 2 colunas de timing — separar em 2 UPDATEs eh equivalente e mais legivel.
- [x] Para cada retornado: chama `notifyTaggedMock(['cto'], 'email_generation_failed', {email_id, reason:'timeout_phase2'})`.
- [ ] **Pendente AE-7:** `notifyTagged` ainda eh mock (mesmo padrao de `phase2-runner.service.ts`). Quando AE-7 entregar o dispatcher real, basta substituir o `notifyTaggedMock` por `notifyTagged`.
- [x] Chama `checkBatchTerminalMock(batchId)` para cada email afetado. Mock alinhado com o pattern do phase2-runner.

### AC AE-4.6 — Detecta emails copy_ready sem fase 2 iniciada (edge case)
- [x] SELECT `id` de `email_flow_emails` WHERE `status='copy_ready' AND copy_ready_at < now() - 3min` ORDER BY copy_ready_at ASC LIMIT 10.
- [x] Para cada: POST `${APP_URL}/api/internal/run-phase2/${emailId}` com header `x-internal-secret: $INTERNAL_SECRET`, timeout 5s. Erros individuais sao logados sem bloquear.
- [x] Skip total quando `INTERNAL_SECRET` nao estiver configurado (log de erro).

### AC AE-4.7 — Idempotência e concorrência
- [x] UPDATE atomico com filtro de status em todas as transicoes de claim ("copy_generating" -> "copy_generating_recovery" e "rendering|qa_running" -> "failed"). Substitui `FOR UPDATE SKIP LOCKED` (nao disponivel via PostgREST).
- [x] Limite máximo: 20 sinais, 10 copy recoveries, 10 phase2 timeouts (por status), 10 stale copy_ready.
- [x] Crons concorrentes nao reprocessam mesmo row: o WHERE do UPDATE eh avaliado dentro da transacao — somente 1 ganhador.

### AC AE-4.8 — Telemetria e métricas
- [x] Log final via `log.info|warn|error('watchdog.summary', summary)` — nivel depende dos contadores (warn se `copy_recovered>0`, error se `phase2_timed_out>0` ou `max_attempts_exhausted>0`).
- [x] INSERT em `email_generation_runs` com `agent='seed', email_id=NULL, batch_id=randomUUID(), parsed_output=summary, model='watchdog'` — 1 row por execucao.

### AC AE-4.9 — Limite de attempts
- [x] Emails com `attempts >= 3` NAO entram em copy recovery — o UPDATE de claim filtra com `lt('attempts', MAX_ATTEMPTS)`.
- [x] Antes do claim, UPDATE separado marca emails com `status='copy_generating' AND attempts >= MAX_ATTEMPTS AND copy_started_at < now()-15min` como `failed` com `failure_reason='max_attempts_exhausted'`.
- [x] Notifica tag CTO via mock.

### AC AE-4.10 — Configuração em vercel.json
- [x] Adicionado bloco `{ "path": "/api/cron/email-generation-watchdog", "schedule": "*/5 * * * *" }` no fim do array `crons`.

---

## Tarefas

- [x] Criar `src/app/api/cron/email-generation-watchdog/route.ts`
- [x] Criar `src/lib/agents/copy-chain-fallback.service.ts`
- [x] Atualizar `vercel.json` com novo cron
- [x] Adicionar `MAX_GENERATION_ATTEMPTS=3` em `.env.example` (config tunável) + `WATCHDOG_COPY_TIMEOUT_MIN`, `WATCHDOG_PHASE2_TIMEOUT_MIN`, `WATCHDOG_STALE_COPY_READY_MIN`
- [x] Testes: 10 specs cobrindo auth (401), summary zerada, signals (2 cenarios), copy stuck (claim + max attempts), phase2 timeout (rendering+qa_running), stale copy_ready (with/without INTERNAL_SECRET)

---

## Dev Notes

### Por que threshold 15min para copy_generating?

P95 esperado do n8n com 7 emails em paralelo: ~5 minutos. Threshold 15min = 3x p95, evita falsos positivos. Configurável via env `WATCHDOG_COPY_TIMEOUT_MIN=15` (não obrigatório nesta story; default no código).

### Por que threshold 10min para fase 2?

Fase 2 esperada: 30–90s. Threshold 10min = 6x p95. Margem ampla porque `waitUntil` ainda pode estar rodando — não queremos matar uma execução legítima.

### Why no exponential backoff entre attempts?

Watchdog roda a cada 5min. Em 15min de timeout, attempts 1→2→3 leva ~45min total. Backoff exponencial adicional seria over-engineering pro volume de tráfego deste pipeline.

### Critical: SELECT FOR UPDATE SKIP LOCKED

Padrão usado em sistemas de fila com Postgres. Cada cron concorrente "pega" rows diferentes sem conflito. Já usado no projeto em `src/app/api/cron/process-deal-won/route.ts` — copiar padrão.

### Fallback notifica n8n team

Se `copy_recovered > 0` em 3 execuções consecutivas, log emite erro estruturado que dispara alerta operacional. (Implementação do alerta fica para Epic de observabilidade — fora do escopo.)

---

## Reuso de padrões existentes

- `requireCronAuth` — `src/lib/api/cron-auth.ts`
- Estrutura cron — copiar de `src/app/api/cron/crm-snapshot/route.ts`
- `FOR UPDATE SKIP LOCKED` — ver `src/app/api/cron/process-deal-won/route.ts`
- `logger.child` — `src/lib/logger`
- Anthropic call — `src/lib/agents/chains/html.chain.ts`

---

## File List

### A criar
- `src/app/api/cron/email-generation-watchdog/route.ts`
- `src/lib/agents/copy-chain-fallback.service.ts`
- `src/app/api/cron/email-generation-watchdog/route.test.ts`

### A modificar
- `vercel.json` — adicionar entrada de cron
- `.env.example` — adicionar variáveis opcionais

---

## Dependencias

- **Bloqueado por**: AE-1 (schema, queue signals table), AE-2 (`consumeQueueSignal` function), AE-3 (endpoint interno `/api/internal/run-phase2`)
- **Bloqueia**: produção do épico (sem watchdog, não há resiliência)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Watchdog dispara fallback enquanto n8n ainda terminaria | Média | Threshold 15min > 3x p95; UPDATE atômico com guard previne dupla execução |
| Cron timeout (300s) com muitos sinais | Baixa | Limite de 20 por execução; volume esperado < 100/dia |
| Anthropic 429 no fallback | Média | Retry interno na chain com backoff; failure marca `failed:rate_limited` |
| Concorrência com webhook do n8n | Média | UPDATE com WHERE status='copy_generating' é atômico — só uma transação ganha |
| Loop infinito de recovery se Claude também falha | Baixa | Cap em `attempts < 3`; após 3 vai pra `failed` |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-30 | @dev | Story implementada. Cron handler + copy fallback service + 10 testes. `FOR UPDATE SKIP LOCKED` substituido por UPDATE atomico com filtros (PostgREST nao expoe). `notifyTagged` / `checkBatchTerminal` permanecem mock ate AE-7. Reuso: `requireCronAuth`, `consumeQueueSignal` (AE-2), `runPhase2InBackground` (AE-3), `createCopyChain` (LangChain), `logGenerationRun`, `computeCostCents`. Status: Draft -> In Review. |
| 2026-05-30 | @reviewer | Code review (commit 3349519) — APROVADO COM AJUSTES. 2 criticos: (a) front 4 podia loopear se POST falha (sem cap), (b) decisao de NAO incrementar `attempts` em recovery estava sem comentario no codigo. 1 importante: faltava teste de dispatch failure no front 4. |
| 2026-05-30 | @dev | Fixes do review: (a) nova migration `20260530c_copy_ready_dispatch_attempts.sql` cria coluna + RPC + cap (`MAX_STALE_DISPATCH=3`). Front 4 incrementa contador apos falha de POST e marca `failed:stale_copy_ready_exhausted` ao atingir cap. (b) Comentario DESIGN NOTE adicionado em `recoverStuckCopy` explicando porque attempts nao e re-incrementado. (c) 2 testes novos no front 4: dispatch falha sem cap + dispatch falha com cap. Suite AE total: 36/36 verde. |
