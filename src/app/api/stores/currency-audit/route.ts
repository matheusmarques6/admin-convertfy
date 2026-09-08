/**
 * GET /api/stores/currency-audit
 *
 * Diagnóstico de moeda E fuso de cada loja da org.
 *
 * ── Por que mudou em 08/09/2026 ──────────────────────────────────────
 *
 * A versão anterior comparava `client_stores.currency` com
 * `store_revenue_summary.currency` e chamava de "OK" quando batiam. Para
 * loja Omnisend isso era CIRCULAR: o `summary.currency` é escrito pelo
 * sync a partir do próprio `client_stores.currency`. Lena Warszawa
 * (lenawarszawa.pl) aparecia "OK" em EUR, Treuquell (.de) "OK" em BRL —
 * a auditoria confirmava o erro que deveria denunciar.
 *
 * Agora o eixo é a PROCEDÊNCIA (`currency_source`/`currency_synced_at`,
 * migration 20261123): moeda que ninguém conferiu com a plataforma sai
 * como `nunca-conferido`, não como OK. O confronto com a plataforma é
 * feito pelo botão (POST /api/stores/platform-profile-sync), que faz a
 * chamada de rede — aqui é leitura de banco, tem que ser rápida.
 *
 * O fuso entra na mesma tela porque é o mesmo defeito: sem
 * `client_stores.timezone` a janela do relatório é cortada num fuso
 * assumido, e o total diverge do painel do Omnisend sem explicação.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CurrencyAudit")

export const dynamic = "force-dynamic"

type Procedencia = "omnisend" | "shopify" | "klaviyo" | "manual" | null

export type StatusMoeda =
  | "plataforma"
  | "manual"
  | "nunca-conferido"
  | "sem-config"
  | "divergencia"
  | "sem-dados"

export interface StoreCurrencyAudit {
  storeId: string
  storeName: string
  clientName: string | null
  platform: "klaviyo" | "omnisend" | "none"
  configuredCurrency: string | null
  currencySource: Procedencia
  currencySyncedAt: string | null
  /** Só o Klaviyo reporta moeda própria; para Omnisend isto espelha o cadastro. */
  reportedCurrency: string | null
  timezone: string | null
  timezoneSource: Procedencia
  status: StatusMoeda
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
      currency_source: Procedencia
      currency_synced_at: string | null
      timezone: string | null
      timezone_source: Procedencia
      omnisend_api_key: string | null
      klaviyo_private_key: string | null
      klaviyo_api_key: string | null
      email_platform: string | null
      client_id: string | null
      clients: { name: string } | { name: string }[] | null
    }

    const COLUNAS_COMPLETAS =
      "id, store_name, currency, currency_source, currency_synced_at, timezone, timezone_source, " +
      "omnisend_api_key, klaviyo_private_key, klaviyo_api_key, email_platform, client_id, clients(name)"

    async function fetchStores(cols: string) {
      return admin
        .from("client_stores")
        .select(cols)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name")
    }
    let storesResp = await fetchStores(COLUNAS_COMPLETAS)
    // Sem a migration 20261123 as colunas de procedência não existem — a
    // tela degrada para o diagnóstico antigo em vez de morrer em 42703.
    if (storesResp.error && /currency_source|timezone|currency_synced_at/.test(storesResp.error.message || "")) {
      storesResp = await fetchStores(
        "id, store_name, currency, omnisend_api_key, klaviyo_private_key, klaviyo_api_key, email_platform, client_id, clients(name)",
      )
    }
    if (storesResp.error && /email_platform|omnisend_api_key/.test(storesResp.error.message || "")) {
      storesResp = await fetchStores(
        "id, store_name, currency, klaviyo_private_key, klaviyo_api_key, client_id, clients(name)",
      )
    }

    if (storesResp.error) throw storesResp.error
    const stores = (storesResp.data || []) as unknown as StoreRow[]

    if (stores.length === 0) {
      return successResponse(request, { stores: [], summary: emptySummary(), period })
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

    // Cotações atuais (1 BRL = X estrangeira) — só carregadas se alguma
    // loja tiver receita em moeda estrangeira para converter.
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
        const fonte = s.currency_source ?? null
        // Para Omnisend o "reportado" é o próprio cadastro (o sync copia)
        // — não serve de confronto, e mostrá-lo como se servisse foi o
        // que sustentou o falso OK. Só o Klaviyo reporta moeda própria.
        const reported = platform === "klaviyo" ? summary?.currency || null : null
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

        let status: StatusMoeda
        let hint: string
        if (!configured) {
          status = "sem-config"
          hint =
            "Sem moeda no cadastro — o sync assume BRL e nenhum valor estrangeiro é convertido. Clique em Conferir com a plataforma."
        } else if (reported && configured !== reported) {
          status = "divergencia"
          hint = `Cadastro diz ${configured} e o Klaviyo reporta ${reported}. O Klaviyo é a fonte: ajuste o cadastro.`
        } else if (fonte === "manual") {
          status = "manual"
          hint = "Moeda definida à mão. A sincronia com a plataforma respeita este valor (use Forçar para sobrescrever)."
        } else if (fonte) {
          status = "plataforma"
          hint = s.currency_synced_at
            ? `Conferido com ${fonte} em ${new Date(s.currency_synced_at).toLocaleString("pt-BR")}.`
            : `Veio de ${fonte}.`
        } else if (!summary) {
          status = "sem-dados"
          hint = "Loja ainda não sincronizada, e a moeda nunca foi conferida com a plataforma."
        } else {
          status = "nunca-conferido"
          hint =
            `Está ${configured}, mas ninguém conferiu com a plataforma — pode ser o default. ` +
            "Clique em Conferir com a plataforma."
        }

        return {
          storeId: s.id,
          storeName: s.store_name,
          clientName: client?.name ?? null,
          platform,
          configuredCurrency: configured,
          currencySource: fonte,
          currencySyncedAt: s.currency_synced_at ?? null,
          reportedCurrency: reported,
          timezone: s.timezone ?? null,
          timezoneSource: s.timezone_source ?? null,
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
      plataforma: results.filter((r) => r.status === "plataforma").length,
      manual: results.filter((r) => r.status === "manual").length,
      nuncaConferido: results.filter((r) => r.status === "nunca-conferido").length,
      semConfig: results.filter((r) => r.status === "sem-config").length,
      divergencia: results.filter((r) => r.status === "divergencia").length,
      semDados: results.filter((r) => r.status === "sem-dados").length,
      semFuso: results.filter((r) => !r.timezone).length,
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
    plataforma: 0,
    manual: 0,
    nuncaConferido: 0,
    semConfig: 0,
    divergencia: 0,
    semDados: 0,
    semFuso: 0,
    currenciesInUse: [] as string[],
  }
}
