import type { OrgRole } from "@/types/organization"

export type OnboardingStageSlug =
  | "entrada"
  | "cliente_formulario"
  | "preview_producao"
  | "preview_aprovacao"
  | "emails_finais"
  | "implementacao"
  | "cliente_ativo"

export type OnboardingResponsibleRole =
  | "suporte"
  | "designer"
  | "implementacao"

const BYPASS_ROLES = new Set<OrgRole>(["admin", "dev", "coo"])

export const ONBOARDING_STAGE_RESPONSIBLE_ROLE: Record<
  OnboardingStageSlug,
  OnboardingResponsibleRole
> = {
  entrada: "suporte",
  cliente_formulario: "suporte",
  preview_producao: "designer",
  preview_aprovacao: "suporte",
  emails_finais: "designer",
  implementacao: "implementacao",
  cliente_ativo: "designer",
}

const ROLE_ALIASES: Record<string, OrgRole> = {
  admin: "admin",
  owner: "admin",
  dev: "dev",
  coo: "coo",
  suporte: "suporte",
  support: "suporte",
  cs: "suporte",
  estrategista: "suporte",
  designer: "designer",
  implementacao: "implementacao",
  ops: "implementacao",
  developer: "implementacao",
}

export function normalizeOnboardingRole(
  role: string | null | undefined,
): OrgRole | null {
  if (!role) return null
  return ROLE_ALIASES[role.trim().toLowerCase()] ?? null
}

export function normalizeOnboardingRoles(
  roles: readonly (string | null | undefined)[],
): OrgRole[] {
  return Array.from(
    new Set(
      roles
        .map(normalizeOnboardingRole)
        .filter((role): role is OrgRole => role !== null),
    ),
  )
}

export function isOnboardingBypass(
  roles: readonly (string | null | undefined)[],
): boolean {
  return normalizeOnboardingRoles(roles).some((role) =>
    BYPASS_ROLES.has(role),
  )
}

export function getOnboardingStageResponsibleRole(
  stageSlug: string | null | undefined,
): OnboardingResponsibleRole | null {
  if (!stageSlug) return null
  return (
    ONBOARDING_STAGE_RESPONSIBLE_ROLE[
      stageSlug as OnboardingStageSlug
    ] ?? null
  )
}

export function canAccessOnboardingStage(
  roles: readonly (string | null | undefined)[],
  stageSlug: string | null | undefined,
): boolean {
  const normalizedRoles = normalizeOnboardingRoles(roles)
  if (normalizedRoles.some((role) => BYPASS_ROLES.has(role))) return true

  const responsibleRole = getOnboardingStageResponsibleRole(stageSlug)
  return responsibleRole !== null && normalizedRoles.includes(responsibleRole)
}

export function getOnboardingStageAccess(
  roles: readonly (string | null | undefined)[],
  stageSlug: string | null | undefined,
): {
  canRead: boolean
  canWork: boolean
  canAdmin: boolean
  responsibleRole: OnboardingResponsibleRole | null
} {
  const canAdmin = isOnboardingBypass(roles)
  const responsibleRole = getOnboardingStageResponsibleRole(stageSlug)
  const canWork =
    canAdmin ||
    (responsibleRole !== null &&
      normalizeOnboardingRoles(roles).includes(responsibleRole))

  return {
    canRead: canWork,
    canWork,
    canAdmin,
    responsibleRole,
  }
}
