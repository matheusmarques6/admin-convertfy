/**
 * Settings da Central de Campanhas — leitura/escrita por org.
 *
 * Defaults espelham as constantes que estavam hardcoded nos services
 * antes desta migração:
 *   - date_window_days       = cycle-context.service.DATE_WINDOW_DAYS (25)
 *   - max_trends_per_cluster = trends.service (6)
 *   - max_web_searches       = trends.service (5)
 *   - max_stores_per_cluster = cycle-context.service.clusterStores (6)
 *   - max_concurrent_clusters = suggestion-engine.MAX_CONCURRENT_CLUSTERS (3)
 *   - benchmark_min_recipients = benchmark.service.MIN_RECIPIENTS (500)
 *   - benchmark_top_n        = benchmark.service.TOP_N (8)
 *   - health_critical        = attention-stores.HEALTH_CRITICAL (40)
 *   - health_warn            = attention-stores.HEALTH_WARN (55)
 *   - revenue_drop_pct       = attention-stores.REVENUE_DROP_PCT (-20)
 *
 * `getSettings(orgId)` SEMPRE retorna um objeto — se a row não existe,
 * devolve defaults sem persistir (lazy-write no primeiro update).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCentralSettings")

export interface CampaignCentralSettings {
  org_id: string
  date_window_days: number
  max_trends_per_cluster: number
  max_web_searches_per_cluster: number
  max_stores_per_cluster: number
  max_concurrent_clusters: number
  benchmark_min_recipients: number
  benchmark_top_n: number
  health_critical_threshold: number
  health_warn_threshold: number
  revenue_drop_pct: number
  auto_cycle_enabled: boolean
  trends_enabled: boolean
  updated_at?: string
  updated_by?: string | null
}

export const DEFAULT_SETTINGS: Omit<CampaignCentralSettings, "org_id"> = {
  date_window_days: 25,
  max_trends_per_cluster: 6,
  max_web_searches_per_cluster: 5,
  max_stores_per_cluster: 6,
  max_concurrent_clusters: 3,
  benchmark_min_recipients: 500,
  benchmark_top_n: 8,
  health_critical_threshold: 40,
  health_warn_threshold: 55,
  revenue_drop_pct: -20,
  auto_cycle_enabled: true,
  trends_enabled: true,
}

const cache = new Map<string, { value: CampaignCentralSettings; expiresAt: number }>()
const TTL_MS = 60_000

export async function getSettings(orgId: string): Promise<CampaignCentralSettings> {
  const hit = cache.get(orgId)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("campaign_central_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    log.warn("settings.read_failed", { orgId, error: error.message })
    return { org_id: orgId, ...DEFAULT_SETTINGS }
  }

  const value: CampaignCentralSettings = data
    ? (data as CampaignCentralSettings)
    : { org_id: orgId, ...DEFAULT_SETTINGS }
  cache.set(orgId, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

export async function updateSettings(params: {
  orgId: string
  userId: string
  patch: Partial<Omit<CampaignCentralSettings, "org_id" | "updated_at" | "updated_by">>
}): Promise<CampaignCentralSettings> {
  const admin = createAdminClient()
  const { orgId, userId, patch } = params

  const { data, error } = await admin
    .from("campaign_central_settings")
    .upsert(
      {
        org_id: orgId,
        ...DEFAULT_SETTINGS, // base se a row não existe
        ...patch, // sobrescreve só os campos enviados
        updated_by: userId,
      },
      { onConflict: "org_id", ignoreDuplicates: false },
    )
    .select()
    .single()

  if (error) throw error
  cache.delete(orgId)
  return data as CampaignCentralSettings
}

export function invalidateCache(orgId: string): void {
  cache.delete(orgId)
}
