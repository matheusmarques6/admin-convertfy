# Fluxo de Geração de Email — da Aprovação do Briefing até o Fim

Mapa canônico e organizado do pipeline, do momento em que o cliente aprova o
briefing até cada email ficar `ready`. Apenas documentação — reflete o código
atual, não propõe mudanças.

---

## 1. Visão geral

```
Cliente aprova briefing
        │
        ├─(A) Briefing webhook ──► n8n (Pesquisa & Diagnóstico) ─┐
        │                                                        │
        └─(B) Dispatch de copy ◄────── pesquisa-completa ◄───────┘
                  │
                  ▼
        n8n gera a COPY ──► callback ──► status: copy_ready
                  │
                  ▼
        [GATE] Identidade visual confirmada
                  │
                  ▼
        Fase 2 (por email):  Imagem ─► HTML ─► QA
                  │
                  ▼
             ready  (ou failed)
```

Em paralelo a tudo, o **watchdog** (cron, 5 min) é a rede de segurança que
destrava o que ficar preso.

---

## 2. Os gatilhos de geração de copy

Há mais de um ponto que dispara a copy. Todos convergem para a mesma função
(`dispatchEmailCopyWebhook`), com idempotência evitando disparo duplicado.

| # | Origem | Função | Roda Montador/Blueprint antes? |
|---|--------|--------|:---:|
| 1 | Briefing aprovado | `confirmBriefing` → `dispatchEmailCopyWebhook('briefing_confirmed')` | ❌ |
| 2 | Pesquisa concluída (gatilho oficial do onboarding) | `/webhooks/n8n/pesquisa-completa` → `dispatchEmailCopyWebhook('pesquisa_completa')` | ❌ |
| 3 | Botão "Gerar copies" | `enqueueDispatchJob` → cron → `dispatchEmailCopyWebhook('manual_store_button')` | ✅ |
| 4 | Botão "Regenerar" | `/generate-blueprints` (só Architect, **não** dispara copy) | ✅ |

> **Nota de inconsistência conhecida:** o Architect (Montador + Blueprint) só
> roda nos caminhos 3 e 4. Os gatilhos automáticos do onboarding (1 e 2) chamam
> `dispatchEmailCopyWebhook` direto, que usa as references/blueprints **já
> existentes + fallback global** — não gera estrutura nova.

---

## 3. Fluxo sequencial, estágio por estágio

### Estágio 0 — Aprovação do briefing
**Função:** `confirmBriefing` (`onboarding-pipeline.service.ts`)
- Atualiza `onboardings` (status do briefing → confirmado, `briefing_confirmed_*`).
- Grava evento `onboarding.briefing_confirmed`; sincroniza idioma da loja.
- Dispara, fire-and-forget (`after()`):
  - **(A)** `dispatchBriefingWebhook` → n8n (workflow de Pesquisa & Diagnóstico).
  - **(B)** `dispatchEmailCopyWebhook('briefing_confirmed')`.

### Estágio 1 — Pesquisa & Diagnóstico (n8n)
- O n8n executa os agentes de pesquisa e grava os **5 pilares** em
  `client_stores` (`brand_*`, `store_*`, `icp_*`, `tone_*`, `ads_*`).
- No **último passo**, chama `POST /api/webhooks/n8n/pesquisa-completa` — o
  **gatilho oficial** da geração de email.
  - `regeneration: true` → só atualiza a pesquisa, **não** dispara copy.
  - Caso contrário → `dispatchEmailCopyWebhook('pesquisa_completa')`.

### Estágio 2 — Dispatch da copy → n8n
**Função:** `dispatchEmailCopyWebhook`
1. Carrega o contexto da loja (brand, ICP, tom, briefing, pesquisa, top
   products, concorrentes).
2. Auto-cura emails faltantes; reconcilia `email_blocks` a partir do blueprint
   efetivo (cascata **store → global → DEFAULT**).
3. Monta o payload `flows[].emails[]`:
   - `blueprint: { objective, messaging, subject_hint }`
   - `blocks: [{ block_id, position, type, label }]`
4. `POST` para `N8N_EMAIL_COPY_WEBHOOK_URL` com
   `callback.url = /api/webhooks/n8n/email-copy`.
5. Marca os emails `draft → in_progress`. Telemetria em `email_generation_runs`.

### Estágio 3 — Copy retorna do n8n
**Endpoint:** `POST /api/webhooks/n8n/email-copy` (callback, 1 email por POST)
- Recebe `{ subject, preheader, blocks: [{ block_id, content }] }`.
- Grava `email_flow_emails.subject/preheader` + `email_blocks.content`.
- Status `in_progress → copy_ready` (`copy_ready_at`).

### Estágio 4 — GATE: identidade visual
- Em `copy_ready`, o email aguarda a **brand identity** estar pronta.
- Confirmada → um sinal `render` entra em `email_generation_queue_signals` → o
  watchdog consome e dispara `runPhase2InBackground`.
- Status `copy_ready → rendering`.

### Estágio 5 — Fase 2 (por email, em background)
**Serviço:** `phase2-runner.service.ts`

| Passo | Agente | Modelo | Entrada → Saída | Status |
|------|--------|--------|-----------------|--------|
| 1 | **Imagem** | `openai/gpt-5.4-image-2` (OpenRouter, 90s) | blocos `needs_image` + `image_brief` → `image_url`/`image_alt` | `rendering → image_done` |
| 2 | **HTML** | `claude-sonnet-4-6` | 21 vars (`reference_html` + copy + brand + blocks) → `email_flow_emails.html` | `image_done → qa_running` |
| 3 | **QA** | `claude-sonnet-4-6` (60s) | HTML + blocks + briefing + brand → `qa_issues` + `passed` | `qa_running → ready` / `failed` |

### Estágio 6 — Estado final
- **`ready`** → pronto para o designer / implementação na Omnisend.
- **`failed`** → com `failure_reason`; o watchdog/alertas avisam.
- `total_cost_cents` consolidado por email.

---

## 4. Status machine

```
draft ─► in_progress ─► copy_ready ─►[GATE brand]─► rendering ─► image_done ─► qa_running ─► ready
                                                                                          └─► failed
```

Legados (não usar em código novo): `in_progress`/`approved`/`live` da era
Klaviyo. Canônico em `src/types/email-workspace.ts`.

---

## 5. Quem escreve o quê (tabelas)

| Estágio | Tabela | Campos principais |
|--------|--------|-------------------|
| 0 | `onboardings`, `events` | status do briefing, evento confirmado |
| 1 | `client_stores` | 5 pilares (`brand_*`, `store_*`, `icp_*`, `tone_*`, `ads_*`) |
| 2 | `email_flow_emails`, `email_generation_runs` | `status=in_progress`, telemetria |
| 3 | `email_flow_emails`, `email_blocks` | `subject`, `preheader`, `content`, `status=copy_ready` |
| 5 | `email_blocks`, `email_flow_emails` | `image_url`, `html`, `qa_issues`, `status` |

---

## 6. Rede de segurança — watchdog (cron, 5 min)

`/api/cron/email-generation-watchdog`:
1. Consome sinais pendentes em `email_generation_queue_signals`.
2. Recupera copy travada (`copy_generating > 15min` → fallback Claude in-process).
3. Marca fase 2 travada como `failed` (`rendering`/`qa_running > 10min`).
4. Re-dispara `copy_ready`/`image_done` presos.
5. Notifica tag **CTO** e dispara `notifyBatchComplete` / `notifyBatchAllFailed`.

---

## 7. Onde fica o Architect (Montador + Blueprint)

- **Botão manual** → `email_dispatch_jobs` (fila) → cron `email-dispatch-queue`
  roda Montador→Blueprint em lotes e, ao terminar, dispara pro n8n.
- **Botão "Regenerar"** (`/generate-blueprints`) → roda só o Architect, sem
  disparar copy.
- **Onboarding automático (gatilhos 1 e 2)** → hoje **não** roda o Architect;
  usa `store_email_references`/`store_email_blueprints` existentes + global.

Referências: `docs/email-generation/01-overview.md`,
`02-triggers.md`, `04-payload-reference.md`.
