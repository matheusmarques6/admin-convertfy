# Security Audit: Portal Multi-Tenant Isolation

**Date:** 2026-03-05
**Auditor:** Quinn (QA Agent)
**Scope:** All `/api/portal/` routes + RLS policies on portal-accessed tables
**Trigger:** Report of portal showing data from OTHER stores

---

## Executive Summary

The portal API routes use `createAdminClient()` (service_role) extensively, which bypasses all RLS policies. The security model therefore relies **entirely on application-level filtering** using `client_id` from the authenticated portal user. After thorough review:

- **Application-level tenant isolation in portal routes is correctly implemented** -- all routes validate `client_id` ownership before returning data
- **However, multiple CRITICAL and HIGH RLS policy issues exist at the database layer** that create a dangerous fallback-free architecture
- **The reported issue of "showing other stores' data" is NOT caused by portal API routes** -- the likely root cause is overly permissive RLS policies that allow any authenticated user to read all data

---

## FINDINGS

### FINDING-01: CRITICAL -- RLS Policies Allow ANY Authenticated User Full Access to Sensitive Tables

**Severity:** CRITICAL
**Tables affected:** `client_stores`, `clients`, `invoices`, `meetings`, `client_charges`, `client_portal_users`

Multiple tables have "Allow all" or "true" policies for `authenticated` or `public` roles that completely negate the purpose of RLS:

**Evidence:**

```
-- client_stores
"Allow all on client_stores" | roles: {public} | cmd: ALL | qual: true | with_check: true
"Authenticated users can manage client_stores" | roles: {authenticated} | cmd: ALL | qual: true

-- clients
"Authenticated users can view clients" | roles: {authenticated} | cmd: SELECT | qual: true
"Authenticated users can update clients" | roles: {authenticated} | cmd: UPDATE | qual: true
"Authenticated users can delete clients" | roles: {authenticated} | cmd: DELETE | qual: true
"Authenticated users can insert clients" | roles: {authenticated} | cmd: INSERT | qual: true

-- invoices
"Allow all operations on invoices" | roles: {public} | cmd: ALL | qual: true | with_check: true
"Authenticated users can manage invoices" | roles: {authenticated} | cmd: ALL | qual: true

-- client_charges
"Allow all on client_charges" | roles: {public} | cmd: ALL | qual: true | with_check: true

-- client_portal_users
"Allow all for authenticated users" | roles: {authenticated} | cmd: ALL | qual: true | with_check: true
```

**Impact:** A portal user (who IS an authenticated Supabase user) making a direct Supabase query from the browser client -- or any code path using `createClient()` instead of `createAdminClient()` -- can read ALL clients, ALL stores, ALL invoices, ALL charges, and ALL portal users across every tenant. The "good" restrictive policies coexist with these permissive "allow all" policies, but in Postgres PERMISSIVE policies are OR'd together -- meaning if ANY permissive policy passes, access is granted.

**Root cause:** These appear to be legacy/development policies that were never removed after the proper org-scoped policies were added.

---

### FINDING-02: CRITICAL -- Portal Users Can Read ALL client_portal_users Records

**Severity:** CRITICAL
**File:** Database RLS policy on `client_portal_users`

**Evidence:**
```
"Allow all for authenticated users" | roles: {authenticated} | cmd: ALL | qual: true | with_check: true
```

This means any portal user can, via the Supabase JS client in the browser:
1. List ALL portal users across all tenants (names, emails, client_ids)
2. UPDATE any portal user record (change permissions, client_id, etc.)
3. DELETE any portal user record
4. INSERT new portal user records

Combined with the `clients` table being fully open, a malicious portal user could escalate to any client.

---

### FINDING-03: HIGH -- The Auth POST Route Uses createClient() for Portal User Lookup

**Severity:** HIGH (mitigated by FINDING-02 accidentally)
**File:** `src/app/api/portal/auth/route.ts`, line 105

**Evidence:**
```typescript
// Line 105 -- uses supabase (createClient, user-context), not adminClient
const { data: portalUser, error: portalError } = await supabase
  .from("client_portal_users")
  .select(`*, client:clients(id, name, company, email, status)`)
  .eq("auth_user_id", authData.user.id)
  .single()
```

This query runs under RLS. It currently works only because of the "Allow all for authenticated users" policy (FINDING-02). If FINDING-02 is fixed (the "Allow all" policy removed), this login flow will break for portal users who don't match the remaining policies (which target admin/manager/cs roles or `auth_user_id = auth.uid()`).

**Recommendation:** This route should use `adminClient` for the portal user lookup (like all other portal routes do), OR ensure a proper RLS policy exists: `auth_user_id = auth.uid()` for SELECT (which already exists as "Portal users can view own record").

---

### FINDING-04: MEDIUM -- fetchKlaviyoFromCache Does Not Filter by org_id

**Severity:** MEDIUM (mitigated by application-level storeId validation)
**File:** `src/app/api/portal/dashboard/route.ts`, lines 111-202

**Evidence:**
```typescript
async function fetchKlaviyoFromCache(storeId, period, supabase) {
  // Queries store_revenue_summary by store_id only -- no org_id filter
  const { data: summary } = await supabase
    .from("store_revenue_summary")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .single()

  // Similarly for klaviyo_campaign_metrics and klaviyo_flow_metrics
  // Only filtered by store_id, no org_id
}
```

The `storeId` passed to this function IS validated upstream (the dashboard route fetches stores for `clientId` first, then only uses those store IDs). However, the function itself accepts any `storeId` and uses `adminClient` (service_role), so a programming error in a future caller could leak data.

**Recommendation:** Add `org_id` as a secondary filter in `fetchKlaviyoFromCache` as defense-in-depth.

---

### FINDING-05: MEDIUM -- Dashboard Route Campaigns Query Missing client_id Ownership Check

**Severity:** MEDIUM (mitigated by storeId scoping)
**File:** `src/app/api/portal/dashboard/route.ts`, lines 518-525

**Evidence:**
```typescript
adminClient
  .from("campaigns")
  .select("*")
  .eq("client_id", clientId)     // Uses clientId from portalUser -- GOOD
  .eq("status", "scheduled")
  ...
```

This query is actually correct -- it filters by `clientId`. However, the `campaigns` table query at line 518 uses `client_id` which IS the portal user's client_id. No issue here upon closer inspection.

**Reclassified:** NOT A VULNERABILITY. The campaigns query correctly scopes to `clientId`.

---

### FINDING-06: LOW -- Portal Auth GET Does Not Check is_active on client_portal_users Lookup

**Severity:** LOW
**File:** `src/app/api/portal/auth/route.ts`, line 32-39

**Evidence:**
```typescript
const { data: portalUser } = await adminClient
  .from("client_portal_users")
  .select(`*, client:clients(id, name, company, email, status)`)
  .eq("auth_user_id", user.id)
  .single()   // No .eq("is_active", true) filter

// is_active is checked LATER at line 51
if (!portalUser.is_active) { ... }
```

This is technically correct (it checks `is_active` after the query), but inconsistent with other routes that filter at the query level. Not a security vulnerability since it does check `is_active` before returning data.

---

### FINDING-07: LOW -- Tracking GET Route storeId from Query Params Not Validated Against Client

**Severity:** LOW (correctly mitigated)
**File:** `src/app/api/portal/tracking/route.ts`, lines 110, 146-148

**Evidence:**
```typescript
const storeId = url.searchParams.get("store_id")
// ...
// storeIds comes from ensureTrackingStores(adminClient, portalUser.client_id) -- scoped to client
const activeStoreIds = storeId
  ? storeIds.filter(id => id === storeId)  // Only keeps if storeId is in client's storeIds
  : storeIds
```

The `storeId` from the request IS validated -- it filters against the already-scoped `storeIds` list. If a malicious user provides a storeId from another client, it simply returns no results. Correctly implemented.

---

### FINDING-08: INFORMATIONAL -- Consistent Use of adminClient Across Portal Routes

All 17+ portal API routes follow the same pattern:
1. `createClient()` for auth (`supabase.auth.getUser()` or `requireAuth()`)
2. `createAdminClient()` for data queries
3. Portal user lookup via `auth_user_id` match
4. All subsequent queries scoped to `portalUser.client_id`

Routes verified:
- `/api/portal/dashboard` -- clientId from portalUser, stores filtered by clientId
- `/api/portal/stores` -- client_id filter on client_stores
- `/api/portal/stores/[id]/report` -- validates store.client_id = portalUser.client_id
- `/api/portal/campaigns` -- clientId filter, storeId validated against clientStoreIds
- `/api/portal/integrations` -- store_id validated against client_id
- `/api/portal/tracking/*` -- all scoped to client_id via client_stores
- `/api/portal/stores/onboarding` -- validates replace_store_id against clientId
- `/api/portal/onboarding` -- scoped to clientId
- `/api/portal/stores/[id]/utm-templates` -- validates storeId against client_id
- `/api/portal/settings/*` -- uses createClient() with user RLS
- `/api/portal/invoices` -- uses createClient() with user RLS

**Assessment:** Application-level isolation is correctly implemented across all portal routes.

---

## RISK MATRIX

| Finding | Severity | Probability | Impact | Risk Score |
|---------|----------|-------------|--------|------------|
| F-01: Open RLS policies on core tables | CRITICAL | HIGH | CRITICAL | 10/10 |
| F-02: client_portal_users allow-all | CRITICAL | HIGH | CRITICAL | 10/10 |
| F-03: Auth POST uses createClient() | HIGH | MEDIUM | HIGH | 7/10 |
| F-04: No org_id in cache queries | MEDIUM | LOW | HIGH | 5/10 |
| F-06: is_active check timing | LOW | LOW | LOW | 2/10 |

---

## ROOT CAUSE ANALYSIS: "Portal Showing Other Stores' Data"

The reported issue is **NOT caused by the portal API routes** (which correctly scope all queries). The most likely root causes are:

### Hypothesis A: Browser-Side Supabase Client Leaking Data -- RULED OUT
Verified: the portal frontend (`src/app/portal/`) only uses `createClient()` for `supabase.auth.getUser()` (authentication). All data fetching goes through `/api/portal/` routes, which use adminClient with correct client_id scoping. No direct `.from()` data queries found in portal frontend code.

### Hypothesis B: Stale Cache Cross-Contamination
The `dashboard_cache` table uses `store_id + cache_type + period` as the upsert key. If two different stores ever shared the same ID (unlikely with UUIDs), cache data could leak. This is unlikely but worth verifying.

### Hypothesis C: Frontend localStorage Persistence -- PARTIALLY RULED OUT
Confirmed: `src/app/portal/dashboard/page.tsx` line 48 reads `localStorage.getItem("portal_active_store")` and sends it as `store_id` to the API. If user A and user B share the same browser, user B would send user A's storeId. However, the API correctly validates the storeId against the user's client and would either ignore it or return empty. This could cause confusion (showing "no data") but NOT data from another tenant.

### Hypothesis D: Multi-Store Client Seeing Wrong Store's Data (MOST LIKELY)
If a client has multiple stores, and the `portal_active_store` localStorage value persists across page navigations or is set incorrectly, the user might see data for their Store B when expecting Store A. This would appear as "showing data from another store" but is actually showing data from another store BELONGING TO THE SAME CLIENT. This is not a security vulnerability but a UX issue. Verify with the reporter whether the "other store" data belongs to a completely different client or just a different store under their account.

---

## RECOMMENDATIONS

### P0 -- IMMEDIATE (CRITICAL)

1. **Remove all "Allow all" / "true" RLS policies** from production tables:
   ```sql
   -- client_stores
   DROP POLICY "Allow all on client_stores" ON client_stores;
   DROP POLICY "Authenticated users can manage client_stores" ON client_stores;

   -- clients
   DROP POLICY "Authenticated users can view clients" ON clients;
   DROP POLICY "Authenticated users can update clients" ON clients;
   DROP POLICY "Authenticated users can delete clients" ON clients;
   DROP POLICY "Authenticated users can insert clients" ON clients;

   -- invoices
   DROP POLICY "Allow all operations on invoices" ON invoices;
   DROP POLICY "Authenticated users can manage invoices" ON invoices;

   -- client_charges
   DROP POLICY "Allow all on client_charges" ON client_charges;

   -- client_portal_users
   DROP POLICY "Allow all for authenticated users" ON client_portal_users;

   -- meetings
   DROP POLICY "Authenticated users can manage meetings" ON meetings;
   ```

2. **BEFORE dropping policies**, verify the portal auth POST route works with remaining policies. Add a portal-specific SELECT policy for `client_portal_users` if the existing "Portal users can view own record" policy is insufficient:
   ```sql
   -- This already exists but verify it works:
   -- "Portal users can view own record" | qual: auth_user_id = auth.uid()
   ```

3. **Add portal-specific RLS policies** for tables that portal users need to read via `createClient()`:
   ```sql
   -- For client_portal_activity (portal users insert their own activity)
   CREATE POLICY "Portal users can insert own activity"
     ON client_portal_activity FOR INSERT
     TO authenticated
     WITH CHECK (
       portal_user_id IN (
         SELECT id FROM client_portal_users
         WHERE auth_user_id = auth.uid() AND is_active = true
       )
     );
   ```

### P1 -- SHORT TERM (HIGH)

4. **Fix auth POST route** to use `adminClient` for portal user lookup (consistent with all other routes):
   ```typescript
   // src/app/api/portal/auth/route.ts, line 105
   const adminClient = createAdminClient()
   const { data: portalUser } = await adminClient
     .from("client_portal_users")
     .select(`*, client:clients(...)`)
     .eq("auth_user_id", authData.user.id)
     .eq("is_active", true)
     .single()
   ```

5. **Audit frontend for direct Supabase client usage** in portal pages. Search for patterns like:
   ```
   supabase.from("client_stores")
   supabase.from("clients")
   ```
   Any direct Supabase queries from the portal frontend will bypass the application-level filtering.

### P2 -- DEFENSE IN DEPTH (MEDIUM)

6. **Add org_id to fetchKlaviyoFromCache** as secondary filter
7. **Add portal user RLS policies** to all data tables so that even if `createClient()` is used accidentally, data is still scoped
8. **Create a middleware helper** `requirePortalUser()` that consolidates the portal user lookup pattern used across all routes

---

## QUALITY GATE DECISION

**GATE: FAIL**

**Rationale:** FINDING-01 and FINDING-02 are CRITICAL severity. The open RLS policies on `client_stores`, `clients`, `invoices`, `client_charges`, and `client_portal_users` allow ANY authenticated user (including portal users) to read/write ALL tenant data via direct Supabase client queries. While the portal API routes themselves implement correct application-level scoping, the database layer provides zero protection, making this a single-point-of-failure architecture.

**Required before PASS:**
- [ ] Remove all "Allow all" / `qual: true` legacy RLS policies (FINDING-01)
- [ ] Remove `client_portal_users` allow-all policy (FINDING-02)
- [ ] Verify portal auth flow works after policy removal (FINDING-03)
- [ ] Confirm no frontend code directly queries Supabase client for sensitive tables

---

*-- Quinn, guardiao da qualidade*
