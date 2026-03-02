# QA Report — Klaviyo Cache System Fixes
**Date:** 2026-03-02
**Analyst:** Quinn (QA Guardian)
**Scope:** Four bugs diagnosed in the Klaviyo cache pipeline and their corrections
**Status:** PENDING VALIDATION — corrections not yet confirmed deployed

---

## 1. Executive Summary

Four defects were diagnosed in the Klaviyo cache pipeline that collectively cause:
- All cron-written cache entries to be invisible to admin routes (date format mismatch)
- Portal clients to see an infinite "Carregando dados..." spinner with no recovery path (no retry on `dataStatus: "loading"`)
- Stores that use the `klaviyo_api_key` credential field (instead of `klaviyo_private_key`) to be silently excluded from cron sync
- A TTL inconsistency between the flows/campaigns routes (2 h max-age) and the cron/portal write path (6 h TTL)

Risk level: HIGH — the date-format bug alone makes the entire Klaviyo cache system non-functional for all stores.

---

## 2. Defect Analysis

### Bug 1: Date Format Mismatch in Cache Lookup (CRITICAL)

**Location:** `src/lib/services/sync-persistence.service.ts` (write path) vs `src/app/api/integrations/klaviyo/flows/route.ts` and `campaigns/route.ts` (read path)

**Root Cause:**

The cron writes `period_start` / `period_end` as ISO 8601 timestamps:
```
new Date(`${startDateStr}T00:00:00Z`).toISOString()
→ "2025-01-02T00:00:00.000Z"
```

The flows/campaigns routes query with plain date strings:
```
readFlowsFromCache(storeId, startDateStr, endDateStr, adminClient)
→ eq("period_start", "2025-01-02")
```

A Postgres `TIMESTAMPTZ` column will never match on `"2025-01-02"` when the stored value is `"2025-01-02T00:00:00.000Z"`. Cache is permanently missed; every request falls through to live fetch.

**Note:** The portal dashboard route (`route.ts`) uses `period_label` for `store_revenue_summary` lookups (line 121), which avoids this bug for the portal. The bug is isolated to the admin `flows` and `campaigns` endpoints.

**Also note:** `savePerfDataToCache` in `sync-persistence.service.ts` (portal live-fetch write path) also converts to ISO before writing `klaviyo_campaign_metrics` / `klaviyo_flow_metrics` (lines 92–93), so any row written via portal live-fetch also has the ISO format — meaning the admin routes would miss those rows too.

---

### Bug 2: Infinite Loading State in Portal Frontend (HIGH)

**Location:** `src/app/api/portal/dashboard/route.ts` lines 746 and 928; `src/app/portal/dashboard/page.tsx`

**Root Cause:**

The API returns `dataStatus: "loading"` in two scenarios:
1. Single-store: cached period, live fetch timed out, stale cache also empty (line 746)
2. All-stores mode: Klaviyo stores exist but all caches are empty (line 928)

The frontend `DataStatusBanner` renders "Carregando dados..." for this status. The `page.tsx` `fetchDashboard` function has no polling / retry mechanism for the `loading` state — it fires once on mount or on user-triggered refresh. The banner spins forever without user intervention.

There is no `useEffect` watching `data.dataStatus` to schedule a retry when `loading` is received.

---

### Bug 3: Cron Ignores `klaviyo_api_key` Field (HIGH)

**Location:** `src/app/api/cron/sync-reports/route.ts` line 285

**Root Cause:**

The database query to select eligible stores filters only on `klaviyo_private_key`:
```typescript
.not("klaviyo_private_key", "is", null)
```

However, both the flows and campaigns routes, and the cron's own `syncStore()` function (line 101), accept either credential field:
```typescript
const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
```

Stores where credentials were saved under `klaviyo_api_key` (not `klaviyo_private_key`) are never fetched by the cron. Their cache is never populated, causing permanent `dataStatus: "loading"` for those stores.

---

### Bug 4: Cache TTL Inconsistency (MEDIUM)

**Location:**
- `src/app/api/integrations/klaviyo/flows/route.ts` line 28: `CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000` (2 h)
- `src/app/api/integrations/klaviyo/campaigns/route.ts` line 28: same 2 h
- `src/lib/services/sync-persistence.service.ts` line 66: `expires_at = Date.now() + 6h`
- `src/app/api/cron/sync-reports/route.ts` error paths lines 190, 221: `expires_at = Date.now() + 6h`

**Root Cause:**

The flows/campaigns admin routes consider cache stale after 2 hours. The cron writes `expires_at` at 6 hours in the future. After the cron runs, a request between hours 2 and 6 will skip the valid cache and re-fetch live. This wastes Klaviyo API quota and creates unnecessary latency.

The portal dashboard route reads `store_revenue_summary` without an `expires_at` filter — it accepts stale data intentionally — so it is not affected by this specific inconsistency.

---

## 3. Test Cases (Given-When-Then)

### Fix 1: Date Format Alignment

**TC-F1-01: Cache written by cron is found by flows admin route**
```
Given: The cron has run successfully for store X, period "30d"
  And: klaviyo_flow_metrics contains rows with period_start = "2025-01-02T00:00:00.000Z"
When: GET /api/integrations/klaviyo/flows?store_id=X&period=30d is called
  And: forceRefresh is not set
Then: readFlowsFromCache returns non-null
  And: response contains fromCache: true
  And: no live Klaviyo API call is made
```

**TC-F1-02: Cache written by admin flows route is found by subsequent request**
```
Given: A live-fetch was triggered for store X, period "30d"
  And: The route upserted rows with period_start = formatDateStr(startDate) = "2025-01-02"
When: The same GET /api/integrations/klaviyo/flows?store_id=X&period=30d is called 30 min later
Then: readFlowsFromCache returns non-null
  And: fromCache: true
```

**TC-F1-03: Format consistency between write paths**
```
Given: Both savePerfDataToCache and syncKlaviyoForPeriod have run for the same store/period
When: Querying klaviyo_flow_metrics with .eq("period_start", <any format>)
Then: Both rows are matched by the same query format
  And: No duplicate rows exist from format mismatch on upsert conflict key
```

**TC-F1-04: Campaign cache lookups are consistent**
```
(Mirror of TC-F1-01 and TC-F1-02 but for klaviyo_campaign_metrics and the campaigns route)
```

**TC-F1-05: Date boundary — period "7d" at timezone boundary**
```
Given: Klaviyo account timezone is America/Sao_Paulo (UTC-3)
  And: Current UTC time is 01:30 on 2025-02-01 (which is 22:30 on 2025-01-31 in SP)
When: parseDateRangeInTimezone("7d", "America/Sao_Paulo") is called
Then: startDateStr = "2025-01-24" (not "2025-01-25" — uses SP "today" = Jan 31)
  And: endDateStr = "2025-01-31"
  And: When converted to ISO for storage: periodStartISO = "2025-01-24T00:00:00.000Z"
  And: A subsequent cache read using the same parseDateRangeInTimezone call matches those rows
```

---

### Fix 2: Infinite Loading — Frontend Retry

**TC-F2-01: Loading state triggers automatic retry**
```
Given: The portal dashboard page mounts
  And: The API returns dataStatus: "loading"
When: 15-30 seconds have elapsed (configurable interval)
Then: fetchDashboard() is called automatically without user interaction
  And: The spinner is still visible during the wait
  And: The DataStatusBanner still shows "Carregando dados..."
```

**TC-F2-02: Retry eventually resolves to ready**
```
Given: First request returned dataStatus: "loading" (cron had not run yet)
  And: The cron completes during the retry window
When: The automatic retry request fires
Then: The API now returns dataStatus: "ready" or "stale"
  And: The DataStatusBanner disappears or shows freshness message
  And: Dashboard data is rendered
```

**TC-F2-03: Retry does not run when data is ready**
```
Given: The API returned dataStatus: "ready"
When: 30 seconds elapse
Then: No additional fetch is triggered
  And: No extra network calls appear in browser DevTools
```

**TC-F2-04: Retry stops after max attempts**
```
Given: The API consistently returns dataStatus: "loading" for N retries
When: Max retry count is reached
Then: The spinner stops
  And: An actionable error message is shown with a manual refresh button
  And: No infinite background polling continues
```

**TC-F2-05: Period change resets retry state**
```
Given: The user is waiting on a loading retry cycle for period "30d"
When: The user changes the period selector to "7d"
Then: Any pending retry timer is cancelled
  And: A fresh fetch fires immediately
  And: The retry counter resets
```

---

### Fix 3: Cron Respects `klaviyo_api_key`

**TC-F3-01: Store with only `klaviyo_api_key` is synced by cron**
```
Given: Store A has klaviyo_private_key = NULL and klaviyo_api_key = "pk_abc123"
When: The cron sync-reports endpoint runs
Then: Store A appears in the stores list returned by the Supabase query
  And: syncStore() is called with Store A
  And: getStoreCredentials returns the api_key value
  And: A successful Klaviyo API request is made using pk_abc123
  And: klaviyo_flow_metrics rows are written for Store A
```

**TC-F3-02: Store with only `klaviyo_private_key` continues to be synced**
```
Given: Store B has klaviyo_private_key = "pk_xyz456" and klaviyo_api_key = NULL
When: The cron runs
Then: Store B is included (regression: original behavior preserved)
```

**TC-F3-03: Store with both keys uses `klaviyo_private_key` preferentially**
```
Given: Store C has both keys set
When: The cron runs and syncStore resolves the key
Then: The key used is klaviyo_private_key (priority preserved)
```

**TC-F3-04: Store with neither key is correctly skipped**
```
Given: Store D has both credential fields as NULL
When: The cron runs
Then: Store D does not appear in the synced stores list
  And: No Klaviyo API call is made for Store D
```

**TC-F3-05: Cron response accurately counts stores with api_key vs private_key**
```
Given: 3 stores have private_key, 2 have only api_key
After Fix: The cron summary shows 5 stores processed (previously would show 3)
```

---

### Fix 4: TTL Alignment

**TC-F4-01: Cache written by cron is valid for 6 hours in flows route**
```
Given: The cron wrote rows with fetched_at = T and expires_at = T + 6h
  And: 3 hours have elapsed since cron wrote (T + 3h)
When: readFlowsFromCache checks freshness via CACHE_MAX_AGE_MS
  And: CACHE_MAX_AGE_MS has been updated to 6h (or aligned constant is used)
Then: The cache is considered fresh
  And: fromCache: true is returned
  And: No live fetch is triggered
```

**TC-F4-02: Cache is stale after 6 hours**
```
Given: rows were written at T and now = T + 7h
When: readFlowsFromCache is called
Then: The cache is considered stale (returns null)
  And: A live fetch is triggered
```

**TC-F4-03: No duplicate live fetches between cron runs**
```
Given: Cron runs every 6 hours
  And: CACHE_MAX_AGE_MS = 6h in flows/campaigns routes
When: A request arrives 5h59m after the cron ran
Then: Cache is still fresh — no live fetch occurs
  And: Klaviyo API quota is not consumed unnecessarily
```

---

## 4. Regression Test Cases

**RT-01: Multi-tenant isolation is preserved**
```
Given: Stores A (org 1) and B (org 2) have cache rows
When: A portal user from org 1 requests dashboard
Then: Only Store A data is returned
  And: Store B rows are never read
```

**RT-02: forceRefresh bypasses cache correctly**
```
Given: Fresh cache exists for store/period
When: GET /flows?store_id=X&period=30d&force_refresh=true
Then: Live fetch is triggered regardless of cache age
  And: Cache is updated with new data
  And: fromCache: false in response
```

**RT-03: Custom period does not use cache**
```
Given: Cache exists for "30d" period
When: GET /flows?store_id=X&period=custom&start_date=2025-01-01&end_date=2025-01-15
Then: Cache is not consulted
  And: Live fetch fires
  And: isCustomPeriod = true (internal flag)
```

**RT-04: Upsert conflict key prevents duplicate rows**
```
Given: A row exists for (store_id, flow_id, period_start, period_end)
When: The same data is upserted again (e.g., by manual re-run)
Then: No duplicate row is inserted
  And: The existing row is updated
  And: Supabase upsert onConflict resolves cleanly
```

**RT-05: Missing Placed Order metric gracefully handled**
```
Given: A store's Klaviyo account has no "Placed Order" metric
When: syncStore() is called for that store
Then: status: "skipped" with error "No Placed Order metric"
  And: No exception propagates to crash the batch
  And: Other stores in the same batch are unaffected
```

**RT-06: Cron lock prevents concurrent runs**
```
Given: A cron run is in progress (is_running = true, started_at = now - 5min)
When: A second cron trigger fires
Then: HTTP 409 is returned with reason "another instance running"
  And: No duplicate data is written
```

**RT-07: Stale lock (>10 min) is correctly overridden**
```
Given: is_running = true but started_at = 15 minutes ago (stale lock)
When: A new cron trigger fires
Then: The stale lock is overridden
  And: Sync proceeds normally
```

**RT-08: Admin flows/campaigns routes fall back to live when cache is absent**
```
Given: No cache rows exist for store X, period "30d"
When: GET /flows?store_id=X&period=30d (no forceRefresh)
Then: Live fetch executes
  And: Data is returned successfully
  And: Rows are written to klaviyo_flow_metrics for future cache hits
```

**RT-09: Portal "All stores" aggregation is not broken**
```
Given: Multiple stores have cache data after the fix
When: Portal dashboard is loaded without a selected store
Then: Revenue from all stores is aggregated
  And: dataStatus is "ready" not "loading"
```

**RT-10: Period selector change triggers a fresh fetch**
```
Given: Dashboard loaded with period "30d", dataStatus "ready"
When: User selects "7d" in the period selector
Then: fetchDashboard is called with period = "7d"
  And: Loading skeleton appears
  And: Fresh data for 7d is displayed
```

---

## 5. Edge Cases

**EC-01: Date near midnight at timezone boundary**
```
Scenario: Server clock = 00:05 UTC, account timezone = America/Sao_Paulo
Expected: parseDateRangeInTimezone returns SP date (yesterday UTC = today in SP)
Risk: toISOString() on `new Date("YYYY-MM-DDT00:00:00Z")` for a "simple" date
      string does NOT apply timezone — uses UTC. Verify this is intentional
      and consistent with how Klaviyo actually filters data.
```

**EC-02: Cache row with NULL fetched_at**
```
Given: A row exists in klaviyo_flow_metrics with fetched_at = NULL
When: readFlowsFromCache checks freshness: new Date(rows[0].fetched_at)
Then: NaN date should be handled — current code would pass NaN to getTime()
      which returns NaN, and NaN > any number is false → cache treated as fresh
Action: Verify NaN produces a safe/conservative result (treat as stale is safer)
```

**EC-03: Partial cron completion (timeout)**
```
Scenario: Cron times out at 240s with 6/10 stores synced
Given: Stores 7-10 have no cache data
When: Portal users for stores 7-10 load their dashboards
Then: fallback to live fetch within PORTAL_LIVE_FETCH_TIMEOUT_MS (45s)
  And: dataStatus transitions to "loading" if live also fails
  And: Retry mechanism (Fix 2) picks up the slack
```

**EC-04: Klaviyo API returns empty results (no flows/campaigns in period)**
```
Given: A new store with no historical data in the requested period
When: cron fetches flow-values-reports
Then: Empty results are correctly stored (zero-value rows)
  And: Cache hit still returns fromCache: true with empty arrays
  And: Not confused with "no cache" (null result)
Note: Current code returns an empty Map and writes zero-value rows —
      verify that upsert with all zeros still triggers a cache hit on next read
```

**EC-05: Clock skew between Vercel instances**
```
Scenario: Two Vercel functions handling concurrent requests
  And: Their system clocks differ by a few seconds
When: Both check cache freshness for the same store/period simultaneously
Then: Both see consistent stale/fresh decision (acceptable race — not a correctness bug)
  And: At worst, one extra live fetch occurs (acceptable)
```

**EC-06: `savePerfDataToCache` ISO format vs. `syncKlaviyoForPeriod` ISO format conflict**
```
Both write to klaviyo_flow_metrics with ISO period_start/period_end.
The upsert conflict key is (store_id, flow_id, period_start, period_end).
If both functions run for the same store/period, the ISO strings must be identical.
Given: parseDateRangeInTimezone returns startDateStr = "2025-01-02"
  - savePerfDataToCache: new Date("2025-01-02T00:00:00Z").toISOString() = "2025-01-02T00:00:00.000Z"
  - syncKlaviyoForPeriod: new Date("2025-01-02T00:00:00Z").toISOString() = "2025-01-02T00:00:00.000Z"
Both produce identical strings → no conflict. Verify this holds for all timezones.
```

**EC-07: Expired `store_revenue_summary` row with no matching flow/campaign detail rows**
```
Scenario: Revenue summary exists (stale) but detail rows were cleaned up
When: fetchKlaviyoFromCache reads summary → ok; then reads campaign/flow detail → empty arrays
Then: Portal still renders (zero campaigns/flows) but summary KPIs are present
  And: dataStatus = "stale" (driven by expires_at)
  And: No crash on empty arrays in mapCacheToPortalKlaviyo
```

**EC-08: `klaviyo_api_key` vs `klaviyo_private_key` field naming ambiguity in RLS/admin client**
```
Given: Fix 3 adds OR condition to cron store query
When: A store has klaviyo_api_key set but klaviyo_private_key = NULL
Then: The Supabase admin client (service role) bypasses RLS and reads both columns correctly
  And: getStoreCredentials correctly decrypts the api_key field
  And: The key works for Klaviyo API authentication
```

---

## 6. Non-Functional Requirements Validation

**NFR-01: Performance — Cache must reduce API call volume by >80%**
- Baseline: Without cache, every portal load = ~4-6 Klaviyo API calls per store
- Expected after fix: Cron pre-populates for [7d, 15d, 30d, 90d] → cache hit rate approaches 100% between cron runs
- Verify: Monitor Klaviyo API usage metrics before/after deployment

**NFR-02: Reliability — Cron failure must not cause permanent data absence**
- Verify: `expires_at` is set 6h in the future; portal still serves stale data until next cron run
- Verify: `dataStatus: "stale"` is correctly shown when `new Date(summary.expires_at) < new Date()`

**NFR-03: Security — Cache reads must respect multi-tenant isolation**
- All cache reads include `.eq("store_id", storeId)` — verify no path omits this filter
- Admin client (service role) is used for cache reads — confirm it is not exposed client-side

**NFR-04: Observability — Cache hit/miss must be logged**
- Verify `log.info("[Klaviyo Flows] Serving from cache...")` fires on hit
- Verify `log.info("[Klaviyo Flows] Starting live fetch...")` fires on miss
- After Fix 1, these logs should be observable in Vercel Logs for the first time

---

## 7. Checklist — Post-Deploy Validation

### Immediate (within 1 hour of deploy)

- [ ] Trigger cron manually: `GET /api/cron/sync-reports` with valid `Authorization: Bearer <CRON_SECRET>`
- [ ] Verify cron response shows `status: "ok"` (not all `"skipped"`)
- [ ] Verify cron response `summary.ok > 0`
- [ ] Check Supabase `klaviyo_flow_metrics` table — confirm rows exist with ISO `period_start` format
- [ ] Check Supabase `klaviyo_campaign_metrics` table — same verification
- [ ] Check Supabase `store_revenue_summary` table — confirm `sync_status = "ok"`

### After Cron Completion

- [ ] Open admin flows tab for a store that had data before
- [ ] Verify response has `fromCache: true`
- [ ] Verify `fetchedAt` matches the cron run timestamp (within expected window)
- [ ] Repeat for campaigns tab
- [ ] Confirm no live Klaviyo API calls for these requests in server logs

### Portal Loading State

- [ ] Find a store with `klaviyo_api_key` set (not `klaviyo_private_key`) — confirm it was synced by cron
- [ ] Log in as a portal user for that store
- [ ] Verify dashboard shows data, not infinite "Carregando dados..."
- [ ] If `dataStatus: "loading"` still appears on first load, verify retry fires within ~30s
- [ ] Confirm the retry eventually resolves to `"ready"` or `"stale"`

### TTL Verification

- [ ] Note cron completion time T
- [ ] At T + 2h, request flows endpoint — verify `fromCache: true` (not a live fetch)
- [ ] At T + 5h, request flows endpoint — verify `fromCache: true`
- [ ] At T + 7h (after 6h TTL expires), verify cache miss and live fetch triggers

### Regression

- [ ] Verify stores using `klaviyo_private_key` (not `klaviyo_api_key`) still sync correctly
- [ ] Verify `forceRefresh=true` still bypasses cache
- [ ] Verify custom date ranges still do live fetch
- [ ] Verify portal dark mode displays correctly (unrelated to this fix)
- [ ] Run `npm run typecheck` — no new type errors
- [ ] Run `npm run lint` — no new lint errors

---

## 8. Existing Test Coverage Assessment

### Current tests found:
- `src/lib/utils/generate-password.test.ts` — utility only
- `src/lib/logger.test.ts` — utility only
- `src/lib/schemas/common.test.ts` — validation schema
- `src/lib/integrations/shopify/report.test.ts` — Shopify specific

**Finding:** Zero test coverage exists for:
- `klaviyo-sync.service.ts`
- `sync-persistence.service.ts`
- `klaviyo/client.ts` (parseDateRangeInTimezone, formatDateStr)
- Portal dashboard route
- Cron sync-reports route
- Cache read functions (readFlowsFromCache, readCampaignsFromCache, fetchKlaviyoFromCache)

---

## 9. Recommended New Tests

### Priority 1 — Unit Tests (add immediately)

**File: `src/lib/integrations/klaviyo/client.test.ts`**
```typescript
// TC: parseDateRangeInTimezone returns correct YYYY-MM-DD for all periods
// TC: parseDateRangeInTimezone handles timezone boundary (UTC midnight vs SP midnight)
// TC: formatDateStr produces YYYY-MM-DD not ISO
// TC: parseDateRangeInTimezone("7d", timezone) → 7 days before today-in-timezone, not today-in-UTC
```

**File: `src/lib/services/sync-persistence.service.test.ts`**
```typescript
// TC: savePerfDataToCache writes period_start as ISO string
// TC: upsertSyncResults writes period_start from data.startDateStr (already ISO from sync service)
// TC: Both write functions produce identical period_start for the same date
// TC: savePerfDataToCache is a no-op for non-CACHED_PERIODS (e.g. "1d", "12m")
```

**File: `src/lib/integrations/klaviyo/cache.test.ts` (new)**
```typescript
// TC: readFlowsFromCache returns null when no rows exist
// TC: readFlowsFromCache returns null when rows exist but are older than CACHE_MAX_AGE_MS
// TC: readFlowsFromCache returns data when rows are fresh
// TC: readFlowsFromCache queries with correct period format (ISO or plain — whichever is the fix)
// TC: fetchKlaviyoFromCache reads period_label not period_start for store_revenue_summary
```

### Priority 2 — Integration Tests

**File: `src/app/api/cron/sync-reports.test.ts`**
```typescript
// TC: Store with klaviyo_api_key (not private_key) is included in sync
// TC: Store with neither key is excluded
// TC: Cron lock prevents concurrent runs
// TC: Timeout at MAX_DURATION_MS produces partial status, not crash
```

### Priority 3 — E2E / Smoke

```
Verify portal dashboard page does not stay in loading state >60s after cron has run
Verify period change re-fetches data
Verify DataStatusBanner disappears when dataStatus transitions to "ready"
```

---

## 10. Residual Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Postgres TIMESTAMPTZ casting behavior differs between local dev (PostgreSQL version) and Supabase (cloud) | Low | High | Test against Supabase staging instance, not local |
| After Fix 1 (date format), existing rows in `klaviyo_flow_metrics` have the old format and will never be matched by new queries until overwritten | High (if fix changes write format) | Medium | Run cron once after deploy to overwrite all rows with consistent format |
| Fix 2 retry loop may spam the portal dashboard API if the endpoint is consistently slow (>45s) | Medium | Medium | Implement exponential backoff (e.g. 15s, 30s, 60s) not fixed-interval polling |
| Fix 3 OR condition on cron query changes the set of synced stores — if `klaviyo_api_key` stores have bad/expired keys, cron error count increases | Low | Low | Graceful error handling already in place (`syncStore` returns `"skipped"` on API failure) |
| TTL fix (6h) means flows/campaigns admin routes now serve data up to 6h old without indicating staleness to the admin user | Low | Low | Consider adding a `fromCache + fetchedAt` UI indicator in admin flow/campaigns tabs |
| `CACHE_MAX_AGE_MS` is a module-level constant duplicated in flows and campaigns routes — if changed in one, easily forgotten in the other | Medium | Low | Extract to `src/lib/shared/data-status.ts` as `CACHE_MAX_AGE_MS` constant |

---

## 11. Gate Decision

**Status: PENDING**

This report is pre-fix. The gate decision will be issued after:
1. Corrections are implemented and deployed to staging
2. Post-deploy validation checklist above is executed
3. All TC-F1 through TC-F4 test cases pass

Blocking criteria for PASS:
- TC-F1-01 (cron cache is found by admin routes) must pass
- TC-F3-01 (api_key stores synced) must pass
- TC-F2-01 (loading retry fires) must pass
- RT-01 through RT-04 regression cases must pass

Non-blocking for PASS (but must be tracked as tech debt):
- TC-F4 series (TTL alignment) — acceptable to ship with 2h max-age if 6h TTL write is not changed, but creates unnecessary live fetches
- EC-02 (NULL fetched_at) — defensive coding improvement
- Residual risk: constant duplication in flows/campaigns routes

---

*— Quinn, guardiao da qualidade*
