import { withTiming } from "@/lib/api/with-timing"
import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { type DataStatus, type DataStatusMeta } from "@/lib/shared/data-status"
import { convertToBRL, convertToBRLDetailed } from "@/lib/services/exchange-rate.service"
import { moedaDaLinha } from "@/lib/money/moeda-da-loja"
import { normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { ANY_EMAIL_PLATFORM_FILTER, KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"

const log = logger.child("TotalRevenue")

/** Admin dashboard considers data stale after 1 hour */
const ADMIN_STALENESS_MS = 60 * 60 * 1000

// ── Types ──────────────────────────────────────────────────────────────────

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  /** Total da loja (Shopify/Statistics totalRevenue) na moeda original */
  totalRevenue: number
  /** Receita atribuida ao email marketing (campaign + flow) na moeda original */
  attributedRevenue: number
  campaignRevenue: number
  flowRevenue: number
  /** ISO 4217 currency code from Klaviyo account (e.g. "USD", "BRL") */
  currency: string
  /** REAIS por 1 unidade da moeda (EUR → 5.9589). null = não convertido. */
  fxRate: number | null
  /** O cache tem outra moeda que o cadastro — esta loja precisa re-sincronizar. */
  currencyStale?: boolean
  /** A moeda gravada no cache, quando discorda do cadastro. */
  currencyCached?: string
  /** Dia da cotação usada (YYYY-MM-DD). */
  fxRateDate: string | null
  /** A cotação não é do dia do faturamento — é a mais próxima que existe. */
  fxRateApproximate: boolean
  /** Câmbio indisponível: os campos "BRL" desta loja estão na moeda original. */
  fxDegraded: boolean
  /** Total da loja convertido pra BRL */
  totalRevenueBRL: number
  /** Atribuido convertido pra BRL */
  attributedRevenueBRL: number
  campaignRevenueBRL: number
  flowRevenueBRL: number
  /** Estado do último sync desta loja ("ok" | "partial" | "error" | "pending") */
  syncStatus: string
  /** Mensagem crua do erro de sync (ex.: chave Klaviyo inválida) */
  syncError: string | null
}

interface TotalRevenueResponse {
  period: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  /** Lojas cujo último sync deu certo — inclui as que faturaram zero. */
  storesSynced?: number
  topStores: StoreRevenue[]
  bottomStores: StoreRevenue[]
  storeBreakdown: StoreRevenue[]
  hasPartialData: boolean
  lastFetchedAt: string | null
  cachedAt: string
  dataStatus?: DataStatus
  /**
   * Lojas cujo ÚLTIMO sync falhou (chave inválida, sem permissão, etc.).
   * O motivo ficava só no log da Vercel — a tela dizia "4 de 62 lojas"
   * sem explicar as outras 58. Agora o dashboard mostra quem e por quê.
   */
  syncIssues: {
    count: number
    stores: Array<{ storeId: string; storeName: string; clientName: string; error: string }>
  }
}

type EnhancedTotalRevenueResponse = TotalRevenueResponse & DataStatusMeta & {
  dataAge: number
  isStale: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildStoreBreakdown(rows: Array<{
  store_id: string
  klaviyo_total_revenue?: number | string | null
  klaviyo_campaign_revenue?: number | string | null
  klaviyo_flow_revenue?: number | string | null
  omnisend_total_revenue?: number | string | null
  omnisend_campaign_revenue?: number | string | null
  omnisend_flow_revenue?: number | string | null
  store_total_revenue?: number | string | null
  currency?: string | null
  sync_status: string
  sync_error?: string | null
  fetched_at: string | null
  client_stores: unknown
}>): Promise<StoreRevenue[]> {
  const results = await Promise.all(rows.map(async (s) => {
    const storeData = s.client_stores as unknown as {
      id: string
      store_name: string
      /** A moeda do CADASTRO — a fonte, contra o snapshot do cache. */
      currency?: string | null
      client_id: string | null
      clients: { name: string } | null
    }
    // A moeda vem do CADASTRO, não do cache.
    //
    // `store_revenue_summary.currency` é um snapshot: o sync copia a moeda
    // da loja quando roda e nunca mais revisita. Corrigir a moeda no
    // cadastro não reescreve as linhas já gravadas, então a tela seguia
    // convertendo pela moeda antiga até alguém re-sincronizar AQUELE
    // período — e nada dizia que as duas discordavam.
    const moedaResolvida = moedaDaLinha(storeData.currency, s.currency)
    const currency = moedaResolvida.moeda
    // klaviyo_total_revenue e omnisend_total_revenue sao o ATRIBUIDO
    // (revenue de email marketing). store_total_revenue e o total REAL
    // da loja (vindo de Shopify ou Statistics totalRevenue). Pra calcular
    // % atribuicao, totalRev precisa ser o total real, nao o atribuido.
    // Bug anterior: totalRev = attributed, fazendo recovery rate = 100%.
    const attributedRev = Number(s.klaviyo_total_revenue || 0) + Number(s.omnisend_total_revenue || 0)
    const campaignRev = Number(s.klaviyo_campaign_revenue || 0) + Number(s.omnisend_campaign_revenue || 0)
    const flowRev = Number(s.klaviyo_flow_revenue || 0) + Number(s.omnisend_flow_revenue || 0)
    // Total da loja: prefere store_total_revenue (real), fallback no
    // attributed se nao houver Shopify conectado (loja "email-only").
    const totalRev = Number(s.store_total_revenue || 0) || attributedRev

    // A 1a usa a variante detalhada para trazer a COTAÇÃO usada (e o
    // flag de câmbio degradado). Como as quatro usam a mesma moeda, a
    // taxa da 1a vale para as quatro.
    const [totalConv, attributedBRL, campaignBRL, flowBRL] = await Promise.all([
      convertToBRLDetailed(totalRev, currency),
      convertToBRL(attributedRev, currency),
      convertToBRL(campaignRev, currency),
      convertToBRL(flowRev, currency),
    ])
    const totalBRL = totalConv.valueBRL

    return {
      storeId: s.store_id,
      storeName: storeData.store_name || "Loja sem nome",
      clientName: storeData.client_id
        ? (storeData.clients?.name || "Cliente desconhecido")
        : storeData.store_name || "Loja avulsa",
      totalRevenue: totalRev,
      attributedRevenue: attributedRev,
      campaignRevenue: campaignRev,
      flowRevenue: flowRev,
      currency,
      /** O cache foi gravado com outra moeda — esta loja precisa re-sincronizar. */
      currencyStale: moedaResolvida.divergente || undefined,
      /** A moeda que está no cache, quando ela discorda do cadastro. */
      currencyCached: moedaResolvida.moedaDoCache,
      // A cotação usada, para a tela poder mostrar a conta no hover.
      fxRate: totalConv.rate ?? null,
      fxRateDate: totalConv.rateDate ?? null,
      fxRateApproximate: totalConv.rateApproximate ?? false,
      // Câmbio indisponível: o "BRL" desta loja está na moeda original e
      // entra no total somando euro com real. Tem de aparecer.
      fxDegraded: currency !== "BRL" && !totalConv.converted,
      totalRevenueBRL: totalBRL,
      attributedRevenueBRL: attributedBRL,
      campaignRevenueBRL: campaignBRL,
      flowRevenueBRL: flowBRL,
      syncStatus: s.sync_status || "pending",
      syncError: s.sync_error ?? null,
    }
  }))
  return results
}

function buildResponse(
  period: string,
  storeBreakdown: StoreRevenue[],
  rows: Array<{ sync_status: string; fetched_at: string | null }>,
  meta: DataStatusMeta & { dataAge: number; isStale: boolean },
  storesCount: number,
): EnhancedTotalRevenueResponse {
  const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenueBRL, 0)
  const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenueBRL, 0)
  const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenueBRL, 0)
  const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenueBRL > 0).length
  // **Sincronizada e sem venda no dia NÃO é loja sem sync.**
  //
  // A tela contava só `storesWithRevenue` e escrevia "45 de 54 lojas com
  // dado até agora": as 9 que faltavam tinham sincronizado com sucesso e
  // faturado ZERO naquele dia — loja pequena sem venda. O banner então
  // dizia "o cache está incompleto, os cards podem mostrar menos do que o
  // real" sobre uma carteira inteiramente sincronizada, e o operador
  // clicava em sincronizar de novo para sempre. Faturamento zero é
  // MEDIÇÃO, não lacuna.
  const storesSynced = storeBreakdown.filter((s) => s.syncStatus !== "error").length

  const sorted = [...storeBreakdown].sort((a, b) => b.totalRevenueBRL - a.totalRevenueBRL)
  const topStores = sorted.filter(s => s.totalRevenueBRL > 0).slice(0, 5)
  const bottomStores = sorted.filter(s => s.totalRevenueBRL > 0).length > 5
    ? [...sorted.filter(s => s.totalRevenueBRL > 0)].reverse().slice(0, 5)
    : []

  const hasPartialData = rows.some(
    (s) => s.sync_status === "error" || s.sync_status === "partial"
  )

  // 'error' = sem dado novo; 'partial' com sync_error = último sync falhou
  // mas a receita anterior foi preservada. Os dois merecem aparecer.
  const issueStores = storeBreakdown
    .filter((s) => s.syncStatus === "error" || (s.syncStatus === "partial" && s.syncError))
    .map((s) => ({
      storeId: s.storeId,
      storeName: s.storeName,
      clientName: s.clientName,
      error: s.syncError || "Erro de sincronização",
    }))

  const lastFetchedAt = meta.lastFetchedAt ?? rows.reduce((oldest: string | null, s) => {
    if (!s.fetched_at) return oldest
    if (!oldest) return s.fetched_at
    return new Date(s.fetched_at) < new Date(oldest) ? s.fetched_at : oldest
  }, null)

  return {
    period,
    totalRevenue,
    campaignRevenue,
    flowRevenue,
    storesCount,
    storesWithRevenue,
    /** Lojas cujo último sync deu certo — inclui as que faturaram zero. */
    storesSynced,
    topStores,
    bottomStores,
    storeBreakdown,
    hasPartialData,
    lastFetchedAt,
    cachedAt: new Date().toISOString(),
    dataStatus: meta.dataStatus,
    isRefreshing: meta.isRefreshing,
    source: meta.source,
    dataAge: meta.dataAge,
    isStale: meta.isStale,
    syncIssues: { count: issueStores.length, stores: issueStores },
  }
}

function emptyResponse(
  period: string,
  storesCount: number,
  meta: DataStatusMeta & { dataAge: number; isStale: boolean },
): EnhancedTotalRevenueResponse {
  return {
    period,
    totalRevenue: 0,
    campaignRevenue: 0,
    flowRevenue: 0,
    storesCount,
    storesWithRevenue: 0,
    storesSynced: 0,
    topStores: [],
    bottomStores: [],
    storeBreakdown: [],
    hasPartialData: false,
    lastFetchedAt: meta.lastFetchedAt,
    cachedAt: new Date().toISOString(),
    dataStatus: meta.dataStatus,
    isRefreshing: meta.isRefreshing,
    source: meta.source,
    dataAge: meta.dataAge,
    isStale: meta.isStale,
    syncIssues: { count: 0, stores: [] },
  }
}

// ── GET Handler (cache-only read — no live API calls) ─────────────────────

async function handleGet(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const period = normalizePeriodLabel(
      request.nextUrl.searchParams.get("period") || "30d",
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end"),
    )
    const storeIdsParam = request.nextUrl.searchParams.get("store_ids")
    const filterStoreIds = storeIdsParam ? storeIdsParam.split(",").filter(Boolean) : null

    const orgId = await resolveOrgId(user.id)
    const adminClient = createAdminClient()

    // Conta lojas com QUALQUER plataforma de email marketing (Klaviyo ou Omnisend).
    // Resiliente a migration pendente: se omnisend_api_key nao existe, cai no
    // filtro legado so-Klaviyo.
    let countResp = await adminClient
      .from("client_stores")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .or(ANY_EMAIL_PLATFORM_FILTER)
    if (countResp.error && /omnisend_api_key/.test(countResp.error.message || "")) {
      countResp = await adminClient
        .from("client_stores")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .or(KLAVIYO_CREDENTIALS_FILTER)
    }
    const storesCount = countResp.count ?? 0

    if (storesCount === 0) {
      const elapsed = Date.now() - startTime
      const result = emptyResponse(period, 0, {
        dataStatus: "empty",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "cache",
        dataAge: 0,
        isStale: false,
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Read from store_revenue_summary (no expires_at filter — we calculate staleness ourselves).
    // Seleciona colunas de AMBAS plataformas (klaviyo + omnisend). Cada loja usa
    // UMA plataforma, entao apenas uma das colunas tem valor > 0.
    const selectNew = `
        store_id,
        klaviyo_total_revenue,
        klaviyo_campaign_revenue,
        klaviyo_flow_revenue,
        omnisend_total_revenue,
        omnisend_campaign_revenue,
        omnisend_flow_revenue,
        store_total_revenue,
        currency,
        sync_status,
        sync_error,
        fetched_at,
        client_stores!inner(id, store_name, currency, client_id, clients(name))
      `
    const selectLegacy = `
        store_id,
        klaviyo_total_revenue,
        klaviyo_campaign_revenue,
        klaviyo_flow_revenue,
        store_total_revenue,
        currency,
        sync_status,
        sync_error,
        fetched_at,
        client_stores!inner(id, store_name, currency, client_id, clients(name))
      `

    async function runQuery(cols: string) {
      let q = supabase
        .from("store_revenue_summary")
        .select(cols)
        .eq("period_label", period)
        .eq("org_id", orgId)
      if (filterStoreIds && filterStoreIds.length > 0) q = q.in("store_id", filterStoreIds)
      return q
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryResp: any = await runQuery(selectNew)
    if (queryResp.error && /omnisend_/.test(queryResp.error.message || "")) {
      queryResp = await runQuery(selectLegacy)
    }
    const { data: summaries, error } = queryResp

    if (error) {
      if (error.code === "42P01") {
        log.warn("[Revenue] store_revenue_summary table does not exist yet")
        return NextResponse.json(
          { success: false, error: "Revenue cache not available", dataStatus: "unavailable" },
          { status: 503, headers: { "Retry-After": "300" } }
        )
      }
      log.error("Error fetching revenue summaries:", error)
      throw error
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (summaries || []) as any[]

    if (rows.length === 0) {
      const elapsed = Date.now() - startTime
      log.info("[CacheStrategy]", { endpoint: "total-revenue", period, storesCount, source: "cache", dataAge: -1, elapsed: `${elapsed}ms` })
      const result = emptyResponse(period, storesCount, {
        dataStatus: "stale",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "cache",
        dataAge: -1,
        isStale: true,
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Calculate data age from oldest fetched_at — SÓ de linhas não-erro.
    // Linha de erro zerada com fetched_at recente (cron/refresh marcando a
    // falha) deixaria a tela "ready" mostrando R$ 0 como se fosse fresco.
    const freshnessRows = rows.filter((s) => s.sync_status !== "error")
    const oldestFetchedAt = freshnessRows.reduce((oldest: string | null, s) => {
      if (!s.fetched_at) return oldest
      if (!oldest) return s.fetched_at
      return new Date(s.fetched_at) < new Date(oldest) ? s.fetched_at : oldest
    }, null)

    const dataAgeMs = oldestFetchedAt ? Date.now() - new Date(oldestFetchedAt).getTime() : Infinity
    const dataAgeMinutes = oldestFetchedAt ? Math.round(dataAgeMs / 60_000) : -1
    const isStale = dataAgeMs > ADMIN_STALENESS_MS

    // Aqui havia um "touch pattern": toda leitura com o cache velho fazia um
    // UPDATE de `expires_at` em massa. Medido no `pg_stat_statements`:
    // **37.639 chamadas e 391 s de CPU** — disparadas por GET.
    //
    // O custo real não é o UPDATE: `store_revenue_summary` está na
    // publication do realtime, e o dashboard assina essa tabela. Cada
    // escrita acordava TODAS as abas abertas, que revalidavam as nove rotas
    // do dashboard, e a leitura de `total-revenue` escrevia de novo — um
    // laço que se realimentava, e que rodava sempre, porque `isStale` era
    // permanentemente verdadeiro enquanto a passada de sync não cobria a
    // carteira. É a regra da casa que o incidente do inbox já tinha
    // custado caro: **GET não escreve**.
    //
    // Quem dependia do carimbo era `/api/stores/control`, que filtrava
    // `expires_at > agora`. Ele passou a medir a IDADE do dado
    // (`fetched_at`), que é o que de fato define validade e não precisa de
    // ninguém renovando — então o touch não tem mais função.

    const storeBreakdown = await buildStoreBreakdown(rows)

    const elapsed = Date.now() - startTime
    log.info("[CacheStrategy]", {
      endpoint: "total-revenue",
      period,
      storesCount,
      rowsReturned: rows.length,
      source: "cache",
      dataAge: dataAgeMinutes,
      isStale,
      elapsed: `${elapsed}ms`,
    })

    const result = buildResponse(period, storeBreakdown, rows, {
      dataStatus: isStale ? "stale" : "ready",
      lastFetchedAt: oldestFetchedAt,
      isRefreshing: false,
      source: isStale ? "stale-cache" : "cache",
      dataAge: dataAgeMinutes,
      isStale,
    }, storesCount)

    const response = successResponse(request, result)
    response.headers.set("X-Response-Time", `${elapsed}ms`)
    return response
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}

export const GET = withTiming("dashboard/total-revenue", handleGet)
