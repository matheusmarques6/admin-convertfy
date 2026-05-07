/**
 * GET /api/stores/currency-audit
 *
 * Diagnostico de configuracao de moeda em todas as lojas da org. Lista
 * cada loja mostrando:
 *  - currency configurado em client_stores.currency (source of truth
 *    pra Omnisend, fallback pra Klaviyo)
 *  - currency reportado em store_revenue_summary.currency (vem do
 *    sync — Klaviyo Account API ou client_stores.currency p/ Omnisend)
 *  - plataforma detectada (klaviyo/omnisend/none)
 *  - status: "ok" | "missing" | "mismatch" | "no-data"
 *
 * Use: dashboard de auditoria pra identificar lojas EUR/USD que estao
 * caindo em fallback BRL (sem conversao) e gerando inconsistencia nos
 * cards de receita do dashboard.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CurrencyAudit")

export const dynamic = "force-dynamic"

interface StoreCurrencyAudit {
  storeId: string
  storeName: string
  clientName: string | null
  platform: "klaviyo" | "omnisend" | "none"
  configuredCurrency: string | null
  reportedCurrency: string | null
  status: "ok" | "missing-config" | "mismatch" | "no-data" | "default-brl"
  storeRevenueLocal: number
  storeRevenueBRL: number | null
  conversionRatio: number | null
  hint: string
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    type StoreRow = {
      id: string
      store_name: string
      currency: string | null
      omnisend_api_key: string | null
      klaviyo_private_key: string | null
      klaviyo_api_key: string | null
      email_platform: string | null
      client_id: string | null
      clients: { name: string } | { name: string }[] | null
    }

    async function fetchStores(cols: string) {
      return admin
        .from("client_stores")
        .select(cols)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name")
    }
    let storesResp = await fetchStores(
      "id, store_name, currency, omnisend_api_key, klaviyo_private_key, klaviyo_api_key, email_platform, client_id, clients(name)",
    )
    if (storesResp.error && /email_platform|omnisend_api_key/.test(storesResp.error.message || "")) {
      storesResp = await fetchStores(
        "id, store_name, currency, klaviyo_private_key, klaviyo_api_key, client_id, clients(name)",
      )
    }

    if (storesResp.error) throw storesResp.error
    const stores = (storesResp.data || []) as unknown as StoreRow[]

    if (stores.length === 0) {
      return successResponse(request, { stores: [], summary: emptySummary() })
    }

    type SummaryRow = {
      store_id: string
      currency: string | null
      store_total_revenue: number | null
      sync_status: string | null
    }

    const { data: summaries } = await admin
      .from("store_revenue_summary")
      .select("store_id, currency, store_total_revenue, sync_status")
      .eq("org_id", orgId)
      .eq("period_label", period)
      .returns<SummaryRow[]>()

    const summaryMap = new Map<string, SummaryRow>()
    for (const s of summaries || []) summaryMap.set(s.store_id, s)

    // Carrega taxas atuais (1 BRL = X foreign) so quando precisar
    let rates: Record<string, number> | null = null
    async function loadRates(): Promise<Record<string, number> | null> {
      if (rates) return rates
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/BRL", {
          signal: AbortSignal.timeout(5000),
        })
        const json = (await res.json()) as { result: string; rates: Record<string, number> }
        if (json.result === "success") rates = json.rates
      } catch (e) {
        log.warn("[CurrencyAudit] Failed to fetch rates", { e })
      }
      return rates
    }

    const results: StoreCurrencyAudit[] = await Promise.all(
      stores.map(async (s) => {
        const client = Array.isArray(s.clients) ? s.clients[0] : s.clients
        const summary = summaryMap.get(s.id)

        let platform: StoreCurrencyAudit["platform"] = "none"
        if (s.email_platform === "klaviyo" || s.email_platform === "omnisend") {
          platform = s.email_platform
        } else if (s.omnisend_api_key) {
          platform = "omnisend"
        } else if (s.klaviyo_private_key || s.klaviyo_api_key) {
          platform = "klaviyo"
        }

        const configured = s.currency || null
        const reported = summary?.currency || null
        const storeRevLocal = Number(summary?.store_total_revenue) || 0

        let storeRevBRL: number | null = null
        let conversionRatio: number | null = null
        const effectiveCurrency = reported || configured || "BRL"

        if (storeRevLocal > 0) {
          if (effectiveCurrency === "BRL") {
            storeRevBRL = storeRevLocal
            conversionRatio = 1
          } else {
            const r = await loadRates()
            const rateFromBRL = r?.[effectiveCurrency]
            if (rateFromBRL && rateFromBRL > 0) {
              storeRevBRL = Math.round((storeRevLocal / rateFromBRL) * 100) / 100
              conversionRatio = 1 / rateFromBRL
            }
          }
        }

        // Status
        let status: StoreCurrencyAudit["status"]
        let hint: string
        if (!summary) {
          status = "no-data"
          hint = "Sem registro em store_revenue_summary. Loja ainda nao sincronizada."
        } else if (!configured && platform === "omnisend") {
          status = "missing-config"
          hint = "Loja Omnisend sem currency em client_stores — sync vai cair em fallback BRL e nao converter valores."
        } else if (configured && reported && configured !== reported) {
          status = "mismatch"
          hint = `Configurado=${configured} mas Klaviyo Account reporta=${reported}. Use o reportado pelo Klaviyo (atualize client_stores.currency).`
        } else if (effectiveCurrency === "BRL" && !configured) {
          status = "default-brl"
          hint = "Sem currency configurado — sistema assumiu BRL. Confirme se realmente e BRL ou ajuste."
        } else {
          status = "ok"
          hint = "Configuracao consistente."
        }

        return {
          storeId: s.id,
          storeName: s.store_name,
          clientName: client?.name ?? null,
          platform,
          configuredCurrency: configured,
          reportedCurrency: reported,
          status,
          storeRevenueLocal: storeRevLocal,
          storeRevenueBRL: storeRevBRL,
          conversionRatio,
          hint,
        }
      }),
    )

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      missingConfig: results.filter((r) => r.status === "missing-config").length,
      mismatch: results.filter((r) => r.status === "mismatch").length,
      defaultBrl: results.filter((r) => r.status === "default-brl").length,
      noData: results.filter((r) => r.status === "no-data").length,
      currenciesInUse: Array.from(
        new Set(
          results
            .map((r) => r.reportedCurrency || r.configuredCurrency)
            .filter((c): c is string => Boolean(c)),
        ),
      ).sort(),
    }

    return successResponse(request, { stores: results, summary, period })
  } catch (error) {
    return errorResponse(request, error, "currency-audit")
  }
}

function emptySummary() {
  return {
    total: 0,
    ok: 0,
    missingConfig: 0,
    mismatch: 0,
    defaultBrl: 0,
    noData: 0,
    currenciesInUse: [] as string[],
  }
}
