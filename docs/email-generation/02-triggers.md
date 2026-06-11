# 02 — Os Três Triggers de Disparo

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Última atualização** | 2026-06-01 |

---

O pipeline AE tem **3 caminhos** que disparam a geração de copies/render para o n8n + Fase 2. Cada um tem origem, código e observabilidade distintos.

## Resumo

| # | Trigger | Origem | Fase | Service entrypoint |
|---|---------|--------|------|--------------------|
| 1 | `briefing_confirmed` | Cliente confirma briefing | Fase 1 (copy) | `dispatchEmailCopyWebhook` |
| 2 | `manual_store_button` | Operador clica botão na UI da loja | Fase 1 (copy) | `dispatchEmailCopyWebhook` |
| 3 | `brand_identity_confirmed` | Designer confirma identidade visual | Fase 2 (render+QA) | `dispatchRenderForCopyReady` |

---

## Trigger 1 — `briefing_confirmed`

### Quando dispara

`store_briefings.status` muda de `current` (ou `NULL`) para `confirmed`. Acontece quando:

- O cliente submete o último passo do onboarding (UI normal de briefing).
- Um operador faz a confirmação via Supabase Studio (caso de migração).

**Pegadinha**: a função SQL só dispara em transição **`NULL|≠confirmed → confirmed`**. UPDATEs subsequentes que mantém `status='confirmed'` (idempotentes) **não** geram novo sinal.

### Código

**SQL — `supabase/migrations/20260530_agent_email_generation.sql:144-170`**

```sql
CREATE OR REPLACE FUNCTION fn_on_briefing_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'confirmed'
      AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
    BEGIN
      INSERT INTO email_generation_queue_signals
        (store_id, triggered_by, payload)
      VALUES
        (NEW.store_id, 'briefing_confirmed',
         jsonb_build_object('briefing_id', NEW.id, 'version', NEW.version));
      PERFORM pg_notify('email_generation_signal',
        jsonb_build_object('store_id', NEW.store_id)::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_on_briefing_confirmed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

A trigger SQL **nunca faz HTTP** — apenas insere o sinal na fila e emite `pg_notify`. O `EXCEPTION WHEN OTHERS → RAISE WARNING` garante que falhas na trigger **não bloqueiam** o UPDATE do briefing.

**TypeScript — `src/lib/services/onboarding-pipeline.service.ts:1150-1160`**

```ts
// Dispara webhook outbound pro n8n (fire-and-forget via after() do Next 15)
after(dispatchBriefingWebhook(onb.id))

// Dispara geração de copy dos emails via n8n (fire-and-forget)
if (onb.store_id) {
  after(
    dispatchEmailCopyWebhook(onb.store_id, {
      triggerSource: "briefing_confirmed",
    }),
  )
}
```

Note que existem **dois caminhos paralelos** após o briefing confirmado:
- A **trigger SQL** insere sinal `signal_type='start'` para o watchdog processar.
- O **call direto** já dispara `dispatchEmailCopyWebhook` imediatamente via `after()`.

Isso é redundância intencional: se o `after()` falhar (deploy reciclando, crash do worker), o watchdog cron pega o sinal pendente em até 5 min e re-dispatcha.

### Regeração de briefing (campo `regeneration`)

`dispatchBriefingWebhook` aceita `{ regeneration?: boolean }` (default `false`) e inclui esse campo no payload de saída do briefing webhook (`event: "onboarding.briefing_confirmed"`). Quando o briefing é **REGERADO** (reenvio manual via `POST /api/onboardings/[id]/resend-briefing-webhook` — default `true` — ou `mode="regenerate"` em `store-briefing`), o webhook sai com `regeneration: true`.

O n8n deve **ECOAR** esse campo ao chamar o callback `POST /api/webhooks/n8n/pesquisa-completa`. Quando `regeneration: true`, esse callback apenas atualiza a Pesquisa & Diagnóstico e **NÃO re-dispara a geração de copy** (`dispatchEmailCopyWebhook`) — loga `skipped_due_to_regeneration`. Ausente ou `false` → comportamento normal (Architect + seed + copy). A primeira confirmação (`confirmBriefing`) usa o default `false`.

### Como observar

```sql
-- Sinais 'start' recentes
SELECT id, store_id, triggered_by, signal_type, status, created_at, processed_at
  FROM email_generation_queue_signals
 WHERE signal_type = 'start'
 ORDER BY created_at DESC
 LIMIT 20;

-- Logs (Vercel / logger)
-- Procurar: email_copy.webhook.start, email_copy.webhook.ok, email_copy.webhook.error
```

### Como testar manualmente

```sql
-- 1. Encontre a loja
SELECT id FROM client_stores WHERE store_name ILIKE '%mobility%' LIMIT 1;

-- 2. Encontre o briefing atual
SELECT id, status, version FROM store_briefings
 WHERE store_id = '<store_id>' ORDER BY version DESC LIMIT 1;

-- 3. Confirma (vai disparar a trigger)
UPDATE store_briefings
   SET status = 'confirmed', confirmed_at = now()
 WHERE id = '<briefing_id>';

-- 4. Confere que o sinal foi enfileirado
SELECT * FROM email_generation_queue_signals
 WHERE store_id = '<store_id>'
 ORDER BY created_at DESC LIMIT 1;
```

⚠️ Em produção, **não force `confirmed` via SQL** sem antes garantir que o cliente realmente confirmou o briefing. Use o botão de disparo manual (trigger 2) para re-dispatch.

---

## Trigger 2 — `manual_store_button`

### Quando dispara

Operador clica em **"Gerar copies (n8n)"** no workspace da loja (`/admin/clientes/lojas/[id]`).

### Código

**Endpoint — `src/app/api/admin/stores/[id]/dispatch-email-copies/route.ts`**

```ts
export const maxDuration = 60

const bodySchema = z.object({
  flow_ids: z.array(z.string().uuid()).optional(),  // gerar só desses flows
  only_drafts: z.boolean().optional(),               // gerar só emails em draft
})

export async function POST(request, context) {
  const { id: storeId } = await context.params
  const user = await requireAuth(sb)
  const parsed = bodySchema.parse(await request.json().catch(() => ({})))

  const result = await dispatchEmailCopyWebhook(storeId, {
    triggerSource: "manual_store_button",
    flowIds: parsed.flow_ids,
    triggeredBy: user.id,
    onlyDrafts: parsed.only_drafts,
  })

  return successResponse(request, result)
}
```

Diferente do trigger 1, este é **síncrono**: aguarda a resposta do `dispatchEmailCopyWebhook` (timeout 15s) e retorna `{ ok, flow_count, email_count, reason }` ao cliente.

### Body params

| Campo | Tipo | Default | Efeito |
|-------|------|---------|--------|
| `flow_ids` | `string[]` (UUIDs) | `undefined` (todos) | Filtra flows do dispatch |
| `only_drafts` | `boolean` | `false` | Se `true`, só envia emails em `draft` (preserva os que já estão `copy_ready`+) |

### Resposta

```jsonc
{
  "ok": true,
  "flow_count": 4,
  "email_count": 12,
  "reason": null // ou: "no_url_configured" | "store_not_found" | "no_flows" | "no_draft_emails" | "no_emails"
}
```

### Como testar

```bash
curl -X POST \
  https://admin.convertfy.me/api/admin/stores/<store_id>/dispatch-email-copies \
  -H 'Cookie: <sua_cookie_de_auth>' \
  -H 'Content-Type: application/json' \
  -d '{"only_drafts": true}'
```

### Como observar

```sql
-- Sem sinal SQL gerado: o trigger 2 é síncrono direto pro service.
-- Confira logs do logger:
--   DispatchEmailCopies.dispatch.start
--   DispatchEmailCopies.dispatch.error
--   EmailCopyWebhook.email_copy.webhook.start
--   EmailCopyWebhook.email_copy.webhook.ok
--   EmailCopyWebhook.email_copy.webhook.timeout
```

---

## Trigger 3 — `brand_identity_confirmed`

### Quando dispara

`store_brand_identity.confirmed_at` muda de `NULL` para uma timestamp. Acontece quando:

- Designer clica **"Confirmar identidade visual"** no workspace (`/admin/clientes/lojas/[id]` → aba Identidade Visual).
- Endpoint `POST /api/admin/stores/[id]/brand-identity/confirm` faz o UPDATE.

**Pegadinha**: cada nova versão (`PATCH /brand-identity`) cria uma row com `confirmed_at = NULL` — precisa ser **reconfirmada** pelo designer para destravar a Fase 2 daquele lote de emails.

### Sanity checks no endpoint

Antes de confirmar, valida:

| Check | Onde | Erro se falhar |
|-------|------|----------------|
| Existe `store_brand_identity` para a loja | linha 99-111 | 404 `brand_identity_not_found` |
| `colors_primary[0].hex` existe | linha 129-130 | 422 `brand_identity_incomplete` |
| `font_heading` preenchida | linha 132-134 | 422 `brand_identity_incomplete` |
| ≥1 logo (qualquer variante svg/png) | linha 135-137 | 422 `brand_identity_incomplete` |

A resposta de 422 inclui `details.missing: string[]` para o frontend mostrar quais campos faltam.

### Código

**SQL — `supabase/migrations/20260626c_email_render_signal_type.sql:67-96`**

```sql
CREATE OR REPLACE FUNCTION fn_on_brand_identity_confirmed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL) THEN
    BEGIN
      INSERT INTO email_generation_queue_signals
        (store_id, triggered_by, signal_type, payload)
      VALUES
        (NEW.store_id, 'manual', 'render',
         jsonb_build_object(
           'brand_identity_id', NEW.id,
           'brand_version', NEW.version
         ));
      PERFORM pg_notify('email_generation_signal',
        jsonb_build_object(
          'store_id', NEW.store_id,
          'signal_type', 'render'
        )::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_on_brand_identity_confirmed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
```

`SECURITY DEFINER + SET search_path = public, pg_temp` é hardening contra escalonamento (revisão AE-17).

### Roteamento do sinal

O cron watchdog (`/api/cron/email-generation-watchdog`, schedule a cada 5min) chama `consumeQueueSignal` que branch por `signal_type`:

```
signal_type = 'start'    → startOnboarding(mode='fresh')      [GATE 1, Fase 1]
signal_type = 'render'   → dispatchRenderForCopyReady          [GATE 2, Fase 2]
signal_type = 'rerender' → reset copy_ready + dispatchRender   [AE-20]
```

`dispatchRenderForCopyReady` (em `src/lib/services/email-generation-trigger.service.ts:484`) faz:
1. `SELECT id FROM email_flow_emails WHERE flow_id IN (...) AND status = 'copy_ready'`.
2. Para cada email, chama `runPhase2InBackground({ emailId })` via `after()`.

### Resposta do endpoint

```jsonc
// 200 — confirmado pela primeira vez
{
  "confirmed_at": "2026-06-01T14:32:08.123Z",
  "version": 3,
  "confirmed_by": "<user_id>",
  "emails_to_render": 12   // contagem de emails em copy_ready que vão entrar em fase 2
}

// 200 — idempotente (já estava confirmada)
{
  "already_confirmed": true,
  "version": 3,
  "confirmed_at": "2026-06-01T10:00:00Z"
}

// 422 — incompleta
{
  "error": "Identidade visual incompleta. Preencha: colors_primary, font_heading.",
  "code": "brand_identity_incomplete",
  "details": { "missing": ["colors_primary", "font_heading"] }
}
```

### Como observar

```sql
-- Sinais 'render' recentes
SELECT id, store_id, signal_type, status, payload, created_at, processed_at
  FROM email_generation_queue_signals
 WHERE signal_type = 'render'
 ORDER BY created_at DESC LIMIT 20;

-- Emails que vão (ou foram) renderizar
SELECT id, flow_id, status, updated_at
  FROM email_flow_emails
 WHERE status IN ('copy_ready', 'rendering', 'qa_running')
   AND flow_id IN (SELECT id FROM email_flows WHERE store_id = '<store_id>')
 ORDER BY updated_at DESC;
```

### Como testar manualmente

```bash
# Disparar via endpoint (a forma "correta")
curl -X POST \
  https://admin.convertfy.me/api/admin/stores/<store_id>/brand-identity/confirm \
  -H 'Cookie: <auth>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Para forçar via SQL (debug/admin):

```sql
UPDATE store_brand_identity
   SET confirmed_at = now(), confirmed_by = '<user_id>'
 WHERE id = (
   SELECT id FROM store_brand_identity
    WHERE store_id = '<store_id>'
    ORDER BY version DESC LIMIT 1
 )
 AND confirmed_at IS NULL;
```

⚠️ Não pula sanity check. Use endpoint quando possível.

---

## Tabela de referência rápida

| Aspecto | Trigger 1 (briefing) | Trigger 2 (manual) | Trigger 3 (brand identity) |
|---------|----------------------|--------------------|----------------------------|
| **Quem dispara** | Cliente | Operador | Designer |
| **UI** | Onboarding | Botão "Gerar copies (n8n)" | Botão "Confirmar identidade" |
| **Endpoint** | (interno do onboarding) | `POST /dispatch-email-copies` | `POST /brand-identity/confirm` |
| **Trigger SQL** | `trg_store_briefings_confirmed` | — | `trg_brand_identity_confirmed` |
| **Signal type** | `start` | (não usa fila) | `render` |
| **Modo** | Async (fire-and-forget) | Síncrono (timeout 15s) | Async (via cron) |
| **Fase** | 1 (copy) | 1 (copy) | 2 (render + QA) |
| **Service** | `dispatchEmailCopyWebhook` | `dispatchEmailCopyWebhook` | `dispatchRenderForCopyReady` → `runPhase2InBackground` |
| **Webhook externo** | `N8N_EMAIL_COPY_WEBHOOK_URL` | `N8N_EMAIL_COPY_WEBHOOK_URL` | — (in-process) |

## Próximos docs

- [`03-runbook-operacional.md`](./03-runbook-operacional.md) — Como disparar pra uma loja
- [`05-troubleshooting.md`](./05-troubleshooting.md) — Quando um trigger falha
