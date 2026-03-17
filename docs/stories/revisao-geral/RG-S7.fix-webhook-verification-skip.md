---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
---

# Story RG-S7 — Nao Skipar Webhook Verification Quando Secret Ausente

## Story

**Como** engenheiro de seguranca,
**Quero** que webhooks rejeitem payloads quando o secret de verificacao nao esta configurado,
**Para que** misconfiguracao nao resulte em aceitacao de payloads forjados.

## Contexto

### Problema

3 endpoints de webhook pulam verificacao de assinatura quando o secret nao esta configurado:

1. **Shopify OAuth callback** (`integrations/shopify/callback/route.ts:54`):
   `if (process.env.SHOPIFY_API_SECRET && hmac)` — pula se env var ausente

2. **Tracking webhook** (`tracking/webhooks/shopify/route.ts:47-54`):
   `if (trackingStore.webhook_secret && hmac)` — pula se secret nao esta no banco

3. **WhatsApp webhook** (`integrations/whatsapp/webhook/route.ts:27-29`):
   `if (!appSecret) { return true }` — pula em "dev mode"

### Impacto

Em misconfiguracao (env var esquecida, secret nao populado), atacante pode forjar callbacks OAuth, injetar tracking data falso, ou enviar mensagens WhatsApp forjadas.

## Acceptance Criteria

### AC1: Shopify OAuth callback
- [ ] Se `SHOPIFY_API_SECRET` nao esta configurado, rejeitar request com 500 + log error
- [ ] Se `hmac` nao esta presente no query, rejeitar com 401

### AC2: Tracking webhook
- [ ] Se `trackingStore.webhook_secret` e null, logar warning e rejeitar com 401
- [ ] Se `hmac` nao esta no header, rejeitar com 401

### AC3: WhatsApp webhook
- [ ] Se `WHATSAPP_APP_SECRET` nao esta configurado, retornar `false` (nao `true`)
- [ ] Logar error level quando secret esta ausente

### AC4: Usar timingSafeEqual em TODOS
- [ ] Shopify OAuth callback: trocar `!==` por `crypto.timingSafeEqual`
- [ ] Verificar que tracking webhook ja usa timingSafeEqual (confirmar)

## Arquivos Afetados

- `src/app/api/integrations/shopify/callback/route.ts`
- `src/app/api/tracking/webhooks/shopify/route.ts`
- `src/app/api/integrations/whatsapp/webhook/route.ts`
