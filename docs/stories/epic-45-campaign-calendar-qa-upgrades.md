# Epic 45 — Campaign Calendar QA Fixes & Architecture Upgrades

## Context

Comprehensive QA + Architecture review of the Campaign Calendar feature (client portal + admin).
Review identified 2 CRITICAL bugs, 5 HIGH issues, 8 MEDIUM improvements, and 5 LOW items.

## Source

- QA Review: Quinn (2026-03-15)
- Architecture Review: Aria (2026-03-15)

## Scope

Portal calendar: `src/app/client/campaigns/page.tsx` (1309 lines monolith)
Portal hook: `src/lib/hooks/use-portal-campaigns-calendar.ts`
Portal API: `src/app/api/portal/campaigns/route.ts`
Portal metrics API: `src/app/api/portal/campaigns/[id]/metrics/route.ts`
Admin calendar: `src/app/admin/campaigns/` (reference for shared components)
RPC: `get_portal_campaigns_with_metrics` migration

## Stories

### Phase 1 — Critical Bug Fixes
- [ ] **45.1** Fix falsy-zero data loss in campaign metrics (`||` → `??`)
- [ ] **45.2** Fix or remove broken week view navigation
- [ ] **45.3** Fix hardcoded BRL currency — read from client_stores

### Phase 2 — Data Integrity
- [ ] **45.4** Fix RPC COALESCE returning 0 instead of NULL for missing rates
- [ ] **45.5** Fix stats inconsistency (opens/clicks include non-metric campaigns)
- [ ] **45.6** Fix type safety — replace Record<string, any> with proper types

### Phase 3 — Component Decomposition
- [ ] **45.7** Extract shared calendar infrastructure (constants, date utils, transform)
- [ ] **45.8** Decompose portal page.tsx into focused components
- [ ] **45.9** Extract campaign modals (detail + day list)

### Phase 4 — API & Performance
- [ ] **45.10** Unify campaign_batches into RPC + add pagination
- [ ] **45.11** Consolidate metrics endpoint (2 queries → 1 JOIN)
- [ ] **45.12** Add org_id defense-in-depth to RPC (WhatsApp moved to 45.7)

### Phase 5 — Admin Modernization
- [ ] **45.13** Migrate admin hook to SWR + adopt shared CalendarGrid

### Phase 6 — Polish
- [ ] **45.14** URL state for filters (nuqs) + prefetch
- [ ] **45.15** Calendar accessibility (a11y) — ARIA roles, keyboard nav, focus management

## Cross-Cutting Concerns

- **RPC signature coordination**: Stories 45.4, 45.10, 45.12 ALL modify the same RPC. Execute in order; each migration must incorporate prior changes. Each must reemit REVOKE/GRANT.
- **PortalClientContext extension**: Stories 45.3 (currency) and 45.12 (org_id) both need `resolvePortalClient()` extended. Combine context changes in 45.3, reuse in 45.12.
- **batchStatusMap duplication**: API route has 2 divergent `batchStatusMap` definitions (lines ~139 and ~163). Story 45.10 must consolidate.
- **goToToday normalization**: Even after 45.2 (remove week view), `goToToday` sets `new Date()` (day=15) while navigation sets day=1. Harmless but inconsistent. Normalize in 45.2 Option B.

## Priority Order

1. 45.1 (CRITICAL, 15min) → 45.2 (CRITICAL, 1h) → 45.3 (HIGH, 30min)
2. 45.4–45.6 (data integrity, 2-3h total)
3. 45.7–45.9 (decomposition, 2-3 days)
4. 45.10–45.12 (API, 1-2 days)
5. 45.13 (admin, 1 day)
6. 45.14–45.15 (polish + a11y, 2 days)
