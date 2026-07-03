/**
 * Fase 5 do pipeline de DESIGN de campanha — notificacoes (sininho interno).
 *
 * Espelha `onboarding-notifications.service.ts`:
 *  - resolve usuarios por FUNCAO canonica via `org_members` + `org_member_roles`
 *    (multi-funcao, fallback pra `org_members.role`, normalizando legados);
 *  - insere 1 linha por usuario em `notifications`.
 *
 * Alvo por evento:
 *  - "entered"  -> funcao responsavel da etapa (aprovacao -> coo; demais ->
 *    designer). Ex: Figma entregue -> campanha entra em `aprovacao` -> COO avalia.
 *  - "changes_requested" -> designers (estrutura volta pra eles com o pedido do COO).
 *
 * Fire-and-forget: chamado em try/catch non-blocking pelo handoff.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  getCampaignStageResponsibleRole,
  type CampaignDesignStageSlug,
} from "@/lib/permissions/campaign-stage-access"
import { normalizeOnboardingRole } from "@/lib/permissions/onboarding-stage-access"
import type { OrgRole } from "@/types/organization"

/**
 * Resolve profiles cujas funcoes (canonicas) batem com `targetRoles`.
 * Consulta TODAS as funcoes da conta via `org_member_roles` (multi-funcao),
 * com fallback pra `org_members.role` quando a junction esta vazia. Normaliza
 * legados antes de comparar. Espelha `profilesByCanonicalRoles` do onboarding.
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

const STAGE_LABEL: Record<CampaignDesignStageSlug, string> = {
  estrutura: "Estrutura",
  aprovacao: "Aprovacao",
  producao: "Producao",
  finalizacao: "Finalizacao",
  implementacao: "Implementacao",
}

export async function notifyCampaignDesignStage(params: {
  suggestionId: string
  orgId: string
  stageSlug: CampaignDesignStageSlug
  event: "entered" | "changes_requested"
  campaignTitle?: string | null
}): Promise<{ notified: number }> {
  const admin = createAdminClient()

  // Alvo: changes_requested sempre volta pros designers; entered mira a funcao
  // responsavel da etapa de destino.
  const targetRole =
    params.event === "changes_requested"
      ? "designer"
      : getCampaignStageResponsibleRole(params.stageSlug)

  const userIds = await profilesByCanonicalRoles(admin, params.orgId, [
    targetRole,
  ])
  if (userIds.length === 0) return { notified: 0 }

  const label = STAGE_LABEL[params.stageSlug] ?? params.stageSlug
  const campaign = params.campaignTitle?.trim() || "Campanha"
  const title =
    params.event === "changes_requested"
      ? `Mudancas solicitadas — ${campaign}`
      : `Campanha entrou em ${label}`
  const body =
    params.event === "changes_requested"
      ? `${campaign}: o COO pediu ajustes na estrutura.`
      : `${campaign}`

  await insertNotifications(admin, userIds, {
    title,
    body,
    type: "campaign_design_stage",
    link: `/admin/campaigns/central?campaign=${params.suggestionId}`,
    metadata: {
      suggestion_id: params.suggestionId,
      stage_slug: params.stageSlug,
      event: params.event,
    },
  })

  return { notified: userIds.length }
}
