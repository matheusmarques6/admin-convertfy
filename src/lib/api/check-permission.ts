import { SupabaseClient } from "@supabase/supabase-js"
import { ForbiddenError } from "./errors"

/**
 * Permission helpers — TRANSIÇÃO.
 *
 * O sistema de features (org_member_features) está deprecado em favor do
 * gating por função (org_member_roles). Estes helpers continuam exportados
 * para não quebrar os ~30 endpoints que dependem deles, mas:
 *
 * - O gate REAL é feito por `canAccess` no client + RLS no banco.
 * - Aqui exigimos apenas que o usuário esteja autenticado e seja membro
 *   ativo de alguma org. Não bloqueia por feature (deprecada).
 * - Próxima release: substituir cada `requireFeature("xxx")` por
 *   `requireRole([...])` baseado em `ROLES_CAN_CREATE_ACCOUNTS` ou similar.
 */

interface PermissionContext {
  userId: string
  isAdmin?: boolean
  isOrgMember?: boolean
}

async function getPermissionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<PermissionContext> {
  // Check if global admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()

  if (profile?.role === "admin") {
    return { userId, isAdmin: true }
  }

  // Check if active org member
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle()

  return { userId, isOrgMember: !!orgMember }
}

/**
 * Authn + org-membership gate. Não consulta mais a tabela de features —
 * mantida só para preservar a assinatura.
 *
 * @deprecated Migrar para um `requireRole([...])` específico por endpoint.
 */
export async function requireFeature(
  supabase: SupabaseClient,
  userId: string,
  _feature: string
): Promise<void> {
  const ctx = await getPermissionContext(supabase, userId)
  if (ctx.isAdmin) return
  if (!ctx.isOrgMember) {
    throw new ForbiddenError("Usuário não pertence a nenhuma organização")
  }
}

/**
 * @deprecated Migrar para um `requireRole([...])` específico por endpoint.
 */
export async function requireAnyFeature(
  supabase: SupabaseClient,
  userId: string,
  _features: string[]
): Promise<void> {
  const ctx = await getPermissionContext(supabase, userId)
  if (ctx.isAdmin) return
  if (!ctx.isOrgMember) {
    throw new ForbiddenError("Usuário não pertence a nenhuma organização")
  }
}
