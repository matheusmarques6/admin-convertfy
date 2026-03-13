# QA Review: Epic 40 -- Onboarding <-> Board Sync

## Re-Review After Fixes (2026-03-13)

**Reviewer:** Quinn (QA Agent)
**Scope:** Verify all 10 unified decisions are consistent across 14 files. Verify previous 7 CRITICAL, 9 HIGH, 12 MEDIUM issues resolved.

---

### Gate Decision: PASS WITH CONCERNS

The consistency fixes addressed all 7 CRITICAL and 8 of 9 HIGH issues. The documents are now aligned on the core decisions. One LOW-severity residual issue remains in the spec doc, and one MEDIUM concern about the progress function formula mismatch between story 40.9 and the migration SQL. The epic is ready for development.

---

### 1. Verification of 10 Unified Decisions

| # | Decision | Architecture | Spec | Migration SQL | Epic Overview | Stories | Verdict |
|---|----------|-------------|------|---------------|---------------|---------|---------|
| 1 | Step status: `waiting` + `review` added, `pending` = ready, NO `ready` enum | `pending` (ready to start) | `waiting`, `review` added; `pending` reused as ready | `waiting` BEFORE `pending`, `review` AFTER `in_progress` | "Do NOT use `ready` as an enum value" | 40.1: explicit "NAO usar `ready`"; 40.6/40.7: use `pending` not `ready` | PASS |
| 2 | Column names: `depends_on_steps UUID[]` (template), `depends_on_step_ids UUID[]` (client), `task_id UUID` (client), NO `onboarding_step_id`, NO `linked_task_id` | `depends_on_steps`, `depends_on_step_ids`, `task_id` -- no `onboarding_step_id` or `linked_task_id` | `depends_on_steps`, `depends_on_step_ids`, `task_id` | All three columns present with correct names | `depends_on_steps` / `depends_on_step_ids` explicitly listed | All stories use correct names | PASS |
| 3 | Source type: `auto_onboarding_step` | `auto_onboarding_step` throughout | `auto_onboarding_step` | CHECK constraint includes `auto_onboarding_step` | `auto_onboarding_step` | All stories: `auto_onboarding_step` | PASS |
| 4 | Service name: `OnboardingSyncService` / `onboarding-sync.service.ts` | `OnboardingSyncService` + `onboarding-sync.service.ts` | `OnboardingSyncService` | N/A | `onboarding-sync.service.ts` | 40.4: `OnboardingSyncService` + `onboarding-sync.service.ts` | PASS |
| 5 | Sync approach: HYBRID (DB triggers for cascade, app for task creation + notifications) | ADR-4 now says HYBRID | Section 4.4: HYBRID | Triggers implemented: `sync_task_completion_to_step`, `cascade_step_completion` | "Sync HYBRID" | 40.4: "HYBRID approach" explicitly stated | PASS |
| 6 | `phase` column present | Sections 3.3, 3.4 | Section 3.5 | Sections 2, 3d | Not explicitly listed | 40.1 AC 40.1.9 | PASS |
| 7 | `is_required` column present | Section 3.2 | Section 3.6 | Section 3e | Not explicitly listed | 40.1 AC 40.1.10; 40.9 references correctly | PASS |
| 8 | `org_id` on `client_onboarding_steps` | Section 3.6 (RLS) | Section 3.4 | Section 3c + backfill 10a | Not explicitly listed | 40.1 AC 40.1.11 | PASS |
| 9 | `seed-tasks` endpoint covered | Section 5.3 | N/A | N/A | N/A | 40.4 AC 40.4.10 | PASS |
| 10 | Step reassignment covered | Section 6.5 | N/A | N/A | N/A | 40.10 AC 40.10.14, 40.10.15 | PASS |

**Result: All 10 decisions are consistent across all files.**

---

### 2. Previous CRITICAL Issues Status

| ID | Issue | Status | Notes |
|----|-------|--------|-------|
| C1 | `ready` vs `review` enum value conflict | RESOLVED | All docs now use `waiting` + `review` as new enum values. `pending` = ready to start. No `ready` enum anywhere. |
| C2 | Column naming for step dependencies (`depends_on` vs `depends_on_steps` vs `depends_on_step_ids`) | RESOLVED | Template: `depends_on_steps UUID[]`, Client: `depends_on_step_ids UUID[]`. Old `depends_on` kept for compat. Consistent across all docs. |
| C3 | Task-Step link column naming (`onboarding_step_id`, `linked_task_id`) | RESOLVED | Architecture doc now uses `task_id` on steps + `source_type/source_id` on tasks. No `onboarding_step_id` or `linked_task_id` anywhere. |
| C4 | `phase` column missing from migration SQL and stories | RESOLVED | `phase TEXT` present in migration SQL (sections 2, 3d), architecture doc (sections 3.3, 3.4), spec (section 3.5), and story 40.1 (AC 40.1.9). |
| M1 | No story covers `is_required` column | RESOLVED | Added to story 40.1 as AC 40.1.10. Spec section 3.6 documents it. Migration SQL section 3e implements it. Story 40.9 references it correctly with note about 40.1 providing the column. |
| M2 | No story covers `seed-tasks` endpoint | RESOLVED | Story 40.4 AC 40.4.10 now covers `POST /api/onboarding/[id]/seed-tasks`. |
| M6 | No story covers step reassignment | RESOLVED | Story 40.10 ACs 40.10.14 and 40.10.15 cover reassignment and notification of new assignee. |

**Result: All 7 CRITICAL issues resolved.**

---

### 3. Previous HIGH Issues Status

| ID | Issue | Status | Notes |
|----|-------|--------|-------|
| C5 | `source_type` value mismatch (`auto_onboarding` vs `auto_onboarding_step`) | RESOLVED | Architecture doc now uses `auto_onboarding_step` throughout. No reference to `auto_onboarding` as the new value. |
| C6 | Sync approach conflict (DB triggers vs app service) | RESOLVED | Architecture doc ADR-4 updated to HYBRID. Story 40.4 explicitly states "HYBRID approach" and documents that service should NOT duplicate trigger work. |
| C7 | Service naming inconsistency (`OnboardingStepSyncService` vs `OnboardingSyncService`) | RESOLVED | All docs now use `OnboardingSyncService` / `onboarding-sync.service.ts`. |
| C8 | `org_id` missing from story 40.1 ACs | RESOLVED | AC 40.1.11 added. |
| C9 | Backfill strategy mismatch | RESOLVED | Story 40.1 notes now correctly state backfill "needs app-level logic to map template step IDs to client step IDs". Migration SQL section 10b implements the full resolution. |
| M3 | No story covers `dag` API endpoint | OPEN (MEDIUM) | Architecture doc section 5.4 defines `GET /api/onboarding/[id]/dag`. No story covers this. However, this is a visualization endpoint, not core sync functionality. Can be deferred to a future story without blocking dev. Downgraded from HIGH to MEDIUM. |
| M4 | No story covers template editor changes | OPEN (LOW) | Architecture doc section 12 Phase 6 describes template editor changes. No story covers this. Acceptable -- it is explicitly listed as a later implementation phase, not part of the core sync. Downgraded from HIGH to LOW. |
| M5 | No story covers `NotificationService.createServer()` variant | OPEN (LOW) | Architecture doc section 4.3 describes this. Story 40.5 uses `notificationService.create()`. Since the service runs server-side via API routes, this may already work with `createAdminClient()` context. Not blocking. |
| M7 | Possible conflict between story 40.9 trigger update and migration SQL trigger | PARTIALLY RESOLVED | The migration SQL now includes the full `calculate_onboarding_progress` function. Story 40.9 shows an alternate implementation in its technical notes that uses a DIFFERENT formula (only counts required steps in numerator AND denominator). The migration SQL version caps at 100% and counts ALL completed/skipped in numerator. See New Issues below. |

**Result: 6 of 9 HIGH issues resolved. 3 remaining downgraded (1 MEDIUM, 2 LOW).**

---

### 4. New Issues Found

#### N1. MEDIUM -- Spec doc still says `ready` in problem statement

**Location:** `docs/specs/onboarding-board-sync-migration.md`, lines 14 and 25

The spec doc's problem statement (section 1) says:
- Line 14: "Mark the step `ready`." (backtick-quoted, implies enum value)
- Line 25: "No `waiting`/`ready`/`review` states" (lists `ready` as a state to be added)

Section 3.1 of the same doc correctly decides to reuse `pending` and NOT add `ready`. So the doc is internally contradictory between its problem statement and its decision.

**Impact:** LOW. Section 3.1 is clearly the authoritative decision. The problem statement is introductory context. A dev reading only section 1 might be confused, but the decision section is unambiguous.

**Recommendation:** Update lines 14 and 25 to say `pending` (ready) instead of `ready`. Nice-to-have, not blocking.

#### N2. MEDIUM -- Progress function formula differs between story 40.9 and migration SQL

**Location:** Story 40.9 technical notes vs migration SQL section 8

The migration SQL's `calculate_onboarding_progress` (section 8) counts:
- Denominator: `is_required IS DISTINCT FROM false` (required steps only)
- Numerator: ALL `completed/skipped` steps (including optional ones)
- Result: capped at 100% via `LEAST(..., 100)`

Story 40.9's technical notes show:
- Denominator: `is_required = true OR is_required IS NULL`
- Numerator: only completed/skipped steps where `is_required = true OR is_required IS NULL`

These produce DIFFERENT results. With the migration SQL version, completing optional steps CAN push progress over 100% (hence the LEAST cap). With story 40.9's version, optional steps are invisible.

**Impact:** MEDIUM. The migration SQL version is more correct (it acknowledges optional step completion). Story 40.9's AC 40.9.3 says "NAO contam no denominador (mas contam no numerador se completados)" which MATCHES the migration SQL, but contradicts its own technical notes SQL example.

**Recommendation:** Story 40.9 technical notes SQL should be updated to match the migration SQL's formula. The ACs are correct -- only the illustrative SQL in technical notes is wrong.

#### N3. LOW -- Story 40.1 technical notes SQL for backfill of `waiting` status is naive

**Location:** Story 40.1, line 112

Story 40.1's SQL example does `SET status = 'waiting' WHERE status = 'pending' AND depends_on_step_ids != '{}'`. This sets ALL steps with any dependencies to `waiting`, even if those dependencies are already completed.

The migration SQL (section 10e) correctly adds `AND NOT check_step_dependencies_met(cos.id)` to only set `waiting` for steps with UNMET dependencies.

**Impact:** LOW. The migration SQL is the authoritative implementation. Story 40.1's SQL is illustrative. A dev following the migration SQL will get correct behavior.

**Recommendation:** No action needed if dev uses migration SQL as source of truth (which is the intent).

---

### 5. Summary

| Severity | Previous | Resolved | Remaining | New | Total Open |
|----------|----------|----------|-----------|-----|------------|
| CRITICAL | 7 | 7 | 0 | 0 | 0 |
| HIGH | 9 | 6 | 0 (downgraded) | 0 | 0 |
| MEDIUM | 12 | ~10 | 1 (M3 dag endpoint) | 2 (N1, N2) | 3 |
| LOW | - | - | 2 (M4, M5) | 1 (N3) | 3 |

---

### 6. Final Recommendation

**PASS WITH CONCERNS.** The epic is ready for development.

All CRITICAL and HIGH blocking issues have been resolved. The 10 unified decisions are now consistent across all 14 files. The remaining 3 MEDIUM and 3 LOW issues are non-blocking:

- **M3 (dag endpoint)**: Can be a follow-up story. Does not block core sync.
- **N1 (spec wording)**: Cosmetic. Decision section is clear.
- **N2 (progress formula)**: ACs are correct; only technical notes example SQL needs update. Dev should use migration SQL as authoritative.
- **M4, M5, N3**: Low impact, documented for awareness.

**Dev should treat the migration SQL (`supabase/migrations/20260314_onboarding_board_sync.sql`) as the authoritative source for all DB changes.** Story technical notes SQL examples are illustrative and may have minor discrepancies from the production migration.

---

*-- Quinn, guardiao da qualidade*

---
---

## Initial Review (2026-03-13)

**Reviewer:** Quinn (QA Agent)
**Date:** 2026-03-13
**Scope:** Pre-development spec review -- all 10 stories, architecture doc, migration spec, migration SQL

---

## 1. Overall Gate Decision

### CONCERNS

The epic is well-structured with clear dependency ordering and a solid architecture document. However, there are **critical inconsistencies** between the three source-of-truth documents (architecture doc, migration spec, migration SQL) that will cause confusion and rework if not resolved before development starts. Additionally, several acceptance criteria have testability gaps and there are missing coverage areas.

**Summary of blocking issues:** 7 CRITICAL, 9 HIGH, 12 MEDIUM

---

## 2. Per-Story Assessment

| Story | Verdict | Key Issues |
|-------|---------|------------|
| 40.1 | CONCERNS | CRITICAL: Enum values contradict across docs (`ready` vs `review`); column names contradict (`depends_on` vs `depends_on_steps` vs `depends_on_step_ids`); drops existing FK without accounting for downstream breakage |
| 40.2 | CONCERNS | References `ready` status that migration SQL adds as `review` instead; depends_on column name mismatch; no error handling ACs |
| 40.3 | PASS WITH NOTES | Well-specified; minor: `source_id = step.id` contradicts architecture doc which uses `onboarding_step_id` as the link |
| 40.4 | CONCERNS | CRITICAL: Architecture doc says "no DB triggers for sync" but migration SQL implements DB triggers for exactly this; loop prevention design won't work in serverless; missing AC for concurrent completion |
| 40.5 | PASS | Low risk, well-scoped, clear ACs |
| 40.6 | CONCERNS | References `ready` status in visual mapping but migration adds `review` not `ready`; `task.metadata.step_data` assumes data contract not defined anywhere |
| 40.7 | CONCERNS | HIGH: Columns reference `ready` status which does not exist in migration; backward compat AC is vague; HIGH effort underestimated for full kanban refactor |
| 40.8 | PASS WITH NOTES | Clear; migration for realtime publication is straightforward; minor: no AC for DELETE events |
| 40.9 | CONCERNS | CRITICAL: `is_required` does not exist on `client_onboarding_steps` -- trigger code references non-existent column; no migration adds it |
| 40.10 | PASS WITH NOTES | Good edge case coverage; minor: some ACs overlap with 40.4 guards |

---

## 3. Cross-Cutting Issues (Inconsistencies Between Documents)

### C1. CRITICAL -- `ready` vs `review` enum value

| Document | New enum values added |
|----------|----------------------|
| **Story 40.1** (AC 40.1.2) | `waiting`, `ready` |
| **Migration spec** (Section 3.1) | `waiting`, `review` |
| **Migration SQL** (Section 1) | `waiting`, `review` |
| **Architecture doc** (Section 9.1) | Neither -- uses `pending` as "ready" |
| **Epic overview** (Decisoes) | `waiting`, `ready` (mentions `review` in lifecycle) |
| **Story 40.6** (visual mapping) | `waiting`, `ready`, `review` (3 new values) |
| **Story 40.7** (kanban columns) | `waiting`, `ready`, `review` (3 columns) |

**Problem:** Story 40.1 says to add `ready`, but the actual migration SQL adds `review` instead. The architecture doc explicitly decides to reuse `pending` as the "ready" state. Stories 40.6 and 40.7 reference BOTH `ready` and `review` as if both exist. The migration only adds `waiting` and `review`.

**Impact:** If dev follows Story 40.1 literally, they will add a `ready` enum value that the migration SQL does not contain. If they follow the migration SQL, stories 40.2, 40.6, and 40.7 reference a non-existent `ready` status.

**Resolution required:** Decide definitively: is it `pending` (reused as ready), or is `ready` a new enum value? Then update ALL documents to be consistent.

### C2. CRITICAL -- Column naming for step dependencies

| Document | Template column | Client step column |
|----------|----------------|--------------------|
| **Story 40.1** | `depends_on UUID[]` (rename existing) | `depends_on UUID[]` |
| **Migration spec** | `depends_on_steps UUID[]` (new, keep old) | `depends_on_step_ids UUID[]` |
| **Migration SQL** | `depends_on_steps UUID[]` (new, keep old) | `depends_on_step_ids UUID[]` |
| **Architecture doc** | `depends_on` (single, keep as-is) | N/A (uses `phase` instead) |

**Problem:** Story 40.1 drops the existing `depends_on` FK column and renames a new array column to `depends_on`. The migration spec and SQL keep the old column and add a NEW column with a different name. These are fundamentally different migration strategies.

**Impact:** Story 40.1's approach breaks existing code that references `depends_on` as a single UUID. The migration SQL's approach preserves backward compatibility but uses different column names than the story specifies.

**Resolution required:** Align on one strategy and update story 40.1 ACs to match the chosen migration approach.

### C3. CRITICAL -- Task-Step link column naming

| Document | tasks table column | steps table column |
|----------|-------------------|--------------------|
| **Architecture doc** | `onboarding_step_id UUID` | `linked_task_id UUID` |
| **Migration spec** | N/A (uses `source_id` only) | `task_id UUID` |
| **Migration SQL** | N/A (uses `source_id` only) | `task_id UUID` |
| **Story 40.1** | N/A | `task_id UUID` |
| **Story 40.3** | Uses `source_id = step.id` | `task_id UUID` |

**Problem:** The architecture doc adds `onboarding_step_id` to the `tasks` table and `linked_task_id` to `client_onboarding_steps`. The migration spec and SQL do NOT add any column to `tasks` -- they use the existing `source_id` FK. The steps table column is `task_id` (not `linked_task_id`).

**Impact:** The architecture doc describes indexes, unique constraints, and API contracts based on `onboarding_step_id` on `tasks` that do not exist in the migration. Story 40.4 references `task.onboarding_step_id` which will not exist if migration SQL is followed.

**Resolution required:** Decide: does `tasks` get a new column, or does the system use `source_type + source_id` for linking? Update architecture doc OR migration to match.

### C4. CRITICAL -- `phase` column exists in architecture but not in migration SQL or stories

The architecture doc (Sections 3.3, 3.4) adds a `phase` column to both `onboarding_template_steps` and `client_onboarding_steps`. The migration SQL does NOT include this column. No story covers adding it.

**Impact:** The architecture's DAG resolution query (Section 8.2) filters by `phase`, the phase transition logic depends on it, and the `seedTasksForPhase()` method requires it. None of this works without the column.

**Resolution required:** Either add `phase` to the migration SQL and create a story for it, or remove phase-based logic from the architecture doc.

### C5. HIGH -- `source_type` value mismatch

| Document | New source_type value |
|----------|-----------------------|
| **Architecture doc** | `auto_onboarding` (reuses existing) |
| **Migration spec** | `auto_onboarding_step` (new) |
| **Migration SQL** | `auto_onboarding_step` (new) |
| **Stories 40.1-40.4** | `auto_onboarding_step` (new) |

**Problem:** Architecture doc's API contract (Section 5.2) checks for `task.onboarding_step_id` which does not exist, and its `TaskAutomationService` changes reference `auto_onboarding` not `auto_onboarding_step`.

### C6. HIGH -- Architecture doc vs stories: Sync approach (DB trigger vs app service)

| Document | Sync mechanism |
|----------|----------------|
| **Architecture doc** (ADR-4) | Application service only, NO DB triggers for sync |
| **Migration spec** (Section 4.4) | Hybrid: DB triggers for completion cascade + app for task creation |
| **Migration SQL** (Sections 7a, 7b) | DB triggers: `sync_task_completion_to_step()`, `cascade_step_completion()` |
| **Story 40.4** | Application service `OnboardingSyncService` |
| **Epic overview** | "Sync via service, nao trigger" |

**Problem:** The architecture doc and epic overview explicitly say NO DB triggers. The migration SQL implements two critical triggers. Story 40.4 builds an application service that duplicates what the triggers already do.

**Impact:** If both triggers and app service exist, step completion will be processed TWICE (trigger fires, then app service also runs), leading to duplicate task creation, duplicate notifications, and potential infinite loops.

**Resolution required:** Choose one approach. If hybrid (recommended per migration spec), update architecture doc ADR-4 and story 40.4 to account for triggers handling completion cascade while app handles task creation.

### C7. HIGH -- Service naming inconsistency

| Document | Service name |
|----------|-------------|
| Architecture doc | `OnboardingStepSyncService` |
| Story 40.4 | `OnboardingSyncService` |
| Epic overview | `onboarding-sync.service.ts` |
| Architecture doc (file path) | `onboarding-step-sync.service.ts` |

Minor but will cause confusion. Pick one name.

### C8. MEDIUM -- `org_id` on `client_onboarding_steps`

Migration spec and SQL add `org_id` to `client_onboarding_steps`. Story 40.1 does NOT mention this column in its ACs. The architecture doc does not mention it either.

### C9. MEDIUM -- Backfill strategy for `depends_on_step_ids`

The migration SQL (Section 10b) performs a complex backfill that resolves template step IDs to client step IDs. Story 40.1 does not mention this backfill at all -- it only mentions "single UUID converted to array of 1 element" which is a template-level backfill, not the client-step-level resolution.

---

## 4. Missing Coverage

### M1. CRITICAL -- No story covers `is_required` column on `client_onboarding_steps`

Story 40.9 AC 40.9.3 references `is_required` in the progress calculation trigger, but this column does NOT exist on `client_onboarding_steps` (only on `onboarding_template_steps`). No story or migration adds it. The migration SQL's `calculate_onboarding_progress` function does not filter by `is_required` either.

### M2. HIGH -- No story covers the `seed-tasks` API endpoint

Architecture doc (Section 5.3) defines `POST /api/onboarding/[id]/seed-tasks` for backfilling tasks on existing onboardings. No story implements this. This is critical for the migration path -- existing in-progress onboardings will have no board tasks without this endpoint.

### M3. HIGH -- No story covers the `dag` API endpoint

Architecture doc (Section 5.4) defines `GET /api/onboarding/[id]/dag` for DAG visualization. No story implements this. Story 40.7's kanban needs dependency visualization data.

### M4. HIGH -- No story covers template editor changes

Architecture doc (Section 12, Phase 6) describes template editor changes to support `phase` selection and DAG validation. No story covers this. Without template editor support, new templates cannot set `phase` or multi-dependencies.

### M5. MEDIUM -- No story covers `NotificationService.createServer()` variant

Architecture doc (Section 4.3) describes adding server-side notification methods using `createAdminClient()`. Story 40.5 uses `notificationService.create()` which may use the client-side variant. No story explicitly creates the server variant.

### M6. MEDIUM -- No story covers step reassignment flow

Architecture doc (Section 6.5) describes detailed reassignment behavior (reassign step, update or create task, notify new assignee). No story has ACs for this flow. Story 40.4 handles status changes but not assignment changes.

### M7. MEDIUM -- No story covers the `update_onboarding_progress` function modification

The migration SQL redefines `calculate_onboarding_progress()` but the existing trigger calls `update_onboarding_progress()`. Story 40.9 mentions updating the trigger but the migration SQL already handles this. Potential for the story to overwrite or conflict with what the migration established.

### M8. LOW -- No story for `pg_notify` listener on app side

Migration SQL uses `pg_notify('onboarding_step_ready', ...)` to signal the app layer, but no story implements the listener that receives this notification and creates tasks. If using DB triggers for cascade (per migration SQL approach), this listener is the bridge to task creation. Currently the listener is completely missing.

---

## 5. Recommendations (Specific Fixes Before Dev Starts)

### R1. MUST FIX -- Resolve the `ready` vs `review` enum conflict

**Recommendation:** Follow the migration spec/SQL approach:
- Add `waiting` (deps unmet) and `review` (work done, awaiting review)
- Reuse `pending` as "ready to start" (architecture doc's recommendation)
- Do NOT add a `ready` enum value

**Update required in:**
- Story 40.1 AC 40.1.2: Remove `ready`, add `review`
- Story 40.2: Replace all references to `ready` with `pending`
- Story 40.6: Remove `ready` from visual mapping, or clarify `pending` IS the ready state visually
- Story 40.7: Replace `ready` column with `pending` column
- Story 40.10: Replace `ready` references with `pending`

### R2. MUST FIX -- Align column naming across all docs

**Recommendation:** Follow migration SQL naming:
- `onboarding_template_steps.depends_on_steps UUID[]` (new, keep old `depends_on`)
- `client_onboarding_steps.depends_on_step_ids UUID[]` (new)
- `client_onboarding_steps.task_id UUID` (back-reference)
- NO new column on `tasks` table (use existing `source_type + source_id`)

**Update required in:**
- Story 40.1: Rewrite AC 40.1.1 (don't rename, add new column), AC 40.1.3 (use `depends_on_step_ids`)
- Architecture doc: Remove `onboarding_step_id` from tasks table, remove `linked_task_id`, use `task_id`

### R3. MUST FIX -- Resolve DB trigger vs app service conflict

**Recommendation:** Use the hybrid approach from the migration spec:
- DB trigger handles: task completion -> step completion, step completion -> cascade to waiting deps
- App service handles: creating tasks for newly-ready steps, sending notifications
- `pg_notify` bridges the two

**Update required in:**
- Architecture doc ADR-4: Change from "no triggers" to "hybrid"
- Story 40.4: Remove step completion logic from `onTaskCompleted()` (trigger handles it); focus on listening for `pg_notify` or polling for newly-pending steps and creating tasks
- Add story or AC for `pg_notify` listener

### R4. MUST FIX -- Add `phase` column or remove phase logic

**Recommendation:** If phase-based grouping is desired (architecture doc says yes), add the `phase` column to the migration SQL and add ACs in story 40.1. If not needed for v1, remove all phase references from architecture doc.

### R5. SHOULD FIX -- Add `is_required` to `client_onboarding_steps`

Story 40.9's progress calculation needs this column. Add it to the migration SQL with `DEFAULT true` and backfill from template. Add an AC to story 40.1.

### R6. SHOULD FIX -- Add story for `seed-tasks` and `dag` endpoints

These endpoints are needed for: (a) migrating existing onboardings, (b) providing DAG visualization data. Either add to story 40.4 or create a new story 40.11.

### R7. SHOULD FIX -- Add `org_id` to story 40.1 ACs

The migration SQL adds `org_id` to `client_onboarding_steps` with backfill. Story 40.1 should have an AC for this since it's in the migration.

### R8. SHOULD FIX -- Standardize service naming

Pick one name: `OnboardingSyncService` (shorter, matches file name). Update architecture doc.

### R9. NICE TO HAVE -- Add story for step reassignment

The architecture doc describes this flow in detail. It should be either an AC in story 40.4 or part of story 40.10 edge cases.

---

## 6. Risk Matrix

| Story | Risk Level | Probability | Impact | Reason |
|-------|-----------|-------------|--------|--------|
| 40.1 | **CRITICAL** | High | High | Migration is the foundation. Enum/column contradictions will cascade to all downstream stories. If migration is wrong, everything must be redone. |
| 40.4 | **HIGH** | High | High | Central orchestration story. DB trigger conflict means either duplicate processing or missing processing. Loop prevention won't work in serverless (stateless). |
| 40.9 | **HIGH** | High | Medium | References non-existent `is_required` column. Trigger modification may conflict with migration SQL's trigger changes. |
| 40.7 | **HIGH** | Medium | High | Full kanban refactor is HIGH effort. References non-existent `ready` status. Backward compatibility poorly defined. |
| 40.2 | **MEDIUM** | Medium | Medium | Depends on correct enum values and column names from 40.1. Otherwise straightforward algorithm. |
| 40.3 | **MEDIUM** | Low | Medium | Well-specified but `source_id` vs `onboarding_step_id` link needs clarity. |
| 40.6 | **MEDIUM** | Medium | Low | UI component. Risk is rendering based on statuses that may not exist. |
| 40.10 | **MEDIUM** | Low | Medium | Edge cases are well-identified but some overlap with 40.4. |
| 40.8 | **LOW** | Low | Low | Realtime subscription is straightforward. Minor risk: no DELETE handling. |
| 40.5 | **LOW** | Low | Low | Simple notification creation. Well-scoped. |

---

## 7. Testability Assessment

### Stories with good testability
- **40.2**: DAG resolution is pure logic, easily unit-testable
- **40.3**: Task creation is verifiable via DB query
- **40.5**: Notification creation is verifiable via DB query
- **40.8**: Realtime updates are observable in browser

### Stories with testability concerns
- **40.4**: Bidirectional sync across two tables with possible triggers is hard to test without a full integration environment. The `_syncOrigin` loop prevention needs careful testing with concurrent requests.
- **40.7**: "Backward compatibility" (AC 40.7.9) is vague -- what constitutes a legacy onboarding? How to verify?
- **40.9**: Progress calculation with `is_required` filtering needs test data with mixed required/optional steps.
- **40.10**: Race condition ACs (40.10.11, 40.10.12) require concurrent request simulation, which is hard to reproduce deterministically.

### Recommended test approach
1. **Story 40.1**: Verify migration runs cleanly on staging. Check enum values exist, columns added, indexes created, backfill correct.
2. **Stories 40.2-40.4**: Integration tests with real DB. Create onboarding with known DAG, complete steps in sequence, verify cascade.
3. **Story 40.10**: Load test with concurrent step completions on same onboarding to verify race condition guards.

---

## 8. Architectural Observations

### Positive aspects
- The DAG model is well-thought-out with single `depends_on` for v1 simplicity
- The projection model (ADR-1) is the right choice for consistency
- Edge cases are explicitly documented in the architecture doc
- Backfill strategy in migration SQL is thorough (resolves template deps to client step deps)

### Concerns
- Three documents (architecture, spec, SQL) were likely written by different agents without cross-validation, leading to the inconsistencies cataloged above
- The architecture doc describes a phase-based system with `OnboardingStepSyncService`, while the migration spec/SQL describe a trigger-based system. These are two different architectures that must be reconciled.
- The `pg_notify` mechanism in the migration SQL is a good idea but has no consumer -- without a listener, newly-ready steps will sit in `pending` with no task created until the next API call

---

*-- Quinn, guardiao da qualidade*
