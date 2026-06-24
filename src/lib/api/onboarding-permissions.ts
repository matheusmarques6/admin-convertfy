/**
 * Helpers de permissao pro pipeline operacional v2.
 *
 * Regras (alto nivel — alinhadas ao modelo de 6 funcoes):
 *   - admin, dev, coo: acesso total (admin)
 *   - suporte: ler, trabalhar e avancar
 *   - designer, implementacao: ler e trabalhar
 *
 * Acoes:
 *   - read: ver onboardings
 *   - edit_meta: editar payment_status / contract_status
 *   - work: marcar checklist, preencher deliverables
 *   - advance: avancar coluna
 *   - go_back: voltar coluna (criar versao)
 *   - override: forcar avanco pulando itens pendentes
 *   - admin: excluir, alterar pipeline structure
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import type { OrgRole } from "@/types/organization"

export type OnboardingAction =
  | "read"
  | "edit_meta"
  | "work"
  | "advance"
  | "go_back"
  | "override"
  | "admin"

const ROLE_PERMISSIONS: Record<OrgRole, OnboardingAction[]> = {
  admin: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  dev: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  coo: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  suporte: ["read", "work", "advance"],
  designer: ["read", "work"],
  implementacao: ["read", "work"],
}

export async function getUserOrgRole(userId: string): Promise<{
  orgId: string
  role: OrgRole
  roles: OrgRole[]
  memberId: string
} | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("org_members")
    .select("id, org_id, role")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (!data) return null

  // Carrega todas as funções da junction.
  const { data: roleRows } = await admin
    .from("org_member_roles")
    .select("role")
    .eq("org_member_id", data.id)
  const roles = (roleRows ?? []).map((r) => r.role as OrgRole)
  const primary = (roles[0] ?? (data.role as OrgRole) ?? "suporte") as OrgRole

  return {
    orgId: data.org_id as string,
    role: primary,
    roles: roles.length > 0 ? roles : [primary],
    memberId: data.id as string,
  }
}

/** True se ALGUMA das funções da conta libera a ação. */
export function canPerform(roles: OrgRole[] | OrgRole, action: OnboardingAction): boolean {
  const list = Array.isArray(roles) ? roles : [roles]
  return list.some((r) => (ROLE_PERMISSIONS[r] ?? ["read"]).includes(action))
}

export async function requireOnboardingPermission(
  userId: string,
  action: OnboardingAction,
): Promise<{ orgId: string; role: OrgRole; roles: OrgRole[]; memberId: string }> {
  const ctx = await getUserOrgRole(userId)
  if (!ctx) throw new AppError("Sem org membership ativo", 403)
  if (!canPerform(ctx.roles, action)) {
    throw new AppError(
      `Suas funções (${ctx.roles.join(", ")}) não têm permissão pra essa ação (${action})`,
      403,
    )
  }
  return ctx
}
