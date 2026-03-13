## Final Verification (2026-03-13)

**Reviewer:** Quinn (QA Agent)
**Verification Type:** Post-fix final gate
**Gate Decision:** **PASS**

### 1. Gate Decision: PASS

All critical and high-severity issues from the initial review have been resolved. The remaining items are low/medium-severity recommendations that do not block merge.

### 2. Fix Verification

**C1 — `auto_onboarding_step` in board mapping: CONFIRMED FIXED**

`src/app/admin/board/page.tsx` lines 64-81 now correctly maps `show_onboarding_tasks` to an array `["auto_onboarding", "auto_onboarding_step"]`, and the loop at line 73-80 handles arrays via `Array.isArray(sourceType)` check with spread. `SOURCE_TO_CONFIG_COLUMN` in `task-automation.service.ts` (line 504) also correctly maps `auto_onboarding_step` to `"show_onboarding_tasks"`.

**C2 — `await createAdminClient()` removed from task-automation.service.ts: CONFIRMED FIXED**

Zero occurrences of `await createAdminClient()` remain in `task-automation.service.ts`. All calls (lines 32, 187, 238, 404, 451) now use synchronous `createAdminClient()`.

**NEW FINDING (NON-BLOCKING):** `step-dependency.service.ts` still has 3 occurrences of `await createAdminClient()` (lines 47, 115, 157). This is the same harmless-but-misleading pattern. Non-blocking since `await` on a non-Promise resolves immediately.

### 3. Integration Chain: CONFIRMED

**Path A: Board task completed -> onboarding advances**

1. `tasks/[id]/route.ts` PUT handler (line 196-208): Detects `source_type === "auto_onboarding_step"` AND `!task.metadata?._syncOrigin`, dynamically imports `OnboardingSyncService`, calls `onTaskStatusChanged(id, body.status)`.
2. `onboarding-sync.service.ts` `onTaskStatusChanged()` (line 204): Routes to `onTaskCompleted()` when status is `completed`.
3. `onTaskCompleted()` (line 93): Looks up linked step via `task_id`, calls `handleNewlyPendingSteps()` and `checkPhaseAndOnboardingCompletion()`.
4. `handleNewlyPendingSteps()` (line 359): Finds pending steps without tasks, calls `TaskAutomationService.onOnboardingStepPending()` for each.
5. Notifications sent via `notifyStepPending()` with correct parameter types.

Additionally, DB triggers handle the synchronous cascade:
- `sync_task_completion_to_step()` marks linked step completed
- `cascade_step_completion()` transitions waiting deps to pending

**Path B: Onboarding step completed -> board task updated**

1. `onboarding/[id]/steps/route.ts` PUT handler (line 127-153): Dispatches to `onStepCompleted()` for completed, `onStepSkipped()` for skipped, `onStepStatusChanged()` for other statuses.
2. `onStepCompleted()` (line 136): Updates linked task to `completed` with `_syncOrigin` metadata. Calls `StepDependencyService.transitionToPending()`, `handleNewlyPendingSteps()`, `checkPhaseAndOnboardingCompletion()`.

All function names, parameter types, and import paths match between callers and callees. Error handling wraps all sync calls in try/catch with non-blocking logging.

### 4. Loop Prevention: CONFIRMED SAFE

Four independent loop prevention mechanisms verified:

1. **`_syncOrigin` metadata** — `tasks/[id]/route.ts` line 200: `!task.metadata?._syncOrigin` prevents re-triggering sync on task updates that originated from step sync.
2. **Status equality guards** — `onTaskStatusChanged` line 227: `if (step.status === targetStepStatus) return`. `onStepStatusChanged` line 308: `if (!task || task.status === targetTaskStatus) return`.
3. **DB trigger guards** — `sync_task_completion_to_step`: `AND status NOT IN ('completed', 'skipped')`. `cascade_step_completion`: `WHEN (NEW.status IN (...) AND OLD.status NOT IN (...))`.
4. **`.neq()` guard** — `onStepCompleted` line 173: `.neq("status", "completed")` prevents updating already-completed tasks.

Worst case: redundant idempotent call. No infinite loop possible.

### 5. Type Consistency: CONFIRMED ALIGNED

| Type | `types/onboarding.ts` | `types/task.ts` | `types/index.ts` |
|------|----------------------|-----------------|-------------------|
| `OnboardingStepStatus` | includes `waiting`, `review` | — | includes `waiting`, `review` |
| `TaskSourceType` | — | includes `auto_onboarding_step` | includes `auto_onboarding_step` |
| `ClientOnboardingStep.task_id` | `string?` | — | `string?` |
| `ClientOnboardingStep.depends_on_step_ids` | `string[]?` | — | `string[]?` |
| `ClientOnboardingStep.phase` | `string?` | — | `string?` |
| `ClientOnboardingStep.is_required` | `boolean?` | — | `boolean?` |
| `ClientOnboardingStep.org_id` | `string?` | — | `string?` |

All three type files are consistent. No `ready` status exists anywhere (correct — uses `pending` instead).

### 6. Migration Completeness: CONFIRMED

`20260314_onboarding_board_sync.sql` verified:

- **`phase` column**: Added to both `onboarding_template_steps` (line 55) and `client_onboarding_steps` (line 91) with CHECK constraint.
- **`is_required` column**: Added to `client_onboarding_steps` (line 96) with DEFAULT true.
- **`depends_on_step_ids UUID[]`**: Added to `client_onboarding_steps` (line 70) with DEFAULT '{}'. GIN index created.
- **`task_id UUID`**: Added to `client_onboarding_steps` (line 77) with FK to `tasks(id)` ON DELETE SET NULL. Partial index created.
- **Triggers**: `sync_task_to_step_trigger` (task->step), `a_cascade_step_completion` (step cascade), `b_onboarding_step_progress_trigger` (progress recalc). All present with correct ordering.
- **`calculate_onboarding_progress()`**: Uses `is_required IS DISTINCT FROM false` for denominator (line 392). Counts completed/skipped in numerator. Capped at 100%.
- **Rollback script**: Lines 551-601 cover all additions: triggers, functions, columns, constraints, indexes. Complete.

### 7. Security: CONFIRMED

| Route | Auth | Org Check | Admin Client Usage |
|-------|------|-----------|-------------------|
| `seed-tasks/route.ts` | `requireAuth()` | RLS via `createClient()` query on `client_onboardings` | `OnboardingSyncService` uses admin internally |
| `all-steps/route.ts` | `requireAuth()` | RLS via `createClient()` (`.select()` filtered by RLS) | None (reads only) |
| `tasks/[id]/route.ts` | `requireAuth()` + `resolveOrgId()` | `.eq("org_id", orgId)` on all queries | Yes, for writes after org verification |
| `onboarding/[id]/steps/route.ts` | `requireAuth()` | `.eq("onboarding_id", id)` with RLS | Yes, for writes via `adminClient` |

No SQL injection vectors. All DB functions use typed parameters. SECURITY DEFINER triggers have `SET search_path = public`.

### 8. Typecheck/Lint: CLEAN

- **`npm run typecheck`**: 0 errors
- **`npm run lint`**: Only 3 pre-existing warnings in `campaigns/page.tsx` (unused vars) and `store-detail-tabs.tsx` (unused arg). No new warnings from Epic 40 code.

### 9. Remaining Issues

**Non-blocking (carry forward as tech debt):**

| ID | Severity | Description |
|----|----------|-------------|
| NEW | LOW | `await createAdminClient()` in `step-dependency.service.ts` (3 occurrences) — harmless but inconsistent |
| R1 | MEDIUM | Duplicated step creation logic across 3 routes — extract shared helper |
| R2 | MEDIUM | Task metadata overwritten during sync — should merge instead of replace |
| R3 | LOW | Blocked/skipped steps invisible in steps kanban |
| R4 | LOW | "Ver pipeline" buttons are no-ops |
| R5 | LOW | Progress calculation edge case with optional steps |
| R6 | LOW | `org_id` on steps should be NOT NULL after backfill |
| R7 | LOW | Double `handleNewlyPendingSteps` call on step completion (idempotent, acceptable) |
| P1 | MEDIUM | N+1 queries in handleNewlyPendingSteps — batch if scale increases |

### 10. Final Recommendation

**READY FOR COMMIT.** All critical and high-severity issues (C1, C2) have been resolved and verified. The integration chain, loop prevention, type consistency, migration, security, and build all pass verification. The remaining items are medium/low-severity recommendations that can be addressed in follow-up stories.

-- Quinn, guardiao da qualidade

---

# Epic 40 — Onboarding ↔ Board Sync — Code Review Report

**Reviewer:** Quinn (QA Agent)
**Date:** 2026-03-13
**Scope:** All 10 stories (40.1–40.10), 25+ files
**Gate Decision:** **PASS WITH CONCERNS**

---

## Executive Summary

The Epic 40 implementation is architecturally sound, well-structured, and production-ready with a few notable concerns. The bi-directional sync logic between onboarding steps and board tasks is correctly designed with both DB-trigger-level cascading and application-level orchestration. Loop prevention guards are properly implemented. Error handling follows the non-blocking pattern consistently. However, there is one **critical bug** (C1) that must be fixed before merge, and several medium-severity items that should be addressed soon after.

---

## Gate Decision: PASS WITH CONCERNS

| Category | Verdict |
|----------|---------|
| Correctness | PASS with 1 critical bug (C1) |
| Security | PASS |
| Error Handling | PASS |
| Performance | PASS with 2 concerns |
| Code Quality | PASS with minor items |

---

## Critical Issues (Must Fix Before Merge)

### C1. `auto_onboarding_step` Missing from Board Page Source Type Mapping

**File:** `src/app/admin/board/page.tsx` (lines 64-71)
**Severity:** CRITICAL
**Impact:** Board tasks created from onboarding steps are invisible to non-assignee viewers.

The `getAllowedSourceTypes()` function maps `show_onboarding_tasks` config only to `"auto_onboarding"` but NOT `"auto_onboarding_step"`. Since `TaskAutomationService.onOnboardingStepPending()` creates tasks with `source_type = "auto_onboarding_step"`, these tasks are excluded from the board query unless the viewer happens to be the assignee (caught by the `assignee_id.eq.${orgMemberId}` OR clause).

**Fix required:** Add `"auto_onboarding_step"` to the allowed list when `show_onboarding_tasks` is enabled:

```typescript
const mapping: [string, TaskSourceType][] = [
  ["show_onboarding_tasks", "auto_onboarding"],
  ["show_onboarding_tasks", "auto_onboarding_step"], // ADD THIS
  ["show_meeting_tasks", "auto_meeting"],
  // ...
]
```

Or deduplicate by pushing both when the config flag is true.

### C2. `createAdminClient()` Called with `await` in `task-automation.service.ts`

**File:** `src/lib/services/task-automation.service.ts` (line 32)
**Severity:** HIGH (correctness, but non-breaking)
**Impact:** `createAdminClient()` is synchronous (returns `SupabaseClient`, not a Promise). Using `await` on a non-Promise value is harmless in JS but misleading and inconsistent with the rest of the codebase. `onboarding-sync.service.ts` correctly calls it without `await`.

**Fix required:** Remove `await` from `const supabase = await createAdminClient()` in `task-automation.service.ts` (lines 32, 187, 238, 404, 451).

---

## Per-File Findings

| File | Stories | Verdict | Findings |
|------|---------|---------|----------|
| `step-dependency.service.ts` | 40.2 | PASS | Clean DAG resolution, 3-color DFS cycle detection, atomic WHERE guard in `transitionToPending`. Well-documented. |
| `onboarding-sync.service.ts` | 40.4, 40.10 | PASS | Correct bi-directional sync. Loop prevention via status equality check + `_syncOrigin` metadata. Non-throwing by design. See R1, R2. |
| `onboarding-notifications.ts` | 40.5 | PASS | All notification functions are non-throwing. Batch insert for multi-recipient notifications. Clean interface definitions. |
| `task-automation.service.ts` | 40.3 | PASS w/ C2 | `onOnboardingStepPending()` properly resolves assignee with 3-tier fallback (direct > role > onboarding default). Idempotency via existing task check. C2: `await` on sync function. |
| `index.ts` | — | PASS | Correct re-exports of new services and types. |
| `onboarding-step-card.tsx` | 40.6 | PASS | Reusable card with board/onboarding context modes. Accessible (role="button", keyboard support). Status transition actions are context-aware. |
| `onboarding-steps-kanban.tsx` | 40.7 | PASS | Drag-and-drop with validated transitions. Optimistic updates with rollback. Filters by onboarding, assignee, phase. See R3. |
| `task-card.tsx` | 40.6 | PASS | Clean onboarding badge integration. "Ver pipeline" link present but no navigation handler (noop). See R4. |
| `onboarding-kanban.tsx` | 40.7 | PASS | Pipeline/Steps toggle works. Steps view delegates to `OnboardingStepsKanban`. Realtime subscription on both views. |
| `task-board-with-calendar.tsx` | 40.8 | PASS | Passes `orgMemberId` for realtime filtering. `useRealtimeBoard` integrated correctly. |
| `use-realtime-board.ts` | 40.8 | PASS | Filtered by `assignee_id`, debounced 2s, polling fallback 30s. Toast on new onboarding tasks. |
| `use-realtime-onboarding.ts` | 40.7 | PASS | Subscribes to both `client_onboardings` and `client_onboarding_steps` tables. Debounced. Polling fallback. |
| `seed-tasks/route.ts` | 40.4 | PASS | Auth check + existence check. Blocks cancelled onboardings. Delegates to `OnboardingSyncService.seedTasks()`. |
| `all-steps/route.ts` | 40.7 | PASS | Fetches all active onboarding steps with joins. Filters out completed/cancelled onboardings. |
| `tasks/[id]/route.ts` | 40.4 | PASS | Sync hook correctly fires only for `auto_onboarding_step` tasks without `_syncOrigin`. Non-blocking via try/catch. |
| `onboarding/[id]/steps/route.ts` | 40.4, 40.10 | PASS | Status-aware sync dispatching (completed, skipped, other). Reassignment sync fires correctly. |
| `onboarding/route.ts` | 40.9, 40.10 | PASS | DAG validation before creation (AC 40.10.13). Dependency resolution from template to client steps. `initialize_onboarding_step_statuses` RPC call. |
| `portal/stores/onboarding/route.ts` | 40.9 | PASS | Same step creation pattern with dependency resolution and initialization. Consistent with main route. |
| `cliente/onboarding-form/route.ts` | 40.9 | PASS | Same step creation pattern. Public endpoint with rate limiting and honeypot. |
| `types/onboarding.ts` | 40.1 | PASS | `waiting`, `review` added to `OnboardingStepStatus`. `task_id`, `depends_on_step_ids`, `phase`, `is_required`, `org_id` added to `ClientOnboardingStep`. |
| `types/task.ts` | 40.1 | PASS | `auto_onboarding_step` added to `TaskSourceType`. |
| `types/index.ts` | 40.1 | PASS | Same updates mirrored. |
| `20260314_onboarding_board_sync.sql` | 40.1 | PASS | Comprehensive migration with proper idempotency, backfill, rollback script. See R5, R6. |
| `20260316_enable_realtime.sql` | 40.8 | PASS | Adds tables to `supabase_realtime` publication. |
| `board/page.tsx` | 40.8 | **FAIL (C1)** | `auto_onboarding_step` missing from source type mapping. See C1 above. |

---

## Security Assessment: PASS

1. **Authentication:** All API routes use `requireAuth()` or portal user verification. No unauthenticated endpoints introduced.
2. **Admin client usage:** `createAdminClient()` is used appropriately for cross-tenant data access in sync operations. All API routes first authenticate via `createClient()`, then use admin client for writes — consistent with existing patterns.
3. **SQL injection:** No raw SQL in application code. All queries use Supabase client parameterized methods. DB functions use `$$ ... $$` blocks with typed parameters.
4. **SECURITY DEFINER triggers:** `sync_task_completion_to_step()` and `cascade_step_completion()` are SECURITY DEFINER with `SET search_path = public`, which is correct.
5. **Org-scoping:** The `all-steps` endpoint relies on RLS via `createClient()`. The seed-tasks endpoint verifies onboarding existence via RLS-scoped query before delegating to admin operations. Steps created with `org_id` backfilled from parent.
6. **No new RLS bypass concerns:** The `_syncOrigin` metadata field in task updates could theoretically be set by a malicious client to bypass sync, but this only affects whether the sync *runs again* (loop prevention) — it doesn't affect data integrity or access control.

---

## Performance Assessment: PASS WITH CONCERNS

### P1. N+1 Query in `handleNewlyPendingSteps` (MEDIUM)

**File:** `onboarding-sync.service.ts` (lines 404-456)
Each pending step triggers:
1. `TaskAutomationService.onOnboardingStepPending()` (which internally queries `org_members`, `board_config`, `tasks` max position, then inserts)
2. A separate `org_members` query to resolve `profile_id` for notification

For an onboarding with many concurrent pending steps (e.g., 10+ steps unlocked simultaneously), this creates ~40+ sequential queries. This is acceptable for the current scale (1 org, few onboardings) but should be batched if scale increases.

### P2. `onStepReassigned` Fetches Onboarding Twice (LOW)

**File:** `onboarding-sync.service.ts` (lines 862-893, 904-914)
When a step has no existing task and is pending, the onboarding context is fetched once for task creation (line 864) and again for notification (line 905). These could share the result.

### P3. Realtime Subscription Breadth (LOW)

`use-realtime-onboarding.ts` subscribes to ALL changes on `client_onboarding_steps` without any filter. For a single-org system this is fine, but at scale this would receive events from all orgs. Supabase Realtime with RLS-enabled tables should filter by user context, but the `ALTER PUBLICATION` approach bypasses RLS filtering.

---

## Recommendations (Nice to Have)

### R1. Extract Step Creation Logic into Shared Helper

The dependency resolution and `initialize_onboarding_step_statuses` RPC call is duplicated across 3 files:
- `src/app/api/onboarding/route.ts` (lines 198-257)
- `src/app/api/portal/stores/onboarding/route.ts` (lines 199-256)
- `src/app/api/cliente/onboarding-form/route.ts` (lines 179-237)

These should be extracted into a shared `createStepsFromTemplate()` helper to reduce duplication and maintenance risk.

### R2. `metadata` Overwrite in Sync Operations

In `onStepCompleted` (line 162-170) and `onStepStatusChanged` (line 310-316), the task's `metadata` field is replaced entirely with sync metadata. This **overwrites** any existing metadata (e.g., `onboarding_id`, `step_name`, `client_name` set by `onOnboardingStepPending`). Consider using a spread or JSONB merge instead:

```typescript
metadata: {
  ...existingMetadata,
  _syncOrigin: "onboarding_step",
  step_id: step.id,
}
```

### R3. Steps Kanban Missing "skipped" and "blocked" Columns

`STEP_COLUMNS` in `onboarding-steps-kanban.tsx` only includes: waiting, pending, in_progress, review, completed. Steps with status `blocked` or `skipped` are not visible in the kanban. They still exist in the data but have no column to render in.

### R4. "Ver pipeline" Button is a No-op in `task-card.tsx`

The `ExternalLink` button at line 209-219 in `task-card.tsx` has `onClick={(e) => e.stopPropagation()}` but no actual navigation. Similarly, the button in `onboarding-step-card.tsx` (line 342-350) has an empty click handler comment. Consider adding `href` navigation or removing the button.

### R5. Migration: `calculate_onboarding_progress` May Over-Count

The updated `calculate_onboarding_progress` function counts ALL completed/skipped steps in the numerator (including optional ones) but only required steps in the denominator. If there are many optional steps that get completed, the percentage could exceed 100%. The `LEAST(..., 100)` cap handles this, but the displayed percentage may seem misleading (e.g., 7 of 5 required steps done = 140% capped to 100%).

### R6. Missing `NOT NULL` on `client_onboarding_steps.org_id`

The `org_id` column on `client_onboarding_steps` is nullable. Since org_id is backfilled and set on creation, consider adding a `NOT NULL` constraint after the backfill to prevent orphaned data.

### R7. `onStepCompleted` and `onTaskCompleted` Both Call `handleNewlyPendingSteps`

When a step is completed via the onboarding UI:
1. `onStepCompleted()` calls `handleNewlyPendingSteps()`
2. `onStepCompleted()` also updates the linked task to completed
3. The DB trigger fires `sync_task_completion_to_step()` which marks the step completed (no-op since already completed)
4. The DB trigger fires `cascade_step_completion()` which transitions waiting deps
5. The task PUT handler calls `onTaskStatusChanged()` -> `onTaskCompleted()` -> `handleNewlyPendingSteps()` again

This results in `handleNewlyPendingSteps()` being called twice. The second call is idempotent (`.is("task_id", null)` guard ensures no duplicate tasks), but it does execute unnecessary queries. Consider adding a guard or documenting this as acceptable.

---

## Infinite Loop Prevention Analysis

The bi-directional sync correctly prevents infinite loops through multiple mechanisms:

1. **Status equality guard:** Both `onTaskStatusChanged` (line 227) and `onStepStatusChanged` (line 308) check if the target already has the desired status before updating.
2. **`_syncOrigin` metadata:** Task updates from step sync include `_syncOrigin: "onboarding_step"` in metadata. The task PUT handler checks `!task.metadata?._syncOrigin` before triggering sync (line 200).
3. **DB trigger guards:** `sync_task_completion_to_step` uses `AND status NOT IN ('completed', 'skipped')`. `cascade_step_completion` uses `WHEN (NEW.status IN (...) AND OLD.status NOT IN (...))`.
4. **`.neq("status", "completed")` guard:** Used in `onStepCompleted` (line 173) to avoid updating already-completed tasks.

**Verdict:** Loop prevention is comprehensive and correct. The worst case is a redundant idempotent call, not an infinite loop.

---

## Cascade Chain Verification

Task complete -> step complete -> deps resolved -> new tasks -> notifications:

1. Task status set to `completed` via PUT `/api/tasks/[id]`
2. DB trigger `sync_task_to_step_trigger` fires -> marks linked step as completed
3. DB trigger `a_cascade_step_completion` fires -> finds waiting steps with all deps met -> marks them pending
4. DB trigger `b_onboarding_step_progress_trigger` fires -> recalculates progress
5. PUT handler calls `OnboardingSyncService.onTaskCompleted()`
6. `onTaskCompleted` -> `handleNewlyPendingSteps()` -> creates board tasks for newly-pending steps
7. `handleNewlyPendingSteps` -> sends `notifyStepPending` to each assignee
8. `onTaskCompleted` -> `checkPhaseAndOnboardingCompletion()` -> may advance phase and/or mark onboarding complete

**Verdict:** The cascade chain is correctly implemented with both DB-level atomicity and application-level orchestration.

---

## Summary of Action Items

| ID | Severity | Description | Action |
|----|----------|-------------|--------|
| C1 | CRITICAL | `auto_onboarding_step` missing from board source type mapping | Must fix before merge |
| C2 | HIGH | `await` on synchronous `createAdminClient()` in task-automation.service | Fix (5 occurrences) |
| R1 | MEDIUM | Duplicated step creation logic across 3 routes | Extract shared helper |
| R2 | MEDIUM | Task metadata overwritten during sync (loses step context) | Merge instead of replace |
| R3 | LOW | Blocked/skipped steps invisible in steps kanban | Add columns or filter indicator |
| R4 | LOW | "Ver pipeline" buttons are no-ops | Add navigation or remove |
| R5 | LOW | Progress calculation edge case with optional steps | Document or adjust formula |
| R6 | LOW | `org_id` on steps should be NOT NULL | Add constraint after backfill |
| R7 | LOW | Double `handleNewlyPendingSteps` call on step completion | Acceptable, document |
| P1 | MEDIUM | N+1 queries in handleNewlyPendingSteps | Batch if scale increases |

---

-- Quinn, guardiao da qualidade
