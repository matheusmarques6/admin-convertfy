import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "./errors"
import { logger } from "@/lib/logger"

const log = logger.child("resolveOrgId")

/**
 * Resolve org_id do usuario autenticado.
 * Usa adminClient para bypassar RLS em org_members.
 * Lanca 403 se usuario nao pertence a nenhuma org ativa.
 */
export async function resolveOrgId(userId: string): Promise<string> {
  const adminClient = createAdminClient()

  const { data: orgMember, error } = await adminClient
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()

  if (error) {
    log.error("Failed to resolve org_id", { userId, code: error.code, message: error.message })
  }

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }

  return orgMember.org_id
}
