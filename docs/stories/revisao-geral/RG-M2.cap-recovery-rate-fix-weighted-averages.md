---
Prioridade: High
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa, @analyst"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: LOW
---

# Story RG-M2 — Cap Recovery Rate em 100% + Fix Weighted Averages

## Story

**Como** agencia mostrando dados a clientes,
**Quero** que recovery rate nunca ultrapasse 100% e que medias de rates sejam ponderadas por volume,
**Para que** os dados apresentados sejam criveis e corretos.

## Contexto

### Problema 1: Recovery rate >100%

`recoveryRate = attributedRevenue / storeRevenue * 100` nao tem cap. Klaviyo attribution window pode atribuir mais revenue a email/flow do que o total da loja (overlap de canais, send-date vs event-date). Resultado: "147% recovery rate" — destroi credibilidade.

Engagement rate ja tem `Math.min(..., 100)`. Recovery rate nao.

### Problema 2: Multi-store averaging incorreto

Single-store usa weighted average (correto):
```typescript
// Pondera por delivered
bounceRate = sum(rate * delivered) / totalDelivered
```

Multi-store usa media simples (incorreto):
```typescript
// Nao pondera — loja com 100 emails pesa igual a loja com 100k
bounceRate = sum(rates) / count
```

### Impacto

Loja de teste com 50% bounce (100 emails) + loja principal com 1% bounce (100k emails):
- Media simples: **25.5%** (incorreto)
- Media ponderada: **~1.01%** (correto)

## Acceptance Criteria

### AC1: Cap recovery rate
- [ ] Adicionar `Math.min(recoveryRate, 100)` em:
  - `src/lib/services/klaviyo-performance.service.ts:644`
  - `src/app/api/portal/dashboard/route.ts:283,843`
  - `src/app/api/stores/control/route.ts:334`
- [ ] Logar warning quando recovery rate > 100% (para investigacao)

### AC2: Fix multi-store weighted averages
- [ ] Em `src/app/api/portal/dashboard/route.ts:863-868`:
  - Usar media ponderada por `delivered` para `bounceRate` e `unsubscribeRate`
  - Seguir o padrao ja usado na single-store path (lines 257-268)

### AC3: Fix unsubscribe rate accumulator bug
- [ ] Em `src/app/api/integrations/klaviyo/report/route.ts:584-591`:
  - Rastrear `unsubscribeRateCount` separadamente de `rateCount`
  - Nao incrementar denominador de unsubscribe quando so bounce_rate esta definido

## Arquivos Afetados

- `src/lib/services/klaviyo-performance.service.ts`
- `src/app/api/portal/dashboard/route.ts`
- `src/app/api/stores/control/route.ts`
- `src/app/api/integrations/klaviyo/report/route.ts`
