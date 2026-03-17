---
Prioridade: High
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: LOW
---

# Story RG-M3 — Fix Timezone Hardcoded no Portal Dashboard

## Story

**Como** agencia com lojas em diferentes fusos horarios,
**Quero** que o portal dashboard use o timezone correto da conta Klaviyo,
**Para que** o periodo "30d" alinhe com os dados do cron.

## Contexto

### Problema

Portal dashboard (line 483) hardcoda `"America/Sao_Paulo"` para calculo de date range. O cron sync e performance service buscam o timezone da conta Klaviyo corretamente.

Se uma agencia gerencia loja com Klaviyo em `America/New_York`, o dashboard pede periodo diferente do que o cron cacheia, causando dados stale ou vazios.

Mesmo problema no Shopify report (`calculateDateRange` usa `new Date()` sem timezone — UTC no Vercel pode incluir/excluir 1 dia vs Klaviyo).

## Acceptance Criteria

### AC1: Portal dashboard
- [ ] Buscar timezone da conta Klaviyo via `getCachedAccountInfo` ou do `store_revenue_summary`
- [ ] Usar timezone real em vez de `"America/Sao_Paulo"` hardcoded
- [ ] Fallback para `America/Sao_Paulo` se timezone nao disponivel

### AC2: Shopify date range
- [ ] `src/lib/integrations/shopify/report.ts` `calculateDateRange`:
  - Usar `parseDateRangeInTimezone` ou logica equivalente
  - Nao depender de `new Date()` sem timezone

## Arquivos Afetados

- `src/app/api/portal/dashboard/route.ts:483`
- `src/lib/integrations/shopify/report.ts:959-1005`
