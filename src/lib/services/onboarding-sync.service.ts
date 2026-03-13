import { createAdminClient } from "@/lib/supabase/server"
import { TaskAutomationService } from "./task-automation.service"
import { StepDependencyService } from "./step-dependency.service"
import {
  notifyStepPending,
  notifyPhaseComplete,
  notifyOnboardingComplete,
  notifyStepReassigned,
} from "./onboarding-notifications"
import { logger } from "@/lib/logger"
import type { OnboardingStepStatus } from "@/types/onboarding"
import type { TaskStatus } from "@/types/task"

const log = logger.child("OnboardingSync")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepCompletionResult {
  unlockedStepIds: string[]
  createdTaskIds: string[]
  phaseChanged: boolean
  newPhase?: string
  onboardingCompleted: boolean
}

export interface SeedTasksResult {
  created: number
  skipped: number
  errors: number
}

// Map: task status -> step status (for board -> onboarding sync)
const TASK_TO_STEP_STATUS: Partial<Record<TaskStatus, OnboardingStepStatus>> = {
  in_progress: "in_progress",
  blocked: "blocked",
  review: "review",
  completed: "completed",
  pending: "pending",
}

// Map: step status -> task status (for onboarding -> board sync)
const STEP_TO_TASK_STATUS: Partial<Record<OnboardingStepStatus, TaskStatus>> = {
  in_progress: "in_progress",
  blocked: "blocked",
  review: "review",
  completed: "completed",
  pending: "pending",
}

// Phases in order
const PHASE_ORDER = [
  "pending_approval",
  "generating_copies",
  "design",
  "implementation",
  "completed",
] as const

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Bidirectional sync between the onboarding pipeline and the personal board.
 *
 * HYBRID approach:
 * - DB triggers handle: task completion -> step completion, step completion -> cascade deps
 * - This service handles: task creation (needs board_config), notifications, phase advancement
 *
 * All methods are non-throwing by design. Errors are logged but never propagate
 * to the caller — sync failures must NOT break the original operation.
 */
export class OnboardingSyncService {
  // -----------------------------------------------------------------------
  // onTaskCompleted (AC 40.4.2)
  // -----------------------------------------------------------------------

  /**
   * Called AFTER a board task with source_type='auto_onboarding_step' is completed.
   *
   * The DB trigger already:
   *  - Marked the linked step as completed
   *  - Cascaded waiting deps to pending
   *
   * This method:
   *  1. Finds newly-pending steps (no task yet)
   *  2. Creates board tasks for them via TaskAutomationService
   *  3. Sends notifications
   *  4. Checks phase/onboarding completion
   */
  static async onTaskCompleted(taskId: string): Promise<void> {
    try {
      const supabase = createAdminClient()

      // 1. Look up the linked step
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, status, phase, org_id")
        .eq("task_id", taskId)
        .maybeSingle()

      if (stepErr || !step) {
        if (stepErr) log.error("onTaskCompleted: failed to look up step", { taskId, error: stepErr })
        return // Not a synced task or already cleaned up
      }

      log.info("onTaskCompleted: processing", {
        action: "task_completed",
        taskId,
        stepId: step.id,
        onboardingId: step.onboarding_id,
      })

      // 2. Handle newly-pending steps + phase completion
      await this.handleNewlyPendingSteps(step.onboarding_id, step.org_id ?? undefined)
      await this.checkPhaseAndOnboardingCompletion(step.onboarding_id)
    } catch (err) {
      log.error("onTaskCompleted: unexpected error", { taskId, err })
    }
  }

  // -----------------------------------------------------------------------
  // onStepCompleted (AC 40.4.3)
  // -----------------------------------------------------------------------

  /**
   * Called when a step is completed directly via the onboarding UI (kanban).
   *
   * 1. If the step has a linked task, update the task to completed
   *    (with _syncOrigin to prevent loop)
   * 2. DB trigger will cascade deps
   * 3. Handle newly-pending steps and phase completion
   */
  static async onStepCompleted(stepId: string, _completedBy?: string): Promise<void> {
    try {
      const supabase = createAdminClient()

      // 1. Fetch the step
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, task_id, org_id, name")
        .eq("id", stepId)
        .single()

      if (stepErr || !step) {
        log.error("onStepCompleted: step not found", { stepId, error: stepErr })
        return
      }

      log.info("onStepCompleted: processing", {
        action: "step_completed",
        stepId,
        taskId: step.task_id,
        onboardingId: step.onboarding_id,
      })

      // 2. If there's a linked board task, mark it as completed
      if (step.task_id) {
        const { error: taskErr } = await supabase
          .from("tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            metadata: {
              _syncOrigin: "onboarding_step",
              step_id: step.id,
              onboarding_id: step.onboarding_id,
            },
          })
          .eq("id", step.task_id)
          .neq("status", "completed") // Don't update if already completed

        if (taskErr) {
          log.error("onStepCompleted: failed to update task", {
            stepId,
            taskId: step.task_id,
            error: taskErr,
          })
        }
      }

      // 3. Transition waiting deps to pending (in case DB trigger didn't fire)
      await StepDependencyService.transitionToPending(step.onboarding_id)

      // 4. Handle newly-pending steps + phase/onboarding completion
      await this.handleNewlyPendingSteps(step.onboarding_id, step.org_id ?? undefined)
      await this.checkPhaseAndOnboardingCompletion(step.onboarding_id)
    } catch (err) {
      log.error("onStepCompleted: unexpected error", { stepId, err })
    }
  }

  // -----------------------------------------------------------------------
  // onTaskStatusChanged (AC 40.4.4)
  // -----------------------------------------------------------------------

  /**
   * Syncs intermediate status changes from board task -> onboarding step.
   * Only handles: in_progress, blocked, review.
   * Completion is handled by onTaskCompleted().
   */
  static async onTaskStatusChanged(taskId: string, newStatus: TaskStatus): Promise<void> {
    try {
      // Completion is handled separately
      if (newStatus === "completed") {
        await this.onTaskCompleted(taskId)
        return
      }

      const targetStepStatus = TASK_TO_STEP_STATUS[newStatus]
      if (!targetStepStatus) return // Status not mapped (e.g. cancelled)

      const supabase = createAdminClient()

      // Look up the linked step
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, status")
        .eq("task_id", taskId)
        .maybeSingle()

      if (stepErr || !step) return // Not a synced task

      // Guard: skip if step already has the target status (loop prevention)
      if (step.status === targetStepStatus) return

      const updateData: Record<string, unknown> = {
        status: targetStepStatus,
        updated_at: new Date().toISOString(),
      }

      // Set started_at when moving to in_progress
      if (targetStepStatus === "in_progress") {
        updateData.started_at = new Date().toISOString()
      }

      const { error: updateErr } = await supabase
        .from("client_onboarding_steps")
        .update(updateData)
        .eq("id", step.id)

      if (updateErr) {
        log.error("onTaskStatusChanged: failed to update step", {
          taskId,
          stepId: step.id,
          newStatus,
          error: updateErr,
        })
        return
      }

      log.info("onTaskStatusChanged: synced", {
        action: "task_status_changed",
        taskId,
        stepId: step.id,
        onboardingId: step.onboarding_id,
        newStatus,
        targetStepStatus,
      })
    } catch (err) {
      log.error("onTaskStatusChanged: unexpected error", { taskId, newStatus, err })
    }
  }

  // -----------------------------------------------------------------------
  // onStepStatusChanged (for onboarding -> board sync of intermediate statuses)
  // -----------------------------------------------------------------------

  /**
   * Syncs intermediate status changes from onboarding step -> board task.
   * Called when a step status changes directly in the onboarding UI.
   */
  static async onStepStatusChanged(
    stepId: string,
    newStatus: OnboardingStepStatus,
    userId?: string,
  ): Promise<void> {
    try {
      // Completion is handled by onStepCompleted
      if (newStatus === "completed") {
        await this.onStepCompleted(stepId, userId)
        return
      }

      const targetTaskStatus = STEP_TO_TASK_STATUS[newStatus]
      if (!targetTaskStatus) return // Status not mapped (e.g. waiting, skipped)

      const supabase = createAdminClient()

      // Fetch the step to get its task_id
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, task_id, onboarding_id")
        .eq("id", stepId)
        .single()

      if (stepErr || !step || !step.task_id) return // No linked task

      // Guard: check current task status to prevent loop
      const { data: task } = await supabase
        .from("tasks")
        .select("status")
        .eq("id", step.task_id)
        .single()

      if (!task || task.status === targetTaskStatus) return

      const updateData: Record<string, unknown> = {
        status: targetTaskStatus,
        metadata: {
          _syncOrigin: "onboarding_step",
          step_id: step.id,
          onboarding_id: step.onboarding_id,
        },
      }

      if (targetTaskStatus === "in_progress") {
        updateData.started_at = new Date().toISOString()
      }

      const { error: updateErr } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", step.task_id)

      if (updateErr) {
        log.error("onStepStatusChanged: failed to update task", {
          stepId,
          taskId: step.task_id,
          newStatus,
          error: updateErr,
        })
        return
      }

      log.info("onStepStatusChanged: synced", {
        action: "step_status_changed",
        stepId,
        taskId: step.task_id,
        onboardingId: step.onboarding_id,
        newStatus,
        targetTaskStatus,
      })
    } catch (err) {
      log.error("onStepStatusChanged: unexpected error", { stepId, newStatus, err })
    }
  }

  // -----------------------------------------------------------------------
  // handleNewlyPendingSteps (AC 40.4.2 / 40.4.3)
  // -----------------------------------------------------------------------

  /**
   * After a step completes and DB triggers cascade deps, find steps that
   * are now pending but don't have board tasks yet. Create tasks + notify.
   */
  private static async handleNewlyPendingSteps(
    onboardingId: string,
    orgId?: string,
  ): Promise<string[]> {
    try {
      const supabase = createAdminClient()

      // Fetch newly-pending steps that don't have a board task yet
      const { data: pendingSteps, error } = await supabase
        .from("client_onboarding_steps")
        .select(`
          id, name, description, assigned_to, phase,
          onboarding_id, org_id, due_date,
          metadata
        `)
        .eq("onboarding_id", onboardingId)
        .eq("status", "pending")
        .is("task_id", null)

      if (error || !pendingSteps || pendingSteps.length === 0) {
        return []
      }

      // Fetch onboarding context (client + store info)
      const { data: onboarding } = await supabase
        .from("client_onboardings")
        .select(`
          id, client_id, store_id, assigned_to,
          client:clients(id, name),
          store:client_stores(id, store_name)
        `)
        .eq("id", onboardingId)
        .single()

      if (!onboarding) {
        log.warn("handleNewlyPendingSteps: onboarding not found", { onboardingId })
        return []
      }

      const resolvedOrgId = orgId || pendingSteps[0]?.org_id
      const clientName = (onboarding.client as unknown as { name: string })?.name || "Cliente"
      const storeName = (onboarding.store as unknown as { store_name: string })?.store_name || ""

      const createdTaskIds: string[] = []

      for (const step of pendingSteps) {
        try {
          // Create board task via TaskAutomationService
          const taskId = await TaskAutomationService.onOnboardingStepPending({
            stepId: step.id,
            stepName: step.name,
            stepDescription: step.description ?? undefined,
            stepPhase: step.phase ?? undefined,
            onboardingId,
            clientId: onboarding.client_id,
            clientName,
            storeId: onboarding.store_id ?? undefined,
            storeName: storeName || undefined,
            assignedTo: step.assigned_to ?? undefined,
            onboardingAssignedTo: onboarding.assigned_to ?? undefined,
            orgId: resolvedOrgId!,
            dueDate: step.due_date ?? undefined,
          })

          if (taskId) {
            createdTaskIds.push(taskId)

            // Send notification to the assignee
            const assigneeId = step.assigned_to ?? onboarding.assigned_to
            if (assigneeId) {
              // Resolve profile_id from org_member_id
              const { data: member } = await supabase
                .from("org_members")
                .select("profile_id")
                .eq("id", assigneeId)
                .single()

              if (member?.profile_id) {
                await notifyStepPending({
                  assigneeProfileId: member.profile_id,
                  stepName: step.name,
                  clientName,
                  storeName: storeName || clientName,
                  onboardingId,
                  stepId: step.id,
                  orgId: resolvedOrgId!,
                })
              }
            }
          }
        } catch (stepErr) {
          log.error("handleNewlyPendingSteps: failed for step", {
            stepId: step.id,
            stepName: step.name,
            error: stepErr,
          })
        }
      }

      if (createdTaskIds.length > 0) {
        log.info("handleNewlyPendingSteps: tasks created", {
          action: "tasks_created_for_pending_steps",
          onboardingId,
          count: createdTaskIds.length,
          taskIds: createdTaskIds,
        })
      }

      // AC 40.9.5: Post-cascade progress verification.
      // The DB trigger recalculates progress_percent automatically.
      // Log here if trigger result shows 100% but status not yet completed,
      // so checkPhaseAndOnboardingCompletion (called right after) can handle it.
      const { data: refreshedOnboarding } = await supabase
        .from("client_onboardings")
        .select("id, progress_percent, status")
        .eq("id", onboardingId)
        .single()

      if (
        refreshedOnboarding?.progress_percent === 100 &&
        refreshedOnboarding.status !== "completed"
      ) {
        log.info("handleNewlyPendingSteps: progress at 100%, pending completion transition", {
          onboardingId,
          currentStatus: refreshedOnboarding.status,
        })
      }

      return createdTaskIds
    } catch (err) {
      log.error("handleNewlyPendingSteps: unexpected error", { onboardingId, err })
      return []
    }
  }

  // -----------------------------------------------------------------------
  // checkPhaseAndOnboardingCompletion (AC 40.4.2)
  // -----------------------------------------------------------------------

  /**
   * After step completion, check:
   * 1. If the current phase is fully complete -> advance to next phase
   * 2. If ALL required steps are complete -> mark onboarding as completed
   */
  private static async checkPhaseAndOnboardingCompletion(
    onboardingId: string,
  ): Promise<{ phaseChanged: boolean; onboardingCompleted: boolean }> {
    try {
      const supabase = createAdminClient()

      // Fetch onboarding + all steps
      const { data: onboarding } = await supabase
        .from("client_onboardings")
        .select(`
          id, current_phase, status, client_id, store_id, assigned_to, org_id,
          client:clients(id, name),
          store:client_stores(id, store_name)
        `)
        .eq("id", onboardingId)
        .single()

      if (!onboarding) return { phaseChanged: false, onboardingCompleted: false }

      const { data: allSteps } = await supabase
        .from("client_onboarding_steps")
        .select("id, status, phase, is_required")
        .eq("onboarding_id", onboardingId)

      if (!allSteps) return { phaseChanged: false, onboardingCompleted: false }

      let phaseChanged = false
      let onboardingCompleted = false

      // --- Check phase completion ---
      const currentPhase = onboarding.current_phase
      if (currentPhase && currentPhase !== "completed") {
        const phaseSteps = allSteps.filter((s) => s.phase === currentPhase)
        const incompleteInPhase = phaseSteps.filter(
          (s) => s.is_required !== false && !["completed", "skipped"].includes(s.status),
        )

        if (phaseSteps.length > 0 && incompleteInPhase.length === 0) {
          // Phase complete — advance to next
          const currentIdx = PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number])
          const nextPhase = currentIdx >= 0 && currentIdx < PHASE_ORDER.length - 1
            ? PHASE_ORDER[currentIdx + 1]
            : null

          if (nextPhase) {
            await supabase
              .from("client_onboardings")
              .update({ current_phase: nextPhase })
              .eq("id", onboardingId)

            // Log the transition
            await supabase.from("onboarding_phase_transitions").insert({
              onboarding_id: onboardingId,
              from_phase: currentPhase,
              to_phase: nextPhase,
              triggered_by: "auto",
            })

            phaseChanged = true

            log.info("Phase advanced", {
              action: "phase_advanced",
              onboardingId,
              fromPhase: currentPhase,
              toPhase: nextPhase,
            })

            // Notify relevant team members
            const storeName =
              (onboarding.store as unknown as { store_name: string })?.store_name || ""
            const recipientIds = await this.getOnboardingTeamProfileIds(onboardingId)

            if (recipientIds.length > 0) {
              await notifyPhaseComplete({
                recipientProfileIds: recipientIds,
                phaseName: currentPhase,
                storeName: storeName || "Onboarding",
                nextPhase,
                onboardingId,
                orgId: onboarding.org_id ?? "",
              })
            }

            // Transition waiting deps for newly-available steps in the new phase
            await StepDependencyService.transitionToPending(onboardingId)
            await this.handleNewlyPendingSteps(onboardingId, onboarding.org_id ?? undefined)
          }
        }
      }

      // --- Check full onboarding completion ---
      const requiredSteps = allSteps.filter((s) => s.is_required !== false)
      const allRequiredDone = requiredSteps.every((s) =>
        ["completed", "skipped"].includes(s.status),
      )

      if (allRequiredDone && requiredSteps.length > 0 && onboarding.status !== "completed") {
        await supabase
          .from("client_onboardings")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            progress_percent: 100,
          })
          .eq("id", onboardingId)

        onboardingCompleted = true

        log.info("Onboarding completed", {
          action: "onboarding_completed",
          onboardingId,
        })

        // Notify team
        const storeName =
          (onboarding.store as unknown as { store_name: string })?.store_name || ""
        const recipientIds = await this.getOnboardingTeamProfileIds(onboardingId)

        if (recipientIds.length > 0) {
          await notifyOnboardingComplete({
            recipientProfileIds: recipientIds,
            storeName: storeName || "Onboarding",
            onboardingId,
            orgId: onboarding.org_id ?? "",
          })
        }
      }

      return { phaseChanged, onboardingCompleted }
    } catch (err) {
      log.error("checkPhaseAndOnboardingCompletion: unexpected error", { onboardingId, err })
      return { phaseChanged: false, onboardingCompleted: false }
    }
  }

  // -----------------------------------------------------------------------
  // seedTasks (AC 40.4.10)
  // -----------------------------------------------------------------------

  /**
   * Create board tasks for all pending steps that don't have one yet.
   * Used for backfill via POST /api/onboarding/[id]/seed-tasks.
   */
  static async seedTasks(onboardingId: string): Promise<SeedTasksResult> {
    const result: SeedTasksResult = { created: 0, skipped: 0, errors: 0 }

    try {
      const supabase = createAdminClient()

      // Fetch onboarding context
      const { data: onboarding } = await supabase
        .from("client_onboardings")
        .select(`
          id, client_id, store_id, assigned_to, org_id,
          client:clients(id, name),
          store:client_stores(id, store_name)
        `)
        .eq("id", onboardingId)
        .single()

      if (!onboarding) {
        log.error("seedTasks: onboarding not found", { onboardingId })
        return result
      }

      // Fetch pending steps without tasks
      const { data: pendingSteps, error } = await supabase
        .from("client_onboarding_steps")
        .select("id, name, description, assigned_to, phase, org_id, due_date")
        .eq("onboarding_id", onboardingId)
        .eq("status", "pending")
        .is("task_id", null)

      if (error || !pendingSteps) {
        log.error("seedTasks: failed to fetch pending steps", { onboardingId, error })
        return result
      }

      const clientName = (onboarding.client as unknown as { name: string })?.name || "Cliente"
      const storeName = (onboarding.store as unknown as { store_name: string })?.store_name || ""
      const orgId = onboarding.org_id || pendingSteps[0]?.org_id

      for (const step of pendingSteps) {
        try {
          const assigneeId = step.assigned_to ?? onboarding.assigned_to
          if (!assigneeId) {
            result.skipped++
            continue
          }

          const taskId = await TaskAutomationService.onOnboardingStepPending({
            stepId: step.id,
            stepName: step.name,
            stepDescription: step.description ?? undefined,
            stepPhase: step.phase ?? undefined,
            onboardingId,
            clientId: onboarding.client_id,
            clientName,
            storeId: onboarding.store_id ?? undefined,
            storeName: storeName || undefined,
            assignedTo: assigneeId,
            orgId: orgId!,
            dueDate: step.due_date ?? undefined,
          })

          if (taskId) {
            result.created++
          } else {
            result.skipped++
          }
        } catch (stepErr) {
          log.error("seedTasks: failed for step", { stepId: step.id, error: stepErr })
          result.errors++
        }
      }

      log.info("seedTasks: completed", {
        action: "seed_tasks",
        onboardingId,
        ...result,
      })

      return result
    } catch (err) {
      log.error("seedTasks: unexpected error", { onboardingId, err })
      return result
    }
  }

  // -----------------------------------------------------------------------
  // onStepSkipped (AC 40.10.5 / 40.10.6)
  // -----------------------------------------------------------------------

  /**
   * Called when a step is marked as skipped.
   *
   * 1. If the step has a linked task, cancel it
   * 2. Treat skip as dependency satisfied — cascade downstream
   * 3. Check phase/onboarding completion
   */
  static async onStepSkipped(stepId: string, _userId?: string): Promise<void> {
    try {
      const supabase = createAdminClient()

      // 1. Fetch the step
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, task_id, org_id, name")
        .eq("id", stepId)
        .single()

      if (stepErr || !step) {
        log.error("onStepSkipped: step not found", { stepId, error: stepErr })
        return
      }

      log.info("onStepSkipped: processing", {
        action: "step_skipped",
        stepId,
        taskId: step.task_id,
        onboardingId: step.onboarding_id,
      })

      // 2. AC 40.10.6: Cancel linked task if exists
      if (step.task_id) {
        const { error: taskErr } = await supabase
          .from("tasks")
          .update({
            status: "cancelled",
            metadata: {
              _syncOrigin: "step_skipped",
              step_id: step.id,
              onboarding_id: step.onboarding_id,
            },
          })
          .eq("id", step.task_id)
          .neq("status", "cancelled") // Don't update if already cancelled

        if (taskErr) {
          log.error("onStepSkipped: failed to cancel task", {
            stepId,
            taskId: step.task_id,
            error: taskErr,
          })
        }
      }

      // 3. AC 40.10.5: Cascade — skipped satisfies dependencies
      await StepDependencyService.transitionToPending(step.onboarding_id)

      // 4. Handle newly-pending steps + phase/onboarding completion
      await this.handleNewlyPendingSteps(step.onboarding_id, step.org_id ?? undefined)
      await this.checkPhaseAndOnboardingCompletion(step.onboarding_id)
    } catch (err) {
      log.error("onStepSkipped: unexpected error", { stepId, err })
    }
  }

  // -----------------------------------------------------------------------
  // onStepReassigned (AC 40.10.14 / 40.10.15)
  // -----------------------------------------------------------------------

  /**
   * Called when a step's assigned_to changes.
   *
   * 1. If step has an existing task, update the task's assignee
   * 2. If step is pending with no task, create one for the new assignee
   * 3. Notify the new assignee
   */
  static async onStepReassigned(
    stepId: string,
    newAssigneeId: string,
    orgId: string,
  ): Promise<void> {
    try {
      const supabase = createAdminClient()

      // 1. Fetch the step
      const { data: step, error: stepErr } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, task_id, name, description, phase, status, org_id, due_date")
        .eq("id", stepId)
        .single()

      if (stepErr || !step) {
        log.error("onStepReassigned: step not found", { stepId, error: stepErr })
        return
      }

      log.info("onStepReassigned: processing", {
        action: "step_reassigned",
        stepId,
        newAssigneeId,
        taskId: step.task_id,
        status: step.status,
      })

      // 2. If step has linked task, update the task's assignee
      if (step.task_id) {
        const { error: taskErr } = await supabase
          .from("tasks")
          .update({
            assignee_id: newAssigneeId,
            metadata: {
              _syncOrigin: "step_reassigned",
              step_id: step.id,
              onboarding_id: step.onboarding_id,
            },
          })
          .eq("id", step.task_id)

        if (taskErr) {
          log.error("onStepReassigned: failed to update task assignee", {
            stepId,
            taskId: step.task_id,
            newAssigneeId,
            error: taskErr,
          })
        }
      } else if (step.status === "pending") {
        // 3. If step is pending with no task, create one
        const { data: onboarding } = await supabase
          .from("client_onboardings")
          .select(`
            id, client_id, store_id, assigned_to,
            client:clients(id, name),
            store:client_stores(id, store_name)
          `)
          .eq("id", step.onboarding_id)
          .single()

        if (onboarding) {
          const clientName = (onboarding.client as unknown as { name: string })?.name || "Cliente"
          const storeName = (onboarding.store as unknown as { store_name: string })?.store_name || ""

          await TaskAutomationService.onOnboardingStepPending({
            stepId: step.id,
            stepName: step.name,
            stepDescription: step.description ?? undefined,
            stepPhase: step.phase ?? undefined,
            onboardingId: step.onboarding_id,
            clientId: onboarding.client_id,
            clientName,
            storeId: onboarding.store_id ?? undefined,
            storeName: storeName || undefined,
            assignedTo: newAssigneeId,
            orgId: orgId || step.org_id || "",
            dueDate: step.due_date ?? undefined,
          })
        }
      }

      // 4. AC 40.10.15: Notify new assignee
      try {
        const { data: member } = await supabase
          .from("org_members")
          .select("profile_id")
          .eq("id", newAssigneeId)
          .single()

        if (member?.profile_id) {
          const { data: onboarding } = await supabase
            .from("client_onboardings")
            .select(`
              id, client:clients(id, name),
              store:client_stores(id, store_name)
            `)
            .eq("id", step.onboarding_id)
            .single()

          const clientName = (onboarding?.client as unknown as { name: string })?.name || "Cliente"
          const storeName = (onboarding?.store as unknown as { store_name: string })?.store_name || ""

          await notifyStepReassigned({
            assigneeProfileId: member.profile_id,
            stepName: step.name,
            clientName,
            storeName: storeName || clientName,
            onboardingId: step.onboarding_id,
            stepId: step.id,
            orgId: orgId || step.org_id || "",
          })
        }
      } catch (notifyErr) {
        log.error("onStepReassigned: failed to notify", { stepId, newAssigneeId, error: notifyErr })
      }
    } catch (err) {
      log.error("onStepReassigned: unexpected error", { stepId, newAssigneeId, err })
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Get profile_ids of all team members involved in an onboarding
   * (assignee + all step assignees).
   */
  private static async getOnboardingTeamProfileIds(
    onboardingId: string,
  ): Promise<string[]> {
    try {
      const supabase = createAdminClient()

      // Get onboarding assignee
      const { data: onboarding } = await supabase
        .from("client_onboardings")
        .select("assigned_to")
        .eq("id", onboardingId)
        .single()

      // Get unique step assignees
      const { data: steps } = await supabase
        .from("client_onboarding_steps")
        .select("assigned_to")
        .eq("onboarding_id", onboardingId)
        .not("assigned_to", "is", null)

      const orgMemberIds = new Set<string>()
      if (onboarding?.assigned_to) orgMemberIds.add(onboarding.assigned_to)
      if (steps) {
        for (const s of steps) {
          if (s.assigned_to) orgMemberIds.add(s.assigned_to)
        }
      }

      if (orgMemberIds.size === 0) return []

      // Resolve to profile_ids
      const { data: members } = await supabase
        .from("org_members")
        .select("profile_id")
        .in("id", Array.from(orgMemberIds))

      return (members ?? [])
        .map((m) => m.profile_id)
        .filter(Boolean) as string[]
    } catch {
      return []
    }
  }
}
