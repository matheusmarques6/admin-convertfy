import { AppError } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import {
  getOnboardingStageAccess,
  isOnboardingBypass,
  normalizeOnboardingRole,
} from "@/lib/permissions/onboarding-stage-access"
import { createAdminClient } from "@/lib/supabase/server"
import type { OrgRole } from "@/types/organization"

export type TaskAccessAction = "read" | "work" | "admin"

export interface TaskAccessContext {
  task: Record<string, unknown> & {
    id: string
    org_id: string
    onboarding_id: string | null
    operational_column_id: string | null
    version: number | null
    assignee_role: string | null
  }
  member: {
    orgId: string
    memberId: string
    role: OrgRole
    roles: OrgRole[]
  }
  onboarding: {
    id: string
    status: string
    current_column_id: string | null
    current_version: number
  } | null
  stageSlug: string | null
  isCurrentStage: boolean
  canRead: boolean
  canWork: boolean
  canAdmin: boolean
}

export async function getTaskAccessContext(
  userId: string,
  taskId: string,
): Promise<TaskAccessContext | null> {
  const member = await getUserOrgRole(userId)
  if (!member) return null

  const admin = createAdminClient()
  const { data: task } = await admin
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("org_id", member.orgId)
    .maybeSingle()

  if (!task) return null

  const typedTask = task as TaskAccessContext["task"]
  const canAdmin = isOnboardingBypass(member.roles)

  if (!typedTask.onboarding_id) {
    const taskRole = normalizeOnboardingRole(typedTask.assignee_role)
    const canWork =
      canAdmin ||
      taskRole === null ||
      member.roles.some((role) => role === taskRole)

    return {
      task: typedTask,
      member,
      onboarding: null,
      stageSlug: null,
      isCurrentStage: true,
      canRead: canWork,
      canWork,
      canAdmin,
    }
  }

  const { data: onboarding } = await admin
    .from("onboardings")
    .select("id, status, current_column_id, current_version")
    .eq("id", typedTask.onboarding_id)
    .eq("org_id", member.orgId)
    .maybeSingle()
  if (!onboarding) return null

  let stageSlug: string | null = null
  if (onboarding.current_column_id) {
    const { data: column } = await admin
      .from("operational_pipeline_columns")
      .select("slug")
      .eq("id", onboarding.current_column_id)
      .maybeSingle()
    stageSlug = (column?.slug as string | null) ?? null
  }

  const stageAccess = getOnboardingStageAccess(member.roles, stageSlug)
  const currentVersion = onboarding.current_version ?? 1
  const isCurrentStage =
    onboarding.status === "in_progress" &&
    typedTask.operational_column_id === onboarding.current_column_id &&
    (typedTask.version ?? 1) === currentVersion

  return {
    task: typedTask,
    member,
    onboarding: {
      id: onboarding.id as string,
      status: onboarding.status as string,
      current_column_id: onboarding.current_column_id as string | null,
      current_version: currentVersion,
    },
    stageSlug,
    isCurrentStage,
    canRead: canAdmin || (isCurrentStage && stageAccess.canRead),
    canWork: canAdmin || (isCurrentStage && stageAccess.canWork),
    canAdmin,
  }
}

export async function requireTaskAccess(
  userId: string,
  taskId: string,
  action: TaskAccessAction,
): Promise<TaskAccessContext> {
  const context = await getTaskAccessContext(userId, taskId)
  if (!context || !context.canRead) {
    throw new AppError("Task nao encontrada", 404)
  }

  if (action === "work" && !context.canWork) {
    throw new AppError("Sem permissao para trabalhar nesta task", 403)
  }
  if (action === "admin" && !context.canAdmin) {
    throw new AppError("Sem permissao administrativa nesta task", 403)
  }

  return context
}
