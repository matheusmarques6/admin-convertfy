---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: In Review
Epic: AE - Agent Email Generation
Fase: API / Pipeline
Estimate: L
---

# Story AE-3 — Webhook n8n enriquecido + fase 2 in-process com Vercel `waitUntil()`

## User Story

**Como** orquestrador,
**quero** que o webhook do n8n responda 200 imediatamente e siga gerando imagem hero + HTML + QA em background,
**para que** o n8n libere worker rapidamente e o pipeline avance sem precisar de queue externa.

---

## Contexto

O handler atual `POST /api/webhooks/n8n/email-copy` (em `src/app/api/webhooks/n8n/email-copy/route.ts`) já:
- Valida HMAC (`requireWebhookSecret`)
- Parseia Zod
- Salva `subject`, `preheader`, `blocks.content`
- Marca status `copy_ready`
- Registra `email_generation_runs` com `agent='copy'`

Falta:
1. Atualizar timing column `copy_ready_at` (criada em AE-1)
2. **Disparar fase 2 in-process via `waitUntil()`** sem segurar a resposta HTTP
3. Idempotência: rejeitar callbacks duplicados de email já em status `>= copy_ready`
4. Notificar SSE bus quando status muda

A fase 2 reusa o service existente `src/lib/agents/email-generation.service.ts` que já implementa o fluxo image → html → ready. Esta story estende o service com:
- Atualização de novos timing columns
- Chamada ao QA agent (story AE-5) antes de marcar `ready`
- Marcação `failed` com `failure_reason` e `qa_issues` quando QA reprova

---

## Acceptance Criteria

### AC AE-3.1 — Webhook responde 200 antes da fase 2
- [x] Handler chama `successResponse(request, ...)` ANTES de iniciar fase 2
- [x] Fase 2 disparada via `after()` de `next/server` (Next 15.5)
- [ ] Latência observada do POST (até `return`) < 500ms em condições normais — validar manualmente em prod
- [x] Se `after` não está disponível no runtime: log warn + falla diretamente para chamada `void runPhase2InBackground(...)`

### AC AE-3.2 — Idempotência: callback duplicado é no-op
- [x] Antes de salvar copy: SELECT status do email
- [x] Se status já é `copy_ready | rendering | qa_running | ready | failed`: retorna 200 com `{ idempotent: true, current_status }` e NÃO dispara fase 2
- [x] Log `webhook.duplicate_callback` em info
- [x] Test case: callback duplicado retorna `idempotent:true` sem invocar `runPhase2InBackground`

### AC AE-3.3 — Timing columns atualizadas
- [x] No UPDATE de status `copy_ready`: também grava `copy_ready_at = now()`
- [x] Quando fase 2 inicia: UPDATE `status='rendering', rendering_started_at=now()`
- [x] Quando inicia QA: UPDATE `status='qa_running', qa_started_at=now()`
- [x] Final sucesso: UPDATE `status='ready', ready_at=now()`
- [x] Final falha: UPDATE `status='failed', failed_at=now(), failure_reason=$reason, qa_issues=$issues`

### AC AE-3.4 — Fase 2 reusa chains existentes
- [x] Função `runPhase2InBackground({ storeId, emailId })` em `src/lib/agents/phase2-runner.service.ts`
- [x] Internamente chama:
  1. `generateEmailImage(...)` — chain existente reusada
  2. `createHtmlChain(...)` — chain existente reusada
  3. UPDATE `email_flow_emails.html`
  4. `runQaAgentMock(...)` — MOCK in-file ate story AE-5 entregar `runQaAgent` real
- [x] Cada sub-step gera 1 row em `email_generation_runs` (agent='image'|'html'|'qa') com `tokens_input`, `tokens_output`, `cost_cents`, `duration_ms`
- [x] Falha em qualquer sub-step → marca `failed` com `failure_reason = 'image_failed' | 'html_failed' | 'qa_error' | 'qa_failed'`
- [x] Soma `total_cost_cents` em `email_flow_emails` ao final (via `rollupTotalCost`)

### AC AE-3.5 — QA define status final
- [x] Se `qaResult.passed === true`: status `ready`, `qa_issues = qaResult.issues` (pode conter low/medium issues), `ready_at = now()`
- [x] Se `qaResult.passed === false`: status `failed`, `failure_reason = 'qa_failed'`, `qa_issues = qaResult.issues`, `failed_at = now()`
- [x] Threshold de bloqueio configurável via env `EMAIL_QA_BLOCK_SEVERITY`, default `'high'` (`qaShouldBlock` em phase2-runner)
- [ ] Validacao end-to-end depende de AE-5 entregar `runQaAgent` real com schema validado

### AC AE-3.6 — Triggers de batch terminal e notificação
- [x] Após cada UPDATE final (`ready` ou `failed`): chama `checkBatchTerminal(storeId, batchId)`
- [x] Se TODOS os emails do batch estão em `ready | failed`: dispatcha `notifyBatchCompleteMock` (substituir por real quando AE-7 entregar)
- [x] Se status final é `failed`: dispatcha `notifyTaggedMock(['cto'], 'email_generation_failed', ...)`
- [x] Notify chamadas envoltas em try/catch — falha de notificação NÃO altera status do email
- [ ] Trocar mocks `notifyBatchCompleteMock`/`notifyTaggedMock` por dispatcher real quando AE-7 entregar

### AC AE-3.7 — Watchdog-friendly: status intermediário lockado
- [x] Ao iniciar `runPhase2InBackground`, primeiro UPDATE com guard `WHERE status='copy_ready' RETURNING id` (PostgREST `.eq('status','copy_ready').select(...)`)
- [x] Se 0 rows: outro processo já pegou — retorna early, log `phase2.skipped_already_started`
- [x] Mesmo guard pattern para transição `rendering → qa_running`

### AC AE-3.8 — Endpoint interno opcional (chamado pelo watchdog)
- [x] Path: `src/app/api/internal/run-phase2/[emailId]/route.ts`
- [x] Auth: HMAC `INTERNAL_SECRET` via header `x-internal-secret` (reuso `requireWebhookSecret`)
- [x] Chama `runPhase2InBackground({ emailId, storeId })` via `after()`
- [ ] Integracao real com watchdog acontece em AE-4

### AC AE-3.9 — Testes
- [x] Teste: webhook normal → 200 + status `copy_ready` no DB + dispatch de fase 2
- [x] Teste: callback duplicado → 200 idempotente + sem novo run
- [x] Teste: webhook com `email_id` que não pertence a `store_id` → 404
- [x] Teste: webhook com `email_id` inexistente → 404
- [x] Teste: webhook sem `x-webhook-secret` → 401
- [ ] Teste: fase 2 com QA passando → status `ready` — depende de AE-5 (mock cobre o caminho)
- [ ] Teste: fase 2 com QA reprovando severity high → status `failed` — depende de AE-5

---

## Tarefas

- [x] Modificar `src/app/api/webhooks/n8n/email-copy/route.ts`:
  - Adicionar guard de idempotência
  - Adicionar `copy_ready_at = now()` no UPDATE
  - Adicionar `after(runPhase2InBackground(...))` antes do return
- [x] Criar `src/lib/agents/phase2-runner.service.ts` com `runPhase2InBackground` + `checkBatchTerminal`
- [x] Criar `src/app/api/internal/run-phase2/[emailId]/route.ts`
- [x] Adicionar `INTERNAL_SECRET` + `EMAIL_QA_BLOCK_SEVERITY` em `.env.example`
- [x] Mockar `runQaAgent` (substituir quando AE-5 entregar a chain real)
- [x] Decisao: NAO tocar em `src/lib/agents/email-generation.service.ts`. O service legacy continua sendo usado pelo endpoint sincrono `/api/admin/stores/[id]/generate-email`; toda logica nova (QA, novas colunas) vive em `phase2-runner.service.ts`. Reduz risco em codigo em producao.
- [x] Testes em `src/app/api/webhooks/n8n/email-copy/route.test.ts` (6 testes passando)

---

## Dev Notes

### Sobre `waitUntil()` no Next.js (App Router)

A função `waitUntil` está disponível no runtime serverless da Vercel. Importação:

```ts
// Next 14.x
import { waitUntil } from '@vercel/functions'
// alt: import { unstable_after as after } from 'next/server'  (Next 15+)
```

Verificar `package.json` versão de Next antes de implementar. O padrão `@vercel/functions` é mais estável.

Limite na Vercel Pro: 5min por execução (mesmo após response sent). Suficiente pra fase 2 esperada (30–90s).

### Chamada Anthropic direta (sem SDK)

Padrão já usado no projeto em `src/lib/agents/chains/html.chain.ts` (Anthropic Messages API via fetch). Reusar.

### Cost computation

```ts
// já existe em src/lib/agents/callbacks/telemetry.callback.ts
import { computeCostCents } from "@/lib/agents/callbacks/telemetry.callback"
const cost = computeCostCents(model, tokensIn, tokensOut)
```

### Total cost rollup

```sql
UPDATE email_flow_emails
SET total_cost_cents = (
  SELECT COALESCE(SUM(cost_cents),0)
  FROM email_generation_runs
  WHERE email_id = $email_id AND batch_id = $batch_id
)
WHERE id = $email_id
```

Executado uma vez ao final (sucesso ou falha) — não em todo sub-step.

### Por que separar `phase2-runner.service.ts` de `email-generation.service.ts`?

O service existente foi pensado para execução síncrona via endpoint `generate-email`. O runner novo é o orquestrador da fase 2 sob `waitUntil`. Internamente delega para as chains existentes. Isso evita refatorar um service que já está em produção.

---

## Reuso de padrões existentes

- `requireWebhookSecret` — `src/lib/api/n8n-auth.ts`
- `parseAndValidate` + Zod — `src/lib/api/errors.ts`
- `createAdminClient` — `src/lib/supabase/server.ts`
- `logGenerationRun` + `computeCostCents` — `src/lib/agents/callbacks/telemetry.callback.ts`
- Chains: `generateEmailImage`, `createHtmlChain` — já existem

---

## File List

### A criar
- `src/lib/agents/phase2-runner.service.ts`
- `src/app/api/internal/run-phase2/[emailId]/route.ts`
- `src/app/api/webhooks/n8n/email-copy/route.test.ts`

### A modificar
- `src/app/api/webhooks/n8n/email-copy/route.ts` — adicionar idempotência + waitUntil
- `src/lib/agents/email-generation.service.ts` — adicionar hook de QA + colunas novas
- `.env.example` — adicionar `INTERNAL_SECRET`, `EMAIL_QA_BLOCK_SEVERITY`

---

## Dependencias

- **Bloqueado por**: AE-1 (schema), AE-2 (batch_id no email)
- **Bloqueia**: AE-4 (watchdog precisa do endpoint interno), AE-6 (UI precisa do status correto), AE-7 (notificações precisam do hook)
- **Em paralelo com**: AE-5 (QA agent — pode mockar inicialmente)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| `waitUntil` timeout em fase 2 longa | Média | Watchdog detecta em 10min e marca failed |
| Anthropic/OpenRouter retorna 429 | Média | Retry com backoff exponencial dentro da chain (já existe parcialmente) |
| Cost spike por loop infinito de retry | Baixa | Max 1 attempt por fase; `attempts` column em email controla |
| HMAC do webhook leaked | Baixa | Rotação documentada; secret só compartilhado com n8n |
| Idempotency guard race (2 callbacks simultâneos) | Baixa | UPDATE com WHERE status='copy_generating' é atômico no Postgres |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-29 | @dev | Story implementada. Webhook idempotente + fase 2 via `after()` (Next 15.5). Phase2 runner com guards atomicos, telemetria por sub-step, rollup de cost e batch-terminal hook. QA agent (AE-5) e notify dispatcher (AE-7) mockados. 6 testes passando. |
| 2026-05-29 | @reviewer | Code review (commit e6c1ab1) — APROVADO. 0 criticos, 1 importante (gap de testes no endpoint interno `/api/internal/run-phase2/[emailId]`), 2 sugestoes (docs do limite `after()`, comentario no mock). |
| 2026-05-29 | @dev | Follow-up review: criados 6 testes do endpoint interno (happy + flow array + 404 email + 404 store + 401 missing + 401 wrong). Adicionados comentarios pedidos no header do `phase2-runner.service.ts` e no mock `after()` do teste do webhook. Total de testes do epico AE: 24/24 verdes. |
