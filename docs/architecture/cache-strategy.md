# Cache Strategy -- admin-convertfy

## Cache Sources

### 1. `dashboard_cache` (generic blob cache)

- **Table:** `dashboard_cache`
- **Used for:** Shopify reports, GA4 analytics, Asaas payments, metadata
- **Populated by:** API routes on-demand (cache-aside pattern)
- **TTL:** Configurable per `cache_type` (see `src/lib/cache.ts`)
- **Format:** JSON blob with `_cacheVersion` field
- **Invalidation:** TTL-based; stale entries served while refresh runs

### 2. Structured Klaviyo Cache (cron-populated)

- **Tables:** `store_revenue_summary`, `klaviyo_flow_metrics`, `klaviyo_campaign_metrics`
- **Used for:** Admin dashboard (`/api/dashboard/total-revenue`), Portal dashboard (`/api/portal/dashboard`)
- **Populated by:** Cron at `/api/cron/sync-reports` (every 30 minutes)
- **TTL:** 6 hours (`expires_at` column)
- **Format:** Typed columns, not JSON blob
- **Fallback:** Live fetch via `syncKlaviyoForPeriod()` on cache miss (non-cached periods or force refresh)

### 3. Live Fetch Cooldowns (Epic 10)

- **Table:** `live_fetch_cooldowns`
- **Used for:** Coordinating live fetches across serverless functions to prevent duplicate API calls
- **Populated by:** Admin/Portal endpoints on cache miss
- **TTL:** 1 minute (cached periods) / 30 minutes (custom date ranges)
- **Mechanism:** PostgreSQL `INSERT ON CONFLICT` for atomic lock acquisition via `try_acquire_live_fetch` RPC

## Which Cache Serves What

| Data | Cache Source | Populated By |
|------|-------------|-------------|
| Klaviyo revenue, campaigns, flows | `store_revenue_summary` + detail tables | Cron + live fallback |
| Shopify orders, products, customers | `dashboard_cache` (type=shopify) | API routes on-demand |
| Audience metrics (leads, engaged) | `store_revenue_summary` columns | Cron only |
| Klaviyo account info, metric IDs | `dashboard_cache` (type=klaviyo_metadata) | Cached helpers |

## Tuning Knobs

| Parameter | Location | Default | Notes |
|-----------|----------|---------|-------|
| Cron BATCH_SIZE | `src/app/api/cron/sync-reports/route.ts` | 10 | Number of stores processed per cron run. Reduce to 5 if cron duration exceeds acceptable limits. |
| Cache TTL | `expires_at` calculation in cron/upsert | 6 hours | How long before cache is considered stale |
| Live fetch timeout | `LIVE_FETCH_TIMEOUT_MS` in total-revenue/route.ts | 30s | Max wait for live API calls |
| Portal fetch timeout | `PORTAL_LIVE_FETCH_TIMEOUT_MS` in portal/dashboard/route.ts | 15s | Max wait for portal live fetch |
| Cooldown (cached periods) | `LIVE_FETCH_COOLDOWN_MS` in `src/lib/shared/data-status.ts` | 1 min | Prevents repeated fetches for same store/period |
| Cooldown (custom ranges) | `CUSTOM_RANGE_COOLDOWN_MS` in `src/lib/shared/data-status.ts` | 30 min | Longer cooldown for arbitrary date ranges |
