# Onboarding-Board Sync: Migration Plan

**Date:** 2026-03-13
**Author:** Dara (Database Architect)
**Migration file:** `supabase/migrations/20260314_onboarding_board_sync.sql`

---

## 1. Problem Statement

Onboarding steps live in `client_onboarding_steps` with a simplistic status lifecycle (`pending` → `in_progress` → `completed`). There is no automatic bridge between a step becoming "ready" (dependencies met) and the team member's board (`tasks` table). Today, `TaskAutomationService.onOnboardingStarted()` creates a single high-level task when an onboarding begins, but individual steps do not spawn granular tasks.

**Goal:** When an onboarding step's dependencies are all satisfied, the system should:
1. Mark the step `ready`.
2. Auto-create a task on the assigned member's board (via `tasks` table with `source_type = 'auto_onboarding_step'`).
3. When the board task is completed → mark the step `completed` → cascade to dependent steps → repeat.

---

## 2. Current State Summary

| Table | Key columns | Notes |
|---|---|---|
| `onboarding_template_steps` | `depends_on UUID` (single FK, nullable) | Single dependency only |
| `client_onboarding_steps` | `status onboarding_step_status` enum: `pending, in_progress, blocked, completed, skipped` | No `waiting`/`ready`/`review` states |
| `tasks` | `source_type TEXT`, `source_id UUID` | CHECK constraint limits to 7 values; no back-reference from step to task |
| `client_onboardings` | `progress_percent INT` | Trigger `update_onboarding_progress()` recalculates on step status change |

---

## 3. Schema Changes

### 3.1 Extend `onboarding_step_status` enum

Add two new values: `waiting` and `review`.

- `waiting` = step exists but dependencies not yet met (replaces the ambiguous initial `pending`).
- `review` = step work is done, awaiting review before completion.

The full lifecycle becomes:
```
waiting → ready(pending) → in_progress → review → completed
                                  ↘ blocked
                        skipped (any state)
```

**Decision:** Reuse `pending` as the "ready" state rather than adding a new enum value. This avoids breaking existing UI code that maps `pending` to "ready to start". The new `waiting` state is for steps whose dependencies are not yet met. Steps that have no dependencies start as `pending` (ready).

### 3.2 Add `depends_on UUID[]` to `client_onboarding_steps`

Currently, dependency info only lives on the template. The instantiated step (`client_onboarding_steps`) has no dependency column. We need this to resolve dependencies at runtime without joining back to the template.

### 3.3 Add `task_id UUID` to `client_onboarding_steps`

Bi-directional link: `tasks.source_id → step.id` AND `client_onboarding_steps.task_id → tasks.id`. This enables:
- Step → Task navigation in the UI.
- Task completion trigger to find and update the step.

### 3.4 Add `org_id UUID` to `client_onboarding_steps`

Currently missing. Required for RLS consistency and for creating tasks (which need `org_id`).

### 3.5 Add `phase TEXT` to `onboarding_template_steps` and `client_onboarding_steps`

Both tables get a `phase TEXT` column with a CHECK constraint for valid values:

```sql
ALTER TABLE onboarding_template_steps
  ADD COLUMN phase TEXT CHECK (phase IN ('setup', 'integration', 'customization', 'launch', 'review'));

ALTER TABLE client_onboarding_steps
  ADD COLUMN phase TEXT CHECK (phase IN ('setup', 'integration', 'customization', 'launch', 'review'));
```

**Backfill strategy:** Copy `phase` from the template step to each instantiated client step:
```sql
UPDATE client_onboarding_steps cos
SET phase = ots.phase
FROM onboarding_template_steps ots
WHERE cos.template_step_id = ots.id;
```

### 3.6 Add `is_required BOOLEAN` to `client_onboarding_steps`

```sql
ALTER TABLE client_onboarding_steps
  ADD COLUMN is_required BOOLEAN NOT NULL DEFAULT true;
```

**Backfill:** Copy from template step's `is_required` value:
```sql
UPDATE client_onboarding_steps cos
SET is_required = ots.is_required
FROM onboarding_template_steps ots
WHERE cos.template_step_id = ots.id;
```

**Impact on progress calculation:** The `update_onboarding_progress()` function must be updated so that only steps where `is_required = true` count toward the denominator. Optional steps (`is_required = false`) that are completed still count toward the numerator but do not block 100% completion.

### 3.7 Extend `tasks.source_type` CHECK constraint

Add `'auto_onboarding_step'` to distinguish step-level tasks from the onboarding-level task.

### 3.8 Add `depends_on UUID[]` to `onboarding_template_steps`

The current `depends_on` is a single `UUID` FK. For parallel execution (multiple steps ready at once), a step may depend on multiple predecessors. Migrate from single FK to an array column.

**Migration strategy:** Add new `depends_on_steps UUID[]` column, backfill from existing `depends_on`, then drop the old column in a future migration (not in this one, to avoid breaking existing code).

### 3.9 New indexes

| Index | Purpose |
|---|---|
| `idx_cos_task_id` on `client_onboarding_steps(task_id)` | Task → Step lookup |
| `idx_cos_org_id` on `client_onboarding_steps(org_id)` | RLS and multi-tenant queries |
| `idx_cos_depends_on` (GIN) on `client_onboarding_steps(depends_on_step_ids)` | Dependency resolution queries |
| `idx_tasks_source_step` on `tasks(source_type, source_id) WHERE source_type = 'auto_onboarding_step'` | Fast lookup of step tasks |
| `idx_cos_onboarding_status_phase` on `client_onboarding_steps(onboarding_id, status, phase)` | Phase-filtered status queries for kanban/pipeline views |

---

## 4. Dependency Resolution Logic

### 4.1 SQL function: `check_step_dependencies_met`

Given a step ID, returns TRUE if all steps in its `depends_on_step_ids` array are `completed` or `skipped`.

### 4.2 SQL function: `get_newly_ready_steps`

Given an onboarding ID and a just-completed step ID, finds all steps that:
1. Are currently `waiting`.
2. Have all dependencies now met (the completed step was the last blocker).

### 4.3 Circular dependency prevention

Enforced via a CHECK constraint trigger on `onboarding_template_steps` that validates the dependency graph is a DAG (no cycles). For `client_onboarding_steps`, dependencies are copied from the template at instantiation time and are immutable.

### 4.4 App-level vs DB-level cascade

**Recommendation: Hybrid approach.**

The split is intentional: DB triggers handle data consistency (cascades, progress), while the application service (`OnboardingSyncService`) handles side-effects that require business logic (task creation, notifications). The bridge between the two layers is `pg_notify`.

| Concern | Where | Why |
|---|---|---|
| Progress % recalculation | DB trigger | Already exists, fast, atomic |
| Step completion cascade | DB trigger | Marks `waiting` → `pending` atomically when dependencies met |
| Mark waiting deps as pending | DB trigger | Must be atomic to prevent race conditions |
| Task completed → step completed | DB trigger | Atomic, prevents race conditions |
| `pg_notify` event emission | DB trigger | Bridge mechanism: notifies app layer that steps are newly ready |
| Task creation on step ready | `OnboardingSyncService` (app) | Requires `board_config` logic, notification sending, and Supabase Realtime awareness |
| Notification sending | `OnboardingSyncService` (app) | Requires user context and notification preferences |

The cascade flow:
1. **DB trigger** on `tasks` status → `completed`: calls `sync_task_completion_to_step()` which sets the linked `client_onboarding_steps` row to `completed`.
2. **DB trigger** on `client_onboarding_steps` status → `completed`: calls `cascade_step_completion()` which marks newly-ready steps as `pending` (from `waiting`).
3. **DB trigger** (existing) on step status change: recalculates `progress_percent`.
4. **`pg_notify`** (bridge): emits `onboarding_step_ready` event with step IDs and assignee info. This is the handoff point from DB to application layer.
5. **`OnboardingSyncService`** (app listener or next API call): picks up ready steps, creates tasks via `TaskAutomationService`, sends notifications to assignees.

---

## 5. Trigger Design

### 5.1 `sync_task_completion_to_step()` — NEW

Fires: `AFTER UPDATE OF status ON tasks`
Condition: `NEW.source_type = 'auto_onboarding_step' AND NEW.status = 'completed' AND OLD.status != 'completed'`
Action: `UPDATE client_onboarding_steps SET status = 'completed', completed_at = NOW() WHERE id = NEW.source_id AND status != 'completed'`

### 5.2 `cascade_step_completion()` — NEW

Fires: `AFTER UPDATE OF status ON client_onboarding_steps`
Condition: `NEW.status IN ('completed', 'skipped') AND OLD.status NOT IN ('completed', 'skipped')`
Action:
1. Find all sibling steps (same `onboarding_id`) that are `waiting`.
2. For each, check if ALL `depends_on_step_ids` are now `completed` or `skipped`.
3. If yes, update to `pending` (ready).
4. Call `pg_notify('onboarding_step_ready', ...)` with the step IDs and assignee info.

### 5.3 `update_onboarding_progress()` — EXISTING (modified)

Updated to recognize `waiting` status. Steps in `waiting` are NOT counted as completed. The formula remains: `completed + skipped / total * 100`.

### 5.4 Trigger ordering

PostgreSQL fires AFTER triggers in alphabetical order by trigger name. Our triggers:
1. `cascade_step_completion` (cascades to other steps)
2. `onboarding_step_progress_trigger` (recalculates progress)

Both fire on step status change. The cascade trigger must fire FIRST so that when progress is recalculated, newly-ready steps are already updated. We prefix names to control order:
- `a_cascade_step_completion`
- `b_onboarding_step_progress_trigger`

---

## 6. Backfill Strategy

### Existing `client_onboarding_steps` rows

All existing rows have `status = 'pending'`. After migration:
- Steps whose template `depends_on` is NOT NULL and whose dependency is NOT completed → set to `waiting`.
- Steps with no dependencies or completed dependencies → remain `pending` (ready).
- Populate `depends_on_step_ids` from template step dependencies.
- Populate `org_id` from parent `client_onboardings.org_id`.

### Existing `onboarding_template_steps` rows

- Populate `depends_on_steps UUID[]` from existing `depends_on UUID` scalar.
- Keep old column for backward compatibility.

---

## 7. RLS Impact

### `client_onboarding_steps`

Existing policies reference `onboarding_id` via join to `client_onboardings`. Adding `org_id` does NOT break these policies. We add an additional index for `org_id` queries but do NOT change existing policies in this migration.

### `tasks`

The `source_type` CHECK constraint is widened. Existing RLS policies on `tasks` are unaffected — they filter by `assignee_id`, `created_by`, `client_id`, `store_id`. The new `auto_onboarding_step` source type works within existing policies.

---

## 8. Realtime Considerations

Supabase Realtime listens to table changes. The following tables should be published for Realtime:
- `client_onboarding_steps` — for pipeline/kanban board to react to step status changes.
- `tasks` — already published for board view.
- `notifications` — for push notifications to assignees.

No additional Realtime configuration needed; existing publication covers these tables.

---

## 9. Performance Considerations

### Hot queries after this change

1. **Find ready steps for an onboarding:** `WHERE onboarding_id = ? AND status = 'pending'` — covered by existing `idx_client_onboarding_steps_onboarding` + `idx_client_onboarding_steps_status`.
2. **Find task by source step:** `WHERE source_type = 'auto_onboarding_step' AND source_id = ?` — new partial index.
3. **Dependency check (array contains):** `SELECT ... FROM client_onboarding_steps WHERE id = ANY(step.depends_on_step_ids)` — covered by PK index on `id`; the GIN index on `depends_on_step_ids` covers reverse lookups ("which steps depend on this step?").
4. **Step → Task navigation:** `WHERE task_id = ?` — new index on `task_id`.

### Trigger performance

The cascade trigger does a single query per completed step to find waiting dependents. For typical onboardings (10-15 steps), this is negligible. The `pg_notify` payload is small (JSON with step IDs).

---

## 10. Rollback Plan

The rollback script (DOWN section in migration) reverses all changes:
1. Drop new triggers.
2. Drop new functions.
3. Drop new columns (`depends_on_step_ids`, `task_id`, `org_id` on `client_onboarding_steps`).
4. Drop `phase` column from `client_onboarding_steps` and `onboarding_template_steps`.
5. Drop `is_required` column from `client_onboarding_steps`.
6. Drop `depends_on_steps` column from `onboarding_template_steps`.
7. Restore old CHECK constraint on `tasks.source_type`.
8. Restore old trigger names.
9. Drop new indexes (`idx_cos_task_id`, `idx_cos_org_id`, `idx_cos_depends_on`, `idx_tasks_source_step`, `idx_cos_onboarding_status_phase`).

**Note:** `ALTER TYPE ... ADD VALUE` for enum values CANNOT be rolled back in PostgreSQL. The `waiting` and `review` values will persist even after rollback. This is safe because no existing code references these values.

---

## 11. Migration File

See `supabase/migrations/20260314_onboarding_board_sync.sql` for the complete, production-ready SQL.

### Execution checklist

1. [ ] Take schema snapshot before applying.
2. [ ] Dry-run on staging/branch database first.
3. [ ] Verify existing `client_onboarding_steps` row count for backfill estimate.
4. [ ] Apply migration.
5. [ ] Run smoke tests: verify triggers fire correctly, dependency cascade works.
6. [ ] Verify RLS policies still pass for all roles.
7. [ ] Update TypeScript types (`OnboardingStepStatus`, `TaskSourceType`).
8. [ ] Implement `OnboardingSyncService` with `onStepReady()` method (listens to `pg_notify` events).
9. [ ] Update `TaskAutomationService` integration to use `source_type = 'auto_onboarding_step'`.
