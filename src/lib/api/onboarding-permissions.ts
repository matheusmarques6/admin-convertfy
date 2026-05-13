/**
 * Helpers de permissao pro pipeline operacional v2.
 *
 * Regras (alto nivel):
 *   - owner, manager, coo, coordinator: acesso total
 *   - ops, estrategista: avancar/voltar, editar deliverables/checklist
 *   - cs: avancar so as colunas de feedback/acompanhamento (slugs 'cliente_ativo')
 *   - financeiro: ler tudo, editar so payment_status/contract_status
 *   - support, sdr, analyst: leitura
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

export type OnboardingAction =
  | "read"
  | "edit_meta"
  | "work"
  | "advance"
  | "go_back"
  | "override"
  | "admin"

const ROLE_PERMISSIONS: Record<string, OnboardingAction[]> = {
  owner: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  manager: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  coo: ["read", "edit_meta", "work", "advance", "go_back", "override", "admin"],
  coordinator: ["read", "edit_meta", "work", "advance", "go_back", "override"],
  ops: ["read", "edit_meta", "work", "advance", "go_back"],
  estrategista: ["read", "work", "advance", "go_back"],
  cs: ["read", "work", "advance"],
  copywriter: ["read", "work"],
  designer: ["read", "work"],
  developer: ["read", "work"],
  techlead: ["read", "work", "advance"],
  financeiro: ["read", "edit_meta"],
  support: ["read"],
  sdr: ["read"],
  analyst: ["read"],
}

export async function getUserOrgRole(userId: string): Promise<{
  orgId: string
  role: string
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
  return {
    orgId: data.org_id as string,
    role: (data.role as string) ?? "support",
    memberId: data.id as string,
  }
}

export function canPerform(role: string, action: OnboardingAction): boolean {
  const allowed = ROLE_PERMISSIONS[role] ?? ["read"]
  return allowed.includes(action)
}

export async function requireOnboardingPermission(
  userId: string,
  action: OnboardingAction,
): Promise<{ orgId: string; role: string; memberId: string }> {
  const ctx = await getUserOrgRole(userId)
  if (!ctx) throw new AppError("Sem org membership ativo", 403)
  if (!canPerform(ctx.role, action)) {
    throw new AppError(
      `Sua função (${ctx.role}) nao tem permissao pra essa acao (${action})`,
      403,
    )
  }
  return ctx
}
