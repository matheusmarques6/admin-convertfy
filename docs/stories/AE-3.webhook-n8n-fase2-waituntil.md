---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: Draft
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
- [ ] Handler chama `successResponse(request, ...)` ANTES de iniciar fase 2
- [ ] Fase 2 disparada via `waitUntil()` import: `import { waitUntil } from 'next/server'` ou `import { after } from 'next/server'` (verificar versão do Next no projeto — usar a função disponível)
- [ ] Latência observada do POST (até `return`) < 500ms em condições normais
- [ ] Se `waitUntil` não está disponível no runtime: log warn + falla diretamente para chamada síncrona (degrada para o comportamento atual)

### AC AE-3.2 — Idempotência: callback duplicado é no-op
- [ ] Antes de salvar copy: SELECT status do email
- [ ] Se status já é `copy_ready | rendering | qa_running | ready | failed`: retorna 200 com `{ idempotent: true, current_status }` e NÃO dispara fase 2
- [ ] Log `webhook.duplicate_callback` em info
- [ ] Test case: chamar webhook 2x com mesmo `email_id` produz exatamente 1 row em `email_generation_runs` para fase 2

### AC AE-3.3 — Timing columns atualizadas
- [ ] No UPDATE de status `copy_ready`: também grava `copy_ready_at = now()`
- [ ] Quando fase 2 inicia: UPDATE `status='rendering', rendering_started_at=now()`
- [ ] Quando inicia QA: UPDATE `status='qa_running', qa_started_at=now()`
- [ ] Final sucesso: UPDATE `status='ready', ready_at=now()`
- [ ] Final falha: UPDATE `status='failed', failed_at=now(), failure_reason=$reason, qa_issues=$issues`

### AC AE-3.4 — Fase 2 reusa email-generation.service.ts
- [ ] Função `runPhase2InBackground({ storeId, emailId })` em `src/lib/agents/phase2-runner.service.ts`
- [ ] Internamente chama:
  1. `generateEmailImage(...)` — chain existente
  2. `createHtmlChain(...)` — chain existente
  3. UPDATE `email_flow_emails.html`
  4. `runQaAgent(...)` — função NOVA da story AE-5 (mock se AE-5 ainda não está pronta — retorna `{passed:true, issues:[]}` durante dev paralelo)
- [ ] Cada sub-step gera 1 row em `email_generation_runs` (agent='image'|'html'|'qa') com `tokens_input`, `tokens_output`, `cost_cents`, `duration_ms`
- [ ] Falha em qualquer sub-step → marca `failed` com `failure_reason = 'image_failed' | 'html_failed' | 'qa_error' | 'qa_failed'`
- [ ] Soma `total_cost_cents` em `email_flow_emails` ao final

### AC AE-3.5 — QA define status final
- [ ] Se `qaResult.passed === true`: status `ready`, `qa_issues = qaResult.issues` (pode conter low/medium issues), `ready_at = now()`
- [ ] Se `qaResult.passed === false`: status `failed`, `failure_reason = 'qa_failed'`, `qa_issues = qaResult.issues`, `failed_at = now()`
- [ ] Threshold de bloqueio: apenas issues com `severity === 'high'` bloqueiam (configurável via env `EMAIL_QA_BLOCK_SEVERITY`, default `'high'`)

### AC AE-3.6 — Triggers de batch terminal e notificação
- [ ] Após cada UPDATE final (`ready` ou `failed`): chama `checkBatchTerminal(storeId, batchId)`
- [ ] Se TODOS os emails do batch estão em `ready | failed`: dispatcha notificação `notifyBatchComplete(storeId, batchId)` (story AE-7 implementa)
- [ ] Se status final é `failed`: dispatcha `notifyTagged(['cto'], 'email_generation_failed', { email_id, reason })`
- [ ] Notify chamadas envoltas em try/catch — falha de notificação NÃO altera status do email

### AC AE-3.7 — Watchdog-friendly: status intermediário lockado
- [ ] Ao iniciar `runPhase2InBackground`, primeiro UPDATE com guard:
  ```sql
  UPDATE email_flow_emails
  SET status='rendering', rendering_started_at=now()
  WHERE id=$email_id AND status='copy_ready'
  RETURNING id
  ```
- [ ] Se 0 rows: outro processo já pegou — retorna early, log `phase2.skipped_already_started`
- [ ] Mesmo guard pattern para transição `rendering → qa_running`

### AC AE-3.8 — Endpoint interno opcional (chamado pelo watchdog)
- [ ] Path: `src/app/api/internal/run-phase2/[emailId]/route.ts`
- [ ] Auth: HMAC `INTERNAL_SECRET` (mesmo padrão de `requireWebhookSecret` mas com `envVar='INTERNAL_SECRET'`, `headerName='x-internal-secret'`)
- [ ] Chama `runPhase2InBackground({ emailId })` via `waitUntil`
- [ ] Usado pela story AE-4 quando watchdog recupera email com `status='copy_ready'` mas sem fase 2 ainda (caso raro: handler do webhook crashou após salvar copy)

### AC AE-3.9 — Testes
- [ ] Teste: webhook normal → 200 em < 500ms + status `copy_ready` no DB
- [ ] Teste: callback duplicado → 200 idempotente + sem novo run
- [ ] Teste: webhook com `email_id` que não pertence a `store_id` → 404 (já existe — mantido)
- [ ] Teste: fase 2 com QA passando → status `ready`
- [ ] Teste: fase 2 com QA reprovando severity high → status `failed` + `qa_issues` preenchido

---

## Tarefas

- [ ] Modificar `src/app/api/webhooks/n8n/email-copy/route.ts`:
  - Adicionar guard de idempotência
  - Adicionar `copy_ready_at = now()` no UPDATE
  - Adicionar `waitUntil(runPhase2InBackground(...))` antes do return
- [ ] Criar `src/lib/agents/phase2-runner.service.ts` com `runPhase2InBackground` + `checkBatchTerminal`
- [ ] Criar `src/app/api/internal/run-phase2/[emailId]/route.ts`
- [ ] Adicionar `INTERNAL_SECRET` em `.env.example`
- [ ] Mockar `runQaAgent` se AE-5 ainda não estiver pronto
- [ ] Atualizar `src/lib/agents/email-generation.service.ts` se necessário (provavelmente apenas adicionar chamada ao QA + nova coluna `qa_issues`)
- [ ] Testes em `src/app/api/webhooks/n8n/email-copy/route.test.ts` (novo arquivo)

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
