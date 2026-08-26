import { withTiming } from "@/lib/api/with-timing"
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL, convertToBRLDetailed } from "@/lib/services/exchange-rate.service"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
  getUnifiedFlows,
} from "@/lib/services/unified-metrics.service"
import { normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { resolveWindow } from "@/lib/services/ops-dashboard/period-window"
import {
  computeStoreTrends,
  midDate,
  type DailyTrendRow,
} from "@/lib/services/ops-dashboard/portfolio"
import { logger } from "@/lib/logger"

const log = logger.child("StoresOverview")

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = normalizePeriodLabel(
      request.nextUrl.searchParams.get("period") || "30d",
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end"),
    )

    // SELECT resiliente: tenta com email_platform/omnisend_api_key (colunas
    // novas), fallback sem quando a migration 20260417 nao foi aplicada.
    async function fetchStores(selectCols: string) {
      return supabase
        .from("client_stores")
        .select(selectCols)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name")
        .limit(500)
    }

    let storesQuery = await fetchStores(
      "id, store_name, store_url, platform, email_platform, omnisend_api_key, klaviyo_private_key, klaviyo_api_key, currency, health_score, is_active, client_id, clients(name)"
    )

    if (storesQuery.error && /email_platform|omnisend_api_key/.test(storesQuery.error.message || "")) {
      log.warn("email_platform/omnisend_api_key columns not found — falling back", { msg: storesQuery.error.message })
      storesQuery = await fetchStores(
        "id, store_name, store_url, platform, klaviyo_private_key, klaviyo_api_key, currency, health_score, is_active, client_id, clients(name)"
      )
    }

    if (storesQuery.error) throw storesQuery.error
    const stores = (storesQuery.data || []) as unknown as Array<Record<string, unknown> & {
      id: string; store_name: string; store_url?: string; platform?: string;
      client_id?: string | null; clients?: { name: string } | { name: string }[] | null;
    }>
    if (stores.length === 0) {
      return successResponse(request, { stores: [], period })
    }

    const storeIds = stores.map((s) => s.id)

    // Trend REAL por loja (aditivo, ago/2026): open rate da 2ª metade da
    // janela vs a 1ª, via store_daily_metrics. O front antigo exibia como
    // "trend" a comparação com a média da carteira — não era temporal.
    const win = resolveWindow(
      request.nextUrl.searchParams.get("period"),
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end"),
    )

    const [revenueRows, campaignRows, flowRows, dailyQ] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period], storeIds),
      getUnifiedCampaigns(supabase, orgId, period, storeIds),
      getUnifiedFlows(supabase, orgId, period, storeIds, true),
      supabase
        .from("store_daily_metrics")
        .select("store_id, metric_date, delivered, opened")
        .eq("org_id", orgId)
        .gte("metric_date", win.from)
        .lte("metric_date", win.to),
    ])
    // Trend é enfeite: erro aqui (ex.: migration da tabela pendente) não
    // pode derrubar a visão inteira — degrada pra null.
    const trends = dailyQ.error
      ? new Map<string, "up" | "down" | null>()
      : computeStoreTrends((dailyQ.data ?? []) as DailyTrendRow[], midDate(win))

    const revMap = new Map(revenueRows.map((r) => [r.store_id, r]))
    const campByStore = new Map<string, typeof campaignRows>()
    for (const c of campaignRows) {
      if (!campByStore.has(c.store_id)) campByStore.set(c.store_id, [])
      campByStore.get(c.store_id)!.push(c)
    }
    const flowByStore = new Map<string, typeof flowRows>()
    for (const f of flowRows) {
      if (!flowByStore.has(f.store_id)) flowByStore.set(f.store_id, [])
      flowByStore.get(f.store_id)!.push(f)
    }

    const results = await Promise.all(stores.map(async (store) => {
      const rev = revMap.get(store.id)
      const campaigns = campByStore.get(store.id) || []
      const flows = flowByStore.get(store.id) || []

      // Detecta plataforma em 3 camadas (robusto a migration pendente):
      //  1. Coluna email_platform (se migration aplicada)
      //  2. Fonte do revenue na tabela store_revenue_summary
      //  3. Presenca de credencial (omnisend_api_key / klaviyo_*_key)
      const s = store as Record<string, unknown>
      let platform: "klaviyo" | "omnisend" | "none" =
        (s.email_platform as "klaviyo" | "omnisend" | "none" | undefined) ||
        rev?.platform ||
        "none"

      if (platform === "none") {
        if (s.omnisend_api_key) platform = "omnisend"
        else if (s.klaviyo_private_key || s.klaviyo_api_key) platform = "klaviyo"
      }

      // Currency: prioriza o que veio no revenue row (atualizado no sync),
      // depois client_stores.currency, depois BRL. Nao chamamos Klaviyo
      // Account API aqui — exigiria apiKey e 401 para lojas Omnisend.
      const currency = rev?.currency || (s.currency as string | undefined) || "BRL"

      // Card "RECEITA TOTAL" reflete a receita TOTAL da loja (de Shopify/
      // Statistics API), nao a receita atribuida a email marketing. Para
      // Omnisend store_total_revenue vem da totalRevenue da Statistics API
      // (~€383K), e nao da omnisend_total_revenue (~€12K attributed).
      const totalRevenue = rev?.store_total_revenue ?? rev?.total_revenue ?? 0
      // Receita ATRIBUIDA = somatorio Klaviyo + Omnisend total_revenue
      // (campanhas + flows). Usado pra calcular % Recuperacao Email.
      const attributedRevenue = rev?.total_revenue ?? 0
      const campaignRevenue = rev?.campaign_revenue ?? 0
      const flowRevenue = rev?.flow_revenue ?? 0

      const emailCamps = campaigns.filter((c) => c.channel === "email" || !c.channel)
      const smsCamps = campaigns.filter((c) => c.channel === "sms")

      // E-MAIL no card = totais do summary (campaign_revenue + flow_revenue
      // do store_revenue_summary) MENOS SMS (que vem das rows). Antes
      // somavamos rows direto, mas quando o sync nao consegue matchar
      // marketingActivityID com campaignID/automationID, os rows ficam
      // com revenue=0 mesmo o summary tendo o total correto. Resultado:
      // card E-MAIL ficava R$ 0,00 enquanto o detalhe da loja mostrava
      // R$ 366K. Usar o summary garante consistencia entre as duas
      // telas (mesma fonte: store_revenue_summary).
      const smsRevenueOriginal = smsCamps.reduce((s, c) => s + c.conversion_value, 0)
      const emailRevenueOriginal = Math.max(0, campaignRevenue + flowRevenue - smsRevenueOriginal)
      const emailRecipients = emailCamps.reduce((s, c) => s + c.recipients, 0)
      const smsRecipients = smsCamps.reduce((s, c) => s + c.recipients, 0)

      // Paraleliza as conversoes BRL por loja. A 1a usa a variante detalhada
      // para sinalizar câmbio degradado (moeda estrangeira sem taxa → valor
      // fica na moeda original). Como todas usam a mesma moeda/taxa, o flag da
      // 1a vale para a loja inteira.
      const [totalConv, campaignBRL, flowBRL, emailBRL, smsBRL, attributedBRL] = await Promise.all([
        convertToBRLDetailed(totalRevenue, currency),
        convertToBRL(campaignRevenue, currency),
        convertToBRL(flowRevenue, currency),
        convertToBRL(emailRevenueOriginal, currency),
        convertToBRL(smsRevenueOriginal, currency),
        convertToBRL(attributedRevenue, currency),
      ])
      const totalBRL = totalConv.valueBRL
      const fxDegraded = currency !== "BRL" && !totalConv.converted
      // % de receita da loja recuperada via email/sms marketing.
      // Mesmo calculo do card "Recuperacao Email" da pagina de detalhe.
      const recoveryRate = totalBRL > 0 ? (attributedBRL / totalBRL) * 100 : 0

      const campRecipients = campaigns.reduce((s, c) => s + c.recipients, 0)
      const campOpened = campaigns.reduce((s, c) => s + c.opened, 0)
      const campClicked = campaigns.reduce((s, c) => s + c.clicked, 0)
      const campDelivered = campaigns.reduce((s, c) => s + c.delivered, 0)
      const campBounced = campaigns.reduce((s, c) => s + c.bounced, 0)
      const campUnsubs = campaigns.reduce((s, c) => s + c.unsubscribed, 0)

      const flowOpened = flows.reduce((s, f) => s + f.opened, 0)
      const flowClicked = flows.reduce((s, f) => s + f.clicked, 0)
      const flowDelivered = flows.reduce((s, f) => s + f.delivered, 0)
      const flowConversions = flows.reduce((s, f) => s + f.conversions, 0)

      const avgOpenRate = campDelivered > 0 ? (campOpened / campDelivered) * 100 : 0
      const avgClickRate = campDelivered > 0 ? (campClicked / campDelivered) * 100 : 0
      const avgCTOR = campOpened > 0 ? (campClicked / campOpened) * 100 : 0
      const avgBounceRate = campRecipients > 0 ? (campBounced / campRecipients) * 100 : 0
      const avgUnsubRate = campDelivered > 0 ? (campUnsubs / campDelivered) * 100 : 0

      const flowOpenRate = flowDelivered > 0 ? (flowOpened / flowDelivered) * 100 : 0
      const flowClickRate = flowDelivered > 0 ? (flowClicked / flowDelivered) * 100 : 0

      // Log de inconsistencia: summary tem revenue mas rows individuais
      // estao zeradas. Indica que marketingActivityID da Statistics API
      // nao casou com os IDs do listing /v5 e o sync caiu em fallback=0.
      // Os totais por canal (CAMPANHAS Receita, AUTOMACOES Receita)
      // continuam corretos via summary, mas as ultimas campanhas e top
      // flows mostram R$ 0 individual.
      if (campaignRevenue > 0 && campaigns.reduce((s, c) => s + c.conversion_value, 0) === 0) {
        log.warn("[StoresOverview] Campaign revenue mismatch: summary has value but rows are zero", {
          storeId: store.id,
          summaryCampaignRevenue: campaignRevenue,
          campaignRowsCount: campaigns.length,
        })
      }
      if (flowRevenue > 0 && flows.reduce((s, f) => s + f.conversion_value, 0) === 0) {
        log.warn("[StoresOverview] Flow revenue mismatch: summary has value but rows are zero", {
          storeId: store.id,
          summaryFlowRevenue: flowRevenue,
          flowRowsCount: flows.length,
        })
      }

      const client = Array.isArray(store.clients) ? store.clients[0] : store.clients

      return {
        id: store.id,
        storeName: store.store_name,
        storeUrl: store.store_url,
        platform: store.platform,
        emailPlatform: platform as "klaviyo" | "omnisend" | "none",
        clientId: store.client_id,
        clientName: client?.name || "—",
        currency,
        // Health score REAL por loja (0-100), computado pelo cron
        // crm-health-compute (email35/rev30/tickets20/nps15). null quando
        // ainda nao calculado — o front trata como badge neutro.
        healthScore: typeof s.health_score === "number" ? s.health_score : null,
        // Tendência temporal real (2ª metade vs 1ª); null = sem volume ou estável.
        trend: trends.get(store.id) ?? null,
        // true = câmbio indisponivel, valores estao na moeda original (nao BRL).
        fxDegraded,
        totalRevenueBRL: Math.round(totalBRL * 100) / 100,
        attributedRevenueBRL: Math.round(attributedBRL * 100) / 100,
        recoveryRate: Math.round(recoveryRate * 100) / 100,
        email: {
          revenue: Math.round(emailBRL * 100) / 100,
          recipients: emailRecipients,
        },
        sms: {
          revenue: Math.round(smsBRL * 100) / 100,
          recipients: smsRecipients,
        },
        campaigns: {
          revenueBRL: Math.round(campaignBRL * 100) / 100,
          recipients: campRecipients,
          envios: campDelivered,
          openRate: Math.round(avgOpenRate * 100) / 100,
          clickRate: Math.round(avgClickRate * 100) / 100,
          ctor: Math.round(avgCTOR * 100) / 100,
          bounceRate: Math.round(avgBounceRate * 100) / 100,
          unsubRate: Math.round(avgUnsubRate * 100) / 100,
        },
        automations: {
          revenueBRL: Math.round(flowBRL * 100) / 100,
          envios: flowDelivered,
          openRate: Math.round(flowOpenRate * 100) / 100,
          clickRate: Math.round(flowClickRate * 100) / 100,
          conversions: flowConversions,
        },
        audience: {
          totalLeads: rev?.total_leads ?? 0,
          engagedLeads: rev?.engaged_leads ?? 0,
          engagementRate: rev?.engagement_rate ?? 0,
        },
        syncStatus: rev?.sync_status || "pending",
      }
    }))

    results.sort((a, b) => b.totalRevenueBRL - a.totalRevenueBRL)

    return successResponse(request, { stores: results, period })
  } catch (error) {
    log.error("StoresOverview error:", error)
    return errorResponse(request, error, "stores-overview")
  }
}

export const GET = withTiming("dashboard/stores-overview", handleGet)
