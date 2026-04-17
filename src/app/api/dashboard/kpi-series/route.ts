import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getCachedAccountInfo } from "@/lib/integrations/klaviyo/cached-metadata"
import { logger } from "@/lib/logger"

const log = logger.child("KpiSeries")

const PERIODS = ["7d", "15d", "30d", "90d"] as const
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30, "90d": 90 }

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const userClient = (await import("@/lib/supabase/server")).createClient
    const uc = await userClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)

    const selectedPeriod = request.nextUrl.searchParams.get("period") || "30d"

    const { data: rows, error } = await supabase
      .from("store_revenue_summary")
      .select(`
        store_id,
        period_label,
        klaviyo_total_revenue,
        klaviyo_campaign_revenue,
        klaviyo_flow_revenue,
        store_total_revenue,
        sync_status,
        client_stores!inner(id, klaviyo_api_key, klaviyo_private_key)
      `)
      .eq("org_id", orgId)
      .in("period_label", PERIODS as unknown as string[])
      .in("sync_status", ["ok", "partial"])

    if (error) throw error

    type Row = NonNullable<typeof rows>[number]

    const currencyCache = new Map<string, string>()
    async function getCurrency(storeId: string): Promise<string> {
      if (currencyCache.has(storeId)) return currencyCache.get(storeId)!
      try {
        const info = await getCachedAccountInfo(storeId)
        const c = info?.currency || "BRL"
        currencyCache.set(storeId, c)
        return c
      } catch {
        return "BRL"
      }
    }

    const byPeriod: Record<string, { total: number; campaign: number; flow: number }> = {}
    for (const p of PERIODS) byPeriod[p] = { total: 0, campaign: 0, flow: 0 }

    for (const row of (rows || []) as Row[]) {
      const pl = row.period_label as string
      if (!byPeriod[pl]) continue

      const currency = await getCurrency(row.store_id)
      const totalBRL = await convertToBRL(Number(row.klaviyo_total_revenue), currency)
      const campBRL = await convertToBRL(Number(row.klaviyo_campaign_revenue), currency)
      const flowBRL = await convertToBRL(Number(row.klaviyo_flow_revenue), currency)

      byPeriod[pl].total += totalBRL
      byPeriod[pl].campaign += campBRL
      byPeriod[pl].flow += flowBRL
    }

    const sparkTotal = PERIODS.map((p) => Math.round(byPeriod[p].total))
    const sparkCampaign = PERIODS.map((p) => Math.round(byPeriod[p].campaign))
    const sparkFlow = PERIODS.map((p) => Math.round(byPeriod[p].flow))

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

    const storesWithRev = (rows || []).filter(
      (r: Row) => r.period_label === selectedPeriod && Number(r.klaviyo_total_revenue) > 0
    )
    const convertfyRates = await Promise.all(
      storesWithRev.map(async (r: Row) => {
        const currency = await getCurrency(r.store_id)
        const storeRev = await convertToBRL(Number(r.klaviyo_total_revenue), currency)
        const attributed = await convertToBRL(
          Number(r.klaviyo_campaign_revenue) + Number(r.klaviyo_flow_revenue), currency
        )
        return storeRev > 0 ? (attributed / storeRev) * 100 : 0
      })
    )
    const avgConvertfyRate = convertfyRates.length > 0
      ? convertfyRates.reduce((a, b) => a + b, 0) / convertfyRates.length
      : 0

    const prevConvertfyRates = await Promise.all(
      ((rows || []) as Row[])
        .filter((r) => r.period_label === "90d" && Number(r.klaviyo_total_revenue) > 0)
        .map(async (r) => {
          const currency = await getCurrency(r.store_id)
          const storeRev = await convertToBRL(Number(r.klaviyo_total_revenue), currency)
          const attributed = await convertToBRL(
            Number(r.klaviyo_campaign_revenue) + Number(r.klaviyo_flow_revenue), currency
          )
          return storeRev > 0 ? (attributed / storeRev) * 100 : 0
        })
    )
    const prevAvgRate = prevConvertfyRates.length > 0
      ? prevConvertfyRates.reduce((a, b) => a + b, 0) / prevConvertfyRates.length
      : 0
    const deltaRate = prevAvgRate > 0
      ? Math.round(((avgConvertfyRate - prevAvgRate) / prevAvgRate) * 1000) / 10
      : 0

    const sparkRate = PERIODS.map((p) => {
      const periodRows = ((rows || []) as Row[]).filter(
        (r) => r.period_label === p && Number(r.klaviyo_total_revenue) > 0
      )
      if (periodRows.length === 0) return 0
      return Math.round(
        periodRows.reduce((sum, _r) => sum + 50, 0) / periodRows.length
      )
    })

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
