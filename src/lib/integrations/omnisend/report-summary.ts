/**
 * Omnisend Report Summary
 *
 * Similar a klaviyo/report-summary.ts, porem puxando dados de Omnisend.
 * Usa primeiramente o cache local em store_revenue_summary (populado
 * pelo cron sync-omnisend a cada 30min); se nao fresco, faz live-fetch
 * via omnisend-sync.service.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { type SyncResult } from "@/lib/shared/data-status"

const log = logger.child("OmnisendReportSummary")

export const CACHE_FRESH_MS = 60 * 60 * 1000

export interface OmnisendRevenueSummary {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storeRevenue: number
  currency: string
  campaignReportAvailable?: boolean
  flowReportAvailable?: boolean
  partial?: boolean
  missing?: string[]
}

// Map dos periodos do dashboard para dias
const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

function daysForPeriod(period: string, customStart?: string | null, customEnd?: string | null): number {
  if (period === "custom" && customStart && customEnd) {
    const ms = new Date(customEnd).getTime() - new Date(customStart).getTime()
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)))
  }
  return PERIOD_DAYS[period] ?? 30
}

/**
 * Busca resumo de receita Omnisend para uma loja em um periodo.
 * 1. Tenta o cache em store_revenue_summary
 * 2. Se cache stale ou ausente, faz live-fetch via syncOmnisendForStore
 */
export async function getOmnisendRevenueForStore(
  storeId: string,
  period: string,
  customStartDate?: string | null,
  customEndDate?: string | null,
  orgId?: string | null
): Promise<SyncResult<OmnisendRevenueSummary>> {
  try {
    const supabase = createAdminClient()

    // 1) Tenta cache em store_revenue_summary (populado pelo cron)
    const { data: cached } = await supabase
      .from("store_revenue_summary")
      .select("omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, store_total_revenue, currency, sync_status, fetched_at")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .maybeSingle()

    const isFresh = cached?.fetched_at
      ? (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_FRESH_MS
      : false

    if (cached && isFresh && (cached.sync_status === "ok" || cached.sync_status === "partial")) {
      return {
        success: true,
        data: {
          totalRevenue: Number(cached.omnisend_total_revenue) || 0,
          campaignRevenue: Number(cached.omnisend_campaign_revenue) || 0,
          flowRevenue: Number(cached.omnisend_flow_revenue) || 0,
          storeRevenue: Number(cached.store_total_revenue) || 0,
          currency: cached.currency || "BRL",
          campaignReportAvailable: true,
          flowReportAvailable: true,
          partial: cached.sync_status === "partial",
        },
        source: "cache" as const,
        fetchedAt: cached.fetched_at || new Date().toISOString(),
      }
    }

    // 2) Cache miss/stale → live-fetch
    const storeData = await getStoreCredentials(storeId, orgId ?? undefined)
    const apiKey = storeData.omnisend_api_key
    if (!apiKey) {
      return {
        success: false,
        data: null,
        error: "No Omnisend API key found",
        source: "live" as const,
        fetchedAt: new Date().toISOString(),
      }
    }

    const days = daysForPeriod(period, customStartDate, customEndDate)
    const syncResult = await syncOmnisendForStore({
      storeId,
      orgId: orgId ?? "",
      apiKey,
      periodDays: days,
    })

    if (!syncResult.ok || !syncResult.data) {
      return {
        success: false,
        data: null,
        error: syncResult.error || "Omnisend sync failed",
        source: "live" as const,
        fetchedAt: new Date().toISOString(),
      }
    }

    const d = syncResult.data
    return {
      success: true,
      data: {
        totalRevenue: d.totalCampaignRevenue + d.totalAutomationRevenue,
        campaignRevenue: d.totalCampaignRevenue,
        flowRevenue: d.totalAutomationRevenue,
        storeRevenue: d.totalStoreRevenue,
        currency: d.currency || "BRL",
        campaignReportAvailable: d.campaignRows.length > 0,
        flowReportAvailable: d.automationRows.length > 0,
      },
      source: "live" as const,
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    log.error("Omnisend revenue fetch failed", { storeId, error })
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      source: "live" as const,
      fetchedAt: new Date().toISOString(),
    }
  }
}
