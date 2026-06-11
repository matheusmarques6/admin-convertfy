/**
 * "Emails campeões" — benchmark interno da rede Convertfy.
 *
 * SOMENTE Omnisend (decisão de produto): top campanhas por open_rate em
 * omnisend_campaign_metrics nos últimos 30 dias, com piso de recipients
 * pra não promover emails de listas minúsculas.
 */

import { createAdminClient } from "@/lib/supabase/server"
import type { BenchmarkEmail } from "@/types/campaign-central"
import { getSettings } from "./settings.service"

const DEFAULT_MIN_RECIPIENTS = 500
const DEFAULT_TOP_N = 8

export async function loadBenchmarkEmails(orgId: string): Promise<BenchmarkEmail[]> {
  const admin = createAdminClient()
  const settings = await getSettings(orgId)
  const MIN_RECIPIENTS = settings.benchmark_min_recipients ?? DEFAULT_MIN_RECIPIENTS
  const TOP_N = settings.benchmark_top_n ?? DEFAULT_TOP_N

  const { data, error } = await admin
    .from("omnisend_campaign_metrics")
    .select(
      "campaign_name, subject, open_rate, click_rate, recipients, conversion_value, period_label, store_id, client_stores(store_name, niche)",
    )
    .eq("org_id", orgId)
    .eq("period_label", "30d")
    .gte("recipients", MIN_RECIPIENTS)
    .not("open_rate", "is", null)
    .order("open_rate", { ascending: false })
    .limit(TOP_N * 3) // margem pra dedup por subject

  if (error) throw error

  // Média de open_rate do conjunto pro "lift" (+Xpp vs média)
  const rows = data ?? []
  const avgOpen =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + Number(r.open_rate ?? 0), 0) / rows.length
      : 0

  const seen = new Set<string>()
  const result: BenchmarkEmail[] = []

  for (const r of rows) {
    const subject = ((r.subject as string) || (r.campaign_name as string) || "").trim()
    if (!subject) continue
    const dedupKey = subject.toLowerCase()
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const store = Array.isArray(r.client_stores) ? r.client_stores[0] : r.client_stores
    const openRate = Number(r.open_rate ?? 0)
    const liftPp = Math.round((openRate - avgOpen) * 10) / 10

    result.push({
      subject,
      metric: `${openRate.toFixed(1).replace(".", ",")}%`,
      label: "abertura",
      lift: liftPp >= 0 ? `+${liftPp}pp vs média` : `${liftPp}pp vs média`,
      vertical: (store as { niche?: string } | null)?.niche ?? null,
      store_name: (store as { store_name?: string } | null)?.store_name,
      open_rate: openRate,
      recipients: Number(r.recipients ?? 0),
    })

    if (result.length >= TOP_N) break
  }

  return result
}
