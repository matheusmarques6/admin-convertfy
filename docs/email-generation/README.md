# Pipeline de Geração de Copies — Admin Convertfy

| Campo | Valor |
|-------|-------|
| **Epic** | AE — Agent Email Generation |
| **Status** | Em produção (commit `830a2a9` expandiu payload) |
| **Última atualização** | 2026-06-01 |
| **Donos** | @dev, @data-engineer, @qa |

---

## O que é

Pipeline em **2 fases com 2 gates** que gera copies de email (texto) + renderiza HTML/imagens automaticamente para cada loja, via n8n. A geração é **disparada por 3 triggers distintos** (briefing confirmado, botão manual, designer confirmando identidade visual) e é **fire-and-forget** — o cliente da API não espera; o resultado chega via callback do n8n e cron watchdog.

Em uma frase: **briefing confirmado → copy gerada → designer confirma identidade → render + QA → email pronto**.

## Fluxo em ASCII

```
┌────────────────┐
│ Briefing pelo  │
│ cliente        │
└────────┬───────┘
         │ status → confirmed   (GATE 1)
         ▼
┌────────────────────────────────────────────┐
│ FASE 1 — Copy generation (n8n)             │
│ dispatchEmailCopyWebhook → N8N_EMAIL_COPY  │
│ email_flow_emails.status: copy_generating  │
└────────┬───────────────────────────────────┘
         │ n8n callback → /api/webhooks/n8n/email-copy
         ▼
   ┌──────────────┐
   │ copy_ready   │ ◀── trava aqui até GATE 2
   └──────┬───────┘
          │ designer confirma store_brand_identity   (GATE 2)
          │ → trigger SQL enfileira signal_type='render'
          │ → watchdog cron consome → runPhase2InBackground
          ▼
┌────────────────────────────────────────────┐
│ FASE 2 — Render + QA (in-process)          │
│ rendering → qa_running → ready | failed    │
└────────────────────────────────────────────┘
```

## Documentos desta pasta

| # | Arquivo | Para quem | O que cobre |
|---|---------|-----------|-------------|
| 1 | [`01-overview.md`](./01-overview.md) | Devs novos, PMs | Arquitetura, status machine, tabelas envolvidas |
| 2 | [`02-triggers.md`](./02-triggers.md) | Devs, suporte | Os 3 triggers com código, condições e observabilidade |
| 3 | [`03-runbook-operacional.md`](./03-runbook-operacional.md) | **Operador** | Receitas passo-a-passo: "preciso mandar copies pra loja X" |
| 4 | [`04-payload-reference.md`](./04-payload-reference.md) | Time n8n | Schema completo do payload + contrato do callback |
| 5 | [`05-troubleshooting.md`](./05-troubleshooting.md) | Suporte, on-call | Status preso, callback não chega, queries de diagnóstico |

## Quick reference

| Quero… | Vá para |
|--------|---------|
| Disparar copies pra uma loja agora | [`03-runbook-operacional.md` → Receita B](./03-runbook-operacional.md) |
| Entender por que o status está preso | [`05-troubleshooting.md`](./05-troubleshooting.md) |
| Saber o que vai no payload do n8n | [`04-payload-reference.md`](./04-payload-reference.md) |
| Implementar/debugar um trigger | [`02-triggers.md`](./02-triggers.md) |
| Schema técnico completo do epic | [`../architecture/adr-agent-email-generation.md`](../architecture/adr-agent-email-generation.md) |
| Flow interno do n8n | [`../n8n/email-copy-flow.md`](../n8n/email-copy-flow.md) |

## Variáveis de ambiente (críticas)

| Env | Onde | Para que |
|-----|------|----------|
| `N8N_EMAIL_COPY_WEBHOOK_URL` | Vercel | URL do webhook n8n que recebe o payload `email_copy.requested` |
| `N8N_WEBHOOK_SECRET` | Vercel | Header `x-webhook-secret` enviado + validado no callback `/api/webhooks/n8n/email-copy` |
| `WATCHDOG_COPY_TIMEOUT_MIN` | Vercel (opc, default 15) | Tempo máximo em `copy_generating` antes do watchdog reciclar |
| `WATCHDOG_PHASE2_TIMEOUT_MIN` | Vercel (opc, default 10) | Tempo máximo em `rendering`/`qa_running` antes de marcar `failed` |

## Versionamento

Este pipeline evoluiu via stories `AE-1` até `AE-22`. As mais relevantes para entender o estado atual:

- **AE-1** (`20260530_agent_email_generation.sql`) — Schema base, queue signals, status events
- **AE-2** — `startOnboarding` + `consumeQueueSignal`
- **AE-3** — Callback split (n8n só faz copy; phase 2 separada)
- **AE-4** — Watchdog cron
- **AE-18** (`20260626b_brand_identity_confirmation.sql`) — GATE 2 (designer)
- **AE-19** (`20260626c_email_render_signal_type.sql`) — Coluna `signal_type`
- **AE-23** (commit `830a2a9`) — Payload expandido com toda aba Contexto

## Change log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-01 | Claude | Documentação inicial em `/docs/email-generation/` |
