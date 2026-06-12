# Fluxo de Geração de Email — Mapa Completo (Onboarding → Email pronto)

Mapa canônico, do cliente preencher o formulário até cada email ficar `ready`.
Reflete o código atual. No fluxo natural, os agentes de IA (Montador/Blueprint)
rodam via fila `email_dispatch_jobs` + cron, ANTES do dispatch da copy. Veja §6.

---

## 0. Visão geral (uma imagem)

```
Form → Briefing(IA) → [aprova] ─► n8n Pesquisa (5 pilares) ─► pesquisa-completa
                                                                      │
                                                 enfileira job (email_dispatch_jobs)
                                                                      │
                              cron email-dispatch-queue (1 min): Montador+Blueprint
                              por email, em lotes; TODOS settled ─► dispatch copy
                                                                      │
                                                            n8n gera COPY ─► copy_ready
                                                                      │
                                  [GATE MANUAL] designer confirma identidade visual
                                                                      │ (sinal render → watchdog)
                                                                      ▼
                                  Fase 2:  Imagem ─► HTML ─► QA ─► ready / failed
```

Rede de segurança: **watchdog** (cron 5 min) destrava o que ficar preso.

---

## 1. Setup — onboarding criado
- `createOnboarding` cria `onboardings` (`briefing_status='not_started'`),
  gera `form_token`, vincula `client_id`/`store_id`. **Não** dispara pesquisa.

## 2. Cliente preenche o formulário
- `POST /api/forms/[token]/submit-data`: grava `form_responses`,
  `briefing_status='form_partially_filled'`, e dispara `generateBriefing` via
  `after()`.

## 3. Agente 1 — Briefing
- `briefing-generation.service.ts`. Cascata de modelo:
  `claude-sonnet-4-6` (Anthropic, 40s) → `openai/gpt-5.3-chat` (OpenRouter, 20s)
  → template determinístico.
- **Input:** `form_responses` + pesquisa já existente em `client_stores` (via
  `pesquisaToFullText`). Num cliente realmente novo a pesquisa ainda não rodou,
  então o briefing sai de `form_responses` + template.
- **Output:** `onboardings.briefing` + `briefing_ai_original`;
  `briefing_status='generated_pending_review'`.

## 4. Cliente aprova o briefing
`confirmBriefing` (`onboarding-pipeline.service.ts:1035`):
- `briefing_status='approved'`, `briefing_confirmed_by_client=true`; avança o
  kanban pra `preview_producao`; grava evento.
- Dispara **1 fire-and-forget** (`after()`):
  `dispatchBriefingWebhook` → n8n (workflow de Pesquisa). `:1153`

> A aprovação **NÃO dispara mais copy** — só a Pesquisa. A copy é disparada
> exclusivamente pelo caminho pesquisa-completa → fila do Architect (§5/§6),
> garantindo que o payload saia com a Pesquisa e a estrutura sob medida.
> (Antes, o dispatch na aprovação saía sem pesquisa e o guard
> `batch_in_progress` pulava o re-dispatch da pesquisa-completa.)

## 5. Agente 2 — Pesquisa & Diagnóstico (n8n)
- O n8n roda os agentes e chama **5 callbacks**, cada um gravando em
  `client_stores`:
  - `/webhooks/n8n/brand` → `brand_thesis/about/pillars/presence`
  - `/webhooks/n8n/store-story` → `store_story/milestones`
  - `/webhooks/n8n/icp` → `icp_persona/demographics/motivations/frictions`
  - `/webhooks/n8n/tone` → `tone_description/do/dont/use_words/avoid_words`
  - `/webhooks/n8n/ads-analyzer` → `ads_score/summary/sub_scores/...`
- **Último passo:** `/webhooks/n8n/pesquisa-completa` →
  `enqueueDispatchJob('pesquisa_completa')` **ENFILEIRA** um job em
  `email_dispatch_jobs` (idempotente: job ativo → `already_queued`; emails com
  reference já gerada entram `done`; Architect não configurado → tudo settled,
  dispatch direto). `regeneration:true` → só atualiza pesquisa, não enfileira.

## 6. Fila do Architect + dispatch da copy → n8n  ← onde a ESTRUTURA é escolhida
**6a. Cron `email-dispatch-queue`** (every minute, maxDuration 300) processa
`email_dispatch_jobs` (`email-dispatch-queue.service.ts`):
1. Claim otimista do job mais antigo (lease por `updated_at`).
2. Roda **Montador+Blueprint** (`generateBlueprintAndReference`) dos emails
   `pending` em lotes paralelos (4 por vez) dentro do orçamento do tick;
   continua nos próximos ticks se não couber.
3. Por email: reference persistida → `done`; 2 tentativas sem persistir →
   `failed` (esse email usa o template/blueprint **global** — não bloqueia).
4. Quando **TODOS settled** → `dispatchEmailCopyWebhook` UMA vez, propagando o
   `trigger_source` do job.

**6b. Dispatch** — `dispatchEmailCopyWebhook`:
1. Carrega contexto da loja (brand, ICP, tom, briefing, pesquisa, top products,
   concorrentes).
2. **Blueprint efetivo por email:** cascata `store_email_blueprints` (gerado
   pela fila em 6a) → **global `email_blueprints`** (fallback por email).
3. Auto-cura emails faltantes; reconcilia `email_blocks` a partir do blueprint.
4. Monta o payload `flows[].emails[]`:
   `blueprint:{objective,messaging,subject_hint}` + `blocks:[{block_id,position,type,label}]`.
5. POST pro `N8N_EMAIL_COPY_WEBHOOK_URL`, callback `/webhooks/n8n/email-copy`.
6. Status `draft → in_progress`. Telemetria em `email_generation_runs`.

## 7. Copy volta do n8n
- `POST /api/webhooks/n8n/email-copy` (1 email por POST): grava
  `email_flow_emails.subject/preheader` + `email_blocks.content`.
- Status `in_progress → copy_ready` (`copy_ready_at`).

## 8. GATE MANUAL — Identidade visual  ← parte crítica, é MANUAL
1. `store_brand_identity` é preenchida **manualmente** pelo designer no
   workspace (logo, cores, fontes). **Não há webhook n8n disso.**
2. Designer clica **"Confirmar identidade visual"** →
   `POST /api/admin/stores/[id]/brand-identity/confirm`:
   - Sanity check (cor primária + `font_heading` + ≥1 logo) — senão `422`.
   - `UPDATE store_brand_identity.confirmed_at = NOW()`.
3. **Trigger SQL** `fn_on_brand_identity_confirmed` (`confirmed_at` NULL→NOT
   NULL) insere sinal `signal_type='render'` em
   `email_generation_queue_signals`.
4. **Watchdog** (cron 5 min) → `consumeQueueSignal` → ramo `render` →
   `dispatchRenderForCopyReady`: pega os emails em `copy_ready` e chama
   `runPhase2InBackground` por email (via `after()`).

> Sem essa confirmação manual, os emails ficam parados em `copy_ready`. A
> latência até a fase 2 começar é de até ~5 min (o tick do watchdog).

## 9. Fase 2 — Imagem → HTML → QA (por email, background)
`phase2-runner.service.ts`. Split em 2 etapas com claim atômico:

| Etapa | Agente | Modelo | Faz | Transição |
|------|--------|--------|-----|-----------|
| 2.1 | **Imagem** | `openai/gpt-5.4-image-2` (OpenRouter, 90s/img) | blocos `needs_image` + `image_brief` → `image_url`/`image_alt` | `copy_ready → rendering → image_done` |
| 2.2a | **HTML** | `claude-sonnet-4-6` | 21 vars (`reference_html` global + copy + brand + blocks) → `email_flow_emails.html`. `precheckBrandReady` (cor+logo+fonte) | `image_done → rendering → qa_running` |
| 2.2b | **QA** | `claude-sonnet-4-6` (60s) | checks determinísticos + LLM (+Vision opcional) → `qa_issues` + `passed` | `qa_running → ready` / `failed` |

- Endpoints internos (auth `x-internal-secret`): `/api/internal/run-phase2-image/[id]`,
  `/api/internal/run-phase2-html-qa/[id]`, `/api/internal/run-phase2/[id]` (monolito).
- Falhas: `context_load_failed`, `image_failed`, `brand_incomplete`
  (`BrandIncompleteError`), `qa_failed`.

## 10. Terminal + notificações
- Sucesso → **`ready`** (`ready_at`); falha → **`failed`** (`failure_reason`).
- `rollupTotalCost` consolida `total_cost_cents` por email.
- `checkBatchTerminal`: quando todos do batch estão `ready`/`failed` →
  `notifyBatchComplete` ou `notifyBatchAllFailed` (tag CTO/admins, dedup-key).

## 11. Rede de segurança — watchdog (cron 5 min)
`/api/cron/email-generation-watchdog`:
1. Consome sinais pendentes (`start`/`render`/`rerender`).
2. Recupera copy travada (`copy_generating > 15min` → fallback Claude in-process).
3. Marca fase 2 travada como `failed` (`rendering`/`qa_running > 10min`).
4. Re-dispara `copy_ready`/`image_done` presos.
5. Notifica tag CTO; dispara batch-complete/all-failed.

---

## Status machine

```
draft → in_progress → copy_ready ─[GATE MANUAL brand]→ rendering → image_done → rendering → qa_running → ready
                                                                                                       └→ failed
```

Sinais de fila (`email_generation_queue_signals.signal_type`):
- `start` → `startOnboarding` (caminho do botão "Iniciar Onboarding").
- `render` → `dispatchRenderForCopyReady` (GATE da identidade visual).
- `rerender` → reset + render (AE-20).

---

## Onde cada gatilho entra

| Gatilho | Endpoint | Roda IA (Architect)? | Dispara n8n? | Status |
|------|----------|:---:|:---:|--------|
| **Fluxo natural** (pesquisa-completa) | `webhooks/n8n/pesquisa-completa` → fila + cron `email-dispatch-queue` | ✅ Montador+Blueprint (via fila) | ✅ (quando todos settled) | `→ in_progress` |
| **Gerar copies (n8n)** (botão) | `dispatch-email-copies` | ❌ | ✅ | `→ in_progress` |
| **Iniciar Onboarding** (botão) | `start-onboarding` | ❌ | ✅ | `→ copy_generating` |
| **Re-sincronizar estrutura** (botão) | `reconcile-blocks` | ❌ | ❌ | sem mudança |
| **Regenerar** (Generated Inspector) | `generate-blueprints` | ✅ Montador+Blueprint | ❌ | sem mudança |

> **Onde o Architect roda:** no **fluxo natural** (via fila
> `email_dispatch_jobs` + cron, antes do dispatch) e no botão "Regenerar"
> (inline, `maxDuration=300`). Os botões manuais de dispatch ("Gerar copies",
> "Iniciar Onboarding") **não** rodam o Architect — usam o que existir em
> `store_email_blueprints`/`store_email_references` e caem no **global** por
> email quando a loja não tem o sob-medida.

Refs: `01-overview.md`, `02-triggers.md`, `04-payload-reference.md`.
