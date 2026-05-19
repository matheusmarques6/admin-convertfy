/**
 * POST /api/admin/stores/[id]/init-flows
 *   Cria os 5 flows padrao (welcome, abandoned_cart, browse_abandonment,
 *   post_purchase, win_back) para uma loja que ainda nao tem flows.
 *   Idempotente — usa NOT EXISTS na inserção (skip flows ja existentes).
 *   Welcome inicia "in_progress", outros "blocked".
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("InitFlows")

export const dynamic = "force-dynamic"

const DEFAULT_FLOWS: Array<{
  flow_type:
    | "welcome"
    | "abandoned_cart"
    | "browse_abandonment"
    | "post_purchase"
    | "win_back"
  name: string
  description: string
  status: "blocked" | "in_progress"
  position: number
}> = [
  {
    flow_type: "welcome",
    name: "Welcome Flow",
    description: "Sequência de boas-vindas para novos inscritos",
    status: "in_progress",
    position: 1,
  },
  {
    flow_type: "abandoned_cart",
    name: "Abandoned Cart",
    description: "Recuperação de carrinho abandonado",
    status: "blocked",
    position: 2,
  },
  {
    flow_type: "browse_abandonment",
    name: "Browse Abandonment",
    description: "Recuperação de navegação sem compra",
    status: "blocked",
    position: 3,
  },
  {
    flow_type: "post_purchase",
    name: "Pós-compra",
    description: "Engajamento pós-compra",
    status: "blocked",
    position: 4,
  },
  {
    flow_type: "win_back",
    name: "Win-back",
    description: "Reativação de clientes inativos",
    status: "blocked",
    position: 5,
  },
]

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // Verifica flows existentes
    const { data: existing, error: fetchErr } = await admin
      .from("email_flows")
      .select("flow_type")
      .eq("store_id", storeId)
    if (fetchErr) throw fetchErr

    const existingTypes = new Set(
      (existing ?? []).map((f) => f.flow_type as string),
    )
    const toInsert = DEFAULT_FLOWS.filter(
      (f) => !existingTypes.has(f.flow_type),
    ).map((f) => ({ ...f, store_id: storeId }))

    if (toInsert.length === 0) {
      return successResponse(request, { created: 0, skipped: DEFAULT_FLOWS.length })
    }

    const { data: created, error: insErr } = await admin
      .from("email_flows")
      .insert(toInsert)
      .select("*")
    if (insErr) throw insErr

    return successResponse(request, {
      created: created?.length ?? 0,
      skipped: DEFAULT_FLOWS.length - (created?.length ?? 0),
    })
  } catch (error) {
    log.error("Init flows error:", error)
    return errorResponse(request, error, "init-flows")
  }
}
