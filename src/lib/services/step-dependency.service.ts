import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { OnboardingStepStatus, OnboardingTemplateStep } from "@/types/onboarding"

const log = logger.child("StepDependency")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepForResolution {
  id: string
  onboarding_id: string
  status: OnboardingStepStatus
  depends_on_step_ids: string[] // UUIDs of other client_onboarding_steps
}

export interface DagValidation {
  valid: boolean
  cycle?: string[] // IDs of steps in the cycle, if any
}

// Statuses that satisfy a dependency requirement
const SATISFIED_STATUSES: OnboardingStepStatus[] = ["completed", "skipped"]

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Resolves the DAG of dependencies between onboarding steps.
 *
 * Pure logic + DB queries — no side effects (no notifications, no task creation).
 */
export class StepDependencyService {
  // -----------------------------------------------------------------------
  // resolvePending
  // -----------------------------------------------------------------------

  /**
   * Given an onboardingId, returns the IDs of steps that should transition
   * from `waiting` to `pending` (all dependencies completed/skipped, or no
   * dependencies at all).
   */
  static async resolvePending(onboardingId: string): Promise<string[]> {
    try {
      const supabase = await createAdminClient()

      // Fetch ALL steps for this onboarding in a single query
      const { data: steps, error } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, status, depends_on_step_ids")
        .eq("onboarding_id", onboardingId)

      if (error) {
        log.error("Failed to fetch steps for resolution", { onboardingId, error })
        return []
      }

      if (!steps || steps.length === 0) return []

      // Build a lookup map: stepId -> status
      const statusMap = new Map<string, OnboardingStepStatus>()
      for (const step of steps) {
        statusMap.set(step.id, step.status as OnboardingStepStatus)
      }

      const eligible: string[] = []

      for (const step of steps) {
        // Only consider steps currently in 'waiting'
        if (step.status !== "waiting") continue

        const deps: string[] = step.depends_on_step_ids ?? []

        // No dependencies → eligible immediately
        if (deps.length === 0) {
          eligible.push(step.id)
          continue
        }

        // All dependencies must be satisfied
        const allSatisfied = deps.every((depId) => {
          const depStatus = statusMap.get(depId)
          return depStatus != null && SATISFIED_STATUSES.includes(depStatus)
        })

        if (allSatisfied) {
          eligible.push(step.id)
        }
      }

      return eligible
    } catch (err) {
      log.error("Exception in resolvePending", { onboardingId, err })
      return []
    }
  }

  // -----------------------------------------------------------------------
  // transitionToPending
  // -----------------------------------------------------------------------

  /**
   * Executes the actual status changes: `waiting` -> `pending` for all
   * eligible steps. Uses an atomic WHERE guard against race conditions.
   *
   * Returns the IDs of steps that were actually transitioned.
   */
  static async transitionToPending(onboardingId: string): Promise<string[]> {
    try {
      const eligibleIds = await this.resolvePending(onboardingId)
      if (eligibleIds.length === 0) return []

      const supabase = await createAdminClient()

      // Batch update with WHERE status = 'waiting' guard (race-condition safe)
      const { data: updated, error } = await supabase
        .from("client_onboarding_steps")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .in("id", eligibleIds)
        .eq("status", "waiting") // atomic guard
        .select("id")

      if (error) {
        log.error("Failed to transition steps to pending", { onboardingId, eligibleIds, error })
        return []
      }

      const transitionedIds = (updated ?? []).map((s) => s.id)

      if (transitionedIds.length > 0) {
        log.info("Steps transitioned to pending", {
          onboardingId,
          count: transitionedIds.length,
          stepIds: transitionedIds,
        })
      }

      return transitionedIds
    } catch (err) {
      log.error("Exception in transitionToPending", { onboardingId, err })
      return []
    }
  }

  // -----------------------------------------------------------------------
  // getBlockedBy
  // -----------------------------------------------------------------------

  /**
   * Returns the dependency steps that are blocking a given step
   * (i.e. dependencies whose status is NOT completed or skipped).
   */
  static async getBlockedBy(stepId: string): Promise<StepForResolution[]> {
    try {
      const supabase = await createAdminClient()

      // 1. Fetch the target step to get its depends_on_step_ids
      const { data: step, error: stepError } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, status, depends_on_step_ids")
        .eq("id", stepId)
        .single()

      if (stepError || !step) {
        log.error("Failed to fetch step for getBlockedBy", { stepId, error: stepError })
        return []
      }

      const deps: string[] = step.depends_on_step_ids ?? []
      if (deps.length === 0) return []

      // 2. Fetch all dependency steps in one query
      const { data: depSteps, error: depsError } = await supabase
        .from("client_onboarding_steps")
        .select("id, onboarding_id, status, depends_on_step_ids")
        .in("id", deps)

      if (depsError) {
        log.error("Failed to fetch dependency steps", { stepId, deps, error: depsError })
        return []
      }

      if (!depSteps) return []

      // 3. Filter to only those NOT satisfied
      return depSteps
        .filter((d) => !SATISFIED_STATUSES.includes(d.status as OnboardingStepStatus))
        .map((d) => ({
          id: d.id,
          onboarding_id: d.onboarding_id,
          status: d.status as OnboardingStepStatus,
          depends_on_step_ids: d.depends_on_step_ids ?? [],
        }))
    } catch (err) {
      log.error("Exception in getBlockedBy", { stepId, err })
      return []
    }
  }

  // -----------------------------------------------------------------------
  // validateDag
  // -----------------------------------------------------------------------

  /**
   * Validates that the dependency graph has no cycles using DFS (3-color).
   * Works with template steps (uses `depends_on_steps` field).
   *
   * This is a pure synchronous function — no DB calls.
   */
  static validateDag(steps: OnboardingTemplateStep[]): DagValidation {
    // Build adjacency: step.id -> depends_on_steps[]
    const adjacency = new Map<string, string[]>()
    const stepIds = new Set<string>()

    for (const step of steps) {
      stepIds.add(step.id)
      adjacency.set(step.id, step.depends_on_steps ?? [])
    }

    // DFS 3-color: WHITE=0, GRAY=1, BLACK=2
    const WHITE = 0
    const GRAY = 1
    const BLACK = 2

    const color = new Map<string, number>()
    const parent = new Map<string, string | null>()

    for (const id of stepIds) {
      color.set(id, WHITE)
      parent.set(id, null)
    }

    /**
     * DFS visit. Returns the cycle path if a back-edge is found, or null.
     */
    function dfs(nodeId: string): string[] | null {
      color.set(nodeId, GRAY)

      const deps = adjacency.get(nodeId) ?? []
      for (const depId of deps) {
        // Skip references to steps not in the set (dangling refs)
        if (!stepIds.has(depId)) continue

        const depColor = color.get(depId) ?? WHITE

        if (depColor === GRAY) {
          // Back-edge found → cycle. Reconstruct the cycle path.
          const cycle: string[] = [depId, nodeId]
          let current = nodeId
          while (current !== depId) {
            const p = parent.get(current)
            if (p == null || p === depId) {
              cycle.push(depId)
              break
            }
            cycle.push(p)
            current = p
          }
          return cycle.reverse()
        }

        if (depColor === WHITE) {
          parent.set(depId, nodeId)
          const cycleResult = dfs(depId)
          if (cycleResult) return cycleResult
        }
      }

      color.set(nodeId, BLACK)
      return null
    }

    // Run DFS from each unvisited node
    for (const id of stepIds) {
      if (color.get(id) === WHITE) {
        const cycle = dfs(id)
        if (cycle) {
          return { valid: false, cycle }
        }
      }
    }

    return { valid: true }
  }
}
