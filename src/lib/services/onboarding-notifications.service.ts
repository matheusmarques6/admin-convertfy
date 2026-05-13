/**
 * Cria notificacoes no inbox interno (sininho) pra eventos do onboarding:
 *  - column_change: avisa profiles com role = nextCol.default_assignee_role
 *  - stuck: avisa todos profiles ops/cs (job de SLA)
 *  - briefing_ready: avisa ops/estrategista quando cliente confirmou briefing
 *
 * Tudo fire-and-forget — falha silenciosa.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { OperationalPipelineColumn } from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingNotifications")

async function profilesByRole(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  roles: string[],
): Promise<string[]> {
  if (!roles.length) return []
  const { data } = await admin
    .from("org_members")
    .select("profile_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .in("role", roles)
  return (data ?? []).map((r) => r.profile_id as string).filter(Boolean)
}

async function insertNotifications(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  rec: {
    title: string
    body: string
    type: string
    link: string
    metadata?: Record<string, unknown>
  },
) {
  if (!userIds.length) return
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title: rec.title,
    body: rec.body,
    type: rec.type,
    link: rec.link,
    metadata: rec.metadata ?? {},
    read: false,
  }))
  await admin.from("notifications").insert(rows)
}

async function loadOnboardingContext(
  admin: ReturnType<typeof createAdminClient>,
  onboardingId: string,
): Promise<{
  client: string
  store: string
} | null> {
  const { data } = await admin
    .from("onboardings")
    .select(
      "client:clients!onboardings_client_id_fkey(name), store:client_stores(store_name)",
    )
    .eq("id", onboardingId)
    .maybeSingle()
  if (!data) return null
  const client = (Array.isArray(data.client) ? data.client[0] : data.client) as
    | { name: string | null }
    | null
  const store = (Array.isArray(data.store) ? data.store[0] : data.store) as
    | { store_name: string | null }
    | null
  return {
    client: client?.name ?? "cliente",
    store: store?.store_name ?? "loja",
  }
}

export async function notifyColumnChange(params: {
  onboardingId: string
  orgId: string
  fromCol: OperationalPipelineColumn
  toCol: OperationalPipelineColumn
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const ctx = await loadOnboardingContext(admin, params.onboardingId)
    if (!ctx) return

    const role = params.toCol.default_assignee_role
    if (!role) return

    const userIds = await profilesByRole(admin, params.orgId, [role])
    await insertNotifications(admin, userIds, {
      title: `Onboarding entrou em ${params.toCol.name}`,
      body: `${ctx.client} · ${ctx.store}`,
      type: "onboarding_column_change",
      link: `/admin/onboarding/${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        from_column: params.fromCol.slug,
        to_column: params.toCol.slug,
      },
    })
  } catch (e) {
    log.error("notifyColumnChange", e)
  }
}

export async function notifyBriefingReady(params: {
  onboardingId: string
  orgId: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const ctx = await loadOnboardingContext(admin, params.onboardingId)
    if (!ctx) return
    const userIds = await profilesByRole(admin, params.orgId, [
      "ops",
      "estrategista",
      "admin",
      "owner",
    ])
    await insertNotifications(admin, userIds, {
      title: `Briefing confirmado pelo cliente`,
      body: `${ctx.client} · ${ctx.store} aprovou o briefing.`,
      type: "onboarding_briefing_ready",
      link: `/admin/onboarding/${params.onboardingId}`,
      metadata: { onboarding_id: params.onboardingId },
    })
  } catch (e) {
    log.error("notifyBriefingReady", e)
  }
}

export async function notifyStuck(params: {
  onboardingId: string
  orgId: string
  daysStuck: number
  assigneeRole: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const ctx = await loadOnboardingContext(admin, params.onboardingId)
    if (!ctx) return

    const roles = params.assigneeRole
      ? [params.assigneeRole, "admin", "owner"]
      : ["ops", "cs", "admin", "owner"]
    const userIds = await profilesByRole(admin, params.orgId, roles)

    await insertNotifications(admin, userIds, {
      title: `Onboarding travado há ${params.daysStuck} dias`,
      body: `${ctx.client} · ${ctx.store}`,
      type: "onboarding_stuck",
      link: `/admin/onboarding/${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        days_stuck: params.daysStuck,
      },
    })
  } catch (e) {
    log.error("notifyStuck", e)
  }
}
