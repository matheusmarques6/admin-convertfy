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

    // PREMISSA SINGLE-ORG (decisao consciente): esta rota do CRM agrega
    // client_stores/deals/pipelines SEM filtro de org_id, ao contrario das
    // rotas irmas do dashboard (health-monitor, stores-overview) que sao
    // org-scoped. Hoje o CRM opera como agencia single-tenant, entao o
    // resultado e o mesmo. ATENCAO: se o app passar a ter multiplas orgs
    // com client_stores, isto vaza dados entre orgs — nesse dia, adicionar
    // resolveOrgId(user.id) + .eq("org_id", orgId) aqui e nas queries de
    // client_subscriptions/pipelines/deals abaixo.

    // Lojas ativas + health/MRR/NPS
    type StoreRow = {
      id: string
      store_name: string
      client_id: string
      mrr_cents: number | null
      health_score: number | null
      nps_last_score: number | null
      nps_last_at: string | null
      contract_start_date: string | null
      contract_end_date: string | null
      is_active: boolean
      client: { id: string; name: string; health_score: number | null } | { id: string; name: string; health_score: number | null }[] | null
    }

    const { data: stores } = await admin
      .from("client_stores")
      .select(`
        id, store_name, client_id, mrr_cents, health_score, nps_last_score, nps_last_at,
        contract_start_date, contract_end_date, is_active,
        client:clients (id, name, health_score)
      `)
      .eq("is_active", true)
      .returns<StoreRow[]>()

    const allStores = stores || []
    const totalStores = allStores.length

    // MRR real via client_subscriptions (PIX direto + manuais + Asaas stub linkados).
    // Soma value de subs com status='active' agrupadas por client_id.
    // Normaliza pra "mensal" baseado em cycle (MONTHLY=1x, QUARTERLY=/3, YEARLY=/12).
    const clientIdsFromStores = Array.from(
      new Set(allStores.map((s) => s.client_id).filter(Boolean)),
    )
    const mrrFromSubs = new Map<string, number>()
    if (clientIdsFromStores.length > 0) {
      const { data: activeSubs } = await admin
        .from("client_subscriptions")
        .select("client_id, value, cycle")
        .in("client_id", clientIdsFromStores)
        .eq("status", "active")
      for (const sub of activeSubs ?? []) {
        const cycleDivisor =
          sub.cycle === "YEARLY"
            ? 12
            : sub.cycle === "QUARTERLY"
              ? 3
              : sub.cycle === "BIWEEKLY"
                ? 0.5
                : sub.cycle === "WEEKLY"
                  ? 0.25
                  : 1
        const monthlyValue = Number(sub.value) / cycleDivisor
        mrrFromSubs.set(
          sub.client_id as string,
          (mrrFromSubs.get(sub.client_id as string) ?? 0) + monthlyValue,
        )
      }
    }

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

    // Loop por client_id (nao por store) pra evitar dobrar MRR quando cliente
    // tem multiplas lojas.
    const clientsSeen = new Set<string>()
    for (const s of allStores) {
      const client = Array.isArray(s.client) ? s.client[0] : s.client

      // Health: usa store.health_score; se null, fallback pra client.health_score
      const score =
        s.health_score != null ? s.health_score : (client?.health_score ?? null)
      const nps = s.nps_last_score

      // MRR: soma uma vez por client_id (multi-store consolida)
      if (!clientsSeen.has(s.client_id)) {
        clientsSeen.add(s.client_id)
        const subMrr = mrrFromSubs.get(s.client_id) ?? 0
        if (subMrr > 0) {
          // value vem em reais; converte pra cents
          totalMrrCents += Math.round(subMrr * 100)
        } else if (s.mrr_cents) {
          // fallback no MRR cacheado em client_stores
          totalMrrCents += s.mrr_cents
        }
      }

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
        const subMrr = mrrFromSubs.get(s.client_id) ?? 0
        atRisk.push({
          store_id: s.id,
          store_name: s.store_name,
          client_name: client?.name || "—",
          health_score: score,
          mrr_cents: subMrr > 0 ? Math.round(subMrr * 100) : s.mrr_cents,
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
          name: p.name,
          color: p.color || null,
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
