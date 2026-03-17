---
Prioridade: Medium
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: LOW
---

# Story RG-S8 — timingSafeEqual em Todos HMAC/Secret Comparisons

## Story

**Como** engenheiro de seguranca,
**Quero** que todas as comparacoes de secrets usem `crypto.timingSafeEqual`,
**Para que** timing attacks nao possam vazar informacao sobre os secrets.

## Contexto

### Locais que usam `!==` para comparar secrets

1. **Shopify OAuth HMAC** — `integrations/shopify/callback/route.ts:70`
2. **Cron endpoints** — todos os 5 cron routes comparam `Bearer ${cronSecret}` com `!==`

### Locais que JA usam timingSafeEqual (correto)

- `tracking/webhooks/shopify/route.ts` — correto
- `integrations/whatsapp/webhook/route.ts` — correto

## Acceptance Criteria

### AC1: Fix Shopify OAuth HMAC
- [ ] Trocar `calculatedHmac !== hmac` por `crypto.timingSafeEqual(Buffer.from(calculatedHmac), Buffer.from(hmac))`

### AC2: Fix cron auth (se nao feito em RG-S3)
- [ ] Se `requireCronAuth` helper foi criado em RG-S3, garantir que usa `timingSafeEqual`
- [ ] Se nao, criar helper agora

### AC3: Audit completo
- [ ] Grep por `!==.*secret`, `!==.*hmac`, `!==.*token` em todo o codebase
- [ ] Garantir que TODAS as comparacoes de secrets usam timing-safe

## Arquivos Afetados

- `src/app/api/integrations/shopify/callback/route.ts`
- `src/lib/api/` — helper requireCronAuth (se criado em RG-S3)
