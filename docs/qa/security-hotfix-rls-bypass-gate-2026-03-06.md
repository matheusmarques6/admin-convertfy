# QA Gate Decision: RLS Bypass Hotfix (P0-P3 Plan)

**Date:** 2026-03-06
**Reviewer:** Quinn (QA Agent)
**Severity:** CRITICAL - Financial data exposure
**Gate Decision:** FAIL - Plan requires modifications before execution

---

## Executive Summary

The proposed P0 hotfix (4 DROP POLICY statements) is **partially correct but will cause a production outage** on the `integrations` table, breaking all Asaas financial routes for non-admin users. The `contracts` DROP is safe only because the table has 0 rows. The `deals` and `reports` DROPs are safe.

Additionally, the P0 hotfix alone is **insufficient** to close the vulnerability -- the real exposure vector is that most routes use `createClient()` (RLS-bound) to query `integrations` without any org scoping, and the `is_admin()` function itself is NOT org-scoped.

---

## Phase 1: Per-Table Regression Analysis

### 1. `deals` -- DROP is SAFE

| Aspect | Detail |
|--------|--------|
| Row count | 0 |
| Remaining policies | 4 granular policies (SELECT, INSERT, UPDATE, DELETE) |
| Client type used | `createClient()` (RLS) in `deal.service.ts`, `pipeline/deals/route.ts`, `pipeline/settings/route.ts`, `pipeline/page.tsx` |
| Regression risk | NONE -- granular policies cover all CRUD operations via `pipeline_members` + `is_admin()` |

**Verdict: SAFE TO DROP**

### 2. `reports` -- DROP is SAFE

| Aspect | Detail |
|--------|--------|
| Row count | 0 |
| Remaining policies | "Access reports by client" (SELECT with `can_access_client` + `has_feature`), "Admin can manage reports" (ALL with `is_admin()` OR `is_org_owner`) |
| Code references | **No code in `src/` queries the `reports` table directly** |
| Regression risk | NONE -- table is not actively used, and granular policies cover all operations |

**Verdict: SAFE TO DROP**

### 3. `contracts` -- DROP is SAFE (conditionally)

| Aspect | Detail |
|--------|--------|
| Row count | 0 |
| Remaining policies | **NONE** -- this is the only policy on the table |
| Code references | 7 files query this table: dashboard pages, client-overview, client-contracts component, contracts API route, deal.service (auto-create), task-automation.service |
| Client type used | `createClient()` (RLS) in all references |
| Regression risk | **ALL contract functionality breaks** -- no INSERT, no SELECT, no UPDATE, no DELETE for any user |

**However:** Since row count is 0, no data is at risk and no user workflow currently depends on contract data. The breakage is that users will be unable to CREATE new contracts until a replacement policy is added.

**Verdict: SAFE TO DROP only because 0 rows exist. MUST add replacement policy immediately (same migration) or accept that contract creation is temporarily disabled.**

### 4. `integrations` -- DROP WILL CAUSE OUTAGE

| Aspect | Detail |
|--------|--------|
| Row count | 1 (Asaas integration with encrypted credentials) |
| Remaining policies | "Users can view integrations" -- SELECT only, USING(`is_admin()`) |
| Code references | **29+ queries across 15+ route files** |
| Client type used | `createClient()` (RLS) in ALL Asaas routes, settings page, save route, Wise routes |

**After DROP, the following will break for non-admin users (role = 'sdr', 6 of 8 users):**

- `/api/integrations/asaas/payments` -- Cannot fetch Asaas credentials -> all payment operations fail
- `/api/integrations/asaas/charges` -- Cannot create/list charges
- `/api/integrations/asaas/subscriptions` -- Cannot manage subscriptions
- `/api/integrations/asaas/customers` -- Cannot sync/create Asaas customers
- `/api/integrations/asaas/clients-status` -- Cannot check payment statuses
- `/api/integrations/asaas/sync` -- Cannot sync data
- `/api/integrations/asaas/billing` -- Cannot view billing
- `/api/integrations/asaas/charges/list` -- Cannot list charges
- `/api/integrations/wise/balances` -- Cannot view Wise balances
- `/api/integrations/wise/transactions` -- Cannot view Wise transactions
- `/api/dashboard/financial-summary` -- Cannot load financial dashboard
- `/settings/integrations` (client-side page) -- Cannot list integrations
- `/api/integrations/save` -- Cannot save/update/delete integrations (INSERT/UPDATE/DELETE blocked for ALL users, including admins, since remaining policy is SELECT-only)

**Even for admins:** After DROP, the remaining policy only allows SELECT. No admin can INSERT, UPDATE, or DELETE integrations. The `/api/integrations/save` POST and DELETE endpoints will fail for everyone.

**Verdict: UNSAFE TO DROP without replacement policy. Will cause production outage.**

---

## Phase 2: Completeness Assessment -- Does P0 Close the Leak?

**NO.** The P0 hotfix is necessary but insufficient for the following reasons:

### Problem A: `is_admin()` is NOT org-scoped

The `is_admin()` function checks:
```sql
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

This is a **global** admin check. If a second organization is ever created, an admin in Org A passes `is_admin()` and can see all data from Org B. This affects:
- `integrations` remaining SELECT policy
- `deals` SELECT policy
- `reports` admin policy
- Any other policy using `is_admin()`

### Problem B: `integrations` has no `org_id` column

Even after adding proper policies, there is no `org_id` to scope by. The portal invoices route already tries `.eq("org_id", ...)` which silently returns empty because the column does not exist.

### Problem C: Asaas routes have no org validation

All 10+ Asaas routes query `integrations` with only `.eq("type", "asaas").eq("is_active", true).single()`. No org filtering. If a second Asaas integration were added for another org, `.single()` would fail with "multiple rows returned" rather than returning the wrong one -- but this is an error, not a security control.

### Problem D: `can_access_client()` gives admin global access

The `can_access_client()` function has:
```sql
IF is_admin() THEN RETURN true; END IF;
```

Any admin can access any client in any org. This affects the `reports` policy.

---

## Phase 3: Risk Assessment

| Factor | Current State | After Second Org |
|--------|--------------|------------------|
| Orgs in production | 1 | 2+ |
| Cross-tenant risk | Theoretical (single-tenant) | CRITICAL |
| Users affected by outage | 6 non-admin SDRs | Same |
| Financial data at risk | Asaas credentials (1 row) | All org credentials |
| Contracts at risk | 0 rows | Active contracts |

**Current real-world risk is LOW** because there is only 1 organization. The bypass policies are bad practice but not actively leaking data to unauthorized parties today. This means we have time to do the fix correctly rather than rushing a broken hotfix.

---

## Phase 4: Revised Plan Recommendation

### P0-REVISED: Safe Immediate Migration (single SQL migration)

```sql
-- 1. SAFE: Drop bypass on deals (granular policies exist)
DROP POLICY "Authenticated users can manage deals" ON deals;

-- 2. SAFE: Drop bypass on reports (granular policies exist)
DROP POLICY "Authenticated users can manage reports" ON reports;

-- 3. SAFE: Drop bypass on contracts + add replacement
DROP POLICY "Authenticated users can manage contracts" ON contracts;
CREATE POLICY "org_members_manage_contracts" ON contracts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = contracts.client_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = contracts.client_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  );

-- 4. REQUIRES CARE: Drop bypass on integrations + add replacement
DROP POLICY "Authenticated users can manage integrations" ON integrations;

-- Add org_id column first
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- Backfill existing row(s) with the single org
UPDATE integrations SET org_id = (SELECT id FROM organizations LIMIT 1)
  WHERE org_id IS NULL;

-- Replace the admin-only SELECT with org-scoped policies
DROP POLICY "Users can view integrations" ON integrations;

CREATE POLICY "org_members_select_integrations" ON integrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = integrations.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  );

CREATE POLICY "admin_manage_integrations" ON integrations
  FOR ALL
  TO authenticated
  USING (
    is_admin() AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = integrations.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    is_admin() AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = integrations.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  );
```

### P1: Fix `is_admin()` to be org-scoped (HIGH priority)

The `is_admin()` function must be updated to check org membership, not just profile role. This is a cross-cutting concern affecting many policies.

### P2: Fix Asaas routes to filter by org_id

After `integrations` has `org_id`, all routes should add `.eq("org_id", userOrgId)` to their queries.

### P3: Fix `can_access_client()` admin bypass

Remove the blanket `IF is_admin() THEN RETURN true` and replace with org-scoped admin check.

### P4: Fix portal invoices route

The `.eq("org_id", clientData.org_id)` filter silently fails today because the column does not exist. After P0-REVISED adds the column, this will work correctly.

---

## Phase 5: Verification Checklist

Before applying the migration, verify:

- [ ] Run migration on a Supabase branch first (not production)
- [ ] Test that SDR users can still query integrations (Asaas payments page)
- [ ] Test that SDR users can still view contracts in client detail
- [ ] Test that admin users can still save/update integrations in settings
- [ ] Test that deals pipeline still works for pipeline_members
- [ ] Verify portal invoices route works with new org_id column
- [ ] Confirm no RPC functions reference the dropped policy names

---

## Gate Decision

### FAIL

**Reason:** The proposed P0 hotfix as written will:

1. **Break production** for 6 of 8 users (all non-admins lose access to financial features)
2. **Break admin functionality** for integration management (INSERT/UPDATE/DELETE blocked for all users)
3. **Not fully close the vulnerability** (is_admin is globally scoped, integrations lacks org_id)
4. Leave `contracts` table completely inaccessible (acceptable only because 0 rows)

### Required Actions Before Approval:

1. Replace the 4-statement DROP with the P0-REVISED migration above (DROP + replacement policies in same transaction)
2. Add `org_id` to `integrations` table in the same migration
3. Backfill the single existing integration row
4. Test on a Supabase branch before applying to production
5. Plan P1 (is_admin scope fix) as immediate follow-up

### Risk if Original P0 is Applied As-Is:

- **Probability of outage:** 100% (non-admin users lose all Asaas access)
- **Impact:** HIGH (financial operations, payment tracking, billing all fail)
- **Time to detect:** Minutes (first non-admin user to load dashboard)
- **Rollback complexity:** LOW (re-create the 4 policies with same names)

---

*-- Quinn, guardiao da qualidade*
