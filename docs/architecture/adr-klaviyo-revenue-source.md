# ADR: Klaviyo Revenue Data Source

| Field | Value |
|-------|-------|
| **Date** | March 2026 |
| **Status** | Accepted |
| **Epic** | API Klaviyo — Rate Limit & Compliance (Epic AK) |
| **Decision makers** | @dev, @architect, @analyst, @data-engineer, @qa |

## Context

Klaviyo provides two different APIs to obtain revenue data, each with fundamentally different attribution semantics:

### Reporting API (`*-values-reports`)
- Attributes revenue to the date the **message was sent**
- Uses Klaviyo's configurable attribution window (default: 5 days email, 1 day SMS)
- Numbers match the Klaviyo dashboard UI exactly
- Supports per-flow and per-campaign breakdown
- Rate limit tier: XS (very restrictive — ~1 req/s burst)

### Metric Aggregates (`/metric-aggregates/`)
- Attributes revenue to the date the **event occurred** (Placed Order timestamp)
- No attribution window — pure event-time aggregation
- Numbers do NOT match the Klaviyo dashboard UI
- Supports total aggregation and grouping by `$attributed_flow`/`$attributed_campaign`
- Rate limit tier: more permissive, no daily report cap

### The Problem

For the same time period, the two APIs return different revenue numbers. This is inherent to their attribution models, not a bug. Example:

```
Email sent: January 1
Customer places order: January 3

Reporting API:  revenue counted on January 1 (send date)
Metric Aggregates: revenue counted on January 3 (event date)
```

When querying "January 1 to January 1", the Reporting API includes this revenue but Metric Aggregates does not. The divergence is amplified for short periods and diminishes for longer ones.

### Observed Divergence

| Period length | Typical divergence |
|---------------|-------------------|
| 1-3 days | Up to ~20% |
| 7 days | <5% |
| 30 days | <2% |
| 90+ days | <1% |

> *Valores estimados com base na mecanica de janela de atribuicao. Dados reais de producao devem ser adicionados quando disponiveis.*

## Decision

We use **both APIs**, each for its specific purpose:

1. **Reporting API** for flow/campaign breakdown metrics
   - `POST /flow-values-reports/` for per-flow data
   - `POST /campaign-values-reports/` for per-campaign data
   - Stored in: `klaviyo_flow_metrics`, `klaviyo_campaign_metrics`

2. **Metric Aggregates** for total store revenue and order count
   - `POST /metric-aggregates/` with `Placed Order` metric, no `by` grouping
   - Stored in: `store_revenue_summary`

We **rejected** replacing the Reporting API with Metric Aggregates for flow/campaign data because:
- Clients compare our admin panel with the Klaviyo dashboard
- Up to ~20% divergence in short periods is unacceptable for client-facing data
- The Reporting API is the only source that matches Klaviyo's own UI

We **rejected** using the Reporting API for total store revenue because:
- XS tier rate limits make it expensive for total-only queries
- Daily report cap limits throughput during cron syncs
- Metric Aggregates is faster and cheaper for aggregate totals

## Data Flow

```
Klaviyo Account
    |
    +-- Reporting API (XS tier)
    |       |
    |       +-- flow-values-reports -----> klaviyo_flow_metrics (DB)
    |       |                                  revenue per flow
    |       |
    |       +-- campaign-values-reports -> klaviyo_campaign_metrics (DB)
    |                                          revenue per campaign
    |
    +-- Metric Aggregates (higher tier)
            |
            +-- Placed Order metric ----> store_revenue_summary (DB)
                 (no grouping)                total store revenue
                                              total store orders

Admin UI reads from DB:
  - Flow/campaign cards: klaviyo_flow_metrics + klaviyo_campaign_metrics
  - Revenue overview:    store_revenue_summary
  - Attribution %:       sum(flow + campaign revenue) / store_revenue * 100
```

## Consequences

### Positive
- Client-facing flow/campaign numbers match Klaviyo dashboard exactly
- Total store revenue uses cheaper API tier, enabling more frequent syncs
- Clear separation of concerns between breakdown and total data

### Negative
- `sum(flow_revenue + campaign_revenue)` will not equal `storeRevenue` for the same period
- Attribution percentage may exceed 100% for short periods (send-date revenue counted in a different bucket than event-date total)
- Two different caching/sync strategies needed (one per API)

### Neutral
- Divergence is well-understood and documented
- For the typical 7d/30d/90d dashboard periods, divergence is negligible (<5%)

## FAQ

### "Why is my revenue in the admin different from the Klaviyo dashboard?"

The per-flow and per-campaign revenue in our admin **matches the Klaviyo dashboard exactly** — both use the Reporting API with send-date attribution. The total store revenue uses a different API (Metric Aggregates) that counts revenue on the order date instead. For periods of 7+ days, the difference is typically less than 5%.

### "Why does the attribution percentage sometimes exceed 100%?"

This can happen for short periods (1-3 days) due to the attribution window. A flow sent 3 days ago may have its attributed revenue counted in today's Reporting API results, but the corresponding orders are spread across multiple days in Metric Aggregates. For 7d+ periods, this effect averages out.

### "Can we switch to a single source for everything?"

This was evaluated in Epic AK (March 2026) and rejected. Using only Metric Aggregates would cause flow/campaign numbers to diverge from the Klaviyo dashboard by up to 20% — clients would report it as a bug. Using only the Reporting API would hit rate limits and daily caps during cron syncs for 42+ stores.

### "What if Klaviyo changes their attribution model?"

Monitor the Klaviyo changelog (https://developers.klaviyo.com/en/docs/changelog_) for changes to attribution windows or reporting semantics. Any change should be evaluated against this ADR and may require updating thresholds or reconsidering the data source split.

## References

- Klaviyo Reporting API: https://developers.klaviyo.com/en/reference/reporting_api_overview
- Klaviyo Metric Aggregates: https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint
- Klaviyo Changelog (attribution model changes documented here): https://developers.klaviyo.com/en/docs/changelog_
- Implementation: `src/lib/services/klaviyo-sync.service.ts`
- Revenue summary: `src/lib/integrations/klaviyo/report-summary.ts`
