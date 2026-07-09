import type { OrgRole } from "@/types/organization"
import {
  isOnboardingBypass,
  normalizeOnboardingRoles,
} from "./onboarding-stage-access"

/**
 * Regra de visibilidade por etapa do pipeline de DESIGN de campanha.
 *
 * Espelha onboarding-stage-access, mas com a matriz de campanha. REUSA o
 * conjunto de bypass (admin/dev/coo) e a normalizacao de roles do
 * onboarding-stage-access para nao duplicar a regra (single source of truth).
 */

export type CampaignDesignStageSlug =
  | "estrutura"
  | "aprovacao"
  | "producao"
  | "finalizacao"
  | "implementacao"

export type CampaignStageResponsibleRole = "designer" | "coo" | "implementacao"

export const CAMPAIGN_DESIGN_STAGE_ROLE: Record<
  CampaignDesignStageSlug,
  CampaignStageResponsibleRole
> = {
  estrutura: "designer",
  aprovacao: "coo",
  producao: "designer",
  finalizacao: "designer",
  implementacao: "implementacao",
}

export function getCampaignStageResponsibleRole(
  stageSlug: string | null | undefined,
): CampaignStageResponsibleRole | null {
  if (!stageSlug) return null
  return (
    CAMPAIGN_DESIGN_STAGE_ROLE[stageSlug as CampaignDesignStageSlug] ?? null
  )
}

export function canAccessCampaignStage(
  roles: readonly (string | null | undefined)[],
  stageSlug: string | null | undefined,
): boolean {
  if (isOnboardingBypass(roles)) return true
  const responsibleRole = getCampaignStageResponsibleRole(stageSlug)
  if (responsibleRole === null) return false
  const normalized = normalizeOnboardingRoles(roles)
  return normalized.includes(responsibleRole as OrgRole)
}

export function getCampaignStageAccess(
  roles: readonly (string | null | undefined)[],
  stageSlug: string | null | undefined,
): {
  canRead: boolean
  canWork: boolean
  canAdmin: boolean
  responsibleRole: CampaignStageResponsibleRole | null
} {
  const canAdmin = isOnboardingBypass(roles)
  const responsibleRole = getCampaignStageResponsibleRole(stageSlug)
  const canWork =
    canAdmin ||
    (responsibleRole !== null &&
      normalizeOnboardingRoles(roles).includes(responsibleRole as OrgRole))

  return { canRead: canWork, canWork, canAdmin, responsibleRole }
}
