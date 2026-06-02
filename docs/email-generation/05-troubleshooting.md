# 05 — Troubleshooting

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Audiência** | Suporte, on-call, dev |
| **Última atualização** | 2026-06-01 |

---

Cada caso segue o formato **Sintoma → Diagnóstico → Fix**. Comece sempre pelo apêndice de queries de saúde do pipeline (no fim do doc).

## Caso 1 — Status preso em `copy_generating`

### Sintoma

Emails ficaram em `copy_generating` por mais de 15 minutos. UI mostra "Gerando…" há muito tempo.

### Diagnóstico

```sql
SELECT id, flow_id, status, updated_at, attempts, failure_reason
  FROM email_flow_emails
 WHERE status IN ('copy_generating', 'copy_generating_recovery')
   AND updated_at < NOW() - INTERVAL '5 minutes'
 ORDER BY updated_at;
```

Causas possíveis:
1. **n8n caiu / workflow desligado** — Logs Vercel não mostram callback chegando.
2. **n8n processou mas callback falhou** — Verifique logs `N8nEmailCopy.*` no Vercel.
3. **Secret incorreto** — n8n recebe 401 ao tentar callback.
4. **Watchdog não está rodando** — Cron job desabilitado.

### Fix

**Curto prazo** (5-15 min): aguarde o watchdog. A cada 5 min ele detecta `copy_generating > WATCHDOG_COPY_TIMEOUT_MIN` (default 15min) e:
- Tenta fallback in-process `runCopyChainInProcess` (status vira `copy_generating_recovery`).
- Se `attempts >= MAX_GENERATION_ATTEMPTS`, marca `failed` com reason `max_attempts_exhausted`.

**Manual** (se watchdog também travou):

```sql
-- 1. Listar emails travados
SELECT id, attempts FROM email_flow_emails
 WHERE status = 'copy_generating'
   AND updated_at < NOW() - INTERVAL '15 minutes';

-- 2. Resetar para draft (vai poder re-disparar)
UPDATE email_flow_emails
   SET status = 'draft', attempts = 0, failure_reason = NULL
 WHERE id IN ('<email_id_1>', '<email_id_2>');
```

Depois use Receita B em [`03-runbook-operacional.md`](./03-runbook-operacional.md) para re-disparar.

---

## Caso 2 — Callback do n8n nunca chegou

### Sintoma

n8n processou (você vê no dashboard do n8n) mas `email_flow_emails.status` continua em `copy_generating`.

### Diagnóstico

1. **Logs Vercel** — procure por `N8nEmailCopy.*`:
   - Se nada aparece → callback nunca foi POSTed.
   - Se aparece com `401` → secret divergente.
   - Se aparece com `404` → `email_id` ou `store_id` inválido / não pertencente.

2. **Conferir secret**:
   ```bash
   # Na Vercel
   echo $N8N_WEBHOOK_SECRET   # mas via dashboard, não secret real

   # No n8n
   # Confira que o node HTTP Request usa o mesmo header `x-webhook-secret`
   ```

3. **Testar callback manualmente** (substitua secret e UUIDs):
   ```bash
   curl -X POST https://admin.convertfy.me/api/webhooks/n8n/email-copy \
     -H 'Content-Type: application/json' \
     -H 'x-webhook-secret: <SECRET>' \
     -d '{
       "store_id": "<store_uuid>",
       "email_id": "<email_uuid>",
       "subject": "Teste manual",
       "preheader": "Disparado pelo curl",
       "blocks": []
     }'
   ```
   - 200 → o endpoint funciona, problema é no n8n.
   - 401 → secret errado na sua chamada (compare com Vercel).
   - 404 → IDs inválidos.

### Fix

- Se secret divergente: atualize no n8n para bater com `N8N_WEBHOOK_SECRET` da Vercel.
- Se IDs inválidos: o workflow do n8n está usando IDs de outra ambiente/loja. Revise.
- Se nada chega: workflow n8n não está ativo. Ative manualmente.

Após corrigir, dispare novamente via Receita B (botão "Gerar copies (n8n)").

---

## Caso 3 — Payload chegou no n8n mas com campos vazios

### Sintoma

n8n recebeu a request mas `store.brand.thesis`, `store.icp.persona`, etc. estão `null`/`""`. Copy gerada é genérica e pobre.

### Diagnóstico

Loja não tem **Contexto preenchido**. Veja a query de saúde no apêndice — colunas críticas estão vazias.

```sql
SELECT
  store_name,
  brand_thesis IS NOT NULL AS has_thesis,
  icp_persona IS NOT NULL AS has_icp,
  tone_description IS NOT NULL AS has_tone,
  slogan IS NOT NULL AS has_positioning,
  store_story IS NOT NULL AS has_story,
  (SELECT COUNT(*) FROM store_top_products WHERE store_id = client_stores.id) AS top_products_count
FROM client_stores
WHERE id = '<store_id>';
```

### Fix

1. Onboarding/CS abre a aba **Contexto** do workspace da loja.
2. Preenche as seções: Brand, ICP, Tone, Positioning, Visual, Story, Operations, Audience.
3. Adiciona top products (sincronização do Shopify via aba específica).
4. Adiciona concorrentes em `client_competitors`.
5. Dispara Receita B para re-gerar.

Veja o checklist em [`03-runbook-operacional.md → "Antes de qualquer disparo"`](./03-runbook-operacional.md).

---

## Caso 4 — `copy_ready` mas Fase 2 não dispara

### Sintoma

Emails ficaram em `copy_ready` há mais de 10 minutos sem virar `rendering`.

### Diagnóstico

```sql
-- 1. A identidade visual foi confirmada?
SELECT id, version, confirmed_at, confirmed_by
  FROM store_brand_identity
 WHERE store_id = '<store_id>'
 ORDER BY version DESC LIMIT 1;
```

- Se `confirmed_at IS NULL` → designer ainda não confirmou. Esse é o **comportamento esperado**. Aguarde ou pergunte ao designer.

```sql
-- 2. Sinais render pendentes na fila
SELECT id, store_id, signal_type, status, attempts, created_at, processed_at, payload
  FROM email_generation_queue_signals
 WHERE store_id = '<store_id>'
   AND signal_type = 'render'
 ORDER BY created_at DESC LIMIT 5;
```

- Se não há sinal: trigger SQL `fn_on_brand_identity_confirmed` não disparou. Causa rara — pode ser que o UPDATE não trocou de `NULL → NOT NULL` (ex: já estava confirmado e foi reconfirmado idempotente).
- Se sinal está `pending` há mais de 5 min: watchdog não está rodando.

```sql
-- 3. Watchdog está rodando?
-- Procurar nos logs Vercel: EmailGenWatchdog.*
-- Se nada nas últimas 10 min, cron está quebrado.
```

### Fix

**Caso designer ainda não confirmou**:
- Notifique o designer (UI: `/admin/clientes/lojas/<store_id>` → aba Identidade Visual → botão "Confirmar").
- Ver receita A passo 4 em [`03-runbook-operacional.md`](./03-runbook-operacional.md).

**Caso sinal não foi gerado**:
```sql
-- Forçar enfileirar manualmente
INSERT INTO email_generation_queue_signals (store_id, triggered_by, signal_type, payload)
VALUES ('<store_id>', 'manual', 'render', '{"reason":"manual_recovery"}'::jsonb);
```
Watchdog vai consumir no próximo ciclo (≤5min).

**Caso watchdog parado**:
- Verifique `vercel.json` → o cron `email-generation-watchdog` deve estar definido.
- Cheque dashboard de Cron Jobs na Vercel.

---

## Caso 5 — Status `failed` com `failure_reason`

### Sintoma

Email caiu em `failed`. Designer pergunta o que aconteceu.

### Diagnóstico

```sql
SELECT id, status, failure_reason, qa_issues, attempts, updated_at
  FROM email_flow_emails
 WHERE id = '<email_id>';
```

Reasons comuns:

| `failure_reason` | Causa | Ação |
|------------------|-------|------|
| `max_attempts_exhausted` | Watchdog tentou 3x e desistiu | Resetar para `draft` e investigar n8n |
| `timeout_phase2` | Fase 2 não terminou em 10 min | Erro no image/html/qa agent. Ver logs |
| `cancelled_manually` | Operador cancelou | Re-disparar via Receita B |
| `superseded_by_redo` | Mode `redo` na trigger 2 substituiu | Esperado, não é erro |
| `validation_error` | Output do agent não passou schema | Bug no prompt — escalar pro dev |
| `qa_critical_issues` | QA agent marcou bloqueante | Designer corrige manualmente ou re-gera |

```sql
-- Ver últimas transições para entender histórico
SELECT from_status, to_status, metadata, created_at
  FROM email_status_events
 WHERE email_id = '<email_id>'
 ORDER BY created_at DESC LIMIT 10;
```

### Fix

**Re-gerar do zero (Fase 1)**:
```sql
UPDATE email_flow_emails
   SET status = 'draft',
       failure_reason = NULL,
       attempts = 0,
       qa_issues = '[]'::jsonb
 WHERE id = '<email_id>';
```
Depois Receita B com `flow_ids` filtrando só o flow afetado.

**Re-rodar só Fase 2** (se copy estava OK):
```sql
UPDATE email_flow_emails
   SET status = 'copy_ready',
       failure_reason = NULL,
       qa_issues = '[]'::jsonb
 WHERE id = '<email_id>';

-- Enfileira sinal pra fase 2 pegar
INSERT INTO email_generation_queue_signals (store_id, triggered_by, signal_type, payload)
VALUES (
  (SELECT store_id FROM email_flows WHERE id = (SELECT flow_id FROM email_flow_emails WHERE id = '<email_id>')),
  'manual', 'render', '{"reason":"recovery_email_<email_id>"}'::jsonb
);
```

---

## Caso 6 — Tag CTO recebeu alerta

### Sintoma

Você (com `profiles.tags @> ARRAY['cto']`) recebeu notificação de falha no pipeline AE.

### Diagnóstico

```sql
-- Ver últimas falhas críticas
SELECT e.id, e.failure_reason, e.updated_at, f.flow_type, cs.store_name
  FROM email_flow_emails e
  JOIN email_flows f ON f.id = e.flow_id
  JOIN client_stores cs ON cs.id = f.store_id
 WHERE e.status = 'failed'
   AND e.updated_at > NOW() - INTERVAL '1 hour'
 ORDER BY e.updated_at DESC;

-- Falhas em batch (batch_id repete)
SELECT generation_batch_id, COUNT(*) AS failed_count, MIN(updated_at) AS first_fail
  FROM email_flow_emails
 WHERE status = 'failed'
   AND updated_at > NOW() - INTERVAL '1 hour'
 GROUP BY generation_batch_id
 ORDER BY failed_count DESC;
```

Se um batch inteiro falhou: provável regressão de prompt ou n8n workflow. Ver Caso 2.

### Quem está marcado como `cto`

```sql
SELECT id, email, tags FROM profiles WHERE tags @> ARRAY['cto'];
```

Para adicionar/remover (sem UI ainda, via Supabase Studio):

```sql
-- Adicionar
UPDATE profiles
   SET tags = array_append(tags, 'cto')
 WHERE email = 'pessoa@convertfy.me'
   AND NOT (tags @> ARRAY['cto']);

-- Remover
UPDATE profiles
   SET tags = array_remove(tags, 'cto')
 WHERE email = 'pessoa@convertfy.me';
```

---

## Caso 7 — Acabei de fazer deploy e os emails não estão gerando

### Sintoma

Após push, lojas que confirmaram briefing não viram dispatch.

### Diagnóstico

1. Sinais ainda estão `pending`?
   ```sql
   SELECT signal_type, status, COUNT(*)
     FROM email_generation_queue_signals
    WHERE created_at > NOW() - INTERVAL '15 minutes'
    GROUP BY signal_type, status;
   ```
2. Watchdog rodou desde o deploy?
   - Logs Vercel `EmailGenWatchdog.*` na última execução.
3. Erro de typecheck/build em algum service?
   - `npm run typecheck` local na branch deployada.

### Fix

Se sinais estão `pending` por mais de 5 min sem `processed_at`:
- Force re-execução do cron via Vercel UI (botão "Run").
- Se quebrou na compilação: rollback do deploy.

---

## Apêndice — Queries de saúde

### Health check geral

```sql
-- 1. Distribuição de status (últimas 24h)
SELECT status, COUNT(*)
  FROM email_flow_emails
 WHERE updated_at > NOW() - INTERVAL '24 hours'
 GROUP BY status
 ORDER BY status;

-- 2. Sinais na fila
SELECT signal_type, status, COUNT(*)
  FROM email_generation_queue_signals
 WHERE created_at > NOW() - INTERVAL '24 hours'
 GROUP BY signal_type, status;

-- 3. Failures por loja (último dia)
SELECT cs.store_name, COUNT(*) AS failed
  FROM email_flow_emails e
  JOIN email_flows f ON f.id = e.flow_id
  JOIN client_stores cs ON cs.id = f.store_id
 WHERE e.status = 'failed'
   AND e.updated_at > NOW() - INTERVAL '24 hours'
 GROUP BY cs.store_name
 ORDER BY failed DESC;

-- 4. Latência média (briefing confirmed → ready)
SELECT
  AVG(EXTRACT(EPOCH FROM (
    (SELECT MAX(created_at) FROM email_status_events
       WHERE email_id = e.id AND to_status = 'ready')
    -
    (SELECT MIN(created_at) FROM email_status_events
       WHERE email_id = e.id AND to_status = 'copy_generating')
  )) / 60) AS avg_minutes
FROM email_flow_emails e
WHERE e.status = 'ready'
  AND e.updated_at > NOW() - INTERVAL '24 hours';
```

### Diagnóstico por loja

```sql
WITH s AS (SELECT '<store_id>'::uuid AS store_id)
SELECT
  cs.store_name,
  (SELECT confirmed_at IS NOT NULL FROM store_brand_identity
     WHERE store_id = (SELECT store_id FROM s)
     ORDER BY version DESC LIMIT 1) AS brand_confirmed,
  (SELECT status FROM store_briefings
     WHERE store_id = (SELECT store_id FROM s)
     ORDER BY version DESC LIMIT 1) AS briefing_status,
  (SELECT json_object_agg(status, count) FROM (
    SELECT status, COUNT(*) AS count
      FROM email_flow_emails e
      JOIN email_flows f ON f.id = e.flow_id
     WHERE f.store_id = (SELECT store_id FROM s)
     GROUP BY status
  ) t) AS emails_by_status,
  (SELECT json_agg(json_build_object(
     'signal_type', signal_type,
     'status', status,
     'created_at', created_at
   ) ORDER BY created_at DESC) FROM (
    SELECT signal_type, status, created_at
      FROM email_generation_queue_signals
     WHERE store_id = (SELECT store_id FROM s)
     ORDER BY created_at DESC LIMIT 5
   ) sig) AS recent_signals
FROM client_stores cs WHERE cs.id = (SELECT store_id FROM s);
```

### Resetar a loja para re-disparar limpo

⚠️ **Destrutivo**. Use apenas em homolog/staging ou após backup.

```sql
BEGIN;

-- 1. Reset emails para draft
UPDATE email_flow_emails
   SET status = 'draft',
       attempts = 0,
       failure_reason = NULL,
       qa_issues = '[]'::jsonb,
       subject = NULL,
       preheader = NULL,
       generation_batch_id = NULL
 WHERE flow_id IN (SELECT id FROM email_flows WHERE store_id = '<store_id>');

-- 2. Limpar conteúdo de blocks
UPDATE email_blocks
   SET content = '{}'::jsonb
 WHERE email_id IN (
   SELECT e.id FROM email_flow_emails e
     JOIN email_flows f ON f.id = e.flow_id
    WHERE f.store_id = '<store_id>'
 );

-- 3. Limpar sinais pendentes da loja
UPDATE email_generation_queue_signals
   SET status = 'done', processed_at = NOW()
 WHERE store_id = '<store_id>' AND status = 'pending';

-- 4. NÃO mexer em store_brand_identity.confirmed_at (preserva GATE 2)

COMMIT;
```

Depois use Receita B em [`03-runbook-operacional.md`](./03-runbook-operacional.md).

---

## Quando escalar

| Situação | Para quem |
|----------|-----------|
| Workflow n8n down/erro de execução | Time de automação n8n |
| Bug de schema/prompt do agent | Dev (tag `cto`) |
| Múltiplas lojas falhando em batch | Dev urgente (tag `cto`) |
| Pipeline ok mas qualidade da copy ruim | Time de copywriter (revisão de prompt/blueprint) |
| Erro de auth no callback | DevOps (rotacionar `N8N_WEBHOOK_SECRET`) |

## Referências

- [`01-overview.md`](./01-overview.md) — Arquitetura e status machine
- [`02-triggers.md`](./02-triggers.md) — Cada trigger detalhado
- [`03-runbook-operacional.md`](./03-runbook-operacional.md) — Receitas de operação
- [`04-payload-reference.md`](./04-payload-reference.md) — Schema completo
- [`../architecture/adr-agent-email-generation.md`](../architecture/adr-agent-email-generation.md) — ADR técnica do epic
