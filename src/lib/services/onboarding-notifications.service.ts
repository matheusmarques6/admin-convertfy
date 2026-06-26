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
import {
  getOnboardingStageResponsibleRole,
  normalizeOnboardingRole,
} from "@/lib/permissions/onboarding-stage-access"
import type { OperationalPipelineColumn } from "@/types/onboarding-pipeline"
import type { OrgRole } from "@/types/organization"

const log = logger.child("OnboardingNotifications")

// Roles com bypass total — sempre recebem alertas relevantes do onboarding.
const BYPASS_TARGET_ROLES: OrgRole[] = ["admin", "dev", "coo"]

/**
 * Resolve profiles cujas funções (canônicas) batem com `targetRoles`.
 * Consulta TODAS as funções da conta via `org_member_roles` (multi-função),
 * com fallback pra `org_members.role` quando a junction está vazia. Normaliza
 * legados (cs/estrategista→suporte, ops→implementacao) antes de comparar.
 */
async function profilesByCanonicalRoles(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  targetRoles: Array<string | null | undefined>,
): Promise<string[]> {
  const wanted = new Set(
    targetRoles
      .map((r) => normalizeOnboardingRole(r))
      .filter((r): r is OrgRole => r !== null),
  )
  if (wanted.size === 0) return []

  const { data: members } = await admin
    .from("org_members")
    .select("id, profile_id, role")
    .eq("org_id", orgId)
    .eq("is_active", true)
  const memberRows = (members ?? []) as Array<{
    id: string
    profile_id: string
    role: string | null
  }>
  if (memberRows.length === 0) return []

  const { data: roleRows } = await admin
    .from("org_member_roles")
    .select("org_member_id, role")
    .in(
      "org_member_id",
      memberRows.map((m) => m.id),
    )
  const rolesByMember = new Map<string, string[]>()
  for (const row of (roleRows ?? []) as Array<{
    org_member_id: string
    role: string
  }>) {
    const list = rolesByMember.get(row.org_member_id) ?? []
    list.push(row.role)
    rolesByMember.set(row.org_member_id, list)
  }

  const profileIds = new Set<string>()
  for (const member of memberRows) {
    const junctionRoles = rolesByMember.get(member.id)
    const effectiveRoles =
      junctionRoles && junctionRoles.length > 0
        ? junctionRoles
        : member.role
          ? [member.role]
          : []
    const hasMatch = effectiveRoles.some((r) => {
      const canonical = normalizeOnboardingRole(r)
      return canonical !== null && wanted.has(canonical)
    })
    if (hasMatch && member.profile_id) profileIds.add(member.profile_id)
  }
  return Array.from(profileIds)
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

    // Mira a FUNÇÃO RESPONSÁVEL canônica da NOVA etapa (transferência de
    // visibilidade). Fallback pro default_assignee_role normalizado se o slug
    // não estiver na matriz.
    const role =
      getOnboardingStageResponsibleRole(params.toCol.slug) ??
      params.toCol.default_assignee_role
    if (!role) return

    const userIds = await profilesByCanonicalRoles(admin, params.orgId, [role])
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
    // Briefing aprovado → onboarding entra em preview_producao (designer).
    // Notifica o responsável da próxima etapa + bypass roles.
    const userIds = await profilesByCanonicalRoles(admin, params.orgId, [
      getOnboardingStageResponsibleRole("preview_producao"),
      ...BYPASS_TARGET_ROLES,
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

    // Normaliza a função responsável (legado→canônico) e adiciona bypass.
    // Sem função explícita, cobre suporte+implementacao (donos operacionais).
    const roles = params.assigneeRole
      ? [params.assigneeRole, ...BYPASS_TARGET_ROLES]
      : ["suporte", "implementacao", ...BYPASS_TARGET_ROLES]
    const userIds = await profilesByCanonicalRoles(admin, params.orgId, roles)

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
