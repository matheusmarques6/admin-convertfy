/**
 * Garante que o usuario autenticado tem role administrativa
 * (admin | dev | coo) na org especificada.
 *
 * Usado em endpoints que mutam configuracao da org (criar/editar/
 * deletar pipelines operacionais, templates IA, etc), pra evitar
 * que qualquer membro consiga modificar.
 *
 * Usa createAdminClient pra bypass de RLS na consulta dos roles.
 * Lanca AppError 403 se nenhuma funcao do usuario autoriza.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "./errors"
import { ROLES_CAN_CREATE_ACCOUNTS } from "@/lib/permissions/role-access"
import type { OrgRole } from "@/types/organization"

export async function requireOrgAdmin(
  userId: string,
  orgId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: member } = await admin
    .from("org_members")
    .select("id, is_active")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!member?.is_active) {
    throw new AppError("Acesso negado.", 403, "forbidden")
  }

  const { data: roleRows } = await admin
    .from("org_member_roles")
    .select("role")
    .eq("org_member_id", member.id)

  const roles = (roleRows ?? []).map((r) => r.role as OrgRole)
  const authorized = roles.some((r) => ROLES_CAN_CREATE_ACCOUNTS.includes(r))

  if (!authorized) {
    throw new AppError(
      "Apenas Admin, Dev ou COO podem fazer essa operacao.",
      403,
      "forbidden",
    )
  }
}
