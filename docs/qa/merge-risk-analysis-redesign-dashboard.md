# Merge Risk Analysis: `origin/claude/redesign-admin-dashboard-dZHCo` into `main`

**Date:** 2026-03-12
**Analyst:** Quinn (QA)
**Gate Decision:** FAIL -- DO NOT MERGE without resolution

---

## Executive Summary

The branch performs a **massive route restructure** (renaming `(dashboard)/` to `admin/` and `portal/` to `client/`) plus UI redesign across 212 files. Main meanwhile added 9 commits with significant new features (Epics 35-37: portal bug fixes, onboarding UX redesign, approval enhancements). The result is a **catastrophic collision**: the branch deletes 34 files that main created or modified, including **4 database migrations already applied in production** and **13 critical source files**.

**Verdict:** This merge will produce delete/modify conflicts on 34 files. Even if resolved manually, the branch is missing all Epic 35-37 feature code and would cause **data loss + broken functionality** if merged.

---

## 1. Conflict Inventory

### 1.1 CRITICAL -- Deleted Migrations (4 files)

The branch does NOT contain these 4 migrations that exist on main and are **already applied in production**:

| File | Purpose | Risk |
|------|---------|------|
| `20260312_create_client_portal_activity.sql` | Creates `client_portal_activity` table | Table used by portal routes |
| `20260312_fix_cascade_and_rejection_rpc.sql` | Fixes 3 missing ON DELETE CASCADE + rejection RPC | Data integrity constraints |
| `20260312_fix_handle_new_user_skip_portal.sql` | Fixes `handle_new_user` trigger to skip portal users | Prevents orphan profiles bug |
| `20260313_onboarding_edit_log_and_constraints.sql` | Creates `onboarding_edit_log` table + NOT NULL constraints | COO edit audit trail |

**Severity:** CRITICAL
**Impact:** Deleting these migration files from the repo does NOT drop the tables from production (migrations are tracked in `supabase_migrations.schema_migrations`), but it creates a **divergence** between the codebase and the database schema. Fresh environments and CI will fail. Code referencing these tables (`onboarding_edit_log`, `client_portal_activity`, `onboarding_rejection_log.comments NOT NULL`) will break.

### 1.2 CRITICAL -- Deleted Source Files With Active Feature Code (13 files)

Files that main ADDED or MODIFIED (with new feature logic) but the branch DELETES:

| File | What main added | Branch equivalent exists? |
|------|----------------|--------------------------|
| `src/app/api/onboarding/[id]/edit/route.ts` | NEW: COO inline edit API (Epic 37.3) | NO |
| `src/app/cliente/onboarding/page.tsx` | NEW: Public onboarding page renamed from `/public/` | NO |
| `src/app/portal/onboarding/wizard/page.tsx` | MAJOR: +840 lines diff (Shopify tutorial step, token validation, stepper redesign) | YES -- but stale copy at `client/onboarding/wizard/page.tsx` (missing all Epic 36 changes) |
| `src/components/onboarding/stepper.tsx` | NEW: Unified stepper component (+98 lines, Epic 36.6/36.11) | NO |
| `src/components/ui/command.tsx` | NEW: cmdk UI component | NO |
| `src/components/ui/cpf-cnpj-input.tsx` | NEW: CPF/CNPJ mask input (Epic 36.8) | NO |
| `src/components/ui/phone-input.tsx` | NEW: International phone input component | NO |
| `src/lib/constants/onboarding.ts` | NEW: Shared onboarding constants (Epic 36.1) | NO |
| 23x `docs/stories/*.md` | All Epic 35/36/37 story files | NO |

**Severity:** CRITICAL
**Impact:** Merging this branch will **delete all Epic 35, 36, and 37 feature code** from the repository. These features are already in production.

### 1.3 HIGH -- Conflicting Middleware Changes (2 files)

#### `src/middleware.ts`
- **Main:** Renamed `/public/:path*` to `/cliente/:path*` in matcher
- **Branch:** Replaced all individual route matchers with `/admin/:path*` and `/client/:path*`, removed `/portal/:path*`, kept `/public/:path*`
- **Conflict type:** Both modify the same `config.matcher` array -- incompatible changes
- **Resolution complexity:** MEDIUM -- must merge both approaches

#### `src/lib/supabase/middleware.ts`
- **Main:** Added `isPortalOnlyUser()` helper function with DB query to `org_members`, added 3 portal-user redirect guards (Epic 35.2 security fix)
- **Branch:** Renamed all `portal` references to `client`, changed redirect targets from `/dashboard` to `/admin/dashboard`
- **Conflict type:** Both modify the same function body in incompatible ways
- **Resolution complexity:** HIGH -- main's security logic must be preserved AND adapted to branch's new route names

### 1.4 HIGH -- Divergent Feature Files (5 files modified on both sides)

| File | Main change | Branch change | Conflict? |
|------|------------|---------------|-----------|
| `src/components/onboarding/onboarding-approvals.tsx` | +849 lines: mandatory confirmation dialog, humanized rejection, COO inline edit (Epic 37) | 1 line: link `/stores/` to `/admin/stores/` | YES -- different regions, but main adds imports from deleted files (`onboarding.ts` constants) |
| `src/lib/services/portal-account.service.ts` | Added `client_id` to user_metadata (Epic 35.3) | Changed login URL from `/portal/login` to `/client/login` | YES -- different lines, may auto-merge but both changes are needed |
| `src/app/api/onboarding/[id]/approve/route.ts` | +100 lines: mandatory comments validation, rejection cleanup logic (Epic 37.1) | 1 line: notification link `/portal/onboarding` to `/client/onboarding` | YES -- different regions, likely auto-mergeable |
| `package.json` / `package-lock.json` | Added `react-phone-number-input`, `libphonenumber-js` dependencies | No changes (branch diverged before these were added) | CLEAN -- main's additions will apply |

### 1.5 MEDIUM -- Route Structure Fundamental Incompatibility

The branch restructures the entire app:
- `src/app/(dashboard)/*` (54 files) -> `src/app/admin/*` (54 files)
- `src/app/portal/*` (38 files) -> `src/app/client/*` (38 files)
- Adds `next.config.mjs` redirects for backward compatibility

Main keeps the original structure. The merge will result in **BOTH structures coexisting**: `(dashboard)/` from main + `admin/` from branch, which means **duplicate pages** and broken routing.

### 1.6 LOW -- Story Documentation (23 files)

All 23 story files from Epics 35, 36, 37 are deleted by the branch. These are documentation only but represent important project history.

---

## 2. Merge Dry-Run Results

```
git merge-tree output:
- 92 "removed in remote" entries (branch deletes files main has)
- 5 "changed in both" entries (textual conflicts requiring manual resolution)
- 0 "added in both" entries
```

The merge will NOT be clean. Git will flag at minimum the 5 "changed in both" files as conflicts, and the 34 delete/modify cases will silently accept the branch's deletion unless `--no-commit` is used and manually reviewed.

---

## 3. Risk Matrix

| Risk | Probability | Impact | Score | Category |
|------|------------|--------|-------|----------|
| Production features deleted (Epic 35-37) | 100% | CRITICAL | P1 | Data/Feature Loss |
| Migration files deleted | 100% | CRITICAL | P1 | Schema Divergence |
| Portal security guard lost (isPortalOnlyUser) | 100% | HIGH | P2 | Security |
| Duplicate route structures coexist | 100% | HIGH | P2 | Broken Routing |
| onboarding-approvals.tsx breaks (missing constants import) | 100% | HIGH | P2 | Build Failure |
| New UI components lost (stepper, phone-input, cpf-cnpj) | 100% | MEDIUM | P3 | Feature Regression |

---

## 4. Recommended Resolution Strategy

### Option A: Rebase Branch on Main (RECOMMENDED)

1. Create a new branch from current `main`
2. Cherry-pick or manually reapply the branch's changes:
   - Route restructure: `(dashboard)` -> `admin`, `portal` -> `client`
   - UI redesign changes (sidebar, dashboard, stores page)
   - `next.config.mjs` redirects
3. Adapt all Epic 35-37 code to the new route structure
4. Re-add all 4 migrations
5. Re-add all deleted UI components and constants
6. Full QA pass before merge

**Effort estimate:** 4-8 hours
**Risk:** LOW -- preserves all production code

### Option B: Merge Main into Branch First

1. `git merge main` into the branch
2. Resolve all 34+ conflicts manually:
   - Keep all migration files from main
   - Keep all new source files from main
   - Adapt main's code to branch's route structure
   - Merge middleware changes carefully
3. Verify build passes
4. Full QA pass

**Effort estimate:** 3-6 hours
**Risk:** MEDIUM -- conflict resolution is error-prone with this volume

### Option C: Abandon Branch, Redo Route Restructure on Main

1. Document the route rename plan from the branch
2. Apply route restructure incrementally as a proper story on current main
3. Carry over UI redesign separately

**Effort estimate:** 2-4 hours
**Risk:** LOWEST -- cleanest approach, no conflict resolution needed

---

## 5. Critical Warnings

1. **DO NOT** merge this branch as-is. It will delete production features and migrations.
2. **DO NOT** use `git merge --strategy=theirs` -- it will wipe Epic 35-37 entirely.
3. The branch was created from `d7b70ae` which is 9 commits behind main. It has NO awareness of Epics 35, 36, or 37.
4. The `isPortalOnlyUser()` security guard in middleware (Epic 35.2) is a **security-critical fix** that prevents portal users from accessing admin routes. Losing it reopens a security vulnerability.
5. The 4 migrations are already applied in production. Their removal from the repo creates schema drift.

---

*Quinn, guardiao da qualidade*
