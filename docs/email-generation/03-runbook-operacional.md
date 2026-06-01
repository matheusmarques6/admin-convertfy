# 03 — Runbook Operacional

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Audiência** | Operador / CS / Designer |
| **Última atualização** | 2026-06-01 |

---

Este é o doc para quem precisa **executar**, não estudar a arquitetura. Cada receita é um caso de uso real.

## Antes de qualquer disparo — Checklist de pré-requisitos

Confirme tudo aqui antes de tentar gerar copies. Cada item faltando = payload pobre ou geração falha.

| # | Pré-requisito | Onde verificar | Como confirmar |
|---|---------------|----------------|----------------|
| 1 | Loja existe e está ativa | `/admin/clientes/lojas/[id]` | Página abre sem 404 |
| 2 | Contexto preenchido (≥50% dos campos) | Aba "Contexto" da loja | Brand, ICP, Tone, Operations, Audience têm dados |
| 3 | Briefing existe (mesmo que `status='current'`) | Tabela `store_briefings` | `SELECT id, status FROM store_briefings WHERE store_id=...` retorna linha |
| 4 | Flows configurados | Aba "Emails" da loja | Pelo menos 1 flow listado (Welcome, Abandoned, etc.) |
| 5 | Emails têm `email_blocks` | Cada email no flow | Cada email tem ≥1 bloco (heading, body, cta, image) |
| 6 | Reference templates ativos | Tabela `email_reference_templates` | Pelo menos 1 ref ativa por `flow_type` |
| 7 | Env `N8N_EMAIL_COPY_WEBHOOK_URL` setada | Vercel dashboard | Variável existe em Production + Preview |
| 8 | Env `N8N_WEBHOOK_SECRET` setada | Vercel dashboard | Idem; mesmo valor que o n8n envia no callback |

Query única para validar pré-requisitos 2-6:

```sql
WITH store AS (SELECT id FROM client_stores WHERE id = '<store_id>')
SELECT
  (SELECT COUNT(*) FROM store_briefings WHERE store_id = (SELECT id FROM store)) AS briefings,
  (SELECT COUNT(*) FROM email_flows WHERE store_id = (SELECT id FROM store)) AS flows,
  (SELECT COUNT(*) FROM email_flow_emails e
     JOIN email_flows f ON f.id = e.flow_id
    WHERE f.store_id = (SELECT id FROM store)) AS emails,
  (SELECT COUNT(*) FROM email_blocks b
     JOIN email_flow_emails e ON e.id = b.email_id
     JOIN email_flows f ON f.id = e.flow_id
    WHERE f.store_id = (SELECT id FROM store)) AS blocks,
  (SELECT COUNT(*) FROM email_reference_templates WHERE is_active = true) AS active_refs;
```

Resultado esperado: `briefings >= 1, flows >= 1, emails >= flows*3, blocks >= emails*3, active_refs >= 1`.

---

## Receita A — Loja nova, do zero ao email pronto

**Quando usar**: Primeiro disparo após onboarding completo.

**Pré-condição**: A loja já fez o onboarding até a aba de briefing, mas ainda não confirmou.

### Passos

1. **Cliente preenche e confirma o briefing** na UI de onboarding. Isso executa `confirmBriefing` que dispara o trigger 1 (`briefing_confirmed`).

2. **Aguarde o n8n processar** (~30s a 5min dependendo do número de emails). Acompanhe:

   ```sql
   SELECT e.id, e.number, e.status, e.updated_at, f.flow_type
     FROM email_flow_emails e
     JOIN email_flows f ON f.id = e.flow_id
    WHERE f.store_id = '<store_id>'
    ORDER BY f.position, e.number;
   ```

   Os status devem progredir: `draft → in_progress → copy_generating → copy_ready`.

3. **Designer abre a aba "Identidade Visual"** em `/admin/clientes/lojas/<store_id>`. Edita cores, logos, fontes, voice tags.

4. **Designer clica "Confirmar"**. Isso chama `POST /api/admin/stores/<store_id>/brand-identity/confirm`. Se houver campos faltando, a UI mostra "Preencha: …".

5. **Sistema dispara automaticamente a Fase 2** (via trigger 3 → cron watchdog, latência máxima ~5min). Acompanhe:

   ```sql
   SELECT id, status, updated_at, failure_reason
     FROM email_flow_emails
    WHERE flow_id IN (SELECT id FROM email_flows WHERE store_id = '<store_id>')
    ORDER BY status DESC, updated_at DESC;
   ```

   Status caminham `copy_ready → rendering → qa_running → ready` (ou `failed`).

6. **Emails prontos** aparecem na aba de Emails com status `ready`. Designer revisa, ajusta o que precisar, e marca como aprovado fora do escopo deste pipeline.

### Sinais de sucesso

- Todos os emails atingiram `status='ready'` em até 30 min do trigger 1.
- Nenhum email com `failure_reason IS NOT NULL`.
- Sem entradas em `email_status_events` com `to_status='failed'`.

### Se algo der errado

Vá para [`05-troubleshooting.md`](./05-troubleshooting.md).

---

## Receita B — Re-gerar copies de uma loja já em produção

**Quando usar**:
- Contexto da loja foi atualizado e quero refletir nas copies.
- Reference template novo foi adicionado.
- Blueprint mudou (mudança de `objective`/`messaging` em algum email).
- Quero re-rodar só os drafts (preservar copies já prontas).

### Opção B1 — Via UI (recomendada)

1. Abrir `/admin/clientes/lojas/<store_id>` → aba **Emails** (ou workspace de produção).
2. Clicar no botão **"Gerar copies (n8n)"**.
3. (Opcional) Selecionar filtros: "Apenas drafts" / "Apenas flow X".
4. Confirmar. UI mostra `{ flow_count, email_count }`.

### Opção B2 — Via curl/API

```bash
# Disparar todos os flows da loja
curl -X POST \
  https://admin.convertfy.me/api/admin/stores/<store_id>/dispatch-email-copies \
  -H 'Cookie: <sua_cookie>' \
  -H 'Content-Type: application/json' \
  -d '{}'

# Disparar só drafts (preserva copy_ready+)
curl -X POST ... -d '{"only_drafts": true}'

# Disparar flows específicos
curl -X POST ... -d '{"flow_ids": ["<flow_uuid_1>", "<flow_uuid_2>"]}'

# Combinar
curl -X POST ... -d '{"flow_ids": ["..."], "only_drafts": true}'
```

### Resposta esperada

```json
{
  "ok": true,
  "flow_count": 4,
  "email_count": 12
}
```

Se `ok: false`, ver `reason` (ex: `"no_url_configured"`, `"store_not_found"`, `"no_flows"`, `"no_emails"`).

⚠️ **Atenção**: o disparo manual coloca emails em `in_progress` e depois `copy_generating`. Se a fase 2 já tinha sido feita antes (`status='ready'`), você vai sobrescrever. Use `only_drafts: true` se quiser preservar.

---

## Receita C — Forçar re-render da Fase 2 sem mudar copy

**Quando usar**:
- Cores/logos da brand identity foram trocados após emails já estarem `ready`.
- Quero re-rodar o QA agent sem regerar copy.

### Opção C1 — Reconfirmar identidade (recomendada)

1. Designer abre a aba **Identidade Visual**.
2. Faz qualquer edição (ou só re-salva). Isso cria uma nova versão de `store_brand_identity` com `confirmed_at = NULL`.
3. Designer clica **Confirmar** novamente.
4. Trigger 3 dispara `signal_type='render'` → fase 2 reroda para todos os emails em `copy_ready` (mas se já estão em `ready`, **não roda** — só re-renderiza emails que estão exatamente em `copy_ready`).

⚠️ Limitação: se os emails já passaram de `copy_ready`, o trigger 3 não os pega. Para isso use a opção C2.

### Opção C2 — Reset manual via SQL (AE-20 `rerender`)

```sql
-- 1. Marca emails de volta para copy_ready (resetando rendering/ready/failed)
UPDATE email_flow_emails
   SET status = 'copy_ready'
 WHERE flow_id IN (SELECT id FROM email_flows WHERE store_id = '<store_id>')
   AND status IN ('rendering', 'qa_running', 'ready', 'failed');

-- 2. Enfileira sinal rerender
INSERT INTO email_generation_queue_signals (store_id, triggered_by, signal_type, payload)
VALUES ('<store_id>', 'manual', 'rerender', jsonb_build_object('reason', 'manual_rerender'));
```

O cron watchdog (≤5min) consome e re-dispara a Fase 2.

---

## Receita D — Disparar 1 flow específico (debug)

**Quando usar**: testar mudança de prompt/blueprint num flow só, sem mexer nos outros.

```bash
# 1. Pegue os flow_ids
curl https://admin.convertfy.me/api/admin/stores/<store_id>/flows \
  -H 'Cookie: <auth>' | jq '.data[] | {id, flow_type, name}'

# 2. Dispare só esse flow
curl -X POST \
  https://admin.convertfy.me/api/admin/stores/<store_id>/dispatch-email-copies \
  -H 'Cookie: <auth>' \
  -H 'Content-Type: application/json' \
  -d '{"flow_ids": ["<flow_uuid>"], "only_drafts": true}'
```

---

## Receita E — Pausar/cancelar geração em andamento

**Limitação atual**: não há endpoint de cancelamento. Para parar uma geração em curso:

```sql
-- Marca emails em copy_generating como failed (n8n callback é idempotente, vai virar no-op)
UPDATE email_flow_emails
   SET status = 'failed', failure_reason = 'cancelled_manually'
 WHERE flow_id IN (SELECT id FROM email_flows WHERE store_id = '<store_id>')
   AND status IN ('copy_generating', 'copy_generating_recovery');
```

Depois, para retomar, use Receita B.

⚠️ Se o n8n callback chegar **depois** do cancelamento, ele cai na lista `IDEMPOTENT_STATUSES` (que inclui `failed`) e vira no-op. Sem race condition.

---

## Verificar que uma loja específica está pronta para dispatch

Use esta query como sanity check antes de qualquer Receita:

```sql
SELECT
  cs.store_name,
  cs.platform,
  cs.language,

  -- Briefing
  (SELECT status FROM store_briefings
    WHERE store_id = cs.id ORDER BY version DESC LIMIT 1) AS briefing_status,

  -- Brand identity
  (SELECT confirmed_at IS NOT NULL FROM store_brand_identity
    WHERE store_id = cs.id ORDER BY version DESC LIMIT 1) AS brand_confirmed,

  -- Flows + emails
  (SELECT COUNT(*) FROM email_flows WHERE store_id = cs.id) AS flow_count,
  (SELECT COUNT(*) FROM email_flow_emails e
     JOIN email_flows f ON f.id = e.flow_id
    WHERE f.store_id = cs.id) AS email_count,

  -- Top products + competitors
  (SELECT COUNT(*) FROM store_top_products WHERE store_id = cs.id) AS top_products,
  (SELECT COUNT(*) FROM client_competitors WHERE store_id = cs.id) AS competitors

FROM client_stores cs
WHERE cs.id = '<store_id>';
```

Resultado esperado para dispatch funcional:
- `briefing_status` ∈ `{current, confirmed}` (não `archived`)
- `flow_count >= 1`
- `email_count >= flow_count * 3` (mínimo razoável)
- `top_products >= 1` (opcional mas melhora qualidade da copy)

Para Fase 2 (Receita A passo 5):
- `brand_confirmed = true`

---

## Quem é responsável por cada passo

| Passo | Responsável | Como notificar |
|-------|-------------|----------------|
| Preencher Contexto da loja | Onboarding/CS | UI de aba Contexto |
| Confirmar briefing | Cliente (ou CS pelo cliente) | UI de onboarding |
| Dispatch manual de copies | CS / Operador | Botão na UI ou curl |
| Editar identidade visual | Designer | Aba "Identidade Visual" |
| Confirmar identidade visual | Designer | Botão "Confirmar" |
| Revisar emails `ready` | Designer / Revisor | Workspace de emails |
| Investigar `failed` | Dev (tag `cto` recebe alerta) | Profile com `tags @> ['cto']` |

---

## Próximos docs

- [`04-payload-reference.md`](./04-payload-reference.md) — O que o n8n recebe
- [`05-troubleshooting.md`](./05-troubleshooting.md) — Quando algo não funciona
