---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: Draft
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
- [ ] Path: `src/app/api/cron/email-generation-watchdog/route.ts`
- [ ] Método `GET`, `dynamic = 'force-dynamic'`, `maxDuration = 300`
- [ ] Auth: `requireCronAuth(request)` (padrão do projeto)
- [ ] Retorna `{ success, signals_processed, copy_recovered, phase2_timed_out, started_at, finished_at }`
- [ ] Registrado em `vercel.json` com schedule `*/5 * * * *`

### AC AE-4.2 — Consome sinais pendentes (fase 1)
- [ ] Query: `SELECT * FROM email_generation_queue_signals WHERE status='pending' ORDER BY created_at ASC LIMIT 20 FOR UPDATE SKIP LOCKED`
- [ ] Para cada sinal: chama `consumeQueueSignal(signal.id)` (função da story AE-2)
- [ ] Errors em consumo individual NÃO param o cron — log e continua

### AC AE-4.3 — Detecta copy travada (fase 2)
- [ ] Query:
  ```sql
  SELECT efe.id, efe.flow_id, efe.generation_batch_id, ef.store_id
  FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE efe.status IN ('copy_generating')
    AND efe.copy_started_at < now() - interval '15 minutes'
    AND efe.attempts < 3
  ORDER BY efe.copy_started_at ASC
  LIMIT 10
  FOR UPDATE SKIP LOCKED
  ```
- [ ] Para cada: UPDATE atômico `SET status='copy_generating_recovery', attempts=attempts+1, last_attempt_at=now()` WHERE status='copy_generating' (guard)
- [ ] Se 0 rows: outro cron já pegou — skip
- [ ] Dispara `waitUntil(runCopyChainInProcess({ emailId, storeId }))`

### AC AE-4.4 — Função runCopyChainInProcess
- [ ] Em `src/lib/agents/copy-chain-fallback.service.ts`
- [ ] Carrega contexto (briefing, brand identity, blueprint, top products) — mesmo helper de `email-generation.service.ts`
- [ ] Chama Claude reusando `createCopyChain(config)` de `src/lib/agents/chains/copy.chain.ts` (LangChain `ChatAnthropic`) com prompt ativo de `email_agent_configs WHERE agent_type='copy' AND is_active=true`. Padrão LangChain, não Anthropic SDK direto.
- [ ] Persiste `subject`, `preheader`, `blocks.content` igual ao webhook do n8n
- [ ] Marca `status='copy_ready', copy_ready_at=now()`
- [ ] Dispara fase 2 in-process via `waitUntil(runPhase2InBackground({...}))`
- [ ] Registra `email_generation_runs` com `agent='copy', model=$claudeModel, parsed_output={...}` + flag `metadata.fallback=true`

### AC AE-4.5 — Marca fase 2 travada como failed
- [ ] Query:
  ```sql
  UPDATE email_flow_emails
  SET status='failed',
      failure_reason='timeout_phase2',
      failed_at=now()
  WHERE status IN ('rendering','qa_running')
    AND (
      (status='rendering' AND rendering_started_at < now() - interval '10 minutes')
      OR (status='qa_running' AND qa_started_at < now() - interval '10 minutes')
    )
  RETURNING id, flow_id
  ```
- [ ] Para cada retornado: enfileira notificação `notifyTagged(['cto'], 'email_generation_failed', {email_id, reason:'timeout_phase2'})`
- [ ] Verifica se batch ficou terminal — se sim, dispara `notifyBatchComplete`

### AC AE-4.6 — Detecta emails copy_ready sem fase 2 iniciada (edge case)
- [ ] Query:
  ```sql
  SELECT id, flow_id FROM email_flow_emails
  WHERE status = 'copy_ready'
    AND copy_ready_at < now() - interval '3 minutes'
  LIMIT 10
  ```
- [ ] Para cada: dispara `POST /api/internal/run-phase2/[emailId]` (endpoint da story AE-3)
- [ ] Header: `x-internal-secret: $INTERNAL_SECRET`
- [ ] Cobre caso: webhook do n8n salvou copy mas crashou antes do `waitUntil`

### AC AE-4.7 — Idempotência e concorrência
- [ ] `FOR UPDATE SKIP LOCKED` em todas as seleções de "pegar para processar"
- [ ] UPDATE com guard de status antes de iniciar trabalho
- [ ] Limite máximo de itens por execução: 20 sinais, 10 copy recoveries, 10 phase2 timeouts, 10 stale copy_ready
- [ ] Se cron rodando enquanto outro ainda não terminou: SKIP LOCKED evita reprocesso; cron não bloqueia

### AC AE-4.8 — Telemetria e métricas
- [ ] Log final: `log.info('watchdog.summary', { signals_processed, copy_recovered, phase2_timed_out, stale_copy_ready, duration_ms })`
- [ ] INSERT em tabela `email_generation_runs` com `agent='seed', status='success', parsed_output=summary` (1 row por execução do watchdog, com `email_id=null` permitido via FK ON DELETE SET NULL)
- [ ] Se `copy_recovered > 0`: emite warning log para visibilidade (n8n está falhando)
- [ ] Se `phase2_timed_out > 0`: emite error log

### AC AE-4.9 — Limite de attempts
- [ ] Emails com `attempts >= 3` NÃO entram em copy recovery
- [ ] Marcados diretamente como `failed` com `failure_reason='max_attempts_exhausted'`
- [ ] Notifica tag CTO

### AC AE-4.10 — Configuração em vercel.json
- [ ] Adicionar bloco:
  ```json
  { "path": "/api/cron/email-generation-watchdog", "schedule": "*/5 * * * *" }
  ```

---

## Tarefas

- [ ] Criar `src/app/api/cron/email-generation-watchdog/route.ts`
- [ ] Criar `src/lib/agents/copy-chain-fallback.service.ts`
- [ ] Atualizar `vercel.json` com novo cron
- [ ] Adicionar `MAX_GENERATION_ATTEMPTS=3` em `.env.example` (config tunável)
- [ ] Testes: 1 por branch (signal consume / copy recover / phase2 timeout / stale copy_ready / max attempts)

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
