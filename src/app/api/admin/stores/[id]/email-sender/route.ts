/**
 * PATCH /api/admin/stores/[id]/email-sender
 *
 * Atualiza o remetente (from_name / from_email) de TODOS os e-mails da loja
 * de uma vez. Usado pela tela de Implementação: o remetente é uma config de
 * loja, então editá-lo lá cascateia pra todos os flows/e-mails daquela loja.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreEmailSender")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const patchSchema = z
  .object({
    from_name: z.string().max(120).nullable().optional(),
    from_email: z.string().email().nullable().optional(),
  })
  .refine(
    (v) => v.from_name !== undefined || v.from_email !== undefined,
    { message: "Informe from_name e/ou from_email" },
  )

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(`invalid_body: ${parsed.error.message}`, 400)
    }

    const update: Record<string, unknown> = {}
    if (parsed.data.from_name !== undefined) update.from_name = parsed.data.from_name
    if (parsed.data.from_email !== undefined) update.from_email = parsed.data.from_email

    // Flows da loja → atualiza todos os e-mails deles.
    const { data: flows, error: flowsErr } = await admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)
    if (flowsErr) throw flowsErr

    const flowIds = (flows ?? []).map((f) => f.id as string)
    if (flowIds.length === 0) {
      return successResponse(request, { updated: 0 })
    }

    const { data: updated, error } = await admin
      .from("email_flow_emails")
      .update(update)
      .in("flow_id", flowIds)
      .select("id")
    if (error) throw error

    return successResponse(request, { updated: (updated ?? []).length })
  } catch (error) {
    log.error("email-sender patch error:", error)
    return errorResponse(request, error, "store-email-sender")
  }
}
