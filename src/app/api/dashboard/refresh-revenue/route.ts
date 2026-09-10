import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { ANY_EMAIL_PLATFORM_FILTER, KLAVIYO_CREDENTIALS_FILTER, getStoreCredentials } from "@/lib/services/credentials.service"
import {
  CACHED_PERIODS,
  buildCustomPeriodLabel,
  parseCustomPeriodLabel,
} from "@/lib/shared/data-status"
import {
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
} from "@/lib/services/klaviyo-sync.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { fusoDaLoja, omnisendDateRange } from "@/lib/integrations/omnisend/timezone"
import {
  CONCORRENCIA_PADRAO,
  comLimite,
  janelaDoPeriodo,
  planoDeLote,
  tetoPorLoja,
} from "@/lib/dashboard/refresh-lote"
import { detectStorePlatform } from "@/lib/services/report-platform.service"
import { upsertSyncResults, upsertOmnisendSyncResults } from "@/lib/services/sync-persistence.service"

const log = logger.child("RefreshRevenue")

// Vercel Pro: max 300s. Antes era 120 e estourava com varias stores.
// Mesmo assim, paramos antes pra retornar parcial gracefully (vide deadline).
export const maxDuration = 300
export const dynamic = "force-dynamic"

const LOCK_TTL_MS = 5 * 60 * 1000 // 5 minutes
// Deadline interno: para de COMEÇAR loja nova com folga suficiente para a
// mais lenta ainda terminar, o lock ser liberado e a resposta sair antes de
// a Vercel cortar em `maxDuration`.
//
// Com 270_000 a conta não fechava: o deadline só era conferido ANTES de
// iniciar cada loja, então uma que começasse em 269 s e levasse 60 s
// terminava em 329 s — a função morria no teto de 300 s e o `finally` que
// libera o lock NUNCA rodava. Medido em 10/09: dois locks com
// `is_running = true` e `finished_at` ANTERIOR ao `started_at`, a marca de
// quem morreu no meio. O lock então segurava o período por 5 minutos e todo
// clique nesse intervalo voltava `alreadyRunning` — que é o "clico em
// sincronizar e não sincroniza".
const LOOP_DEADLINE_MS = 195_000
/**
 * Até quando uma loja em voo ainda cabe na função, deixando margem para
 * liberar o lock e responder. É daqui que sai o teto de cada loja.
 */
const ORCAMENTO_DA_FUNCAO_MS = 275_000

// ── Lock helpers (reuses cron_locks table) ────────────────────────────────

function lockName(orgId: string, period: string): string {
  return `refresh_${orgId}_${period}`
}

async function acquireRefreshLock(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<{ acquired: boolean; lockedSince?: string }> {
  const name = lockName(orgId, period)
  const now = new Date().toISOString()
  const ttlSeconds = Math.floor(LOCK_TTL_MS / 1000)

  // Atomic lock: INSERT or UPDATE only if not currently locked (or lock is stale)
  const { data, error } = await supabase.rpc("acquire_cron_lock", {
    p_lock_name: name,
    p_ttl_seconds: ttlSeconds,
    p_now: now,
  })

  if (error) {
    // Fallback: if RPC doesn't exist, use non-atomic approach
    log.warn(`[RefreshRevenue] acquire_cron_lock RPC failed, falling back: ${error.message}`)

    const { data: existing } = await supabase
      .from("cron_locks")
      .select("is_running, started_at")
      .eq("lock_name", name)
      .single()

    if (existing?.is_running && existing.started_at) {
      const startedAt = new Date(existing.started_at).getTime()
      if (Date.now() - startedAt < LOCK_TTL_MS) {
        return { acquired: false, lockedSince: existing.started_at }
      }
      log.warn(`[RefreshRevenue] Stale lock detected for ${name}, overriding`)
    }

    await supabase
      .from("cron_locks")
      .upsert({
        lock_name: name,
        is_running: true,
        started_at: now,
      }, { onConflict: "lock_name" })

    return { acquired: true }
  }

  const acquired = data === true
  if (!acquired) {
    // Lock is held by another process — read who holds it
    const { data: lockRow } = await supabase
      .from("cron_locks")
      .select("started_at")
      .eq("lock_name", name)
      .single()
    return { acquired: false, lockedSince: lockRow?.started_at }
  }

  return { acquired: true }
}

async function releaseRefreshLock(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<void> {
  await supabase
    .from("cron_locks")
    .update({
      is_running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("lock_name", lockName(orgId, period))
}

// ── Store sync (extracted from cron logic) ────────────────────────────────

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
  klaviyo_validated_at?: string | null
  klaviyo_validation_error?: string | null
}

// Mesma régua do cron sync-reports: loja marcada [INVALID_KEY] há menos de
// 24h nem é tentada — cada tentativa é um 401 garantido que queima ~5-10s
// do budget de 270s (com 24 lojas quebradas, o refresh gastava metade do
// tempo colecionando 401 antes de chegar nas lojas boas).
const INVALID_KEY_RETRY_MS = 24 * 60 * 60 * 1000

function isInInvalidKeyCooldown(store: StoreRow): boolean {
  const errMsg = store.klaviyo_validation_error ?? ""
  if (!errMsg.startsWith("[INVALID_KEY]")) return false
  if (!store.klaviyo_validated_at) return false
  return Date.now() - new Date(store.klaviyo_validated_at).getTime() < INVALID_KEY_RETRY_MS
}

/** Marca a chave como inválida em client_stores — liga o cooldown de 24h
 *  para o cron E para os próximos refreshes (antes só o cron gravava, então
 *  o refresh manual re-tentava as mesmas lojas quebradas a cada clique). */
async function markInvalidKey(
  supabase: SupabaseClient,
  storeId: string,
  message: string,
): Promise<void> {
  try {
    await supabase
      .from("client_stores")
      .update({
        klaviyo_validation_error: `[INVALID_KEY] ${message}`.slice(0, 500),
        klaviyo_validated_at: new Date().toISOString(),
        klaviyo_has_reporting_access: false,
      })
      .eq("id", storeId)
  } catch {
    // best-effort — não pode derrubar o loop
  }
}

const PERIOD_DAYS: Record<string, number> = {
  today: 1, yesterday: 1, "7d": 7, "15d": 15, "30d": 30, "90d": 90, "12m": 365,
}

/**
 * Grava a falha de sync da loja em store_revenue_summary — sem isso o
 * dashboard fica cego: 24 lojas com chave Klaviyo inválida apareciam só
 * no log da Vercel e a tela dizia "4 de 62 lojas" sem nenhum porquê.
 * UPDATE só de status/erro (a receita boa do último sync fica intacta,
 * inclusive fetched_at — a idade do DADO é a do dado, não da tentativa);
 * loja sem linha nenhuma ganha uma linha zerada marcada 'error' pra
 * entrar na contagem e na auditoria.
 */
async function markStoreSyncError(
  supabase: SupabaseClient,
  store: StoreRow,
  period: string,
  errorMsg: string,
): Promise<void> {
  try {
    const syncError = errorMsg.slice(0, 500)
    const { data: updated } = await supabase
      .from("store_revenue_summary")
      .update({ sync_status: "error", sync_error: syncError })
      .eq("store_id", store.id)
      .eq("period_label", period)
      .select("store_id")

    if (updated && updated.length > 0) return
    if (!store.org_id) return // org_id é NOT NULL na tabela — sem org não há linha

    const custom = parseCustomPeriodLabel(period)
    const now = new Date()
    const periodEnd = custom ? new Date(`${custom.endDate}T23:59:59.999Z`) : now
    const periodStart = custom
      ? new Date(`${custom.startDate}T00:00:00.000Z`)
      : new Date(now.getTime() - (PERIOD_DAYS[period] ?? 30) * 86_400_000)

    await supabase.from("store_revenue_summary").insert({
      store_id: store.id,
      period_label: period,
      org_id: store.org_id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      sync_status: "error",
      sync_error: syncError,
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
  } catch (err) {
    // Marcar o erro nunca pode derrubar o loop de refresh
    log.warn(`[RefreshRevenue] markStoreSyncError falhou para ${store.store_name}: ${err instanceof Error ? err.message : err}`)
  }
}

/** Fuso IANA da loja — é ele que fatia a janela no painel da plataforma. */
async function lerFusoDaLoja(
  supabase: SupabaseClient,
  storeId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("client_stores")
      .select("timezone")
      .eq("id", storeId)
      .maybeSingle()
    return (data?.timezone as string | null) ?? null
  } catch {
    return null
  }
}

async function refreshStoreForPeriod(
  supabase: SupabaseClient,
  store: StoreRow,
  period: string,
): Promise<{ status: "ok" | "error"; error?: string }> {
  // Dispatcher por plataforma
  const platform = await detectStorePlatform(store.id)

  if (platform === "omnisend") {
    const credentials = await getStoreCredentials(store.id, store.org_id ?? undefined)
    const apiKey = credentials.omnisend_api_key
    if (!apiKey) return { status: "error", error: "No Omnisend API key" }
    // A janela vai EXPLÍCITA para o sync.
    //
    // Aqui havia uma recusa: "Omnisend não suporta range retroativo
    // (janela é relativa a hoje)" — e period personalizado que não
    // terminasse hoje era pulado sem tentar. A afirmação é falsa:
    // `syncOmnisendForStore` aceita `startDate`/`endDate` desde sempre
    // (o builder de campanhas já os passa). Como as 54 lojas desta org
    // são Omnisend, essa linha recusava a carteira inteira — o dashboard
    // dizia "1 de 54 lojas com receita" e era exatamente essa frase que
    // estava gravada em `store_revenue_summary.sync_error`. Piorava com o
    // fuso: a comparação usava o dia em UTC, então depois das 21h de
    // Brasília o período de HOJE também virava "retroativo".
    const janela = janelaDoPeriodo(period)
    const { tz } = fusoDaLoja(await lerFusoDaLoja(supabase, store.id))
    const { from, to } = omnisendDateRange(janela.inicio, janela.fim, tz)
    const result = await syncOmnisendForStore({
      storeId: store.id,
      orgId: store.org_id ?? "",
      apiKey,
      periodDays: janela.dias,
      startDate: from,
      endDate: to,
    })
    if (result.ok && result.data) {
      await upsertOmnisendSyncResults(supabase, { id: store.id, org_id: store.org_id }, result.data, period)
      return { status: "ok" }
    }
    return { status: "error", error: result.error || "Omnisend sync failed" }
  }

  if (platform !== "klaviyo") {
    return { status: "error", error: `Unsupported platform: ${platform}` }
  }

  const credentials = await getStoreCredentials(store.id)
  const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
  if (!apiKey) return { status: "error", error: "No API key" }

  try {
    const accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined, store.id)
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    const metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined, store.id)

    if (!metricId) return { status: "error", error: "No Placed Order metric" }

    const [flowNames, campNames] = await Promise.all([
      fetchFlowNames(apiKey),
      fetchCampaignNames(apiKey),
    ])

    const audience = await fetchAudienceForStore(apiKey)
    const audienceData = audience.success && audience.data
      ? audience.data
      : { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }

    const result = await syncKlaviyoForPeriod({
      storeId: store.id,
      orgId: store.org_id,
      apiKey,
      timezone: accountInfo.timezone,
      timezoneOffset,
      metricId,
      period,
      flowNames,
      campNames,
      currency: accountInfo.currency,
    })

    if (result.success && result.data) {
      await upsertSyncResults(supabase, store, result.data, period, audienceData)
      return { status: "ok" }
    }

    return { status: "error", error: result.error || "Sync failed" }
  } catch (err) {
    if (err instanceof KlaviyoPermissionError) {
      return { status: "error", error: `Permission denied: ${err.missingScopes.join(", ")}` }
    }
    if (err instanceof KlaviyoRateLimitError) {
      return { status: "error", error: `Rate limited (retry after ${err.retryAfterMs}ms)` }
    }
    if (err instanceof KlaviyoInvalidKeyError) {
      await markInvalidKey(supabase, store.id, err.message)
      return { status: "error", error: `Invalid key: ${err.message}` }
    }
    return { status: "error", error: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * Corre `fn` com teto de tempo, devolvendo erro em vez de travar o worker.
 *
 * Não aborta o trabalho em si (o sync não recebe signal) — o ponto é
 * libertar o worker: sem isso, uma loja pendurada segura uma das vagas de
 * concorrência até o fim e leva a função inteira ao teto da Vercel, que é
 * onde o lock fica preso.
 */
async function comTeto(
  fn: () => Promise<{ status: "ok" | "error"; error?: string }>,
  ms: number,
  mensagem: string,
): Promise<{ status: "ok" | "error"; error?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<{ status: "ok" | "error"; error?: string }>((resolve) => {
        timer = setTimeout(() => resolve({ status: "error", error: mensagem }), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ── POST Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json().catch(() => ({}))
    let period: string = body.period || "30d"

    // Range personalizado: {period:"custom", start, end} vira o rótulo
    // composto custom:YYYY-MM-DD:YYYY-MM-DD — o MESMO que as rotas de
    // leitura resolvem via normalizePeriodLabel. Sincronizar sob esse
    // label é o que popula o cache do range selecionado.
    if (period === "custom") {
      const start = typeof body.start === "string" ? body.start.slice(0, 10) : null
      const end = typeof body.end === "string" ? body.end.slice(0, 10) : null
      const valid =
        start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) &&
        start <= end &&
        (Date.parse(end) - Date.parse(start)) / 86_400_000 <= 366
      if (!valid) {
        return NextResponse.json(
          { success: false, error: "Range custom inválido: envie start/end (YYYY-MM-DD, máx. 366 dias)" },
          { status: 400 },
        )
      }
      period = buildCustomPeriodLabel(start!, end!)
    } else if (!(CACHED_PERIODS as readonly string[]).includes(period)) {
      return NextResponse.json(
        { success: false, error: `Invalid period: ${period}. Use: ${CACHED_PERIODS.join(", ")} ou custom+start/end` },
        { status: 400 }
      )
    }

    const orgId = await resolveOrgId(user.id)
    const adminClient = createAdminClient()

    // Try to acquire lock
    const { acquired, lockedSince } = await acquireRefreshLock(adminClient, orgId, period)
    if (!acquired) {
      log.info(`[RefreshRevenue] Already running for org ${orgId}/${period} since ${lockedSince}`)
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        lockedSince,
      })
    }

    log.info(`[RefreshRevenue] Starting refresh for org ${orgId}/${period}`)

    try {
      // Get ALL stores with Klaviyo OR Omnisend credentials for this org.
      // Resiliente a migration pendente: fallback para so-Klaviyo se omnisend_api_key
      // coluna nao existe.
      const storeCols = "id, store_name, org_id, klaviyo_validated_at, klaviyo_validation_error"
      let storesResp = await adminClient
        .from("client_stores")
        .select(storeCols)
        .eq("org_id", orgId)
        .or(ANY_EMAIL_PLATFORM_FILTER)
      if (storesResp.error && /omnisend_api_key/.test(storesResp.error.message || "")) {
        storesResp = await adminClient
          .from("client_stores")
          .select(storeCols)
          .eq("org_id", orgId)
          .or(KLAVIYO_CREDENTIALS_FILTER)
      }
      const { data: allStores, error: storesError } = storesResp

      if (storesError || !allStores || allStores.length === 0) {
        log.warn("[RefreshRevenue] No stores found for org", orgId)
        return NextResponse.json({ success: true, storesRefreshed: 0, durationMs: Date.now() - startTime })
      }

      // Cooldown de chave inválida (24h, mesma régua do cron): não tentar o
      // 401 garantido, mas MARCAR o erro no cache do período pra loja
      // aparecer no aviso do dashboard (rótulos custom não têm a linha que
      // o cron grava).
      const cooldownStores = (allStores as StoreRow[]).filter(isInInvalidKeyCooldown)
      const stores = (allStores as StoreRow[]).filter((s) => !isInInvalidKeyCooldown(s))
      if (cooldownStores.length > 0) {
        log.info(
          `[RefreshRevenue] Pulando ${cooldownStores.length} lojas em cooldown de INVALID_KEY: ${cooldownStores.map((s) => s.store_name).join(", ")}`,
        )
        await Promise.all(
          cooldownStores.map((s) =>
            markStoreSyncError(adminClient, s, period, s.klaviyo_validation_error || "[INVALID_KEY] Chave Klaviyo inválida"),
          ),
        )
      }

      if (stores.length === 0) {
        return NextResponse.json({
          success: true,
          storesRefreshed: 0,
          storesInCooldown: cooldownStores.length,
          durationMs: Date.now() - startTime,
        })
      }

      // Quem JÁ tem dado deste período — a fila começa por quem não tem,
      // porque loja sem linha é buraco no total, enquanto dado de ontem é
      // só imprecisão.
      const jaSincronizadas = new Map<
        string,
        { temDado: boolean; falhou: boolean; sincronizadaEm: string | null }
      >()
      try {
        const { data: linhas } = await adminClient
          .from("store_revenue_summary")
          .select("store_id, sync_status, fetched_at")
          .eq("period_label", period)
          .in("store_id", stores.map((s) => s.id))
        for (const l of linhas ?? []) {
          const status = l.sync_status as string | null
          jaSincronizadas.set(l.store_id as string, {
            temDado: status !== "error",
            // `partial` entra junto com `error`: é dado que veio pela
            // metade (a plataforma não respondeu às estatísticas e a
            // receita ficou preservada do sync anterior). Contando como
            // dado bom, ela caía no fim da fila e a passada terminava
            // antes de alcançá-la — as 5 `partial` de 10/09 seguiam
            // carimbadas às 14:40 com as `ok` já refeitas às 16:03.
            falhou: status === "error" || status === "partial",
            sincronizadaEm: (l.fetched_at as string | null) ?? null,
          })
        }
      } catch {
        // Sem essa leitura o lote só perde a priorização, não a correção.
      }

      // Uma passada NÃO cobre a carteira: cada loja é um sync completo da
      // plataforma, e 54 delas em série (com 1s entre cada) não cabem no
      // teto da função — o loop antigo parava na primeira e as outras 53
      // nunca eram tentadas, o que aparecia como "1 de 54 lojas com
      // receita". Agora roda em paralelo com teto (as chaves são por
      // loja, então o limite de requisições da plataforma é por conta e
      // não impede o paralelismo) e o que não coube é DEVOLVIDO como
      // pendência, para a próxima passada continuar dali.
      const plano = planoDeLote(
        stores.map((s) => ({
          ...(s as StoreRow),
          temDado: jaSincronizadas.get(s.id)?.temDado ?? false,
          falhou: jaSincronizadas.get(s.id)?.falhou ?? false,
          sincronizadaEm: jaSincronizadas.get(s.id)?.sincronizadaEm ?? null,
        })),
        stores.length,
        CONCORRENCIA_PADRAO,
      )

      let okCount = 0
      let errorCount = 0
      let skippedCount = 0
      let timedOut = false

      await comLimite(plano.lote, plano.concorrencia, async (store) => {
        // O deadline é conferido por loja, não por bloco: quem já começou
        // termina, quem não começou vira pendência declarada.
        if (Date.now() - startTime > LOOP_DEADLINE_MS) {
          skippedCount++
          timedOut = true
          return
        }
        // O teto é o que ainda resta da função, não um número fixo: com a
        // fila curta (as frescas já saíram do plano) as poucas lojas lentas
        // que sobraram recebem quase todo o orçamento. Um teto fixo de 90 s
        // marcava como erro três lojas grandes que só precisavam de mais
        // tempo — "demorou" virava "não sincroniza" na tela.
        const teto = tetoPorLoja(Date.now() - startTime, ORCAMENTO_DA_FUNCAO_MS)
        const result = await comTeto(
          () => refreshStoreForPeriod(adminClient, store as StoreRow, period),
          teto,
          `Demorou mais que o tempo desta rodada (${Math.round(teto / 1000)}s). Clique em sincronizar de novo: com a fila menor esta loja recebe mais tempo.`,
        )
        if (result.status === "ok") {
          okCount++
          log.info(`[RefreshRevenue] OK: ${store.store_name}/${period}`)
        } else {
          errorCount++
          log.warn(`[RefreshRevenue] Error: ${store.store_name}/${period}: ${result.error}`)
          await markStoreSyncError(adminClient, store as StoreRow, period, result.error || "Sync failed")
        }
      })

      const durationMs = Date.now() - startTime
      const pendentes = skippedCount + plano.restantes
      log.info(
        `[RefreshRevenue] Completed org ${orgId}/${period}: ok=${okCount} error=${errorCount} skipped=${skippedCount} frescas=${plano.jaFrescas} pendentes=${pendentes} duration=${durationMs}ms`,
      )

      return NextResponse.json({
        success: true,
        alreadyRunning: false,
        storesRefreshed: okCount,
        storeErrors: errorCount,
        storesSkipped: skippedCount,
        storesInCooldown: cooldownStores.length,
        // Quantas lojas ainda não foram tentadas nesta janela. O cliente
        // usa isso para chamar de novo até zerar — sem esse número, a tela
        // dizia "sincronizado" com dois terços da carteira de fora.
        storesPending: pendentes,
        /** Puladas por já terem dado fresco — não são erro nem pendência. */
        storesFresh: plano.jaFrescas,
        timedOut,
        durationMs,
      })
    } finally {
      await releaseRefreshLock(adminClient, orgId, period)
    }
  } catch (error) {
    return errorResponse(request, error, "RefreshRevenue POST")
  }
}
