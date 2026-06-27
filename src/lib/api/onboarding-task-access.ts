import { AppError } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import {
  getOnboardingStageAccess,
  isOnboardingBypass,
  normalizeOnboardingRole,
} from "@/lib/permissions/onboarding-stage-access"
import { getCampaignStageAccess } from "@/lib/permissions/campaign-stage-access"
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
    source_type?: string | null
    source_id?: string | null
    operational_pipeline_id?: string | null
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
  // Pipeline de design de campanha (paralelo a onboarding). null se a task
  // nao for de campanha. Tasks comuns tem onboarding=null E campaign=null.
  campaign: {
    id: string
    design_column_id: string | null
    design_version: number
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
    // Task do pipeline de DESIGN de campanha? (source_type campaign_suggestion
    // + vinculada a um operational pipeline). Distingue da design task legada
    // (que nao tem operational_pipeline_id).
    if (
      typedTask.source_type === "campaign_suggestion" &&
      typedTask.operational_pipeline_id &&
      typedTask.source_id
    ) {
      const campaignCtx = await resolveCampaignAccess(
        admin,
        typedTask,
        member,
        canAdmin,
      )
      if (campaignCtx) return campaignCtx
    }

    const taskRole = normalizeOnboardingRole(typedTask.assignee_role)
    const canWork =
      canAdmin ||
      taskRole === null ||
      member.roles.some((role) => role === taskRole)

    return {
      task: typedTask,
      member,
      onboarding: null,
      campaign: null,
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
    campaign: null,
    stageSlug,
    isCurrentStage,
    canRead: canAdmin || (isCurrentStage && stageAccess.canRead),
    canWork: canAdmin || (isCurrentStage && stageAccess.canWork),
    canAdmin,
  }
}

/**
 * Resolve acesso para uma task do pipeline de design de CAMPANHA. A "etapa
 * atual" da campanha vive em campaign_suggestions.design_column_id/
 * design_version (paralelo a onboardings.current_*). Retorna null se a campanha
 * nao for encontrada (a task cai no tratamento de task comum).
 */
async function resolveCampaignAccess(
  admin: ReturnType<typeof createAdminClient>,
  typedTask: TaskAccessContext["task"],
  member: TaskAccessContext["member"],
  canAdmin: boolean,
): Promise<TaskAccessContext | null> {
  const { data: campaign } = await admin
    .from("campaign_suggestions")
    .select("id, design_column_id, design_version")
    .eq("id", typedTask.source_id)
    .eq("org_id", member.orgId)
    .maybeSingle()
  if (!campaign) return null

  let stageSlug: string | null = null
  if (campaign.design_column_id) {
    const { data: column } = await admin
      .from("operational_pipeline_columns")
      .select("slug")
      .eq("id", campaign.design_column_id)
      .maybeSingle()
    stageSlug = (column?.slug as string | null) ?? null
  }

  const stageAccess = getCampaignStageAccess(member.roles, stageSlug)
  const currentVersion = (campaign.design_version as number | null) ?? 1
  const isCurrentStage =
    campaign.design_column_id != null &&
    typedTask.operational_column_id === campaign.design_column_id &&
    (typedTask.version ?? 1) === currentVersion

  return {
    task: typedTask,
    member,
    onboarding: null,
    campaign: {
      id: campaign.id as string,
      design_column_id: (campaign.design_column_id as string | null) ?? null,
      design_version: currentVersion,
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

/**
 * Gate ESCOPADO: aplica a regra de visibilidade por etapa apenas a tasks de
 * ONBOARDING. Tasks comuns (sem onboarding_id) mantem o comportamento original
 * (qualquer membro da org), retornando o contexto sem bloquear.
 *
 * Use isto nos endpoints de sub-recursos (comments, checklists, timeline, etc.)
 * para nao restringir tasks de produtividade que nao fazem parte do onboarding.
 */
export async function guardOnboardingTask(
  userId: string,
  taskId: string,
  action: TaskAccessAction,
): Promise<TaskAccessContext> {
  const context = await getTaskAccessContext(userId, taskId)
  if (!context) {
    throw new AppError("Task nao encontrada", 404)
  }
  // Gate vale para tasks de pipeline (onboarding OU campanha). Tasks comuns
  // (sem onboarding e sem campanha) mantem o comportamento original.
  if (!context.onboarding && !context.campaign) {
    return context
  }
  if (!context.canRead) {
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
