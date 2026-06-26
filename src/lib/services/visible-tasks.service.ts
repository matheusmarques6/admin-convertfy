import {
  canAccessOnboardingStage,
  isOnboardingBypass,
  normalizeOnboardingRole,
} from "@/lib/permissions/onboarding-stage-access"
import { createAdminClient } from "@/lib/supabase/server"
import type { OrgRole } from "@/types/organization"

export interface VisibleTaskMember {
  orgId: string
  memberId: string
  roles: OrgRole[]
}

export async function listVisibleTasks(
  member: VisibleTaskMember,
  filters: {
    status?: string | null
    sourceType?: string | null
    type?: string | null
    clientId?: string | null
    storeId?: string | null
    priority?: string | null
    limit?: number
  } = {},
) {
  const admin = createAdminClient()
  let query = admin
    .from("tasks")
    .select(
      `*,
       assignee:org_members(id, role, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)),
       creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
       client:clients(id, name, company),
       store:client_stores(id, store_name, platform),
       task_comments(count)`,
    )
    .eq("org_id", member.orgId)
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status)
  }
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType)
  if (filters.type) query = query.eq("type", filters.type)
  if (filters.clientId) query = query.eq("client_id", filters.clientId)
  if (filters.storeId) query = query.eq("store_id", filters.storeId)
  if (filters.priority) query = query.eq("priority", filters.priority)
  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 500)

  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []
  const onboardingIds = Array.from(
    new Set(
      rows
        .map((task) => task.onboarding_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const { data: onboardings } =
    onboardingIds.length > 0
      ? await admin
          .from("onboardings")
          .select("id, status, current_column_id, current_version")
          .eq("org_id", member.orgId)
          .in("id", onboardingIds)
      : { data: [] }
  const onboardingMap = new Map(
    (onboardings ?? []).map((onboarding) => [
      onboarding.id as string,
      onboarding,
    ]),
  )
  const columnIds = Array.from(
    new Set(
      (onboardings ?? [])
        .map((onboarding) => onboarding.current_column_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const { data: columns } =
    columnIds.length > 0
      ? await admin
          .from("operational_pipeline_columns")
          .select("id, slug")
          .in("id", columnIds)
      : { data: [] }
  const columnSlugMap = new Map(
    (columns ?? []).map((column) => [
      column.id as string,
      column.slug as string,
    ]),
  )
  const bypass = isOnboardingBypass(member.roles)

  return rows.flatMap((task) => {
    let canWork = false
    let stageSlug: string | null = null
    if (task.onboarding_id) {
      const onboarding = onboardingMap.get(task.onboarding_id as string)
      if (!onboarding || onboarding.status !== "in_progress") return []
      stageSlug =
        columnSlugMap.get(onboarding.current_column_id as string) ?? null
      const isCurrent =
        task.operational_column_id === onboarding.current_column_id &&
        (task.version ?? 1) === (onboarding.current_version ?? 1)
      if (!isCurrent || !canAccessOnboardingStage(member.roles, stageSlug)) {
        return []
      }
      canWork = true
    } else {
      const taskRole = normalizeOnboardingRole(task.assignee_role as string)
      canWork =
        bypass ||
        taskRole === null ||
        member.roles.some((role) => role === taskRole)
      if (!canWork) return []
    }

    const commentData = task.task_comments as unknown as
      | Array<{ count: number }>
      | undefined
    const { task_comments: _comments, ...taskWithoutComments } = task
    return [
      {
        ...taskWithoutComments,
        comments_count: commentData?.[0]?.count ?? 0,
        can_work: canWork,
        can_admin: bypass,
        stage_slug: stageSlug,
      },
    ]
  })
}
