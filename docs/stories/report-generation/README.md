# Epic: Report Generation — Relatorios Personalizados em Background

## Contexto

O admin panel precisa gerar relatorios com datas personalizadas para multiplas lojas. Hoje, custom date ranges fazem ~12s de API calls por loja (3 calls XS-tier na Klaviyo). Com 10+ lojas, isso excede o timeout de 60s do Vercel e os resultados nao sao cacheados.

> **Spec completa**: `docs/specs/report-generation-feature.md`

> **Decisao chave**: Write-through cache + fan-out client-side + job queue server-side.
> Resultados ficam salvos em `store_revenue_summary` (custom ranges) e `report_jobs` (jobs de geracao).

## Stories

| # | Story | Prioridade | Esforco | Fase |
|---|-------|-----------|---------|------|
| RG-1 | Write-through cache para custom ranges | HIGH | MEDIUM | 1 |
| RG-2 | Fan-out client-side progressivo | HIGH | MEDIUM | 2 |
| RG-3 | Progress bar deterministico | MEDIUM | LOW | 2 |
| RG-4 | Job queue no Supabase | HIGH | MEDIUM | 3 |
| RG-5 | Job processor com maxDuration | HIGH | MEDIUM-HIGH | 3 |
| RG-6 | NotificationBell + polling | MEDIUM | MEDIUM | 3 |
| RG-7 | Pagina historico de relatorios | MEDIUM | MEDIUM | 4 |
| RG-8 | Export CSV + cleanup | LOW | LOW | 4 |

## Ordem de Execucao

### Fase 1 — Cache (Foundation)

1. **RG-1** (MEDIUM) — write-through cache para custom ranges. Sem dependencias.

### Fase 2 — Progressive Loading (UX)

2. **RG-2** (MEDIUM) — fan-out client-side, 1 fetch por loja (depende de RG-1)
3. **RG-3** (LOW) — progress bar + banner (depende de RG-2)

### Fase 3 — Background Jobs (Core)

4. **RG-4** (MEDIUM) — tabela report_jobs + API create/status (depende de RG-1)
5. **RG-5** (MEDIUM-HIGH) — processor com maxDuration + error handling (depende de RG-4)
6. **RG-6** (MEDIUM) — NotificationBell na sidebar + polling SWR (depende de RG-4)

### Fase 4 — Historico + Export (Polish)

7. **RG-7** (MEDIUM) — pagina /report-jobs com historico (depende de RG-4 + RG-6)
8. **RG-8** (LOW) — download CSV + cron cleanup (depende de RG-7)

## Diagrama de Dependencias

```
RG-1 (cache)
  |
  +---> RG-2 (fan-out) ---> RG-3 (progress bar)
  |
  +---> RG-4 (job queue)
           |
           +---> RG-5 (processor)
           |
           +---> RG-6 (notifications) --+
           |                            |
           +----------------------------+---> RG-7 (historico) ---> RG-8 (CSV + cleanup)
```

## Arquivos Novos

- `supabase/migrations/YYYYMMDD_report_generation_cache.sql` (RG-1)
- `supabase/migrations/YYYYMMDD_report_jobs.sql` (RG-4)
- `src/app/api/reports/generate/route.ts` (RG-4)
- `src/app/api/reports/[id]/route.ts` (RG-4)
- `src/app/api/reports/process/route.ts` (RG-5)
- `src/components/reports/report-generation-banner.tsx` (RG-3)
- `src/components/layout/notification-bell.tsx` (RG-6)
- `src/components/reports/report-history-list.tsx` (RG-7)
- `src/components/reports/report-history-card.tsx` (RG-7)
- `src/app/(dashboard)/report-jobs/page.tsx` (RG-7)
- `src/app/api/reports/export/route.ts` (RG-8)
- `src/app/api/reports/route.ts` (RG-4 — list endpoint)
- `src/app/api/reports/cleanup/route.ts` (RG-8)
- `src/lib/utils/csv.ts` (RG-8)

## Arquivos Modificados

- `src/lib/integrations/klaviyo/report-summary.ts` (RG-1)
- `src/lib/shared/data-status.ts` (RG-1)
- `src/components/stores/store-performance-kpis.tsx` (RG-2, RG-3)
- `src/components/stores/store-control-panel.tsx` (RG-2)
- `src/components/layout/sidebar.tsx` (RG-6)
- `vercel.json` (RG-8)

## Backlog / Futuro

### Portal Integration (Deferred)
A spec menciona que `hero-section.tsx` (portal do cliente) deveria mostrar badge "(parcial)" durante geracao de relatorios. Esta integracao esta DEFERRED para apos a Fase 4, pois:
- O portal do cliente nao tem date picker customizado (usa periodos fixos)
- A feature de report generation e admin-only no momento
- Se/quando o portal precisar de custom ranges, criar story RG-9
