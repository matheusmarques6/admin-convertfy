/**
 * GET /api/crm/cs-painel/carga-csm
 *
 * Carga por CSM: numero de lojas ativas por dono (clients.owner_id) e
 * quantas dessas estao em risco (health_score < 50).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelCargaCsm")

export const dynamic = "force-dynamic"

type StoreRow = {
  id: string
  health_score: number | null
  client: { id: string; owner_id: string | null } | { id: string; owner_id: string | null }[] | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: stores } = await admin
      .from("client_stores")
      .select("id, health_score, client:clients(id, owner_id)")
      .eq("is_active", true)
      .returns<StoreRow[]>()

    const rows = stores || []

    // Agrupa por owner_id
    const byOwner = new Map<string, { n: number; risk: number }>()
    for (const s of rows) {
      const c = Array.isArray(s.client) ? s.client[0] : s.client
      const owner = c?.owner_id
      if (!owner) continue
      const acc = byOwner.get(owner) || { n: 0, risk: 0 }
      acc.n += 1
      if (s.health_score != null && s.health_score < 50) acc.risk += 1
      byOwner.set(owner, acc)
    }

    // Nomes dos CSMs
    const ownerIds = Array.from(byOwner.keys())
    const ownerName = new Map<string, string>()
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds)
      for (const p of profiles || []) {
        ownerName.set(p.id as string, (p.name as string) || "—")
      }
    }

    const csms = ownerIds
      .map((id) => ({
        owner_id: id,
        name: ownerName.get(id) || "—",
        n: byOwner.get(id)!.n,
        risk: byOwner.get(id)!.risk,
      }))
      .sort((a, b) => b.n - a.n)

    return successResponse(request, { csms })
  } catch (error) {
    log.error("CS painel carga-csm error:", error)
    return errorResponse(request, error, "cs-painel-carga-csm")
  }
}
