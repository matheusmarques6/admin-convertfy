/**
 * GET /api/crm/dashboard/cs
 *
 * KPIs do dashboard de Customer Success:
 * - Distribuicao de health score por faixa (saudavel/atencao/critico)
 * - NPS recente
 * - MRR total da carteira
 * - Lojas em risco (health < 50)
 * - Deals abertos por pipeline CS
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDashboardCS")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // Lojas ativas + health/MRR/NPS
    const { data: stores } = await admin
      .from("client_stores")
      .select(`
        id, store_name, mrr_cents, health_score, nps_last_score, nps_last_at,
        contract_start_date, contract_end_date, is_active,
        client:clients (id, name)
      `)
      .eq("is_active", true)

    const allStores = stores || []
    const totalStores = allStores.length

    // Distribuicao por faixa de health
    let healthy = 0
    let warning = 0
    let critical = 0
    let noScore = 0
    let totalMrrCents = 0
    let npsCount = 0
    let npsSum = 0
    let npsPromoters = 0
    let npsPassives = 0
    let npsDetractors = 0

    const atRisk: Array<{
      store_id: string
      store_name: string
      client_name: string
      health_score: number | null
      mrr_cents: number | null
      nps: number | null
    }> = []

    for (const s of allStores) {
      const score = (s as any).health_score
      const mrr = (s as any).mrr_cents
      const nps = (s as any).nps_last_score

      if (mrr) totalMrrCents += mrr

      if (score == null) {
        noScore += 1
      } else if (score >= 70) {
        healthy += 1
      } else if (score >= 50) {
        warning += 1
      } else {
        critical += 1
      }

      if (score != null && score < 50) {
        const client = Array.isArray((s as any).client) ? (s as any).client[0] : (s as any).client
        atRisk.push({
          store_id: s.id,
          store_name: (s as any).store_name,
          client_name: client?.name || "—",
          health_score: score,
          mrr_cents: mrr,
          nps,
        })
      }

      if (nps != null) {
        npsCount += 1
        npsSum += nps
        if (nps >= 9) npsPromoters += 1
        else if (nps >= 7) npsPassives += 1
        else npsDetractors += 1
      }
    }

    const npsScore =
      npsCount > 0
        ? ((npsPromoters - npsDetractors) / npsCount) * 100
        : null
    const npsAvg = npsCount > 0 ? npsSum / npsCount : null

    atRisk.sort((a, b) => (a.health_score || 0) - (b.health_score || 0))

    // Deals abertos em pipelines CS
    const { data: csPipelines } = await admin
      .from("pipelines")
      .select("id, name, color")
      .eq("scope", "cs")
      .eq("is_archived", false)

    const csIds = (csPipelines || []).map((p) => p.id)
    const byPipeline: Array<{ id: string; name: string; color: string | null; open_count: number }> = []

    if (csIds.length > 0) {
      const { data: openCsDeals } = await admin
        .from("deals")
        .select("id, pipeline_id")
        .in("pipeline_id", csIds)
        .eq("status", "open")

      const counts = new Map<string, number>()
      for (const d of openCsDeals || []) {
        counts.set(d.pipeline_id, (counts.get(d.pipeline_id) || 0) + 1)
      }
      for (const p of csPipelines || []) {
        byPipeline.push({
          id: p.id,
          name: (p as any).name,
          color: (p as any).color || null,
          open_count: counts.get(p.id) || 0,
        })
      }
    }

    return successResponse(request, {
      total_stores: totalStores,
      health_distribution: {
        healthy,
        warning,
        critical,
        no_score: noScore,
      },
      total_mrr_cents: totalMrrCents,
      nps: {
        score: npsScore,
        avg: npsAvg,
        count: npsCount,
        promoters: npsPromoters,
        passives: npsPassives,
        detractors: npsDetractors,
      },
      at_risk: atRisk.slice(0, 10),
      by_pipeline: byPipeline,
    })
  } catch (error) {
    log.error("CS dashboard error:", error)
    return errorResponse(request, error, "crm-dashboard-cs")
  }
}
