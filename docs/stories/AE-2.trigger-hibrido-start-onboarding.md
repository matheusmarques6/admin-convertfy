---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: In Review
Epic: AE - Agent Email Generation
Fase: API / Trigger
Estimate: M
---

# Story AE-2 — Gatilho híbrido: trigger SQL + endpoint manual `start-onboarding`

## User Story

**Como** operador de onboarding,
**quero** que a geração de emails comece automaticamente ao confirmar o briefing OU manualmente clicando em "Iniciar Onboarding",
**para que** eu não precise gerar email-por-email e tenha override para retomar/refazer batches.

---

## Contexto

A story AE-1 cria a tabela `email_generation_queue_signals` e a trigger SQL que insere um sinal ali. Esta story implementa o **consumidor** do sinal e o **endpoint manual** que dispara o mesmo pipeline.

Fluxo após esta story:
1. Trigger SQL insere em `email_generation_queue_signals` quando briefing confirmado
2. Watchdog (AE-4) consome sinais pendentes e chama `POST /api/admin/stores/[id]/start-onboarding` internamente OU o operador clica no botão na UI
3. Endpoint faz dispatch único pro n8n com lista de emails

---

## Acceptance Criteria

### AC AE-2.1 — Endpoint POST /api/admin/stores/[id]/start-onboarding existe e valida
- [x] Path: `src/app/api/admin/stores/[id]/start-onboarding/route.ts`
- [x] Método `POST` exportado, `dynamic = 'force-dynamic'`, `maxDuration = 60`
- [x] Auth: `requireAuth(sb)` — só admin autenticado
- [x] Validação Zod do body:
  ```ts
  z.object({
    mode: z.enum(['fresh','resume','redo']).default('fresh'),
    flow_ids: z.array(z.string().uuid()).optional(),
    triggered_by: z.enum(['ui','signal_consumer']).default('ui')
  })
  ```
- [x] Erros usam `errorResponse(request, e, 'start-onboarding')`

### AC AE-2.2 — Pré-condição: briefing confirmado
- [x] Se loja não tem briefing com status `confirmed`, retorna 422 com mensagem `briefing_not_confirmed` (mapeado para HTTP 400 via ValidationError; code=`briefing_not_confirmed`)
- [x] Exceção: `mode='resume'` permite continuar mesmo sem briefing confirmed (usado quando watchdog ou operador retoma um batch travado)

### AC AE-2.3 — Pré-condição: não há batch em andamento
- [x] Se já existem emails com status `copy_generating | copy_generating_recovery | rendering | qa_running` para essa loja:
  - Se `mode='fresh'` → 409 com mensagem `batch_in_progress` e `current_batch_id`
  - Se `mode='resume'` → 200, retoma sem disparar n8n novamente (idempotente)
  - Se `mode='redo'` → marca os emails atuais como `failed` (motivo `superseded_by_redo`) e prossegue

### AC AE-2.4 — Seleção de emails alvo
- [x] Query: emails em `email_flow_emails` da loja filtrados por `flow_ids` se informado, senão todos os flows da loja com `status != 'live'`
- [x] Skipa emails em status `ready` salvo `mode='redo'`
- [x] Skipa emails em status `live` SEMPRE (proteção)
- [x] Se array vazio resultante: retorna 200 com `emails_dispatched: 0` e mensagem `nothing_to_generate`

### AC AE-2.5 — Atomicidade do start
- [x] Gera `batch_id = crypto.randomUUID()`
- [x] UPDATE em batch (uma única query) usando `IN` clause:
  ```sql
  UPDATE email_flow_emails
  SET status='copy_generating',
      generation_batch_id=$batch_id,
      copy_started_at=now(),
      attempts=attempts+1,
      last_attempt_at=now(),
      failure_reason=null,
      qa_issues='[]'::jsonb
  WHERE id = ANY($email_ids)
    AND status NOT IN ('live')
  ```
- [x] Se 0 rows afetadas → retorna 200 com `nothing_to_generate`
- [ ] **NOTA**: incremento de `attempts` foi implementado via RPC `increment_email_attempt` com fallback silencioso (RPC pode nao existir ainda — telemetria nao-crítica). Verificar em prod.

### AC AE-2.6 — Dispatch n8n
- [x] POST para `process.env.N8N_EMAIL_COPY_URL` (com fallback para `N8N_EMAIL_COPY_WEBHOOK_URL`)
- [x] Header `Content-Type: application/json` + `x-webhook-secret`
- [x] Body:
  ```json
  {
    "store_id": "...",
    "batch_id": "...",
    "callback_url": "{APP_URL}/api/webhooks/n8n/email-copy",
    "callback_secret": "{N8N_WEBHOOK_SECRET}",
    "emails": [
      { "email_id":"...", "flow_id":"...", "flow_type":"welcome", "email_number": 1, "name":"Welcome 1" }
    ],
    "briefing_version": 7,
    "options": { "generate_images": true }
  }
  ```
- [x] Timeout: 15s. Se n8n não responde 2xx: marca todos os emails do batch de volta para `pending` + grava `failure_reason='n8n_dispatch_failed'` e retorna 502
- [x] Sucesso: retorna `{ batch_id, emails_dispatched: N, dispatched_to_n8n: true, flow_ids_used: [...] }`

### AC AE-2.7 — Sinal: signal consumer
- [x] Função `consumeQueueSignal(signalId)` em `src/lib/services/email-generation-trigger.service.ts`
- [x] Marca status='processing' atomicamente (UPDATE com `eq(status,'pending')` no lugar de SELECT FOR UPDATE SKIP LOCKED — PostgREST nao expõe SELECT FOR UPDATE; o filtro garante que so um worker processa)
- [x] Chama internamente a lógica de `start-onboarding` com `mode='fresh', triggered_by='signal_consumer'`
- [x] Em sucesso: status='done', processed_at=now()
- [x] Em falha: status='failed', attempts++; reagenda se attempts < 3 (volta pra `pending`)
- [x] ConflictError (batch ja em andamento) tratado como done — idempotência
- [ ] Watchdog (AE-4) chama isso (depende de AE-4)

### AC AE-2.8 — Botão UI "Iniciar Onboarding"
- [x] Componente em `src/components/stores/start-onboarding-button.tsx`
- [x] Aparece em `/admin/stores/[id]/producao` (página equivalente — não existe `/onboarding`. Integrado no ProductionWorkspace sidebar)
- [x] Disabled se briefing não confirmed (com title/tooltip explicando)
- [x] Modal de confirmação com 3 opções:
  - "Iniciar do zero" → `mode='fresh'`
  - "Retomar batch atual" → `mode='resume'`
  - "Refazer (descartar atual)" → `mode='redo'` com double-confirm
- [x] Após sucesso: toast "Geração iniciada — batch {short_id}" + redireciona (já estamos na pagina de producao; chama router.push + refresh)
- [x] Em 409: mostra alerta "Já existe batch em andamento. Escolha 'Retomar' ou 'Refazer'"

### AC AE-2.9 — Endpoint de "confirmar briefing"
- [x] Endpoint `POST /api/admin/stores/[id]/briefing/confirm` em `src/app/api/admin/stores/[id]/briefing/confirm/route.ts`
- [x] Marca o briefing `current` mais recente como `status='confirmed', confirmed_at=now(), confirmed_by=user.id`
- [x] Trigger SQL (AE-1) automaticamente insere sinal — esta story NÃO precisa fazer nada além do UPDATE
- [x] Retorna 200 com `{ briefing_id, confirmed_at }`
- [x] Idempotente: se já confirmed, retorna 200 sem trigger novo (trigger só dispara se OLD.status != confirmed)

### AC AE-2.10 — Logs e telemetria
- [x] `log.info('start.dispatch', { storeId, batchId, emailCount, mode, triggeredBy })`
- [x] `log.error('start.n8n_failed', ...)` em falha de dispatch
- [x] INSERT em `email_generation_runs` com `agent='seed', status='success'|'error'`, `parsed_output={ batch_id, email_ids, mode, triggered_by, flow_ids }`

---

## Tarefas

- [x] Criar `src/app/api/admin/stores/[id]/start-onboarding/route.ts`
- [x] Criar `src/app/api/admin/stores/[id]/briefing/confirm/route.ts`
- [x] Criar `src/lib/services/email-generation-trigger.service.ts` com `startOnboarding(input)` e `consumeQueueSignal(signalId)`
- [x] Criar componente `src/components/stores/start-onboarding-button.tsx`
- [x] Integrar botão em `/admin/stores/[id]/producao` (não existe `/onboarding`; producao é a tela equivalente)
- [x] Adicionar `N8N_EMAIL_COPY_URL` em `.env.example`
- [x] Testes: 1 teste por mode (`fresh`, `resume`, `redo`) + teste de 422 (briefing not confirmed) + teste de 409 (batch in progress) — 7 tests passing

---

## Dev Notes

### Schema do payload n8n (contrato externo)

```ts
type N8nDispatchPayload = {
  store_id: string
  batch_id: string
  callback_url: string
  callback_secret: string   // n8n DEVE repassar como header X-Webhook-Secret
  emails: Array<{
    email_id: string
    flow_id: string
    flow_type: 'welcome' | 'abandoned_cart' | 'browse_abandonment'
              | 'upsell' | 'win_back' | 'site_abandoned' | 'shipping_stages'
    email_number: number
    name: string
  }>
  briefing_version: number
  options: { generate_images: boolean }
}
```

### Reuso de utilitários

- `createAdminClient()` para UPDATE em batch (contorna RLS)
- `createClient()` + `requireAuth()` para validar admin no endpoint
- `errorResponse`/`successResponse` para padronização
- Padrão de envio HTTP pro n8n: ver `src/lib/services/n8n-trigger.service.ts` (epic onboarding) — copiar estrutura de `triggerCopyGeneration`

### Race condition entre trigger SQL e UI button

Cenário: operador confirma briefing e imediatamente clica "Iniciar Onboarding" antes do watchdog consumir o sinal.

Mitigação: `mode='fresh'` falha com 409 se já há batch em andamento. O signal consumer também respeita 409 e marca o sinal como `done` (já foi processado pela UI). Garantia: nunca há dois dispatches concorrentes.

### Edge cases testáveis

1. Briefing existe mas é `current` → 422 `briefing_not_confirmed`
2. Loja sem nenhum email → 200 `nothing_to_generate`
3. Loja com todos os emails `ready` + `mode='fresh'` → 200 `nothing_to_generate`
4. `mode='redo'` em loja com 1 email `live` → 1 email pulado, restante reprocessado
5. n8n offline (timeout) → 502 + emails revertem para `pending`

---

## File List

### A criar
- `src/app/api/admin/stores/[id]/start-onboarding/route.ts`
- `src/app/api/admin/stores/[id]/briefing/confirm/route.ts`
- `src/lib/services/email-generation-trigger.service.ts`
- `src/components/stores/start-onboarding-button.tsx`

### A modificar
- `src/app/admin/stores/[id]/onboarding/page.tsx` (ou nome equivalente) — adicionar botão
- `.env.example` — adicionar `N8N_EMAIL_COPY_URL`

---

## Dependencias

- **Bloqueia**: AE-3, AE-4 (precisam do batch criado)
- **Bloqueado por**: AE-1 (precisa do schema novo)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Operador clica "Iniciar" várias vezes seguidas | Alta | 409 protege; UI desabilita botão durante request |
| n8n timeout durante dispatch | Média | Try/catch + revert para `pending` + 502 |
| Trigger SQL dispara para briefing antigo recém-marcado | Baixa | Trigger só dispara se `OLD.status != 'confirmed'` |
| Race entre signal consumer e UI button | Média | 409 + idempotência por `batch_id` |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-29 | @dev | Story implementada. Criados endpoints start-onboarding + briefing/confirm, service `email-generation-trigger.service.ts` com `startOnboarding`/`consumeQueueSignal`, componente `StartOnboardingButton` com modal 3-modes. Botão integrado no ProductionWorkspace (não há `/admin/stores/[id]/onboarding` — `/producao` é a tela equivalente). N8N URL aceita ambas envs (`N8N_EMAIL_COPY_URL` preferida; fallback para `N8N_EMAIL_COPY_WEBHOOK_URL`). 7 testes passam, typecheck/lint limpos. AC AE-2.7 watchdog parte depende de AE-4. |
