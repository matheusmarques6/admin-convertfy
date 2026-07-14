/**
 * GET /api/crm/cs-painel/proximas-calls
 *
 * Proximas calls agendadas da carteira (client_stores.next_feedback_date >= hoje),
 * ordenadas por proximidade. Enriquecido com CSM (clients.owner_id -> profiles)
 * e cadencia (store_cadence_overrides, default 'weekly').
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelProximasCalls")

export const dynamic = "force-dynamic"

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  paused: "Pausada",
}

type StoreRow = {
  id: string
  store_name: string
  next_feedback_date: string | null
  client: { id: string; name: string; owner_id: string | null } | { id: string; name: string; owner_id: string | null }[] | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const nowIso = new Date().toISOString()

    const { data: stores } = await admin
      .from("client_stores")
      .select(
        "id, store_name, next_feedback_date, client:clients(id, name, owner_id)",
      )
      .eq("is_active", true)
      .not("next_feedback_date", "is", null)
      .gte("next_feedback_date", nowIso)
      .order("next_feedback_date", { ascending: true })
      .limit(6)
      .returns<StoreRow[]>()

    const rows = stores || []
    const storeIds = rows.map((s) => s.id)

    // Cadencia por loja
    const cadenceByStore = new Map<string, string>()
    if (storeIds.length > 0) {
      const { data: overrides } = await admin
        .from("store_cadence_overrides")
        .select("store_id, frequency")
        .in("store_id", storeIds)
      for (const o of overrides || []) {
        cadenceByStore.set(o.store_id as string, o.frequency as string)
      }
    }

    // Nome do CSM (owner)
    const ownerIds = Array.from(
      new Set(
        rows
          .map((s) => {
            const c = Array.isArray(s.client) ? s.client[0] : s.client
            return c?.owner_id
          })
          .filter(Boolean) as string[],
      ),
    )
    const ownerName = new Map<string, string>()
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds)
      for (const p of profiles || []) {
        ownerName.set(p.id as string, (p.name as string) || "")
      }
    }

    const calls = rows.map((s) => {
      const c = Array.isArray(s.client) ? s.client[0] : s.client
      const freq = cadenceByStore.get(s.id) || "weekly"
      return {
        store_id: s.id,
        store_name: s.store_name,
        next_call_date: s.next_feedback_date,
        csm_name: c?.owner_id ? ownerName.get(c.owner_id) || null : null,
        cadence: freq,
        cadence_label: CADENCE_LABEL[freq] || freq,
      }
    })

    return successResponse(request, { calls })
  } catch (error) {
    log.error("CS painel proximas-calls error:", error)
    return errorResponse(request, error, "cs-painel-proximas-calls")
  }
}
