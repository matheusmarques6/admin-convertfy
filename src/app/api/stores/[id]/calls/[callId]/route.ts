/**
 * DELETE /api/stores/[id]/calls/[callId] — remove uma call registrada
 * por engano.
 * PATCH  /api/stores/[id]/calls/[callId] — corrige a call (data, meses
 *        de referência, notas) sem precisar apagar e refazer.
 *
 * A exclusão limpa também o deal espelho do pipeline "Calls Mensais"
 * (criado pelo syncCallToDeal) — deixar o deal órfão faria a cadência
 * mostrar uma call que não existe mais. O
 * client_stores.last_feedback_date é recalculado pelo trigger AFTER
 * DELETE (migration 20261108).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertStoreInUserOrg } from "@/lib/api/store-org-guard"
import { isMonthKey } from "@/lib/services/call-coverage"
import { logger } from "@/lib/logger"

const log = logger.child("StoreCallItem")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  conducted_at: z.string().min(4).optional(),
  duration_minutes: z.number().int().min(0).max(600).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  action_items: z.string().max(10_000).nullable().optional(),
  next_call_date: z.string().min(4).nullable().optional(),
  reference_months: z.array(z.string().max(7)).max(24).optional(),
})

async function loadCall(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  callId: string,
) {
  const { data } = await admin
    .from("store_feedback_calls")
    .select("id, store_id")
    .eq("id", callId)
    .maybeSingle()
  // A call tem de ser DESTA loja — id de outra loja devolve 404.
  if (!data || data.store_id !== storeId) {
    throw new AppError("Call não encontrada", 404, "not-found")
  }
  return data
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> },
) {
  try {
    const { id, callId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertStoreInUserOrg(admin, user.id, id)
    await loadCall(admin, id, callId)

    // Deal espelho da call no pipeline de cadência (fire-and-forget:
    // falhar aqui não pode impedir a exclusão pedida pelo usuário).
    const { error: dealError } = await admin
      .from("deals")
      .delete()
      .eq("source", "feedback_call")
      // chave gravada pelo syncCallToDeal
      .contains("custom_fields", { legacy_call_id: callId })
    if (dealError) {
      log.warn("deal espelho não removido", { call_id: callId, error: dealError.message })
    }

    const { error } = await admin.from("store_feedback_calls").delete().eq("id", callId)
    if (error) throw new AppError(error.message, 500)

    log.info("call excluída", { call_id: callId, store_id: id, by: user.id })
    return successResponse(request, { ok: true, deleted: callId })
  } catch (error) {
    return errorResponse(request, error, "StoreCallDelete")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> },
) {
  try {
    const { id, callId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertStoreInUserOrg(admin, user.id, id)
    await loadCall(admin, id, callId)

    const body = patchSchema.parse(await request.json())
    const patch: Record<string, unknown> = {}
    if (body.conducted_at !== undefined) patch.conducted_at = body.conducted_at
    if (body.duration_minutes !== undefined) patch.duration_minutes = body.duration_minutes
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.action_items !== undefined) patch.action_items = body.action_items
    if (body.next_call_date !== undefined) patch.next_call_date = body.next_call_date
    if (body.reference_months !== undefined) {
      patch.reference_months = body.reference_months.filter(isMonthKey)
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("Nada para atualizar", 400, "empty-patch")
    }

    let result = await admin
      .from("store_feedback_calls")
      .update(patch)
      .eq("id", callId)
      .select()
      .single()
    if (result.error && result.error.code === "42703" && patch.reference_months) {
      // migration 20261108 não rodou — salva o resto
      const { reference_months: _drop, ...rest } = patch
      void _drop
      result = await admin
        .from("store_feedback_calls")
        .update(rest)
        .eq("id", callId)
        .select()
        .single()
    }
    if (result.error) throw new AppError(result.error.message, 500)

    return successResponse(request, { call: result.data })
  } catch (error) {
    return errorResponse(request, error, "StoreCallPatch")
  }
}
