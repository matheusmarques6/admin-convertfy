# 01 — Visão Geral da Arquitetura

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Status** | Em produção |
| **Última atualização** | 2026-06-01 |

---

## Conceitos centrais

### Duas fases

| Fase | Quem executa | Onde roda | O que produz |
|------|--------------|-----------|--------------|
| **Fase 1 — Copy** | Workflow n8n externo | Webhook n8n → callback em `/api/webhooks/n8n/email-copy` | `subject`, `preheader` em `email_flow_emails` + `content` JSONB em cada `email_blocks` row |
| **Fase 2 — Render + QA** | `runPhase2InBackground` (processo Next/Vercel) | `src/lib/agents/phase2-runner.service.ts` | Imagem gerada (image agent) + HTML do email + saída do QA agent (`qa_issues`) |

### Dois gates

| Gate | Trigger | O que destrava |
|------|---------|----------------|
| **GATE 1** — Briefing confirmado | `store_briefings.status` vira `confirmed` (cliente submeteu briefing) | Fase 1 |
| **GATE 2** — Identidade visual confirmada | `store_brand_identity.confirmed_at` vira `NOT NULL` (designer aprovou) | Fase 2 |

A separação dos gates evita renderizar emails com cores/logos placeholder enquanto o designer ainda está trabalhando. Antes da AE-18, a fase 2 disparava automaticamente após `copy_ready` — produzindo emails errados.

## Status machine — `email_flow_emails.status`

```
draft ──────────────────────────────────────────┐
  │ (a)                                         │
  ▼                                             │
in_progress (legado)                            │
  │                                             │
  ▼                                             │
copy_generating                                 │
  │ (b)                                         │
  ▼                                             │
copy_generating_recovery (fallback in-process)  │
  │                                             │
  ▼                                             │
copy_ready ─── GATE 2 ──┐                       │
                        │ (c)                   │
                        ▼                       │
                  rendering                     │
                        │                       │
                        ▼                       │
                  qa_running                    │
                        │                       │
                        ▼                       │
                  ready  /  failed ─────────────┘
                                  (rerender via AE-20)
```

Movimentações:
- **(a)** `dispatchEmailCopyWebhook` (trigger 1, 2)
- **(b)** Callback do n8n em `/api/webhooks/n8n/email-copy` OU watchdog recovery (`runCopyChainInProcess`)
- **(c)** `dispatchRenderForCopyReady` consumido pelo watchdog após designer confirmar identidade (trigger 3)

### Significado de cada status

| Status | O que significa | É terminal? |
|--------|-----------------|-------------|
| `draft` | Email criado no workspace, não enfileirado | Não |
| `pending` | Agendado para gerar (entrou na fila) | Não |
| `copy_generating` | n8n está processando a copy | Não |
| `copy_generating_recovery` | Watchdog detectou travamento; está rodando fallback in-process | Não |
| `copy_ready` | Copy gerada, aguardando GATE 2 | Não |
| `rendering` | Gerando imagem + HTML | Não |
| `qa_running` | QA agent validando | Não |
| `ready` | Pronto para o designer/revisor | **Sim** |
| `failed` | Erro irrecuperável (ver `failure_reason`) | **Sim** |
| `in_progress`, `approved`, `live` | LEGACY (Epic 8/9 Klaviyo). Não usar em código novo | — |

Toda transição passa pelo trigger SQL `fn_log_email_status_change`, que insere uma linha em `email_status_events` (audit log + SSE bus).

## Tabelas envolvidas

### Schema do epic AE

| Tabela | Função | Story |
|--------|--------|-------|
| `email_flow_emails` | Estado de cada email (status, subject, preheader, qa_issues) | AE-1 |
| `email_blocks` | Conteúdo JSONB por bloco do email | (pré-AE) |
| `email_flows` | Flow ao qual o email pertence (Welcome, Abandoned, Browse, etc.) | (pré-AE) |
| `email_generation_queue_signals` | Fila de sinais (`signal_type`: `start` / `render` / `rerender`) | AE-1 + AE-19 |
| `email_status_events` | Audit log append-only de cada transição de status | AE-1 |
| `email_generation_runs` | Telemetria por agent run (tokens, custo, duração) | (pré-AE) |
| `email_blueprints` | Definição por `flow_type:email_number` (objective, messaging, subject_hint) | (pré-AE) |
| `email_reference_templates` | Referências de copy/HTML por flow_type para inspirar o agent | (pré-AE) |

### Dados de contexto da loja (lidos no payload)

| Tabela | O que tem | Lido por |
|--------|-----------|----------|
| `client_stores` | ~50 colunas: brand, ICP, tone, positioning, visual, story, ads review, operations, audience | `dispatchEmailCopyWebhook` |
| `store_briefings` | Briefing estruturado (`marca`, `briefing`, status, version) | Trigger 1 + `dispatchEmailCopyWebhook` |
| `store_brand_identity` | Identidade visual (logos, cores, fontes, `confirmed_at`, `confirmed_by`) | Trigger 3 + `dispatchEmailCopyWebhook` |
| `store_top_products` | Top produtos da loja (sincronizado de Shopify) | `dispatchEmailCopyWebhook` |
| `client_competitors` | Concorrentes mapeados | `dispatchEmailCopyWebhook` |

## Fluxo completo (passo a passo)

1. **Cliente submete o briefing** via UI de onboarding. A action chama `confirmBriefing` em `src/lib/services/onboarding-pipeline.service.ts`, que faz `UPDATE store_briefings SET status='confirmed'`.
2. **Trigger SQL** `trg_store_briefings_confirmed` dispara `fn_on_briefing_confirmed`, que insere em `email_generation_queue_signals` um sinal `signal_type='start'`.
3. **Em paralelo**, o mesmo handler chama `after(dispatchEmailCopyWebhook(storeId, { triggerSource: 'briefing_confirmed' }))` — fire-and-forget pro n8n (não espera resposta).
4. O **service `dispatchEmailCopyWebhook`** monta o payload completo da loja (ver [`04-payload-reference.md`](./04-payload-reference.md)) e faz POST para `N8N_EMAIL_COPY_WEBHOOK_URL`. Atualiza status dos emails de `draft` para `in_progress`.
5. **n8n processa** cada email do batch (workflow externo). Quando termina cada um, faz POST em `/api/webhooks/n8n/email-copy` com `{ store_id, email_id, subject, preheader, blocks[] }`.
6. O **callback** persiste em `email_flow_emails` + `email_blocks` e marca `status='copy_ready'`. **Não dispara fase 2 diretamente** (mudança de AE-19).
7. **Designer abre** `/admin/clientes/lojas/[id]` → aba Identidade Visual. Edita cores/logos/fontes. Clica "Confirmar".
8. O endpoint `POST /api/admin/stores/[id]/brand-identity/confirm` valida sanity checks (cores primárias, font_heading, ≥1 logo) e faz `UPDATE store_brand_identity SET confirmed_at = now(), confirmed_by = user.id`.
9. **Trigger SQL** `trg_brand_identity_confirmed` dispara `fn_on_brand_identity_confirmed`, que insere sinal `signal_type='render'`.
10. O **cron watchdog** (`/api/cron/email-generation-watchdog`, a cada 5 min) chama `consumeQueueSignal` que roteia o sinal `render` para `dispatchRenderForCopyReady`. Para cada email em `copy_ready`, chama `runPhase2InBackground` via `after()`.
11. **Fase 2** roda: image agent → html agent → qa agent. Status caminha por `rendering` → `qa_running` → `ready`/`failed`.
12. Cada transição de status gera entrada em `email_status_events` e dispara `pg_notify('email_status_event', ...)` para SSE no frontend (página de logs em tempo real).

## Onde está o código

| Componente | Arquivo |
|------------|---------|
| Service principal Fase 1 | `src/lib/services/email-copy-webhook.service.ts` |
| Roteador de sinais + Fase 2 | `src/lib/services/email-generation-trigger.service.ts` |
| Runner da Fase 2 | `src/lib/agents/phase2-runner.service.ts` |
| Fallback in-process (recovery) | `src/lib/agents/copy-chain-fallback.service.ts` |
| Watchdog cron | `src/app/api/cron/email-generation-watchdog/route.ts` |
| Callback n8n | `src/app/api/webhooks/n8n/email-copy/route.ts` |
| Endpoint disparo manual | `src/app/api/admin/stores/[id]/dispatch-email-copies/route.ts` |
| Endpoint confirmar identidade | `src/app/api/admin/stores/[id]/brand-identity/confirm/route.ts` |
| Confirmação de briefing | `src/lib/services/onboarding-pipeline.service.ts:1140-1160` |

## Próximos docs

- [`02-triggers.md`](./02-triggers.md) — Cada trigger detalhado
- [`03-runbook-operacional.md`](./03-runbook-operacional.md) — Como operar
