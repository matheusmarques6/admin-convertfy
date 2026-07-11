import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getUnifiedRevenue } from "@/lib/services/unified-metrics.service"
import {
  computeIntersectionDelta,
  computeIntersectionRateDelta,
} from "@/lib/services/kpi-deltas"
import { logger } from "@/lib/logger"

const log = logger.child("KpiSeries")

const PERIODS = ["7d", "15d", "30d", "90d"] as const
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30, "90d": 90 }

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const selectedPeriod = request.nextUrl.searchParams.get("period") || "30d"

    const rows = await getUnifiedRevenue(supabase, orgId, PERIODS as unknown as string[])

    // Currency ja vem do DB (store_revenue_summary.currency). Evitamos chamar
    // Klaviyo Account API aqui: para lojas Omnisend nao ha apiKey Klaviyo
    // (retornaria 401) e a informacao persistida e suficiente.
    const currencyCache = new Map<string, string>()
    function getCurrency(storeId: string, fallback: string | null): string {
      if (currencyCache.has(storeId)) return currencyCache.get(storeId)!
      const c = fallback || "BRL"
      currencyCache.set(storeId, c)
      return c
    }

    const byPeriod: Record<string, { total: number; campaign: number; flow: number; rates: number[] }> = {}
    for (const p of PERIODS) byPeriod[p] = { total: 0, campaign: 0, flow: 0, rates: [] }

    // Somas POR LOJA por período — insumo do delta por interseção
    // (cards/sparklines continuam usando os agregados byPeriod).
    type StoreMaps = {
      total: Map<string, number>
      campaign: Map<string, number>
      flow: Map<string, number>
      rate: Map<string, number>
    }
    const storeMaps: Record<string, StoreMaps> = {}
    for (const p of PERIODS) {
      storeMaps[p] = {
        total: new Map(),
        campaign: new Map(),
        flow: new Map(),
        rate: new Map(),
      }
    }

    for (const row of rows) {
      if (!byPeriod[row.period_label]) continue

      const currency = getCurrency(row.store_id, row.currency)
      const totalBRL = await convertToBRL(row.total_revenue, currency)
      const campBRL = await convertToBRL(row.campaign_revenue, currency)
      const flowBRL = await convertToBRL(row.flow_revenue, currency)

      byPeriod[row.period_label].total += totalBRL
      byPeriod[row.period_label].campaign += campBRL
      byPeriod[row.period_label].flow += flowBRL

      const maps = storeMaps[row.period_label]
      maps.total.set(row.store_id, (maps.total.get(row.store_id) ?? 0) + totalBRL)
      maps.campaign.set(row.store_id, (maps.campaign.get(row.store_id) ?? 0) + campBRL)
      maps.flow.set(row.store_id, (maps.flow.get(row.store_id) ?? 0) + flowBRL)

      if (row.total_revenue > 0) {
        const attributed = row.campaign_revenue + row.flow_revenue
        const rate = row.total_revenue > 0 ? (attributed / row.total_revenue) * 100 : 0
        byPeriod[row.period_label].rates.push(rate)
        maps.rate.set(row.store_id, rate)
      }
    }

    const sparkTotal = PERIODS.map((p) => Math.round(byPeriod[p].total))
    const sparkCampaign = PERIODS.map((p) => Math.round(byPeriod[p].campaign))
    const sparkFlow = PERIODS.map((p) => Math.round(byPeriod[p].flow))
    const sparkRate = PERIODS.map((p) => {
      const rates = byPeriod[p].rates
      return rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0
    })

    const currentDays = PERIOD_DAYS[selectedPeriod] || 30
    const currentMaps = storeMaps[selectedPeriod] || storeMaps["30d"]
    const refMaps = storeMaps["90d"]
    const refDays = 90

    // Delta calculado APENAS sobre a interseção de lojas presentes nas
    // duas janelas — antes, a janela 90d desatualizada (ex.: 28 lojas
    // vs 60 no 30d) subestimava a referência e produzia deltas absurdos
    // (+3763%). value null = referência incompleta → UI mostra "—".
    const deltaTotal = computeIntersectionDelta(
      currentMaps.total, currentDays, refMaps.total, refDays,
    )
    const deltaCampaign = computeIntersectionDelta(
      currentMaps.campaign, currentDays, refMaps.campaign, refDays,
    )
    const deltaFlow = computeIntersectionDelta(
      currentMaps.flow, currentDays, refMaps.flow, refDays,
    )
    const deltaRate = computeIntersectionRateDelta(currentMaps.rate, refMaps.rate)

    const deltaLabel = (d: { value: number | null; stores: number }) =>
      d.value === null
        ? "referência 90d incompleta"
        : `vs média 90d (${d.stores} lojas)`

    return successResponse(request, {
      period: selectedPeriod,
      sparklines: {
        total: sparkTotal,
        campaign: sparkCampaign,
        flow: sparkFlow,
        rate: sparkRate,
      },
      deltas: {
        total: { value: deltaTotal.value, label: deltaLabel(deltaTotal) },
        campaign: { value: deltaCampaign.value, label: deltaLabel(deltaCampaign) },
        flow: { value: deltaFlow.value, label: deltaLabel(deltaFlow) },
        rate: { value: deltaRate.value, label: deltaLabel(deltaRate) },
      },
    })
  } catch (error) {
    log.error("KpiSeries error:", error)
    return errorResponse(request, error, "kpi-series")
  }
}
