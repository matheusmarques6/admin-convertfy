import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getCachedAccountInfo } from "@/lib/integrations/klaviyo/cached-metadata"
import { getUnifiedRevenue } from "@/lib/services/unified-metrics.service"
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

    const currencyCache = new Map<string, string>()
    async function getCurrency(storeId: string, fallback: string | null): Promise<string> {
      if (currencyCache.has(storeId)) return currencyCache.get(storeId)!
      try {
        const info = await getCachedAccountInfo(storeId)
        const c = info?.currency || fallback || "BRL"
        currencyCache.set(storeId, c)
        return c
      } catch {
        return fallback || "BRL"
      }
    }

    const byPeriod: Record<string, { total: number; campaign: number; flow: number; rates: number[] }> = {}
    for (const p of PERIODS) byPeriod[p] = { total: 0, campaign: 0, flow: 0, rates: [] }

    for (const row of rows) {
      if (!byPeriod[row.period_label]) continue

      const currency = await getCurrency(row.store_id, row.currency)
      const totalBRL = await convertToBRL(row.total_revenue, currency)
      const campBRL = await convertToBRL(row.campaign_revenue, currency)
      const flowBRL = await convertToBRL(row.flow_revenue, currency)

      byPeriod[row.period_label].total += totalBRL
      byPeriod[row.period_label].campaign += campBRL
      byPeriod[row.period_label].flow += flowBRL

      if (row.total_revenue > 0) {
        const attributed = row.campaign_revenue + row.flow_revenue
        const rate = row.total_revenue > 0 ? (attributed / row.total_revenue) * 100 : 0
        byPeriod[row.period_label].rates.push(rate)
      }
    }

    const sparkTotal = PERIODS.map((p) => Math.round(byPeriod[p].total))
    const sparkCampaign = PERIODS.map((p) => Math.round(byPeriod[p].campaign))
    const sparkFlow = PERIODS.map((p) => Math.round(byPeriod[p].flow))
    const sparkRate = PERIODS.map((p) => {
      const rates = byPeriod[p].rates
      return rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0
    })

    const current = byPeriod[selectedPeriod] || byPeriod["30d"]
    const currentDays = PERIOD_DAYS[selectedPeriod] || 30
    const ref = byPeriod["90d"]
    const refDays = 90

    function calcDelta(currentValue: number, cDays: number, refValue: number, rDays: number): number {
      const avgCurrent = cDays > 0 ? currentValue / cDays : 0
      const avgRef = rDays > 0 ? refValue / rDays : 0
      if (avgRef === 0) return 0
      return Math.round(((avgCurrent - avgRef) / avgRef) * 1000) / 10
    }

    const deltaTotal = calcDelta(current.total, currentDays, ref.total, refDays)
    const deltaCampaign = calcDelta(current.campaign, currentDays, ref.campaign, refDays)
    const deltaFlow = calcDelta(current.flow, currentDays, ref.flow, refDays)

    const currentRateAvg = current.rates.length > 0
      ? current.rates.reduce((a, b) => a + b, 0) / current.rates.length
      : 0
    const refRateAvg = ref.rates.length > 0
      ? ref.rates.reduce((a, b) => a + b, 0) / ref.rates.length
      : 0
    const deltaRate = refRateAvg > 0
      ? Math.round(((currentRateAvg - refRateAvg) / refRateAvg) * 1000) / 10
      : 0

    return successResponse(request, {
      period: selectedPeriod,
      sparklines: {
        total: sparkTotal,
        campaign: sparkCampaign,
        flow: sparkFlow,
        rate: sparkRate,
      },
      deltas: {
        total: { value: deltaTotal, label: "vs média 90d" },
        campaign: { value: deltaCampaign, label: "vs média 90d" },
        flow: { value: deltaFlow, label: "vs média 90d" },
        rate: { value: deltaRate, label: "vs média 90d" },
      },
    })
  } catch (error) {
    log.error("KpiSeries error:", error)
    return errorResponse(request, error, "kpi-series")
  }
}
