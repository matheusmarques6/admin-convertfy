# Epic 54 — Portal Cache System Fixes

## Contexto

Auditoria completa do sistema de cache do portal revelou problemas criticos e estruturais
nas 6 tabelas de cache (`store_revenue_summary`, `klaviyo_flow_metrics`, `klaviyo_campaign_metrics`,
`klaviyo_audiences`, `campaigns`, `dashboard_cache`).

Problemas identificados por 4 agentes (Dev, QA, Arquiteto, Data Engineer) em 2026-03-17.

## Fases

### Phase 1 — Critical Data Integrity (MUST FIX)
| Story | Titulo | Prioridade | Esforco |
|-------|--------|------------|---------|
| 54.1 | Add missing `period_label` column migration | CRITICAL | LOW |
| 54.2 | Fix `org_id: null` violating NOT NULL in sync-persistence | CRITICAL | LOW |

### Phase 2 — High Reliability & Performance
| Story | Titulo | Prioridade | Esforco |
|-------|--------|------------|---------|
| 54.3 | Atomic write for flow/campaign metrics (eliminate race condition) | HIGH | MEDIUM |
| 54.4 | Add missing index on `period_label` for metrics tables | HIGH | LOW |
| 54.5 | Async Shopify fetch (stop blocking portal response) | HIGH | MEDIUM |
| 54.6 | Decompose portal dashboard god route (1100+ lines) | HIGH | HIGH |

### Phase 3 — Medium Improvements
| Story | Titulo | Prioridade | Esforco |
|-------|--------|------------|---------|
| 54.7 | Fix useless touch pattern (`expires_at` vs `fetched_at`) | MEDIUM | LOW |
| 54.8 | Standardize RLS policies across cache tables | MEDIUM | MEDIUM |
| 54.9 | Add TTL/cleanup for flow/campaign metrics tables | MEDIUM | LOW |
| 54.10 | Fix frontend preserving stale period data | MEDIUM | LOW |

### Phase 4 — Low Priority Cleanup
| Story | Titulo | Prioridade | Esforco |
|-------|--------|------------|---------|
| 54.11 | Add `org_id` to Shopify cache writes | LOW | LOW |
| 54.12 | Drop legacy orphan tables | LOW | LOW |
| 54.13 | Fix rate aggregation (weighted avg instead of simple) | LOW | LOW |

## Ordem de Execucao

```
54.1 (migration period_label) ──┐
                                ├──→ 54.3 (atomic write) ──→ 54.9 (TTL cleanup)
54.2 (org_id null fix) ────────┘
                                ├──→ 54.4 (index) ──→ 54.8 (RLS)
                                └──→ 54.5 (async shopify) ──→ 54.6 (decompose route)

54.7 (touch fix) ── independente
54.10 (frontend fix) ── independente
```

- 54.1 + 54.2: sem dependencias, podem ser feitas em paralelo
- 54.3: depende de 54.1 (precisa da coluna oficializada)
- 54.4: depende de 54.1 (indice requer coluna na migration)
- 54.6: depende de 54.5 (decomposicao inclui o novo pattern async)
- 54.7, 54.10: independentes

## Tabelas Afetadas

| Tabela | Stories |
|--------|---------|
| `store_revenue_summary` | 54.2, 54.7, 54.8 |
| `klaviyo_flow_metrics` | 54.1, 54.3, 54.4, 54.8, 54.9 |
| `klaviyo_campaign_metrics` | 54.1, 54.3, 54.4, 54.8, 54.9 |
| `dashboard_cache` | 54.8, 54.11 |
| Portal dashboard route | 54.5, 54.6, 54.7, 54.10 |

## Arquivos-Chave

| Arquivo | Papel |
|---------|-------|
| `src/app/api/cron/sync-reports/route.ts` | Cron orquestrador |
| `src/lib/services/sync-persistence.service.ts` | Upsert em cache tables |
| `src/app/api/portal/dashboard/route.ts` | God route (1100+ linhas) |
| `src/app/api/portal/dashboard/refresh/route.ts` | Refresh manual |
| `src/app/client/dashboard/page.tsx` | UI consumidora |
| `src/lib/shared/data-status.ts` | Constantes e tipos |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-17 | @sm | Epic criado a partir de auditoria completa do cache (4 agentes) |
