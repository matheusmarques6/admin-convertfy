# QA Review Report: Epic 25 -- Tracking System Hardening

**Reviewer:** Quinn (QA Agent)
**Date:** 2026-03-06
**Scope:** 6 stories (25.1 through 25.6) + source code validation
**Source files reviewed:**
- `src/app/api/tracking/lookup/route.ts`
- `src/lib/tracking/carriers.ts`
- `src/lib/services/tracking.service.ts`
- `src/app/api/script/widget.js/route.ts`

---

## Executive Summary

The Epic is well-structured with clear prioritization. The critical security fix (25.1) is correctly placed first. However, I identified **14 issues** across the 6 stories, including **3 HIGH** severity gaps that must be addressed before implementation to avoid incomplete fixes or regressions.

| Story | Verdict | Issues |
|-------|---------|--------|
| 25.1 | CONCERNS | 4 issues (1 HIGH, 2 MEDIUM, 1 LOW) |
| 25.2 | CONCERNS | 2 issues (1 HIGH, 1 MEDIUM) |
| 25.3 | PASS | 1 issue (1 LOW) |
| 25.4 | CONCERNS | 3 issues (1 HIGH, 1 MEDIUM, 1 LOW) |
| 25.5 | PASS | 2 issues (2 LOW) |
| 25.6 | CONCERNS | 2 issues (1 MEDIUM, 1 LOW) |

**Epic Verdict: CONCERNS -- addressable, does not block start of development**

---

## Story 25.1 -- Fix PostgREST Filter Injection

**Verdict: CONCERNS**

### What is correct

- The vulnerability analysis is accurate. Line 241 of `lookup/route.ts` confirms the raw `.or()` interpolation.
- The fix approach (split into two parametrized queries) is the right solution.
- Cross-tenant risk is correctly assessed as mitigated by the `.eq("tracking_store_id")` AND filter.
- Lines 221 and 260 are correctly identified as safe (SDK parametrizes `.ilike()` and `.eq()` individually).

### Issues Found

**I1 (HIGH) -- Line 260 uses raw `query`, not `cleanQuery`, and has no LIKE escape**

The story's AC 25.1.3 says to apply `escapePostgrestLike()` on line 260. However, the actual code at line 260 is:
```typescript
.ilike("tracking_number", `%${query}%`)
```
Note: this uses `query` (the raw user input), NOT `cleanQuery`. The `cleanQuery` variable only strips the `#` prefix and is used in the order number path. In the tracking code path (the `else` branch starting at line 255), `cleanQuery` is never referenced.

The story must clarify: apply BOTH `sanitizePostgrestValue()` AND `escapePostgrestLike()` to `query` in line 260. While `.ilike()` is parametrized by the SDK (so no injection), the LIKE wildcards `%` and `_` in user input can cause unintended broad matches.

**I2 (MEDIUM) -- Sanitization regex strips characters valid in international tracking numbers**

AC 25.1.1 proposes: `input.replace(/[^a-zA-Z0-9\s\-#]/g, "")`. This strips dots and underscores, which are acceptable in tracking numbers and order names. More critically, it strips accented characters (e.g., Portuguese names in `order_name`). Consider:
- For `shopify_order_number` (numeric): the strict regex is fine.
- For `order_name` (`.ilike`): names may contain accented chars. The `.ilike()` path uses SDK parametrization, so the only risk is LIKE wildcards. Use `escapePostgrestLike()` instead of `sanitizePostgrestValue()` for the `ilike` query.

**Recommendation:** Apply `sanitizePostgrestValue()` only to the `.eq("shopify_order_number", ...)` query. Apply `escapePostgrestLike()` (not the full sanitizer) to the `.ilike("order_name", ...)` query. This preserves legitimate search while preventing injection.

**I3 (MEDIUM) -- Missing test scenario: Unicode/encoded payloads**

The 4 test scenarios cover basic injection but miss:
- URL-encoded payloads: `q=%2Ccustomer_email.neq.null` (the `,` arrives decoded from query string)
- Double-encoding: `q=%252C...`
- Unicode homoglyphs for dots/commas

Add at least one scenario for URL-encoded injection to confirm the sanitization happens AFTER URL decoding (which it does, since `searchParams.get()` auto-decodes).

**I4 (LOW) -- Email path also uses raw `cleanQuery` in `.ilike()`**

Line 221: `.ilike("customer_email", cleanQuery)` -- while SDK-parametrized and thus safe from injection, it has the same LIKE wildcard issue. A user searching for `%` would match all emails. Apply `escapePostgrestLike()` here too for defense-in-depth.

---

## Story 25.2 -- Global Timeout Budget + Circuit Breaker

**Verdict: CONCERNS**

### What is correct

- The timeout cascade analysis is accurate. Code confirms 8000ms timeouts on all 4 providers (carriers.ts lines 145, 223, 322, 442) and 8000ms + 2000ms sleep + 8000ms in tracking.service.ts (lines 373, 400, 404).
- The budget pattern with `deadline` and `remaining` check is solid.
- The worst-case calculation (42s current, 25s target) is mathematically correct.

### Issues Found

**I5 (HIGH) -- `trackWithBestProvider()` signature change not propagated to callers**

AC 25.2.1 adds a `globalTimeoutMs` parameter to `trackWithBestProvider()`. The current function signature (carriers.ts line 587-593) is:
```typescript
export async function trackWithBestProvider(
  trackingNumber: string,
  keys: CarrierKeys,
  trackVia17track: (numbers: string[], apiKey: string) => Promise<any[]>,
  providerOrder?: string[]
): Promise<TrackingResult | null>
```

There are at least 2 callers:
1. `lookup/route.ts` line 319 -- passes 3 args (no providerOrder)
2. `tracking.service.ts` line 647 -- passes 3 args (no providerOrder)

Adding `globalTimeoutMs` as the 5th parameter with a default is backwards-compatible. However, the story should explicitly list BOTH callers and confirm they do not need custom timeout values. The lookup endpoint may want a shorter budget (e.g., 20s) since it also has sync time after the provider chain.

**I6 (MEDIUM) -- AbortController in the budget pattern does not actually cancel in-flight fetch**

The reference code in Dev Notes creates an `AbortController` and uses `Promise.race`, but the abort signal is NOT passed to `provider.execute()`. This means when the race resolves via the abort listener, the provider's `fetch()` continues running in the background until its own individual timeout (5s) expires. The function returns `null` but the fetch is still consuming resources.

AC 25.2.4 acknowledges this as "optional/future" but it should be flagged as a known limitation in the implementation. At minimum, the individual provider timeout should be set to `Math.min(remaining, 5000)` AND the individual `AbortController` in each provider function should use the shorter value. Since each provider already creates its own `AbortController`, simply reducing the timeout value achieves effective cancellation without interface changes.

**Recommendation:** Remove AC 25.2.4 as a separate AC and instead ensure AC 25.2.2 sets each provider's individual timeout to `Math.min(remaining, 5000)` dynamically. This requires passing `remaining` to the provider functions.

---

## Story 25.3 -- Batch N+1 Queries

**Verdict: PASS**

### What is correct

- The N+1 pattern is accurately identified in all 3 paths plus sync re-read.
- The batch solution using `.in()` is the correct Supabase/PostgREST approach.
- Line numbers match the actual code (verified: lines 226-234 for email, 245-254 for order, 263-276 for tracking code, 469-481 for sync).
- The deduplication and Map-based grouping patterns are correct.

### Issues Found

**I7 (LOW) -- `.in()` has a practical limit**

Supabase/PostgREST `.in()` has a URL length limit since it encodes as query parameters. With `limit(10)` on the initial query, the `.in()` will have at most 10 UUIDs (360 chars), which is well within limits. No action needed, but worth noting as a comment in code for future maintainers who might increase the limit.

---

## Story 25.4 -- Correios/Cainiao Circuit Breaker + TrackingMore v4

**Verdict: CONCERNS**

### What is correct

- The problems are accurately described. Correios 403, Cainiao 302, TrackingMore 412 are all real failure modes.
- The `redirect: "manual"` fix for Cainiao is the correct approach.
- The content-type check before `.json()` prevents parse errors.

### Issues Found

**I8 (HIGH) -- In-memory circuit breaker state is lost on every Vercel cold start**

The story proposes module-level variables (`correiosDisabledUntil`, `cainiaoDisabledUntil`). On Vercel serverless, each function invocation may be a new instance. The circuit breaker state is effectively per-instance and resets on cold starts, which happen frequently (every few minutes of inactivity).

This means:
- After a 403, the circuit opens for that specific instance only.
- The next request may hit a different instance and retry Correios immediately.
- Under moderate traffic, many instances will independently waste 5s discovering the 403.

**Options (in order of pragmatism):**
1. **Accept the limitation** -- document that this is a "best-effort" circuit breaker that works within warm instances. Still saves time on sequential requests within the same instance. This is a valid tradeoff for the complexity level.
2. **Use Vercel KV / Upstash Redis** -- shared state across instances. Adds a dependency.
3. **Use env var `CORREIOS_ENABLED=false`** as the permanent kill switch (already in the AC) and treat the in-memory breaker as optimization-only.

**Recommendation:** Accept option 1 but the story MUST document this limitation explicitly so that future developers understand the scope. Also, option 3 (env var) should be the primary remediation for known-broken providers.

**I9 (MEDIUM) -- TrackingMore v3 vs v4 investigation is too vague for a deliverable AC**

AC 25.4.3 says "investigate if v4 works." This is research, not an acceptance criterion. It should be split:
- **Pre-work (spike):** Investigate v4 compatibility (1-2 hours, no code change).
- **AC (deliverable):** Based on spike result, implement either v4 migration OR v3 retry-without-courier-code fallback.

As written, the AC cannot be definitively checked off because the outcome is conditional.

**I10 (LOW) -- Missing test scenarios for Story 25.4**

The story has no `Cenarios de Teste (QA)` section, unlike all other stories. Add at minimum:
```gherkin
Scenario: Correios 403 triggers circuit breaker
  Given Correios returns 403
  When the next lookup request arrives within 30 minutes
  Then Correios provider should be skipped
  And log should show "Correios circuit breaker active"

Scenario: Cainiao redirect is handled gracefully
  Given Cainiao returns 302 redirect
  When tracking a CN package
  Then null is returned immediately (no following redirect)
  And circuit breaker activates for 30 minutes
```

---

## Story 25.5 -- Dead Code Cleanup + attachShadow Guard

**Verdict: PASS**

### What is correct

- Dead code identification is accurate: `generateMockEvents` (line 258), `getMockStatus` (line 309), `trackNumber` (line 481), `getMockTrackResult` (line 507) all confirmed present.
- `trackNumber` has zero external callers (Grep confirms only the declaration at line 481).
- `detectCarrier()` duplication confirmed: exists in `tracking.service.ts` (line 196) and `detectCarrierProvider()` in `carriers.ts` (line 35).
- Widget uses `mode: 'closed'` (confirmed at widget.js/route.ts line 296), which means `host.shadowRoot` returns null, making re-attach impossible without the guard.

### Issues Found

**I11 (LOW) -- `CARRIER_CODES` map should be evaluated for removal too**

AC 25.5.2 says to keep `CARRIER_NAMES` but remove `CARRIER_CODES` and `detectCarrier()`. However, `CARRIER_CODES` is used inside `trackVia17track()` (line 367-368: `detectCarrier(trackingNumber)` returns `{ code: ... }` which maps to `CARRIER_CODES`). After refactoring to use `detectCarrierProvider()`, the 17track carrier code mapping needs to come from somewhere. The story should specify creating a mapping from `detectCarrierProvider().code` to 17track numeric carrier codes.

**I12 (LOW) -- attachShadow guard: `mode: 'closed'` vs `mode: 'open'`**

The current code uses `mode: 'closed'`. The AC suggests checking `host.shadowRoot` first, but with closed mode, `shadowRoot` is always null. The story correctly notes this ("if `mode: 'closed'`, mudar para `mode: 'open'`") as an alternative. Recommendation: switch to `mode: 'open'` as the primary fix -- it is simpler, more debuggable, and the security benefit of closed mode is negligible for a tracking widget.

---

## Story 25.6 -- Unit Tests

**Verdict: CONCERNS**

### What is correct

- The test coverage targets are well-chosen: sanitization, carrier detection, status mapping, cache TTL, freshness guard.
- The test structure (separate files per module) follows best practices.
- The `@internal` export approach is pragmatic.

### Issues Found

**I13 (MEDIUM) -- Missing test category: integration/regression tests for the injection fix**

The test scenarios in 25.6.1 test the sanitization FUNCTIONS in isolation. But the critical regression test is: "given a malicious query string, does the full lookup endpoint return only expected results?" This requires an integration test (or at least a test that calls the handler with a mock Supabase client) to verify the sanitized value is actually used in the query.

Without this, someone could refactor the handler and accidentally use the raw input instead of the sanitized one, and the unit tests would still pass.

**Recommendation:** Add AC 25.6.6 for at least 2 integration-level tests:
- Injection payload through the full handler returns 400 or empty results.
- Legitimate query through the full handler returns expected results.

These can use mocked Supabase responses but must exercise the actual route handler logic.

**I14 (LOW) -- Story 25.6.3 status mapping assertions have inaccuracies**

Checking against the actual code:

- `mapTrackingMoreStatus("exception")` -- story says `"exception"` but code returns `"alert"` (carriers.ts line 406). The test expectation should be `"alert"`.
- `mapTrackingMoreStatus("notfound")` -- story says `"pending"`, code returns `"pending"` -- correct.
- `inferCorreiosStatus("Objeto em transito")` -- story says `"in_transit"`, but the function normalizes accents. The input should be tested both with and without accents.
- `mapSeventeenTrackStatus` -- story says test with `{ track_info: { latest_status: { status: "Delivered" } } }`, which is correct. But also test the fallback path using `{ tag: "InTransit" }` when `track_info` is missing.

---

## Cross-Story Analysis

### Dependencies

| Dependency | From | To | Documented? |
|------------|------|----|-------------|
| Sanitization functions | 25.1 | 25.6 (tests) | Yes |
| Timeout changes | 25.2 | 25.4 (circuit breaker skips) | Implicit only |
| Dead code removal | 25.5 | 25.6 (export internals) | No |
| Provider signature changes | 25.2 | 25.4 (canRun changes) | No |

**Gap:** Stories 25.2 and 25.4 both modify `carriers.ts` and both change how providers are selected/executed. If implemented by different developers or in different PRs, merge conflicts are guaranteed. The epic should note that 25.2 must be merged BEFORE 25.4 starts.

**Gap:** Story 25.5 removes dead code and refactors exports. Story 25.6 adds tests that import from those modules. If 25.5 lands first and changes export names, 25.6's test file paths and import names may need updating. These should be explicitly sequenced: 25.5 before 25.6.

### Overlap

- Stories 25.2 and 25.4 both modify `carriers.ts` provider behavior. No functional overlap, but high merge conflict risk.
- Stories 25.1 and 25.3 both modify `lookup/route.ts`. The `.or()` removal in 25.1 changes the order number path that 25.3 also modifies. Sequencing: 25.1 first, then 25.3.

### Prioritization Assessment

The current prioritization is:
1. Immediate: 25.1 (security)
2. Sprint 1: 25.2, 25.3 (performance/reliability)
3. Sprint 2: 25.4, 25.6 (external APIs + tests)
4. Sprint 3: 25.5 (cleanup)

**Assessment: Mostly correct, with one adjustment.**

25.6 (tests) should be moved to Sprint 1, executed IN PARALLEL with 25.2/25.3. The sanitization tests (25.6.1) directly protect the security fix from 25.1. Waiting until Sprint 2 means the most critical fix runs without regression protection for an entire sprint.

Suggested order:
1. **Immediate:** 25.1 + 25.6.1 (security fix + its tests together)
2. **Sprint 1:** 25.2, 25.3, 25.6.2-25.6.5 (remaining tests)
3. **Sprint 2:** 25.4
4. **Sprint 3:** 25.5

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Injection fix incomplete (I1) | HIGH | CRITICAL | Address I1/I2 before dev starts |
| Timeout budget breaks existing behavior | MEDIUM | HIGH | Test with real providers before deploy |
| Circuit breaker useless on Vercel (I8) | HIGH | LOW | Document limitation, use env var as primary |
| Merge conflicts 25.2/25.4 | HIGH | MEDIUM | Enforce sequencing: 25.2 before 25.4 |
| TrackingMore v4 investigation delays sprint | MEDIUM | MEDIUM | Timebox spike to 2 hours |
| Dead code removal breaks hidden caller | LOW | HIGH | Grep confirms zero external callers |
| Tests give false confidence without integration coverage (I13) | MEDIUM | MEDIUM | Add integration test AC |

---

## Summary of Required Actions

### Must-fix before development (3 items)

1. **I1 (HIGH):** Story 25.1 AC 25.1.3 -- clarify that line 260 uses `query` not `cleanQuery`. Apply both sanitization AND LIKE escape to the raw `query` variable.
2. **I5 (HIGH):** Story 25.2 -- list both callers of `trackWithBestProvider()` and confirm the lookup endpoint should use a shorter budget (20s instead of 25s) to leave room for sync.
3. **I8 (HIGH):** Story 25.4 -- document that in-memory circuit breaker is per-instance on Vercel. Position env var as the primary mechanism for known-broken providers.

### Should-fix (5 items)

4. **I2 (MEDIUM):** Story 25.1 -- differentiate sanitization strategy between `.eq()` (strict) and `.ilike()` (LIKE escape only) to preserve accented characters.
5. **I3 (MEDIUM):** Story 25.1 -- add URL-encoded injection test scenario.
6. **I6 (MEDIUM):** Story 25.2 -- clarify that the abort pattern does not cancel in-flight fetches; ensure individual timeouts use `Math.min(remaining, 5000)`.
7. **I9 (MEDIUM):** Story 25.4 -- split TrackingMore AC into spike + deliverable.
8. **I13 (MEDIUM):** Story 25.6 -- add integration-level regression test for the injection fix.

### Nice-to-have (6 items)

9. **I4 (LOW):** Add LIKE escape to email path (line 221).
10. **I7 (LOW):** Document `.in()` URL length consideration.
11. **I10 (LOW):** Add test scenarios section to Story 25.4.
12. **I11 (LOW):** Clarify CARRIER_CODES mapping strategy after detectCarrier removal.
13. **I12 (LOW):** Switch widget shadow DOM to `mode: 'open'`.
14. **I14 (LOW):** Fix status mapping test expectations to match actual code.

---

## Final Verdict

**EPIC 25: CONCERNS -- Proceed with development after addressing the 3 HIGH items.**

The epic is well-conceived, accurately reflects the codebase, and addresses real vulnerabilities and performance problems. The prioritization is sound with the minor adjustment of moving test story 25.6.1 alongside 25.1. The 3 HIGH issues are all spec clarifications (not fundamental design problems) and can be resolved in a single pass before development begins.

-- Quinn, guardiao da qualidade
