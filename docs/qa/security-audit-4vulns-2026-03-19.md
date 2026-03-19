# Security Audit Report: 4 Vulnerability Validation & Test Plan

**Date:** 2026-03-19
**Auditor:** Quinn (QA Agent)
**Scope:** 4 reported vulnerabilities in API routes + RLS policies
**Overall Assessment:** All 4 vulnerabilities **CONFIRMED**. 1 additional vulnerability discovered.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vuln 1: RLS USING(true) on store_feedback_calls](#vuln-1)
3. [Vuln 2: IDOR in /api/onboarding/store-data](#vuln-2)
4. [Vuln 3: OAuth Authorize accepts arbitrary store_id](#vuln-3)
5. [Vuln 4: /api/integrations/save missing requireStoreAccess](#vuln-4)
6. [Vuln 5 (NEW): store_onboarding_data RLS not verified](#vuln-5)
7. [Priority Matrix](#priority-matrix)
8. [Quality Gates](#quality-gates)

---

## Executive Summary {#executive-summary}

| ID | Severity | Status | CVSS-like Score | Effort to Fix |
|----|----------|--------|-----------------|---------------|
| V1 | HIGH | CONFIRMED | 7.5 | LOW |
| V2 | HIGH | CONFIRMED | 8.1 | MEDIUM |
| V3 | HIGH | CONFIRMED | 8.5 | MEDIUM |
| V4 | MEDIUM | CONFIRMED (partially mitigated) | 5.5 | LOW |
| V5 | MEDIUM | NEW FINDING | 6.0 | LOW |

**Current state:** Single-org deployment (8 users, 2 admins). Cross-tenant exploitation is theoretical but the vulnerabilities are real and exploitable the moment a second org is created.

**Mitigating factor for V3:** OAuth state is stored in httpOnly cookie and validated on callback. An attacker would need to initiate the OAuth flow themselves (not just craft a callback URL). The `store_id` is embedded in the state, so the callback trusts whatever `store_id` the authorize endpoint accepted. The attack requires the attacker to be an authenticated user who initiates OAuth for a store they do not own.

---

## Vuln 1: RLS `USING(true)` on `store_feedback_calls` {#vuln-1}

### Confirmation

**CONFIRMED.** Evidence:

1. `supabase/migrations/20250107_store_feedback_control.sql` lines 39-46 create three policies with `USING (true)` / `WITH CHECK (true)` for SELECT, INSERT, UPDATE on role `authenticated`.
2. `supabase/migrations/20250215_fix_rls_using_true.sql` does NOT mention `store_feedback_calls` at all (verified via grep -- zero matches).
3. `src/app/api/stores/feedback/route.ts` uses `createClient()` (user RLS client) but has NO auth check (`requireAuth` is never called). The RLS policies themselves allow everything, making the route fully open.
4. The PATCH handler updates `client_stores` via the same RLS client -- the `client_stores` table WAS fixed in the 20250215 migration, so PATCH may fail for non-org-members. But the feedback table itself is wide open.

### Additional Issues Found in This File

- **No DELETE policy** -- `store_feedback_calls` has no DELETE policy, which means no authenticated user can delete records. This is likely intentional but should be documented.
- **No `org_id` column** on `store_feedback_calls` -- the table only has `store_id` and `client_id`. RLS policies will need to join through `client_stores` to check org membership.

### Test Scenarios

```
SCENARIO V1-NEG-1: Cross-org feedback read
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A calls GET /api/stores/feedback?store_id=<S1_id>
  THEN response MUST be 403 Forbidden (or empty array with no S1 data)

SCENARIO V1-NEG-2: Unauthenticated feedback access
  GIVEN no authentication cookie/token
  WHEN calling GET /api/stores/feedback?store_id=<any>
  THEN response MUST be 401 Unauthorized

SCENARIO V1-NEG-3: Cross-org feedback insert
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A calls POST /api/stores/feedback with store_id=<S1_id>
  THEN response MUST be 403 Forbidden

SCENARIO V1-NEG-4: Cross-org PATCH settings
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A calls PATCH /api/stores/feedback with store_id=<S1_id>
  THEN response MUST be 403 Forbidden

SCENARIO V1-POS-1: Same-org feedback read
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  AND User A has can_view access to S1
  WHEN User A calls GET /api/stores/feedback?store_id=<S1_id>
  THEN response contains feedback calls for S1 only

SCENARIO V1-POS-2: Same-org feedback insert
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  AND User A has can_edit access to S1
  WHEN User A calls POST /api/stores/feedback with valid data for S1
  THEN feedback call is created successfully
  AND next_feedback_date is auto-updated via trigger
```

### Acceptance Criteria for Fix

- [ ] AC1: RLS policies on `store_feedback_calls` replaced with org-scoped checks (e.g., `store_id IN (SELECT id FROM client_stores WHERE can_access_store(id))`)
- [ ] AC2: `requireAuth()` added to all handlers (GET, POST, PATCH)
- [ ] AC3: `requireStoreAccess(storeId, user.id)` called before any data operation
- [ ] AC4: POST and PATCH require `can_edit` permission
- [ ] AC5: GET returns only feedback for stores the user can access
- [ ] AC6: Migration created to DROP old policies and CREATE new org-scoped ones

### Regression Risks

- **Trigger function** `update_next_feedback_date()` runs as SECURITY DEFINER implicitly (trigger context). Verify it still works after RLS policy change.
- **Joined queries** in GET (profiles, client_stores, clients) -- ensure RLS on joined tables does not cause empty results for legitimate users.
- **PATCH on client_stores** -- already has proper RLS via the 20250215 fix; adding `requireStoreAccess` is defense-in-depth.

---

## Vuln 2: IDOR in `/api/onboarding/store-data` {#vuln-2}

### Confirmation

**CONFIRMED.** Evidence:

1. `src/app/api/onboarding/store-data/route.ts` line 17: `requireAuth(supabase)` only checks authentication (user has a valid session). It does NOT check org membership or store access.
2. Lines 26-27: `createAdminClient()` is used for ALL data queries, completely bypassing RLS.
3. Lines 31-37 (GET): Accepts `store_id` from query params, fetches from `client_stores` via adminClient with no ownership check.
4. Lines 74-81 (GET): Fetches PII from `clients` table (name, email, phone, cpf_cnpj, company) using the resolved `client_id` -- no org check.
5. Lines 115-126 (POST): Accepts `store_id` from body, verifies the store EXISTS but not that the authenticated user has access.
6. Lines 130-138 (POST): If `client_id` is provided without `store_id`, fetches client via adminClient with no org check -- can create stores under another org's client.

### Additional Issues Found in This File

- **Client PII exposure** (line 77): `cpf_cnpj` (Brazilian tax ID -- highly sensitive PII) is returned with no access control.
- **Store creation under foreign client** (lines 151-173): If an attacker provides `client_id` of a client in another org, a new store is created under that client with the attacker's desired data.

### Test Scenarios

```
SCENARIO V2-NEG-1: Cross-org store data read via store_id
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A calls GET /api/onboarding/store-data?store_id=<S1_id>
  THEN response MUST be 403 Forbidden

SCENARIO V2-NEG-2: Cross-org client PII read via client_id
  GIVEN User A is authenticated in Org A
  AND Client C1 belongs to Org B
  WHEN User A calls GET /api/onboarding/store-data?client_id=<C1_id>
  THEN response MUST be 403 Forbidden
  AND no PII (name, email, phone, cpf_cnpj) from C1 is returned

SCENARIO V2-NEG-3: Cross-org store creation via POST
  GIVEN User A is authenticated in Org A
  AND Client C1 belongs to Org B
  WHEN User A calls POST /api/onboarding/store-data with client_id=<C1_id>
  THEN response MUST be 403 Forbidden
  AND no store is created under C1

SCENARIO V2-NEG-4: Cross-org store data write via store_id
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A calls POST /api/onboarding/store-data with store_id=<S1_id> and modified data
  THEN response MUST be 403 Forbidden
  AND S1 data is unchanged

SCENARIO V2-POS-1: Same-org store data read
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  AND User A has can_manage_onboarding access to S1
  WHEN User A calls GET /api/onboarding/store-data?store_id=<S1_id>
  THEN response contains store, onboarding_data, and client data

SCENARIO V2-POS-2: Same-org store data write
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  AND User A has can_manage_onboarding access to S1
  WHEN User A calls POST /api/onboarding/store-data with valid data for S1
  THEN data is saved successfully
```

### Acceptance Criteria for Fix

- [ ] AC1: GET with `store_id` calls `requireStoreAccess(storeId, user.id)` before any data fetch
- [ ] AC2: GET with `client_id` resolves org membership and verifies user belongs to same org as client
- [ ] AC3: POST with `store_id` calls `requireStoreAccess(storeId, user.id, "can_manage_onboarding")`
- [ ] AC4: POST with `client_id` verifies user belongs to same org as client before creating/updating store
- [ ] AC5: N8N trigger payload does not leak PII outside the system (verify callback URL is internal)
- [ ] AC6: No `cpf_cnpj` or PII returned to users without proper org access

### Regression Risks

- **Onboarding wizard flow**: This endpoint is used during portal onboarding. Portal users authenticate via `client_portal_users`, not via `profiles`/`org_members`. The fix must NOT break portal onboarding -- portal users may need a separate code path or the fix should use org_id from the store/client rather than from `org_members`.
- **N8N briefing generation**: The fire-and-forget N8N trigger on completion must still work after adding access checks.
- **First-store creation**: When `client_id` is provided and no store exists, a new store is created. Ensure this still works for legitimate users.

---

## Vuln 3: OAuth Authorize Accepts Arbitrary `store_id` {#vuln-3}

### Confirmation

**CONFIRMED.** Evidence:

**Shopify authorize** (`src/app/api/integrations/shopify/authorize/route.ts`):
1. Line 13-15: Checks `supabase.auth.getUser()` -- authentication only.
2. Line 20: `storeId` comes directly from `searchParams.get("store_id")`.
3. Lines 55-63: `storeId` is embedded in the OAuth state (base64-encoded JSON), no ownership validation.
4. No call to `requireStoreAccess()`, no call to `resolveOrgId()`.

**Shopify callback** (`src/app/api/integrations/shopify/callback/route.ts`):
1. Lines 116-123: `updateStoreCredentials(stateData.store_id, ...)` is called with the `store_id` from the OAuth state. No `orgId` is passed to `updateStoreCredentials()`.
2. Since `updateStoreCredentials` without `orgId` option does NOT check org ownership (line 333 of credentials.service.ts: `useOrgCheck = !!options?.orgId && !options?.skipOrgCheck`), credentials are written to ANY store.

**Meta authorize** (`src/app/api/integrations/meta/authorize/route.ts`):
1. Line 21: `storeId` from query params with no validation.
2. Lines 48-55: Embedded in state, same pattern as Shopify.

**Meta callback** (`src/app/api/integrations/meta/callback/route.ts`):
1. Lines 126-137: `updateStoreCredentials(stateData.store_id, ...)` without `orgId`. Same issue.

### Attack Scenario

1. Attacker (User A in Org A) navigates to `/api/integrations/shopify/authorize?shop=attackers-shop.myshopify.com&store_id=<VICTIM_STORE_ID>`
2. Attacker completes Shopify OAuth with their own Shopify store
3. Callback writes attacker's Shopify credentials to the victim's store record
4. Next cron sync pulls data from attacker's Shopify store into victim's dashboard
5. If victim already had Shopify credentials, they are overwritten -- victim loses their integration

### Test Scenarios

```
SCENARIO V3-NEG-1: Shopify OAuth with foreign store_id
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A initiates GET /api/integrations/shopify/authorize?shop=test.myshopify.com&store_id=<S1_id>
  THEN response MUST be 403 Forbidden (redirect to error page)
  AND no OAuth flow is initiated

SCENARIO V3-NEG-2: Meta OAuth with foreign store_id
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org B
  WHEN User A initiates GET /api/integrations/meta/authorize?store_id=<S1_id>
  THEN response MUST be 403 Forbidden
  AND no OAuth flow is initiated

SCENARIO V3-NEG-3: Shopify callback with tampered state
  GIVEN a valid Shopify OAuth callback
  BUT the state cookie has been manually modified to contain a different store_id
  WHEN the callback is processed
  THEN the state validation MUST fail (cookie mismatch)
  AND no credentials are written

SCENARIO V3-POS-1: Shopify OAuth with owned store
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  AND User A has can_edit access to S1
  WHEN User A initiates Shopify OAuth for S1
  THEN OAuth completes successfully
  AND credentials are saved to S1 with orgId defense-in-depth

SCENARIO V3-POS-2: Meta OAuth with owned store
  GIVEN User A is authenticated in Org A
  AND Store S1 belongs to Org A
  WHEN User A initiates Meta OAuth for S1
  THEN OAuth completes successfully
  AND credentials are saved to S1
```

### Acceptance Criteria for Fix

- [ ] AC1: Shopify authorize calls `requireStoreAccess(storeId, user.id, "can_edit")` before initiating OAuth
- [ ] AC2: Meta authorize calls `requireStoreAccess(storeId, user.id, "can_edit")` before initiating OAuth
- [ ] AC3: Shopify callback passes `orgId` to `updateStoreCredentials()` via options: `{ orgId: stateData.org_id }`
- [ ] AC4: Meta callback passes `orgId` to `updateStoreCredentials()` via options: `{ orgId: stateData.org_id }`
- [ ] AC5: OAuth state includes `org_id` (resolved during authorize) for defense-in-depth on callback
- [ ] AC6: If `store_id` is missing or empty in Meta authorize (currently allowed on line 52), redirect to error

### Regression Risks

- **OAuth flow interruption**: Adding `requireStoreAccess` to the authorize endpoint means the redirect to the OAuth provider only happens if the user has access. If `requireStoreAccess` throws, the user gets a generic error redirect. Ensure error message is user-friendly (e.g., "You don't have permission to connect this store").
- **State cookie expiry**: Meta callback checks 10-minute expiry (line 49). Shopify does not. Both should have consistent expiry checks.
- **Meta allows empty store_id** (line 52: `storeId || ""`): After fix, empty `store_id` should be rejected at authorize time.

---

## Vuln 4: `/api/integrations/save` Missing `requireStoreAccess` {#vuln-4}

### Confirmation

**CONFIRMED -- partially mitigated.** Evidence:

1. `src/app/api/integrations/save/route.ts` line 57: `resolveOrgId(user.id)` is called, which verifies user belongs to SOME org.
2. Line 74: `updateStoreCredentials(store_id, ..., { orgId })` passes `orgId`, which triggers the org ownership check in `updateStoreCredentials` (line 341-343 of credentials.service.ts).
3. **However**: `requireStoreAccess()` is NOT called. This means:
   - The org-level check works (prevents cross-org writes).
   - But granular permissions (`can_edit`) are NOT checked.
   - Any org member (even one without `can_edit` or `can_view` on a specific store) can write credentials to any store in their org.

### Severity Assessment

**Downgraded from original HIGH to MEDIUM** because `orgId` defense-in-depth prevents cross-org exploitation. The remaining risk is intra-org privilege escalation: a team member assigned to stores A and B (with limited permissions) could write credentials to store C in the same org.

### Test Scenarios

```
SCENARIO V4-NEG-1: Member without can_edit writes credentials
  GIVEN User A is member of Org A
  AND User A has can_view (but NOT can_edit) on Store S1
  WHEN User A calls POST /api/integrations/save with store_id=<S1_id> and Klaviyo credentials
  THEN response MUST be 403 Forbidden

SCENARIO V4-NEG-2: Member without store access writes credentials
  GIVEN User A is member of Org A
  AND User A has NO access row for Store S2
  WHEN User A calls POST /api/integrations/save with store_id=<S2_id>
  THEN response MUST be 403 Forbidden

SCENARIO V4-NEG-3: Cross-org credential write (already mitigated)
  GIVEN User A is member of Org A
  AND Store S1 belongs to Org B
  WHEN User A calls POST /api/integrations/save with store_id=<S1_id>
  THEN response MUST be 403 Forbidden (already works via orgId check)

SCENARIO V4-POS-1: Authorized member writes credentials
  GIVEN User A is member of Org A
  AND User A has can_edit on Store S1
  WHEN User A calls POST /api/integrations/save with store_id=<S1_id> and valid credentials
  THEN credentials are saved and encrypted correctly
```

### Acceptance Criteria for Fix

- [ ] AC1: `requireStoreAccess(store_id, user.id, "can_edit")` called when `store_id` is provided
- [ ] AC2: The `orgId` from `requireStoreAccess` result is used (instead of resolving separately) to avoid TOCTOU
- [ ] AC3: DELETE handler also validates store access if deleting a store-level integration

### Regression Risks

- **Low risk.** Adding `requireStoreAccess` is additive. The org-level check already exists. The only risk is if `agent_store_access` rows are not properly populated for admin/owner users -- but `requireStoreAccess` already handles admin/owner as full-access.

---

## Vuln 5 (NEW): `store_onboarding_data` RLS Not Verified {#vuln-5}

### Discovery

While analyzing V2, I found that `store_onboarding_data` is queried via `adminClient` (bypassing RLS), but the table's RLS policies were not audited. The onboarding route also UPSERTs into this table with no ownership check beyond what V2 covers.

Additionally, **`client_portal_users` may be used to access the onboarding endpoint** during the portal wizard flow. The `requireAuth()` check only validates Supabase auth -- it does not distinguish between admin users and portal users. A portal user from Client C1 could potentially call this endpoint with `client_id` of Client C2.

### Severity: MEDIUM

Same attack surface as V2 but through a different path (portal user context). The fix for V2 also fixes V5 if the access check correctly handles portal user context.

### Acceptance Criteria

- [ ] AC1: If the caller is a portal user, verify `client_id` matches their `client_portal_users.client_id`
- [ ] AC2: If the caller is an admin user, verify org membership for the target store/client
- [ ] AC3: The `store_onboarding_data` table should have proper RLS policies (even though adminClient is used, defense-in-depth)

---

## Priority Matrix {#priority-matrix}

| Priority | Vuln | Impact | Exploitability | Effort | Rationale |
|----------|------|--------|----------------|--------|-----------|
| **P0** | V3 | HIGH (credential overwrite) | MEDIUM (requires OAuth flow) | MEDIUM | Can overwrite victim store credentials, redirect data flows |
| **P0** | V2 | HIGH (PII exposure + data tampering) | HIGH (simple GET request) | MEDIUM | Exposes CPF/CNPJ, allows cross-org store creation |
| **P1** | V1 | HIGH (data leak) | HIGH (simple GET request) | LOW | Exposes feedback data cross-org, easy to fix (migration + requireAuth) |
| **P2** | V4 | MEDIUM (intra-org escalation) | LOW (requires org membership) | LOW | orgId check already in place, just missing granular permission |
| **P2** | V5 | MEDIUM (portal user escalation) | LOW (requires portal auth) | LOW | Covered by V2 fix if portal context is handled |

### Recommended Fix Order

1. **V3 + V2** (parallel, P0) -- both are cross-org with high impact
2. **V1** (P1) -- easy migration + route fix
3. **V4 + V5** (P2) -- incremental hardening

---

## Quality Gates {#quality-gates}

### Per-Fix Quality Gate (MUST PASS before merge)

| Gate | Criteria | Verification Method |
|------|----------|-------------------|
| **G1: Unit Test** | Negative test scenarios pass (403 for cross-org, 401 for unauth) | Automated test suite |
| **G2: No Regression** | Existing functionality (same-org access, onboarding wizard, OAuth flow) works | Manual smoke test |
| **G3: RLS Verification** | New migration tested via Supabase `execute_sql` with different user contexts | SQL-level test |
| **G4: Code Review** | `requireStoreAccess` or equivalent called before ALL data operations using adminClient | Manual code review |
| **G5: orgId Propagation** | All calls to `updateStoreCredentials` include `{ orgId }` in options | Grep verification |
| **G6: Portal Path** | Portal onboarding wizard still works (portal user can save their own store data) | Manual test in portal |

### Overall Security Gate (after all fixes merged)

| Criteria | PASS/FAIL |
|----------|-----------|
| All V1-V5 negative test scenarios pass | Required |
| No `USING(true)` policies remain on user-facing tables | Required |
| All routes using `createAdminClient()` have explicit access checks | Required |
| All OAuth flows validate store ownership before initiating | Required |
| All `updateStoreCredentials` calls include orgId | Required |
| Portal user isolation verified (portal user A cannot access portal user B's data) | Required |

### Gate Decision Template

After fixes are implemented, QA will issue one of:
- **PASS** -- All criteria met, merge approved
- **PASS WITH CONCERNS** -- Critical criteria met, non-blocking items documented as follow-up
- **FAIL** -- Critical criteria not met, must fix before merge

---

## Appendix: Files Requiring Changes

| File | Changes Needed |
|------|---------------|
| `src/app/api/stores/feedback/route.ts` | Add `requireAuth`, `requireStoreAccess` to all handlers |
| `src/app/api/onboarding/store-data/route.ts` | Add `requireStoreAccess` or org-check for both GET and POST |
| `src/app/api/integrations/shopify/authorize/route.ts` | Add `requireStoreAccess` before OAuth redirect |
| `src/app/api/integrations/shopify/callback/route.ts` | Pass `orgId` to `updateStoreCredentials` |
| `src/app/api/integrations/meta/authorize/route.ts` | Add `requireStoreAccess`, reject empty `store_id` |
| `src/app/api/integrations/meta/callback/route.ts` | Pass `orgId` to `updateStoreCredentials` |
| `src/app/api/integrations/save/route.ts` | Replace `resolveOrgId` + `store_id` with `requireStoreAccess` |
| `supabase/migrations/NEW` | Fix RLS on `store_feedback_calls`, audit `store_onboarding_data` |

---

*-- Quinn, guardiao da qualidade*
