import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getCachedAccountInfo } from "@/lib/integrations/klaviyo/cached-metadata"
import { logger } from "@/lib/logger"

const log = logger.child("FlowsAggregate")

export const dynamic = "force-dynamic"

type FlowCategory = "cart_recovery" | "browse_abandon" | "winback" | "welcome" | "other"

const FLOW_PATTERNS: { category: FlowCategory; patterns: RegExp[] }[] = [
  {
    category: "cart_recovery",
    patterns: [/cart/i, /carrin/i, /abandon.*cart/i, /checkout/i],
  },
  {
    category: "browse_abandon",
    patterns: [/browse/i, /navega/i, /abandon.*brows/i, /product.*view/i],
  },
  {
    category: "winback",
    patterns: [/win.?back/i, /re.?engag/i, /lapsed/i, /retorn/i, /inativo/i],
  },
  {
    category: "welcome",
    patterns: [/welcome/i, /boas.?vindas/i, /onboard/i, /new.*subscri/i],
  },
]

const CATEGORY_LABELS: Record<FlowCategory, { title: string; benchmark: number }> = {
  cart_recovery: { title: "Recuperação de Carrinho", benchmark: 10 },
  browse_abandon: { title: "Abandono de Navegação", benchmark: 4 },
  winback: { title: "Win-back", benchmark: 2.5 },
  welcome: { title: "Welcome Series", benchmark: 8 },
  other: { title: "Outros Flows", benchmark: 3 },
}

function categorizeFlow(flowName: string): FlowCategory {
  for (const { category, patterns } of FLOW_PATTERNS) {
    if (patterns.some((p) => p.test(flowName))) return category
  }
  return "other"
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)

    const period = request.nextUrl.searchParams.get("period") || "30d"

    const { data: rows, error } = await supabase
      .from("klaviyo_flow_metrics")
      .select(`
        store_id,
        flow_id,
        flow_name,
        flow_status,
        recipients,
        delivered,
        opened,
        open_rate,
        clicked,
        click_rate,
        conversions,
        conversion_rate,
        conversion_value,
        revenue_per_recipient,
        bounced,
        bounce_rate,
        unsubscribed,
        unsubscribe_rate,
        client_stores!inner(id, store_name, client_id, clients(name))
      `)
      .eq("org_id", orgId)
      .eq("period_label", period)
      .eq("flow_status", "live")

    if (error) throw error
    if (!rows || rows.length === 0) {
      return successResponse(request, { flows: [], period })
    }

    const aggregated = new Map<FlowCategory, {
      totalRecipients: number
      totalDelivered: number
      totalOpened: number
      totalClicked: number
      totalConversions: number
      totalRevenueBRL: number
      totalBounced: number
      totalUnsubscribed: number
      flowCount: number
      conversionRates: number[]
      storeConversions: Map<string, { storeName: string; rate: number }>
    }>()

    for (const cat of Object.keys(CATEGORY_LABELS) as FlowCategory[]) {
      aggregated.set(cat, {
        totalRecipients: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0,
        totalConversions: 0, totalRevenueBRL: 0, totalBounced: 0, totalUnsubscribed: 0,
        flowCount: 0, conversionRates: [], storeConversions: new Map(),
      })
    }

    for (const row of rows) {
      const category = categorizeFlow(row.flow_name || "")
      const agg = aggregated.get(category)!

      let currency = "BRL"
      try {
        const info = await getCachedAccountInfo(row.store_id)
        currency = info?.currency || "BRL"
      } catch { /* ignore */ }

      const revBRL = await convertToBRL(Number(row.conversion_value) || 0, currency)

      agg.totalRecipients += Number(row.recipients) || 0
      agg.totalDelivered += Number(row.delivered) || 0
      agg.totalOpened += Number(row.opened) || 0
      agg.totalClicked += Number(row.clicked) || 0
      agg.totalConversions += Number(row.conversions) || 0
      agg.totalRevenueBRL += revBRL
      agg.totalBounced += Number(row.bounced) || 0
      agg.totalUnsubscribed += Number(row.unsubscribed) || 0
      agg.flowCount++

      if (Number(row.conversion_rate) > 0) {
        agg.conversionRates.push(Number(row.conversion_rate))
      }

      const storeData = row.client_stores as unknown as {
        store_name: string; client_id: string | null; clients: { name: string } | null
      }
      const storeName = storeData?.store_name || "Loja"
      const existing = agg.storeConversions.get(row.store_id)
      const rate = Number(row.conversion_rate) || 0
      if (!existing || rate < existing.rate) {
        agg.storeConversions.set(row.store_id, { storeName, rate })
      }
    }

    const fmtCurrency = (v: number) => {
      if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}K`
      return `R$ ${Math.round(v)}`
    }

    const results = (Object.keys(CATEGORY_LABELS) as FlowCategory[])
      .filter((cat) => cat !== "other" || aggregated.get(cat)!.flowCount > 0)
      .slice(0, 3)
      .map((cat) => {
        const agg = aggregated.get(cat)!
        const { title, benchmark } = CATEGORY_LABELS[cat]
        const avgRate = agg.conversionRates.length > 0
          ? agg.conversionRates.reduce((a, b) => a + b, 0) / agg.conversionRates.length
          : 0

        const worstStores = Array.from(agg.storeConversions.values())
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 2)

        return {
          title,
          rate: Math.round(avgRate * 10) / 10,
          revenue: fmtCurrency(agg.totalRevenueBRL),
          delta: 0,
          benchmark,
          sparklinePoints: "",
          tooltip: {
            emailsEnviados: agg.totalRecipients.toLocaleString("pt-BR"),
            conversoes: agg.totalConversions.toLocaleString("pt-BR"),
            ticketMedio: agg.totalConversions > 0
              ? fmtCurrency(agg.totalRevenueBRL / agg.totalConversions)
              : "—",
            unsubRate: agg.totalDelivered > 0
              ? `${((agg.totalUnsubscribed / agg.totalDelivered) * 100).toFixed(2)}%`
              : "—",
            flowsAtivos: String(agg.flowCount),
          },
          worstClients: worstStores.map((s) => ({ name: s.storeName, value: Math.round(s.rate * 10) / 10 })),
        }
      })

    return successResponse(request, { flows: results, period })
  } catch (error) {
    log.error("FlowsAggregate error:", error)
    return errorResponse(request, error, "flows-aggregate")
  }
}
