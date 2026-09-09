/**
 * PATCH /api/admin/vault/propostas — marca uma lacuna proposta como
 * `copiada` (foi para o Obsidian) ou `descartada` (não é lacuna; o cron não
 * a ressuscita). A lista vem no GET /api/admin/vault (`propostas`).
 * Auth: canManagePrompts — mesmo gate do hub.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, ValidationError } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"

const log = logger.child("AdminVaultPropostas")

export const dynamic = "force-dynamic"

const Body = z.object({
  id: z.string().uuid(),
  status: z.enum(["proposta", "copiada", "descartada"]),
})

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = Body.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new ValidationError("Informe id (uuid) e status (proposta|copiada|descartada)")
    const { id, status } = parsed.data
    const { data, error } = await admin
      .from("vault_propostas")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status")
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new ValidationError("Proposta não encontrada")
    return successResponse(request, data)
  } catch (error) {
    log.error("PATCH vault/propostas error", error)
    return errorResponse(request, error, "admin-vault-propostas-patch")
  }
}
