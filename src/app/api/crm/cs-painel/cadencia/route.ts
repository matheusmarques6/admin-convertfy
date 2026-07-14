/**
 * GET /api/crm/cs-painel/cadencia
 *
 * Distribuicao das lojas ativas por cadencia de call.
 * Fonte: store_cadence_overrides.frequency (weekly/biweekly/monthly/paused).
 * Lojas ativas SEM override contam como 'weekly' (default global do sistema).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelCadencia")

export const dynamic = "force-dynamic"

const LABELS: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  paused: "Pausada",
}
const ORDER = ["weekly", "biweekly", "monthly", "paused"] as const

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // Lojas ativas
    const { data: stores } = await admin
      .from("client_stores")
      .select("id")
      .eq("is_active", true)
      .returns<Array<{ id: string }>>()

    const storeIds = (stores || []).map((s) => s.id)
    const total = storeIds.length

    // Overrides existentes (so as excecoes ao default 'weekly')
    const overrideByStore = new Map<string, string>()
    if (storeIds.length > 0) {
      const { data: overrides } = await admin
        .from("store_cadence_overrides")
        .select("store_id, frequency")
        .in("store_id", storeIds)
        .returns<Array<{ store_id: string; frequency: string }>>()
      for (const o of overrides || []) {
        overrideByStore.set(o.store_id, o.frequency)
      }
    }

    const counts: Record<string, number> = {
      weekly: 0,
      biweekly: 0,
      monthly: 0,
      paused: 0,
    }
    for (const id of storeIds) {
      const freq = overrideByStore.get(id) || "weekly"
      if (counts[freq] != null) counts[freq] += 1
    }

    const distribution = ORDER.map((key) => ({
      key,
      label: LABELS[key],
      n: counts[key],
    }))

    return successResponse(request, { total, distribution })
  } catch (error) {
    log.error("CS painel cadencia error:", error)
    return errorResponse(request, error, "cs-painel-cadencia")
  }
}
