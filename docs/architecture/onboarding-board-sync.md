# Architecture: Onboarding-Board Bidirectional Sync

> **Status**: Draft
> **Author**: Aria (Architect Agent)
> **Date**: 2026-03-13
> **Epic**: Onboarding Pipeline <-> Personal Board Sync

---

## 1. Problem Statement

Today the onboarding pipeline (`/admin/onboarding`) and the personal board (`/admin/board`) are **disconnected systems**. When a designer's step becomes active in onboarding, nothing appears on their personal board. Completing a task on the board does not advance the onboarding pipeline. Team members must manually check the onboarding kanban to discover work assigned to them.

**Goal**: When an onboarding step becomes actionable for a team member, a linked task automatically appears on their personal board. When they complete it there, the onboarding step completes and the next step(s) in the DAG become actionable, triggering new tasks for the next assignees.

---

## 2. Design Principles

1. **Single Source of Truth**: `client_onboarding_steps` owns step status. The `tasks` row is a **projection** (mirror) of a step, not an independent entity.
2. **Unidirectional Write, Bidirectional Read**: Writes flow through a single service (`OnboardingSyncService`) that updates both tables atomically. Both UIs read their own table.
3. **DAG-Driven Progression**: Step ordering uses the existing `depends_on` column (DAG, not linear). Parallel steps are first-class.
4. **No Polling**: Realtime subscriptions on both `client_onboarding_steps` and `tasks` keep UIs in sync.
5. **Graceful Degradation**: If a step has no `assigned_to`, it stays actionable in the onboarding kanban but no board task is created until someone is assigned.

---

## 3. Database Changes

### 3.1 Linking tasks to onboarding steps (via `source_type` + `source_id`)

The link between the two systems uses the **existing** `source_type` and `source_id` columns on `tasks`. A task with `source_type = 'auto_onboarding_step'` and `source_id = onboarding_id` is a **synced onboarding task**. No new columns are added to `tasks`.

The `client_onboarding_steps.task_id` column (Section 3.2) provides the direct FK link from step to task.

**TypeScript type note:** No changes to the `Task` interface. The existing `source_type` and `source_id` fields are sufficient.

### 3.2 ALTER `client_onboarding_steps` -- add `task_id`, `depends_on_step_ids`, `is_required`

Direct FK to the linked board task, array-based dependency tracking, and required flag.

```sql
-- task_id: back-reference for fast lookup from onboarding UI to the board task (avoids join)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cos_task
  ON client_onboarding_steps(task_id)
  WHERE task_id IS NOT NULL;

-- depends_on_step_ids: array of client_onboarding_step UUIDs this step depends on
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS depends_on_step_ids UUID[] DEFAULT '{}';

-- is_required: whether this step must complete for phase advancement (copied from template)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;
```

**TypeScript type change:**

```typescript
// src/types/onboarding.ts -- add to ClientOnboardingStep interface
export interface ClientOnboardingStep {
  // ... existing fields ...
  task_id?: string                // NEW: back-reference to tasks.id
  depends_on_step_ids: string[]   // NEW: array of step IDs this depends on
  is_required: boolean            // NEW: whether step is required for phase completion
}
```

### 3.3 ALTER `onboarding_template_steps` -- add `phase`, `depends_on_steps`

Maps each template step to a pipeline phase and adds array-based multi-parent dependency tracking. The old `depends_on` column is kept for backward compatibility.

```sql
ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));

-- NEW: array-based multi-parent dependency tracking
-- Keep old `depends_on` (single UUID) for backward compat
ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS depends_on_steps UUID[] DEFAULT '{}';

-- Backfill existing template steps based on category convention
UPDATE onboarding_template_steps SET phase = 'pending_approval' WHERE category = 'setup' AND position <= 2;
UPDATE onboarding_template_steps SET phase = 'generating_copies' WHERE category = 'integration';
UPDATE onboarding_template_steps SET phase = 'design' WHERE category = 'setup' AND position > 2;
UPDATE onboarding_template_steps SET phase = 'implementation' WHERE category = 'training' OR category = 'launch';
-- NOTE: Backfill is approximate. Admin should review via template editor.
```

### 3.4 ALTER `client_onboarding_steps` -- add `phase` (denormalized from template)

```sql
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));
```

### 3.5 New enum value for `source_type` CHECK constraint

Add `auto_onboarding_step` to the `tasks.source_type` CHECK constraint. This distinguishes onboarding-synced tasks from other auto-generated tasks.

```sql
-- Update CHECK constraint to include auto_onboarding_step
-- (exact ALTER depends on existing constraint definition)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_source_type_check
  CHECK (source_type IN ('manual', 'auto_onboarding_step', /* ...other existing values... */));
```

### 3.6 RLS Policies

No new RLS policies needed. Existing policies already cover:
- `tasks`: viewable by assignee, creator, admin, org_owner
- `client_onboarding_steps`: viewable by assigned_to, onboarding assigned_to, admin, org_owner

The `task_id` column on `client_onboarding_steps` is just an FK -- it inherits the row's existing visibility.

### 3.7 Complete Migration SQL

```sql
-- ============================================================
-- Migration: 20260314_onboarding_board_sync.sql
-- Links onboarding steps to personal board tasks bidirectionally
-- ============================================================

-- 1. onboarding_steps -> tasks back-reference
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cos_task
  ON client_onboarding_steps(task_id)
  WHERE task_id IS NOT NULL;

-- 2. Array-based dependency tracking on client steps
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS depends_on_step_ids UUID[] DEFAULT '{}';

-- 3. Required flag (copied from template step)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;

-- 4. Phase on template steps
ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));

-- 5. depends_on_steps array on template steps (keep old depends_on for backward compat)
ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS depends_on_steps UUID[] DEFAULT '{}';

-- 6. Phase on client steps (denormalized)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));

-- 7. Update source_type CHECK constraint to include auto_onboarding_step
-- (adjust based on existing constraint values)

-- 8. Composite index for DAG resolution queries
CREATE INDEX IF NOT EXISTS idx_cos_onboarding_status_phase
  ON client_onboarding_steps(onboarding_id, status, phase);
```

---

## 4. Service Layer Architecture

### 4.1 New Service: `OnboardingSyncService` (HYBRID: DB triggers + App service)

The sync uses a **hybrid approach**:
- **DB triggers** handle: task completion -> step completion cascade, step completion -> mark `waiting` deps as `pending`
- **App service** handles: task creation (needs `board_config`), notifications (needs external calls), phase advancement logic

**File**: `src/lib/services/onboarding-sync.service.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/server"
import { TaskAutomationService } from "./task-automation.service"
import { notificationService } from "./notification.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingSync")

interface StepCompletionResult {
  completedStep: ClientOnboardingStep
  unlockedSteps: ClientOnboardingStep[]
  createdTaskIds: string[]
  phaseChanged: boolean
  newPhase?: string
}

export class OnboardingSyncService {

  /**
   * Complete a step (called from EITHER onboarding UI or board UI).
   * This is the SINGLE entry point for step completion.
   *
   * 1. Marks step as completed
   * 2. Marks linked task as completed (if exists)
   * 3. Resolves DAG to find newly unblocked steps
   * 4. Creates board tasks for unblocked steps
   * 5. Notifies next assignees
   * 6. Checks if phase should advance
   */
  static async completeStep(params: {
    stepId: string
    completedByUserId: string
    onboardingId: string
    orgId: string
  }): Promise<StepCompletionResult>

  /**
   * Start a step (mark as in_progress).
   * Updates both the step and linked task.
   */
  static async startStep(params: {
    stepId: string
    startedByUserId: string
    onboardingId: string
  }): Promise<void>

  /**
   * Block a step with a reason.
   * Updates both the step and linked task.
   */
  static async blockStep(params: {
    stepId: string
    blockedReason: string
    onboardingId: string
  }): Promise<void>

  /**
   * Assign a step to a team member.
   * Creates/updates the linked board task.
   */
  static async assignStep(params: {
    stepId: string
    assigneeOrgMemberId: string
    onboardingId: string
    orgId: string
  }): Promise<void>

  /**
   * Called when an onboarding is first created or enters a new phase.
   * Seeds board tasks for all steps in that phase that have assignees.
   */
  static async seedTasksForPhase(params: {
    onboardingId: string
    phase: string
    orgId: string
    clientId: string
    storeId?: string
    storeName: string
  }): Promise<string[]>

  /**
   * DAG resolver: given a completed step, find all steps whose
   * depends_on is now satisfied.
   */
  static async resolveUnlockedSteps(
    onboardingId: string,
    completedStepTemplateId: string
  ): Promise<ClientOnboardingStep[]>

  /**
   * Check if all steps in a phase are completed.
   * If so, advance the onboarding to the next phase.
   */
  static async checkPhaseCompletion(
    onboardingId: string,
    currentPhase: string
  ): Promise<{ advanced: boolean; newPhase?: string }>
}
```

### 4.2 Changes to `TaskAutomationService`

The existing `onOnboardingStarted()` method becomes a thin wrapper that delegates to `OnboardingSyncService.seedTasksForPhase()`.

```typescript
// In task-automation.service.ts

static async onOnboardingStarted(params: {
  onboardingId: string
  storeName: string
  clientId: string
  storeId?: string
  assignedTo: string
  orgId: string
}): Promise<void> {
  // Delegate to the sync service to seed tasks for the initial phase
  await OnboardingSyncService.seedTasksForPhase({
    onboardingId: params.onboardingId,
    phase: 'pending_approval', // first phase
    orgId: params.orgId,
    clientId: params.clientId,
    storeId: params.storeId,
    storeName: params.storeName,
  })
}
```

### 4.3 Changes to `NotificationService`

Add a server-side variant that uses `createAdminClient()` instead of `createClient()`, since step sync runs from API routes (server context), not from browser.

```typescript
// notification.service.ts -- add method

async createServer(data: CreateNotificationData): Promise<Notification | null> {
  const supabase = await createAdminClient()
  // ... same logic but using admin client ...
}

async createBulkServer(
  userIds: string[],
  data: Omit<CreateNotificationData, 'user_id'>
): Promise<number> {
  const supabase = await createAdminClient()
  // ...
}
```

---

## 5. API Contracts

### 5.1 Modified: `PUT /api/onboarding/[id]/steps`

Currently updates a step directly. Must now route through `OnboardingSyncService`.

```typescript
// Request body (unchanged)
{
  step_id: string
  status?: "waiting" | "pending" | "in_progress" | "review" | "blocked" | "completed" | "skipped"
  assigned_to?: string
  notes?: string
  blocked_reason?: string
  due_date?: string
}

// Response body (expanded)
{
  step: ClientOnboardingStep       // updated step
  onboarding_progress: number
  onboarding_status: string
  unlocked_steps?: ClientOnboardingStep[]  // NEW: steps that became actionable
  created_task_ids?: string[]              // NEW: board tasks created
  phase_changed?: boolean                  // NEW
  new_phase?: string                       // NEW
  message: string
}
```

**Implementation change**: When `status === "completed"`, call `OnboardingSyncService.completeStep()` instead of direct DB update. When `assigned_to` changes, call `OnboardingSyncService.assignStep()`.

### 5.2 Modified: `PATCH /api/tasks/[id]` (board task status change)

When a task with `source_type = 'auto_onboarding_step'` is moved to `completed` status:

```typescript
// In the existing task update handler, add:
const isOnboardingTask = task.source_type === 'auto_onboarding_step'

if (isOnboardingTask) {
  // Look up the step via task_id FK on client_onboarding_steps
  const { data: step } = await supabase
    .from('client_onboarding_steps')
    .select('id, onboarding_id')
    .eq('task_id', task.id)
    .single()

  if (step && newStatus === 'completed') {
    const result = await OnboardingSyncService.completeStep({
      stepId: step.id,
      completedByUserId: user.id,
      onboardingId: step.onboarding_id,
      orgId: task.org_id,
    })
    // Return additional info about unlocked steps
  }

  if (step && newStatus === 'in_progress') {
    await OnboardingSyncService.startStep({
      stepId: step.id,
      startedByUserId: user.id,
      onboardingId: step.onboarding_id,
    })
  }

  if (step && newStatus === 'blocked') {
    await OnboardingSyncService.blockStep({
      stepId: step.id,
      blockedReason: body.blocked_reason || 'Bloqueado via board',
      onboardingId: step.onboarding_id,
    })
  }
}
```

### 5.3 New: `POST /api/onboarding/[id]/seed-tasks`

Manual trigger to create board tasks for all actionable steps in the current phase. Useful for onboardings that were created before this feature existed.

```typescript
// Request
POST /api/onboarding/{onboardingId}/seed-tasks

// Response
{
  created_task_ids: string[]
  steps_without_assignee: string[]  // step names that couldn't get tasks
  message: string
}
```

### 5.4 New: `GET /api/onboarding/[id]/dag`

Returns the step dependency graph for visualization. Used by both the onboarding detail view and the board to show context.

```typescript
// Response
{
  steps: Array<{
    id: string
    name: string
    phase: string
    status: OnboardingStepStatus
    assigned_to?: string
    assignee_name?: string
    depends_on_step_ids: string[]  // step IDs this depends on
    dependents: string[]           // step IDs that depend on this
    task_id?: string
    is_actionable: boolean     // all dependencies met
  }>
  phases: Array<{
    name: string
    steps_total: number
    steps_completed: number
    is_current: boolean
  }>
}
```

---

## 6. Event Flow -- Detailed Sequence

### 6.1 Happy Path: Step Completion Chain

```
Onboarding: "Loja Acme" -- Phase: design
Steps in design phase:
  Step A: "Criar templates de email" (designer, depends_on: none) -- IN_PROGRESS
  Step B: "Criar segmentos" (analyst, depends_on: none) -- PENDING
  Step C: "Revisar design final" (coordinator, depends_on: A, B) -- WAITING (deps unmet)
```

**Sequence:**

```
1. Designer opens /admin/board
   -> Sees task "Criar templates de email - Loja Acme" in "in_progress" column

2. Designer drags task to "completed"
   -> Frontend calls PATCH /api/tasks/{taskId} { status: "completed" }

3. API handler detects task.source_type === 'auto_onboarding_step'
   -> Looks up step via: SELECT id, onboarding_id FROM client_onboarding_steps WHERE task_id = task.id
   -> Calls OnboardingSyncService.completeStep({
        stepId: stepA.id,
        completedByUserId: designer.profile_id,
        onboardingId: onboarding.id,
        orgId: org.id
      })

4. OnboardingSyncService.completeStep():
   a. UPDATE client_onboarding_steps SET status='completed', completed_at=now(), completed_by=userId
      WHERE id = stepA.id
   b. UPDATE tasks SET status='completed', completed_at=now()
      WHERE id = stepA.task_id  (redundant but ensures consistency)
   c. Call resolveUnlockedSteps():
      - Query all steps WHERE onboarding_id = X AND stepA.id = ANY(depends_on_step_ids)
      - Step C depends on A AND B. Check if ALL items in depends_on_step_ids are completed -> NO
      - No steps unlocked yet
   d. Call checkPhaseCompletion():
      - Count steps in "design" phase: 3 total, 1 completed -> NOT complete
   e. Return { unlockedSteps: [], phaseChanged: false }

5. Later, Analyst completes Step B (same flow via board or onboarding UI)

6. OnboardingSyncService.completeStep() for Step B:
   a. Mark B as completed
   b. resolveUnlockedSteps():
      - Step C has depends_on_step_ids = [stepA.id, stepB.id]
      - Check ALL deps: A (completed) AND B (just completed) -> ALL deps met
      - Mark Step C as "pending" (was "waiting" with deps unmet, now truly actionable)
   c. Create board task for Step C:
      - Find coordinator org_member in the org
      - Call TaskAutomationService.createAutoTask({
          title: "Revisar design final - Loja Acme",
          source_type: "auto_onboarding_step",
          source_id: onboarding.id,
          candidate_assignees: [coordinator.org_member_id]
        })
      - Save task_id back to Step C
   d. Notify coordinator:
      - notificationService.createServer({
          user_id: coordinator.profile_id,
          title: "Nova etapa disponivel: Revisar design final",
          body: "O onboarding da Loja Acme avancou. Sua etapa esta pronta.",
          type: "info",
          link: "/admin/board"
        })
   e. checkPhaseCompletion() -> 2 of 3 completed, not yet

7. Coordinator completes Step C
   -> All steps in "design" phase completed
   -> checkPhaseCompletion() returns { advanced: true, newPhase: "implementation" }
   -> Service updates client_onboardings.current_phase = 'implementation'
   -> Logs transition in onboarding_phase_transitions
   -> Calls seedTasksForPhase("implementation") to create tasks for implementation steps
   -> Notifies all implementation step assignees
```

### 6.2 Edge Case: Step Has No Assignee

```
Step D: "Configurar DNS" (no assigned_to, no default_assignee_role)

-> resolveUnlockedSteps() finds Step D is unblocked
-> Step D has no assignee -> NO board task created
-> Step D.status remains "pending" (visible in onboarding kanban)
-> Onboarding manager sees unassigned step in kanban, assigns someone
-> OnboardingSyncService.assignStep() creates the board task
-> Assignee gets notified
```

### 6.3 Edge Case: Member Marks Task as Blocked

```
1. Developer drags task to "blocked" on board
2. API calls OnboardingSyncService.blockStep()
3. Step status -> "blocked", blocked_reason saved
4. Board task status -> "blocked"
5. Notification sent to onboarding manager (assigned_to on client_onboardings)
6. No downstream steps are affected (they were already pending)
7. When block is resolved, manager moves step back to in_progress
```

### 6.4 Edge Case: Parallel Steps in Same Phase

```
Phase: implementation
  Step E: "Instalar widget" (developer) -- depends_on: none
  Step F: "Treinar equipe" (support) -- depends_on: none
  Step G: "Go-live review" (coordinator) -- depends_on: E, F

-> When phase starts, both E and F get board tasks simultaneously
-> Developer and Support work in parallel
-> Step G only unlocks when BOTH E and F are completed
-> This is native to the DAG model; no special handling needed
```

### 6.5 Edge Case: Step Reassignment

```
1. Manager reassigns Step A from Designer1 to Designer2
2. OnboardingSyncService.assignStep():
   a. Update client_onboarding_steps.assigned_to = designer2.org_member_id
   b. If task_id exists:
      - Update tasks.assignee_id = designer2.org_member_id
      - (Same task, just reassigned)
   c. If no task_id:
      - Create new board task for Designer2
      - Save task_id
   d. Notify Designer2
```

---

## 7. Component Architecture

### 7.1 Shared Card Strategy

The onboarding kanban and board kanban render **different components** but share a **common data contract** for the onboarding context.

```
OnboardingKanban                    BoardKanban
  |                                   |
  v                                   v
OnboardingCard                      TaskCard
  - Full onboarding info            - Generic task info
  - All steps as checklist          - Single step as task
  - Progress bar                    - Priority, due date
  - Phase badge                     - Client/store badge
  - "View on Board" link            - "View in Onboarding" link
```

**No shared card component**. The two UIs have fundamentally different information density needs. Instead, share:

1. **Status color mapping** -- extract to `src/lib/constants/onboarding-status.ts` (already partially exists)
2. **Client/Store badge component** -- reuse `<Badge>` with consistent styling
3. **Phase indicator** -- shared `OnboardingPhaseBadge` component

### 7.2 TaskCard Enhancement

Add onboarding context when `task.source_type === 'auto_onboarding_step'`:

```typescript
// In task-card.tsx, add:
{task.source_type === 'auto_onboarding_step' && (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
    <Rocket className="w-3 h-3" />
    <span>Etapa de onboarding</span>
    <a href={`/admin/onboarding?highlight=${task.source_id}`}
       className="text-primary hover:underline ml-1">
      Ver pipeline
    </a>
  </div>
)}
```

### 7.3 OnboardingKanban Card Enhancement

Show linked board task status:

```typescript
// In onboarding step display, add:
{step.task_id && (
  <div className="flex items-center gap-1.5 text-xs">
    <ClipboardList className="w-3 h-3" />
    <span>No board de {step.assignee?.profile?.name}</span>
  </div>
)}
```

### 7.4 Realtime Subscription Strategy

**Current**: `useRealtimeOnboarding` subscribes to `client_onboardings` table changes.

**Required additions**:

```typescript
// Option A (recommended): Expand existing hook
// Subscribe to both tables in the same channel

const channel = supabase
  .channel("onboarding-board-sync")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "client_onboardings",
  }, debouncedUpdate)
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "client_onboarding_steps",
  }, debouncedUpdate)
  .subscribe()
```

**For the board page**: Add subscription to `tasks` table filtered by current user's `assignee_id`:

```typescript
// New hook: useRealtimeBoard
const channel = supabase
  .channel("board-realtime")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "tasks",
    filter: `assignee_id=eq.${currentOrgMemberId}`,
  }, debouncedUpdate)
  .subscribe()
```

---

## 8. DAG Dependency Resolution

### 8.1 Algorithm

Dependencies use array-based multi-parent tracking:
- **Template steps**: `depends_on_steps UUID[]` (new, array). Old `depends_on` (single UUID) kept for backward compat.
- **Client steps**: `depends_on_step_ids UUID[]` -- populated when onboarding is instantiated from template.

A step is **actionable** when ALL items in its `depends_on_step_ids` array are in `completed` or `skipped` status. Steps with an empty array have no dependencies and are immediately actionable within their phase.

Steps whose dependencies are NOT yet met have status `waiting`. When all dependencies are satisfied, the DB trigger (or app service) transitions the step to `pending` (ready to start).

### 8.2 Resolution Query

```sql
-- Find steps that are now actionable after completing step X
-- A step is actionable when:
-- 1. Its status is 'waiting' (deps were unmet)
-- 2. ALL items in depends_on_step_ids are 'completed' or 'skipped'
-- 3. It belongs to the current phase (or phase is being seeded)

SELECT cos.*
FROM client_onboarding_steps cos
WHERE cos.onboarding_id = $1
  AND cos.status = 'waiting'
  AND cos.phase = $2
  AND (
    cos.depends_on_step_ids = '{}'            -- no dependencies
    OR NOT EXISTS (
      -- Check that NO dependency is still incomplete
      SELECT 1
      FROM unnest(cos.depends_on_step_ids) AS dep_id
      JOIN client_onboarding_steps dep ON dep.id = dep_id
      WHERE dep.status NOT IN ('completed', 'skipped')
    )
  );
```

### 8.3 Phase Transition Query

```sql
-- Check if all required steps in a phase are complete
SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped') AND is_required = true) AS remaining_required,
  COUNT(*) FILTER (WHERE is_required = true) AS total_required,
  COUNT(*) AS total
FROM client_onboarding_steps
WHERE onboarding_id = $1
  AND phase = $2;
-- If remaining_required = 0, phase is complete
```

### 8.4 Phase Order

```typescript
const PHASE_ORDER: string[] = [
  'pending_approval',
  'generating_copies',
  'design',
  'implementation',
  'completed',
]

function getNextPhase(current: string): string | null {
  const idx = PHASE_ORDER.indexOf(current)
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null
  return PHASE_ORDER[idx + 1]
}
```

---

## 9. Status Mapping

### 9.1 Step Status <-> Task Status

| Onboarding Step Status | Board Task Status | Direction | Description |
|------------------------|-------------------|-----------|-------------|
| `waiting`              | *no task created* | N/A       | Dependencies unmet, not yet actionable |
| `pending`              | `pending`         | Step -> Task (on creation) | Ready to start (all deps met) |
| `in_progress`          | `in_progress`     | Bidirectional | Work actively being done |
| `review`               | `review`          | Bidirectional | Work done, awaiting review |
| `blocked`              | `blocked`         | Bidirectional | Blocked by external issue |
| `completed`            | `completed`       | Bidirectional | Done |
| `skipped`              | `cancelled`       | Step -> Task | Intentionally skipped |

### 9.2 Phase <-> Onboarding `current_phase`

When all steps in a phase complete, `client_onboardings.current_phase` advances to the next phase and `onboarding_phase_transitions` gets a new row.

---

## 10. Notification Templates

### 10.1 Step Assigned

```
Title: "Nova etapa: {step_name}"
Body:  "Voce foi designado para a etapa '{step_name}' do onboarding de {store_name}."
Link:  "/admin/board"
Type:  "info"
```

### 10.2 Step Unlocked (Dependencies Met)

```
Title: "Etapa disponivel: {step_name}"
Body:  "Todas as dependencias foram concluidas. A etapa '{step_name}' do onboarding de {store_name} esta pronta para inicio."
Link:  "/admin/board"
Type:  "info"
```

### 10.3 Step Blocked

```
Title: "Etapa bloqueada: {step_name}"
Body:  "{blocker_name} bloqueou a etapa '{step_name}' do onboarding de {store_name}. Motivo: {reason}"
Link:  "/admin/onboarding?id={onboarding_id}"
Type:  "warning"
```

### 10.4 Phase Complete

```
Title: "Fase concluida: {phase_name}"
Body:  "Todas as etapas da fase '{phase_name}' do onboarding de {store_name} foram concluidas. Proxima fase: {next_phase}."
Link:  "/admin/onboarding?id={onboarding_id}"
Type:  "success"
```

### 10.5 Onboarding Complete

```
Title: "Onboarding concluido: {store_name}"
Body:  "Parabens! O onboarding da loja {store_name} foi concluido com sucesso."
Link:  "/admin/onboarding?id={onboarding_id}"
Type:  "success"
```

---

## 11. Critical Design Decisions (ADRs)

### ADR-1: Projection Model vs Independent Tasks

**Decision**: Board tasks are **projections** of onboarding steps, not independent entities.

**Alternatives considered**:
1. **Independent tasks with event sync**: Create standalone tasks that listen to step events. Allows tasks to have their own lifecycle.
2. **Projection model** (chosen): Task is a mirror. Writes always go through the sync service.
3. **Single table**: Eliminate the tasks table for onboarding steps, render directly from steps.

**Why projection**:
- Prevents divergence (two sources of truth is the #1 cause of sync bugs)
- Simpler mental model for devs
- Board UI already works with the `tasks` table shape -- no refactoring
- Still allows manual tasks to coexist on the board

**Tradeoff**: A board task for an onboarding step cannot be independently edited (e.g., changing priority on the board does not propagate to the step). This is acceptable because the step is the authority.

### ADR-2: Phase-Based Grouping vs Pure DAG

**Decision**: Use `phase` as a grouping mechanism with `depends_on` for intra-phase ordering.

**Why**: The existing UI is phase-based (kanban columns). Pure DAG would require a completely new UI paradigm. Phase grouping maps naturally to the existing kanban and is easier to reason about for managers. The DAG within each phase handles sequential dependencies.

**Tradeoff**: Cannot express cross-phase dependencies (e.g., "implementation step X depends on design step Y"). For v1 this is fine because phase transitions already enforce this sequencing.

### ADR-3: Sync Direction

**Decision**: Both the onboarding UI and board UI can trigger completion, routed through the same service.

**Why**: Team members should be able to complete work from whichever screen they prefer. Routing both through `OnboardingSyncService` ensures consistency.

### ADR-4: Hybrid DB Triggers + App Service

**Decision**: Use a **hybrid approach** -- DB triggers handle pure data cascading, app service handles external concerns.

**DB triggers handle:**
- Task completion -> step completion cascade (status sync)
- Step completion -> check `depends_on_step_ids` and mark `waiting` deps as `pending`
- The existing `update_onboarding_progress` trigger remains for progress calculation

**App service handles:**
- Task creation (needs `board_config` lookup, org member resolution)
- Notifications (needs external service calls)
- Phase advancement and seeding tasks for next phase

**Why hybrid**:
- Cascading status changes are a pure DB concern -- triggers ensure consistency even if app crashes mid-operation
- Task creation and notifications require application context that triggers cannot access
- Easier to test the app-layer logic independently from the trigger-layer logic

### ADR-5: Array-based `depends_on_step_ids` for multi-parent dependencies

**Decision**: Use `UUID[]` arrays for dependency tracking on both template steps (`depends_on_steps`) and client steps (`depends_on_step_ids`). Keep old single `depends_on` on template steps for backward compatibility.

**Why**: Multi-parent dependencies (Step C depends on both A and B) are a common real-world need. Array-based tracking is more expressive and avoids the workaround of relying solely on phase grouping for parallel completion gates. DAG cycle detection should be implemented in the template editor validation.

---

## 12. Implementation Phases

### Phase 1: Database + Service Foundation (1 story, ~3 dev days)

1. Create migration `20260314_onboarding_board_sync.sql`
2. Implement `OnboardingSyncService` with `completeStep`, `startStep`, `blockStep`, `assignStep`
3. Implement `resolveUnlockedSteps` and `checkPhaseCompletion`
4. Update TypeScript types (`Task`, `ClientOnboardingStep`, `OnboardingTemplateStep`)
5. Unit tests for DAG resolution logic

### Phase 2: API Integration (1 story, ~2 dev days)

1. Modify `PUT /api/onboarding/[id]/steps` to use sync service
2. Modify task update handler to detect `source_type === 'auto_onboarding_step'` and route through sync service
3. Implement `POST /api/onboarding/[id]/seed-tasks`
4. Implement `GET /api/onboarding/[id]/dag`

### Phase 3: Board UI Enhancement (1 story, ~2 dev days)

1. Add onboarding context badge to `TaskCard` when `source_type === 'auto_onboarding_step'`
2. Add "View in Pipeline" link
3. Prevent editing of synced task fields (title, description) -- read from step
4. Add `useRealtimeBoard` hook
5. Handle `blocked` status with reason display

### Phase 4: Onboarding UI Enhancement (1 story, ~2 dev days)

1. Add "On board" indicator to step display
2. Add "View on Board" link per step
3. Expand `useRealtimeOnboarding` to subscribe to `client_onboarding_steps`
4. Show board task status inline in step detail

### Phase 5: Notification + Seed Existing (1 story, ~1 dev day)

1. Implement notification templates (section 10)
2. Build admin action to seed tasks for existing in-progress onboardings
3. Backfill `phase` column on existing `client_onboarding_steps`

### Phase 6: Template Editor Enhancement (1 story, ~1 dev day)

1. Add `phase` selector to template step editor
2. Validate DAG (no cycles, `depends_on` only within same phase or earlier)
3. Preview phase grouping in template editor

---

## 13. Observability

### Logging

All operations through `OnboardingSyncService` log via `logger.child("OnboardingSync")`:
- `step_completed` -- step_id, onboarding_id, user_id, unlocked_count
- `task_created` -- task_id, step_id, assignee_id
- `phase_advanced` -- onboarding_id, from_phase, to_phase
- `step_blocked` -- step_id, reason
- `dag_resolution` -- onboarding_id, completed_step_id, unlocked_step_ids

### Metrics to Track

- Time per step (started_at to completed_at)
- Time per phase
- Total onboarding duration
- Steps blocked frequency
- Phase completion rate

These can be derived from existing `onboarding_phase_transitions` + `client_onboarding_steps` timestamps. No additional tables needed.

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Race condition: two users complete same step | Low | Medium | DB trigger checks current status before cascading; service uses optimistic concurrency |
| Orphaned tasks after step deletion | Low | Low | `ON DELETE SET NULL` on `task_id` FK; cleanup handled by service |
| Phase column not backfilled correctly | Medium | Medium | Provide admin UI to verify/fix phase assignments; seed-tasks endpoint validates |
| Notification spam on bulk operations | Medium | Low | Batch notifications; debounce in service |
| Realtime channel limits (Supabase) | Low | Medium | Use table-level subscription, not row-level; existing debounce pattern handles volume |

---

*-- Aria, arquitetando o futuro*
