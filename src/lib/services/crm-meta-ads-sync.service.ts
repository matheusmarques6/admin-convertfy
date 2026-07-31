/**
 * Sincroniza insights da Meta Ads para o funil comercial.
 *
 * Puxa gasto/impressões/cliques/leads por DIA em 3 níveis (campanha,
 * adset, anúncio) e grava em crm_ad_insights. O nível `ad` é o que
 * alimenta o ranking de criativos; o nível `campaign` é a fonte do
 * investimento total do funil (somar os 3 níveis contaria o mesmo
 * gasto três vezes).
 *
 * O token da conta fica criptografado em crm_ad_accounts.access_token.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { MetaAdsService, type MetaDailyInsight } from "@/lib/integrations/meta-ads"
import { logger } from "@/lib/logger"

const log = logger.child("CrmMetaAdsSync")

const LEVELS: Array<"campaign" | "adset" | "ad"> = ["campaign", "adset", "ad"]

export interface SyncResult {
  account_id: string
  account_name: string
  rows: number
  spend: number
  from: string
  to: string
  error?: string
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Janela padrão: últimos N dias (Meta reprocessa atribuição por ~7d). */
export function defaultWindow(days = 30): { since: string; until: string } {
  const now = new Date()
  const since = new Date(now.getTime() - days * 86_400_000)
  return { since: ymd(since), until: ymd(now) }
}

interface AdAccountRow {
  id: string
  org_id: string
  account_id: string
  account_name: string
  business_id: string | null
  access_token: string
}

/**
 * Sincroniza uma conta. Idempotente: upsert por
 * (ad_account_id, day, level, entity_id).
 */
export async function syncAdAccount(
  account: AdAccountRow,
  window: { since: string; until: string },
): Promise<SyncResult> {
  const admin = createAdminClient()
  const base: SyncResult = {
    account_id: account.account_id,
    account_name: account.account_name,
    rows: 0,
    spend: 0,
    from: window.since,
    to: window.until,
  }

  await admin
    .from("crm_ad_accounts")
    .update({ last_sync_status: "running", last_sync_error: null })
    .eq("id", account.id)

  try {
    const token = decrypt(account.access_token)
    const service = new MetaAdsService({
      accessToken: token,
      adAccountId: account.account_id,
      businessId: account.business_id ?? undefined,
    })

    let totalRows = 0
    let campaignSpend = 0

    for (const level of LEVELS) {
      const insights = await service.getDailyInsights({ level, timeRange: window })
      if (insights.length === 0) continue

      if (level === "campaign") {
        campaignSpend += insights.reduce((s, i) => s + i.spend, 0)
      }

      const rows = insights
        .filter((i) => i.entity_id)
        .map((i: MetaDailyInsight) => ({
          org_id: account.org_id,
          ad_account_id: account.id,
          day: i.day,
          level: i.level,
          entity_id: i.entity_id,
          campaign_id: i.campaign_id,
          campaign_name: i.campaign_name,
          adset_id: i.adset_id,
          adset_name: i.adset_name,
          ad_id: i.ad_id,
          ad_name: i.ad_name,
          spend: i.spend,
          impressions: i.impressions,
          reach: i.reach,
          clicks: i.clicks,
          ctr: i.ctr,
          cpc: i.cpc,
          cpm: i.cpm,
          leads: i.leads,
          synced_at: new Date().toISOString(),
        }))

      // Lotes de 500 pra não estourar o payload do PostgREST
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from("crm_ad_insights")
          .upsert(rows.slice(i, i + 500), {
            onConflict: "ad_account_id,day,level,entity_id",
          })
        if (error) throw error
      }
      totalRows += rows.length
    }

    await admin
      .from("crm_ad_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_error: null,
      })
      .eq("id", account.id)

    log.info("[MetaSync] conta sincronizada", {
      account: account.account_id,
      rows: totalRows,
      spend: campaignSpend,
    })

    return { ...base, rows: totalRows, spend: campaignSpend }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    log.error("[MetaSync] falha", { account: account.account_id, message })
    await admin
      .from("crm_ad_accounts")
      .update({ last_sync_status: "error", last_sync_error: message.slice(0, 500) })
      .eq("id", account.id)
    return { ...base, error: message }
  }
}

/** Sincroniza todas as contas ativas de uma org (ou de todas as orgs). */
export async function syncAllAdAccounts(opts?: {
  orgId?: string
  days?: number
}): Promise<SyncResult[]> {
  const admin = createAdminClient()
  const window = defaultWindow(opts?.days ?? 30)

  let q = admin
    .from("crm_ad_accounts")
    .select("id, org_id, account_id, account_name, business_id, access_token")
    .eq("platform", "meta")
    .eq("is_active", true)
  if (opts?.orgId) q = q.eq("org_id", opts.orgId)

  const { data, error } = await q
  if (error) throw error

  const accounts = (data as AdAccountRow[] | null) ?? []
  const results: SyncResult[] = []
  for (const account of accounts) {
    results.push(await syncAdAccount(account, window))
  }
  return results
}
