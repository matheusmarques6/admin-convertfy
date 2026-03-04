# Epic 10 - Cache-First + Live Fallback Unificado

**Prioridade:** Alta
**Status:** Planning
**Objetivo:** Implementar estrategia cache-first com live fallback para que dashboards nunca mostrem zero quando o cache esta vazio, mantendo a performance do cron como fonte primaria.

---

## Contexto

O projeto admin-convertfy possui um cron (`/api/cron/sync-reports`) que popula cache tables (`store_revenue_summary`, `klaviyo_campaign_metrics`, `klaviyo_flow_metrics`). O portal e admin dashboard leem dessas tables. Problema: se o cache esta vazio (primeira vez, nova loja, cron falhou), tudo mostra zero. A solucao e cache-first + live fallback: tentar cache primeiro, se vazio buscar live, salvar resultado para proximas requests.

### QA Findings Incorporados

**HIGH:**
- H1: Race condition em live fetch concorrente - mecanismo atomico de cooldown/lock
- H2: Rate limit amplification em serverless - deduplicacao via `store_fetch_status`
- H3: Portal Shopify faz HTTP self-call - deve importar servico diretamente

**MEDIUM:**
- M1: Dual cache (dashboard_cache vs dedicated tables) - documentar qual serve o que
- M2: Custom date ranges sem cooldown - aplicar cooldown com key `store_id + date_range_hash`
- M3: `klaviyoRequest()` retorna null silencioso - sync services devem retornar `{ success, data, error }`
- M4: `DataStatus` nao padronizado - definir type unificado
- M5: Periodos desalinhados - criar constante compartilhada `CACHED_PERIODS` e `LIVE_ONLY_PERIODS`

**LOW:**
- L1: Background refresh com `waitUntil()` se disponivel
- L2: Observability - structured logging de cache hits vs live fallback
- L3: Renomear `shopify_total_revenue` para `store_total_revenue`
- L4: Considerar reduzir BATCH_SIZE do cron para 3-5

---

## Fases e Stories

### Fase 1 - Fundacao (Shared Types + Service Extraction)

| Story | Titulo | Status | QA Findings |
|-------|--------|--------|-------------|
| 10.1 | Shared Period Constants + DataStatus Type | Pending | M4, M5 |
| 10.2 | Extract Klaviyo Sync Service do Cron | Pending | M3, H3-parcial |
| 10.3 | Extract Shopify Sync Service + Eliminar Self-Call | Pending | H3 |

### Fase 2 - Infraestrutura de Lock/Cooldown

| Story | Titulo | Status | QA Findings |
|-------|--------|--------|-------------|
| 10.4 | Atomic Cooldown/Lock + Fetch Status Tables | Pending | H1, H2 |

### Fase 3 - Live Fallback (Admin + Portal)

| Story | Titulo | Status | QA Findings |
|-------|--------|--------|-------------|
| 10.5 | Admin Live Fallback com force_refresh | Pending | M2 |
| 10.6 | Portal Live Fallback com Auto-Fallback + Stale-Refresh | Pending | - |

### Fase 4 - Frontend + Cleanup

| Story | Titulo | Status | QA Findings |
|-------|--------|--------|-------------|
| 10.7 | Frontend Progressive Loading + UX | Pending | L1 |
| 10.8 | Rename shopify_total_revenue + Cache Cleanup + Observability | Pending | L3, M1, L2 |

---

## Dependencias

```
10.1 ──> 10.2 ──> 10.4 ──> 10.5
  │        │                  │
  └──> 10.3 ──> 10.4 ──> 10.6
                              │
                         10.7 (independente, mas pos-10.5/10.6)
                         10.8 (independente, pode ser feita a qualquer momento)
```

- 10.1 e fundacao (types/constants) — bloqueia 10.2 e 10.3
- 10.2 e 10.3 podem ser feitas em paralelo apos 10.1
- 10.4 depende de 10.2/10.3 (services extraidos para serem chamados pelo fallback)
- 10.5 e 10.6 dependem de 10.4 (lock/cooldown disponivel)
- 10.7 depende de 10.5/10.6 (endpoints com DataStatus disponivel)
- 10.8 e independente (migration + cleanup)

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-03-01 | Epic criado com 8 stories incorporando QA findings | @sm (River) |
