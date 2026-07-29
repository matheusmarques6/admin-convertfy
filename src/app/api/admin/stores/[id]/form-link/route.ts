/**
 * Link do formulario de onboarding de uma loja.
 *
 * GET  — devolve o link atual (status `active` | `expired` | `none`).
 *        Nunca cria nada: e leitura pura, segura pra render de lista.
 * POST — garante um link enviavel. Loja sem onboarding ganha um (o
 *        formulario publico resolve por `onboardings.form_token`, entao
 *        um token solto abriria 404); token vencido e renovado.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  ensureFormLinkForStore,
  getFormLinkByStore,
} from "@/lib/services/onboarding-form-link.service"

const log = logger.child("StoreFormLink")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)

    return successResponse(request, await getFormLinkByStore(storeId))
  } catch (error) {
    log.error("GET error", error)
    return errorResponse(request, error, "store-form-link")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const result = await ensureFormLinkForStore(storeId, user.id)

    log.info("link garantido", {
      store_id: storeId,
      created: result.created,
      renewed: result.renewed,
    })

    return successResponse(request, result)
  } catch (error) {
    log.error("POST error", error)
    return errorResponse(request, error, "store-form-link")
  }
}
