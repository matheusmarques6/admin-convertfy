/**
 * Garante que o usuario autenticado tem role administrativa
 * (owner | manager | coo | coordinator) na org especificada.
 *
 * Usado em endpoints que mutam configuracao da org (criar/editar/
 * deletar pipelines operacionais, templates IA, etc), pra evitar
 * que qualquer membro consiga modificar.
 *
 * Usa createAdminClient pra bypass de RLS na consulta do role.
 * Lanca AppError 403 se nao for admin.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "./errors"

const ADMIN_ROLES = new Set(["owner", "manager", "coo", "coordinator"])

export async function requireOrgAdmin(
  userId: string,
  orgId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: member } = await admin
    .from("org_members")
    .select("role, is_active")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!member?.is_active || !ADMIN_ROLES.has(member.role)) {
    throw new AppError(
      "Apenas owners, managers e coordenadores podem fazer essa operacao.",
      403,
      "forbidden",
    )
  }
}
