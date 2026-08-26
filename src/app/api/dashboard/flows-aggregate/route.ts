import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getUnifiedFlows } from "@/lib/services/unified-metrics.service"
import { normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { logger } from "@/lib/logger"

const log = logger.child("FlowsAggregate")

export const dynamic = "force-dynamic"

type FlowCategory = "cart_recovery" | "browse_abandon" | "winback" | "welcome" | "other"

// Patterns inclusivos pra cobrir nomes tipicos Convertfy:
//   "Convertfy | Abandoned Cart | Blessed Choice"
//   "Convertfy | Abandoned Checkout | Blessed Choice"
//   "Convertfy | Site Abandon | Blessed Choice"
//   "Convertfy | Viewed Product | Blessed Choice"
//   "Convertfy | Welcome Flow | Blessed"
//   "Convertfy | Winback | Blessed Choice"
const FLOW_PATTERNS: { category: FlowCategory; patterns: RegExp[] }[] = [
  { category: "cart_recovery", patterns: [/cart/i, /carrin/i, /abandoned.?cart/i, /abandon.*checkout/i, /checkout.*abandon/i, /checkout/i] },
  { category: "browse_abandon", patterns: [/browse/i, /navega/i, /site.?abandon/i, /viewed.?product/i, /product.?view/i, /rastreio/i] },
  { category: "winback", patterns: [/win.?back/i, /re.?engag/i, /lapsed/i, /retorn/i, /inativo/i, /upsell/i] },
  { category: "welcome", patterns: [/welcome/i, /boas.?vindas/i, /onboard/i, /new.*subscri/i] },
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
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = normalizePeriodLabel(
      request.nextUrl.searchParams.get("period") || "30d",
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end"),
    )

    const flows = await getUnifiedFlows(supabase, orgId, period, undefined, true)
    if (flows.length === 0) {
      return successResponse(request, { flows: [], period })
    }

    // Carrega metadados das lojas (nome + currency para conversao BRL).
    // Currency vem do client_stores (persistido no sync da loja) em vez de
    // chamar Klaviyo Account API (que exigiria apiKey e 401 para Omnisend).
    const storeIds = Array.from(new Set(flows.map((f) => f.store_id)))
    async function fetchStoresMeta(cols: string) {
      return supabase.from("client_stores").select(cols).in("id", storeIds)
    }
    let metaResp = await fetchStoresMeta("id, store_name, email_platform, currency")
    if (metaResp.error && /email_platform|currency/.test(metaResp.error.message || "")) {
      metaResp = await fetchStoresMeta("id, store_name")
    }
    const storesMeta = (metaResp.data || []) as unknown as Array<{
      id: string; store_name?: string | null;
      email_platform?: string | null; currency?: string | null;
    }>

    const storeNames = new Map<string, string>()
    const storeCurrency = new Map<string, string>()
    for (const s of storesMeta) {
      storeNames.set(s.id, s.store_name || "Loja")
      storeCurrency.set(s.id, s.currency || "BRL")
    }

    const aggregated = new Map<FlowCategory, {
      totalRecipients: number; totalDelivered: number; totalOpened: number; totalClicked: number
      totalConversions: number; totalRevenueBRL: number; totalBounced: number; totalUnsubscribed: number
      flowCount: number; conversionRates: number[]
      storeConversions: Map<string, { storeName: string; rate: number }>
    }>()

    for (const cat of Object.keys(CATEGORY_LABELS) as FlowCategory[]) {
      aggregated.set(cat, {
        totalRecipients: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0,
        totalConversions: 0, totalRevenueBRL: 0, totalBounced: 0, totalUnsubscribed: 0,
        flowCount: 0, conversionRates: [], storeConversions: new Map(),
      })
    }

    for (const row of flows) {
      const category = categorizeFlow(row.flow_name || "")
      const agg = aggregated.get(category)!

      // Currency vem do client_stores. Omnisend sync ja converte para BRL
      // internamente, entao convertToBRL e no-op nesse caso.
      const currency = storeCurrency.get(row.store_id) || "BRL"
      const revBRL = await convertToBRL(row.conversion_value, currency)

      agg.totalRecipients += row.recipients
      agg.totalDelivered += row.delivered
      agg.totalOpened += row.opened
      agg.totalClicked += row.clicked
      agg.totalConversions += row.conversions
      agg.totalRevenueBRL += revBRL
      agg.totalBounced += row.bounced
      agg.totalUnsubscribed += row.unsubscribed
      agg.flowCount++

      if (row.conversion_rate > 0) {
        agg.conversionRates.push(row.conversion_rate)
      }

      const storeName = storeNames.get(row.store_id) || "Loja"
      const existing = agg.storeConversions.get(row.store_id)
      if (!existing || row.conversion_rate < existing.rate) {
        agg.storeConversions.set(row.store_id, { storeName, rate: row.conversion_rate })
      }
    }

    const fmtCurrency = (v: number) => {
      if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}K`
      return `R$ ${Math.round(v)}`
    }

    // Só categorias que realmente têm flows ativos — antes o slice(0,3) fixo
    // descartava Welcome Series mesmo quando categorias anteriores estavam
    // vazias. Agora prioriza por ordem mas ignora categorias sem dados.
    const results = (Object.keys(CATEGORY_LABELS) as FlowCategory[])
      .filter((cat) => aggregated.get(cat)!.flowCount > 0)
      .slice(0, 4)
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
          // Numérico (aditivo, ago/2026): o dashboard novo formata no
          // cliente — a string pré-formatada acima segue pros consumidores
          // antigos.
          revenueBRL: Math.round(agg.totalRevenueBRL),
          // Sem série per-flow ainda (Grupo 3 cobre store-level). null =
          // "sem comparação" → o card não mostra um "+0%" falso.
          delta: null as number | null,
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
