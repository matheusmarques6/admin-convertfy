/**
 * Engine de sugestões da Central de Campanhas.
 *
 * runSuggestionCycle: cria um campaign_cycle, monta contexto (tabelas
 * locais apenas), chama a IA por cluster de lojas (nicho/país) e
 * persiste campaign_suggestions. Telemetria em campaign_ai_runs.
 *
 * Prompt versionado em email_agent_configs (agent_type =
 * 'campaign_suggestion') — editável na UI de prompts.
 *
 * Lock via cron_locks ('campaign_suggestions_cycle') protege contra
 * corrida cron × botão "Re-gerar".
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  loadCycleContext,
  clusterStores,
  type CycleContext,
  type CycleStoreContext,
} from "./cycle-context.service"
import { loadAttentionStores } from "./attention-stores.service"
import { loadBenchmarkEmails } from "./benchmark.service"
import { captureTrends } from "./trends.service"
import { getSettings } from "./settings.service"
import { callAnthropicJson } from "./anthropic-client"
import { aiSuggestionsOutputSchema, type AiSuggestion } from "@/lib/validations/campaign-central"
import type { AttentionStore, BenchmarkEmail, CampaignTrend } from "@/types/campaign-central"

const log = logger.child("CampaignSuggestionEngine")

const LOCK_NAME = "campaign_suggestions_cycle"
const LOCK_STALE_MINUTES = 10
const DEFAULT_MAX_CONCURRENT_CLUSTERS = 3
const CYCLE_DAYS = 7

export interface RunCycleResult {
  cycleId: string | null
  cycleNumber: number | null
  status: "ready" | "partial" | "failed" | "skipped_locked" | "no_stores"
  suggestionsCreated: number
  clustersTotal: number
  clustersFailed: number
  error?: string
}

interface AgentConfig {
  id: string
  model: string
  system_prompt: string
  user_template: string
  temperature: number | null
  max_tokens: number | null
  output_schema: Record<string, unknown> | null
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => vars[expr.trim()] ?? "")
}

/** Próximo domingo 22h BRT (= segunda 01h UTC) a partir de `from`. */
export function nextSundayRun(from = new Date()): Date {
  const d = new Date(from)
  // alvo: dia da semana 1 (segunda) 01:00 UTC
  d.setUTCHours(1, 0, 0, 0)
  const day = d.getUTCDay()
  let add = (1 - day + 7) % 7
  if (add === 0 && d.getTime() <= from.getTime()) add = 7
  d.setUTCDate(d.getUTCDate() + add)
  return d
}

async function acquireLock(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  // RPC atômico padrão do projeto (acquire_sync_lock — 20260310). Evita
  // TOCTOU. Stale = lock parado há mais de LOCK_STALE_MINUTES é liberado
  // automaticamente.
  const { data, error } = await admin.rpc("acquire_sync_lock", {
    p_lock_name: LOCK_NAME,
    p_stale_ms: LOCK_STALE_MINUTES * 60_000,
  })

  if (error) {
    log.error("lock.acquire_error", error)
    return false
  }
  return data === true
}

async function releaseLock(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  await admin
    .from("cron_locks")
    .update({ is_running: false, finished_at: new Date().toISOString() })
    .eq("lock_name", LOCK_NAME)
}

async function loadAgentConfig(
  admin: ReturnType<typeof createAdminClient>,
): Promise<AgentConfig | null> {
  const { data } = await admin
    .from("email_agent_configs")
    .select("id, model, system_prompt, user_template, temperature, max_tokens, output_schema")
    .eq("agent_type", "campaign_suggestion")
    .eq("is_active", true)
    .maybeSingle()
  return (data as AgentConfig | null) ?? null
}

function buildClusterVars(params: {
  cycleRangeLabel: string
  today: string
  cluster: { key: string; stores: CycleStoreContext[] }
  ctx: CycleContext
  attention: AttentionStore[]
  benchmark: BenchmarkEmail[]
  trends: Pick<CampaignTrend, "title" | "source" | "delta_label" | "tag" | "niche" | "country">[]
}): Record<string, string> {
  const clusterCountries = new Set(params.cluster.stores.map((s) => s.country))
  const clusterStoreIds = new Set(params.cluster.stores.map((s) => s.store_id))

  const dates = params.ctx.dates.filter((d) => clusterCountries.has(d.country))
  const attention = params.attention.filter((a) => clusterStoreIds.has(a.store_id))
  const trends = params.trends.filter(
    (t) => !t.country || clusterCountries.has(t.country),
  )

  return {
    cycle_range: params.cycleRangeLabel,
    today: params.today,
    stores_json: JSON.stringify(params.cluster.stores, null, 1),
    dates_json: dates.length > 0 ? JSON.stringify(dates, null, 1) : "[] (nenhuma na janela)",
    attention_json:
      attention.length > 0 ? JSON.stringify(attention, null, 1) : "[] (nenhuma loja em atenção)",
    benchmark_json:
      params.benchmark.length > 0
        ? JSON.stringify(params.benchmark, null, 1)
        : "[] (sem benchmark disponível)",
    trends_json:
      trends.length > 0 ? JSON.stringify(trends, null, 1) : "[] (sem trends neste ciclo)",
  }
}

/** Roda fns com limite de concorrência, preservando a ordem dos resultados. */
async function runWithConcurrency<T>(
  fns: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<{ ok: true; value: T } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: T } | { ok: false; error: unknown }> = new Array(
    fns.length,
  )
  let next = 0
  async function worker() {
    while (next < fns.length) {
      const i = next++
      try {
        results[i] = { ok: true, value: await fns[i]() }
      } catch (error) {
        results[i] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
  return results
}

export async function runSuggestionCycle(params: {
  orgId: string
  triggeredBy: "cron" | "manual"
  /** Trends pré-carregadas. Se vazio e enableTrends!==false, captura via web search. */
  trends?: Pick<CampaignTrend, "title" | "source" | "delta_label" | "tag" | "niche" | "country">[]
  /** false desliga a captura de trends (teste/custo). Default: true. */
  enableTrends?: boolean
  dryRun?: boolean
}): Promise<RunCycleResult> {
  const admin = createAdminClient()
  const { orgId, triggeredBy } = params

  const gotLock = await acquireLock(admin)
  if (!gotLock) {
    log.warn("cycle.skipped_locked", { orgId, triggeredBy })
    return {
      cycleId: null,
      cycleNumber: null,
      status: "skipped_locked",
      suggestionsCreated: 0,
      clustersTotal: 0,
      clustersFailed: 0,
    }
  }

  let cycleId: string | null = null
  try {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const rangeEnd = new Date(now.getTime() + CYCLE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)

    // Contexto (tabelas locais apenas)
    const settings = await getSettings(orgId)
    const ctx = await loadCycleContext(orgId, now, settings.date_window_days)
    if (ctx.stores.length === 0) {
      return {
        cycleId: null,
        cycleNumber: null,
        status: "no_stores",
        suggestionsCreated: 0,
        clustersTotal: 0,
        clustersFailed: 0,
      }
    }

    const [attention, benchmark] = await Promise.all([
      loadAttentionStores(orgId),
      loadBenchmarkEmails(orgId).catch((err) => {
        // Benchmark é enriquecimento — falha não aborta o ciclo
        log.warn("cycle.benchmark_failed", { error: err instanceof Error ? err.message : err })
        return [] as BenchmarkEmail[]
      }),
    ])

    const clusters = clusterStores(ctx.stores, settings.max_stores_per_cluster)
    let trends = params.trends ?? []

    // Número sequencial por org
    const { data: lastCycle } = await admin
      .from("campaign_cycles")
      .select("number")
      .eq("org_id", orgId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle()
    const cycleNumber = ((lastCycle?.number as number) ?? 0) + 1

    const contextSnapshot = {
      stores_scanned: ctx.stores.length,
      countries: ctx.countries,
      dates_in_window: ctx.dates.length,
      attention_count: attention.length,
      benchmark_count: benchmark.length,
      trends_count: trends.length,
      clusters: clusters.map((c) => ({ key: c.key, store_ids: c.stores.map((s) => s.store_id) })),
    }

    if (params.dryRun) {
      log.info("cycle.dry_run", { orgId, cycleNumber, ...contextSnapshot })
      return {
        cycleId: null,
        cycleNumber,
        status: "ready",
        suggestionsCreated: 0,
        clustersTotal: clusters.length,
        clustersFailed: 0,
      }
    }

    const { data: cycleRow, error: cycleErr } = await admin
      .from("campaign_cycles")
      .insert({
        org_id: orgId,
        number: cycleNumber,
        range_start: today,
        range_end: rangeEnd,
        status: "generating",
        triggered_by: triggeredBy,
        next_run_at: nextSundayRun(now).toISOString(),
        context: contextSnapshot,
      })
      .select("id")
      .single()
    if (cycleErr) throw cycleErr
    cycleId = cycleRow.id as string

    // Trends v2 — 1 chamada IA por cluster (país × nichos) com busca em
    // idioma local + cascata TrendTrack stub. Falha interna não aborta o
    // ciclo. Trends `risk_flag='high'` ficam no banco mas são filtradas
    // do contexto enviado pra IA da geração de sugestões (mostradas só
    // na UI com badge, COO decide).
    if (
      trends.length === 0 &&
      params.enableTrends !== false &&
      settings.trends_enabled !== false
    ) {
      // Agrupa nichos por país pra montar os clusters do trends.service
      const nichesByCountry = new Map<string, Set<string>>()
      for (const s of ctx.stores) {
        const c = s.country.toUpperCase()
        const set = nichesByCountry.get(c) ?? new Set<string>()
        if (s.niche) set.add(s.niche)
        nichesByCountry.set(c, set)
      }
      const trendClusters = Array.from(nichesByCountry.entries()).map(
        ([country, niches]) => ({ country, niches: Array.from(niches) }),
      )
      const captured = await captureTrends({
        orgId,
        cycleId,
        clusters: trendClusters,
      })
      // Filtra risk_flag='high' antes de injetar no prompt das sugestões
      trends = captured.filter((t) => t.risk_flag !== "high")
      await admin
        .from("campaign_cycles")
        .update({
          context: {
            ...contextSnapshot,
            trends_count: captured.length,
            trends_risk_high: captured.length - trends.length,
          },
        })
        .eq("id", cycleId)
    }

    const config = await loadAgentConfig(admin)
    if (!config) {
      await admin
        .from("campaign_cycles")
        .update({ status: "failed", error: "Config campaign_suggestion ausente/inativa" })
        .eq("id", cycleId)
      return {
        cycleId,
        cycleNumber,
        status: "failed",
        suggestionsCreated: 0,
        clustersTotal: clusters.length,
        clustersFailed: clusters.length,
        error: "Config campaign_suggestion ausente",
      }
    }

    const cycleRangeLabel = `${today} a ${rangeEnd}`
    const validStoreIds = new Set(ctx.stores.map((s) => s.store_id))
    const storeNameById = new Map(ctx.stores.map((s) => [s.store_id, s.store_name]))
    // NÃO usar um Map global store→país: com o fan-out uma loja pode estar
    // em 2 países e o Map colapsaria pro último. O país é derivado do
    // CLUSTER (single-country por construção em clusterStores).
    const dateIdByName = new Map(ctx.dates.map((d) => [d.name.toLowerCase(), d.id]))

    let suggestionsCreated = 0
    let clustersFailed = 0

    const tasks = clusters.map((cluster) => async () => {
      const vars = buildClusterVars({
        cycleRangeLabel,
        today,
        cluster,
        ctx,
        attention,
        benchmark,
        trends,
      })
      const t0 = Date.now()
      let runStatus: "completed" | "failed" | "invalid_output" = "completed"
      let errorMessage: string | null = null
      let rawOutput: string | null = null
      let parsedOutput: unknown = null
      let tokensIn = 0
      let tokensOut = 0
      let costCents = 0

      try {
        const result = await callAnthropicJson({
          model: config.model,
          system: config.system_prompt,
          user: renderTemplate(config.user_template, vars),
          maxTokens: config.max_tokens ?? 8192,
          temperature: config.temperature ?? 0.7,
          outputSchema:
            config.output_schema ?? { type: "object", required: ["suggestions"] },
        })
        rawOutput = result.rawText
        tokensIn = result.tokensInput
        tokensOut = result.tokensOutput
        costCents = result.costCents

        if (!result.parsed) {
          runStatus = "invalid_output"
          errorMessage = result.parseError ?? "Output sem JSON"
        } else {
          const validation = aiSuggestionsOutputSchema.safeParse(result.parsed)
          if (!validation.success) {
            runStatus = "invalid_output"
            errorMessage = validation.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          } else {
            parsedOutput = validation.data
            // Cluster é single-country (clusterStores agrupa por país):
            // o país do cluster vem do primeiro store ou do prefixo da key.
            const clusterCountry =
              cluster.stores[0]?.country ?? cluster.key.split(":")[0]
            const inserted = await persistSuggestions(admin, {
              orgId,
              cycleId: cycleId!,
              suggestions: validation.data.suggestions,
              validStoreIds,
              storeNameById,
              clusterCountry,
              dateIdByName,
            })
            suggestionsCreated += inserted
          }
        }
      } catch (err) {
        runStatus = "failed"
        errorMessage = err instanceof Error ? err.message : String(err)
      }

      await admin.from("campaign_ai_runs").insert({
        org_id: orgId,
        cycle_id: cycleId,
        kind: "suggestions",
        agent_config_id: config.id,
        model: config.model,
        status: runStatus,
        input_vars: { cluster: cluster.key, stores: cluster.stores.map((s) => s.store_id) },
        raw_output: rawOutput,
        parsed_output: parsedOutput,
        error_message: errorMessage,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        cost_cents: costCents,
        duration_ms: Date.now() - t0,
      })

      if (runStatus !== "completed") {
        clustersFailed += 1
        log.error("cycle.cluster_failed", { cluster: cluster.key, runStatus, errorMessage })
      }
    })

    await runWithConcurrency(
      tasks,
      settings.max_concurrent_clusters ?? DEFAULT_MAX_CONCURRENT_CLUSTERS,
    )

    const finalStatus: "ready" | "partial" | "failed" =
      clustersFailed === 0 ? "ready" : clustersFailed < clusters.length ? "partial" : "failed"

    await admin
      .from("campaign_cycles")
      .update({
        status: finalStatus,
        generated_at: new Date().toISOString(),
        error:
          clustersFailed > 0 ? `${clustersFailed}/${clusters.length} clusters falharam` : null,
      })
      .eq("id", cycleId)

    log.info("cycle.done", {
      orgId,
      cycleId,
      cycleNumber,
      finalStatus,
      suggestionsCreated,
      clustersFailed,
    })

    return {
      cycleId,
      cycleNumber,
      status: finalStatus,
      suggestionsCreated,
      clustersTotal: clusters.length,
      clustersFailed,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error("cycle.error", err)
    if (cycleId) {
      await admin
        .from("campaign_cycles")
        .update({ status: "failed", error: msg })
        .eq("id", cycleId)
    }
    return {
      cycleId,
      cycleNumber: null,
      status: "failed",
      suggestionsCreated: 0,
      clustersTotal: 0,
      clustersFailed: 0,
      error: msg,
    }
  } finally {
    await releaseLock(admin)
  }
}

async function persistSuggestions(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    orgId: string
    cycleId: string
    suggestions: AiSuggestion[]
    validStoreIds: Set<string>
    storeNameById: Map<string, string>
    /** País do cluster (single-country) — todos os targets herdam dele. */
    clusterCountry: string
    dateIdByName: Map<string, string>
  },
): Promise<number> {
  const rows = []
  for (const s of params.suggestions) {
    // Valida targets contra as lojas reais — descarta os inexistentes
    const targets = s.targets
      .filter((t) => params.validStoreIds.has(t.store_id))
      .map((t) => ({
        store_id: t.store_id,
        store_name: params.storeNameById.get(t.store_id) ?? t.store_name,
        country: params.clusterCountry ?? t.country,
      }))

    if (targets.length === 0) {
      log.warn("persist.suggestion_no_valid_targets", { title: s.title })
      continue
    }

    rows.push({
      org_id: params.orgId,
      cycle_id: params.cycleId,
      source: "ai",
      status: "suggested",
      type: s.type,
      title: s.title,
      confidence: Math.round(s.confidence),
      trigger: s.trigger,
      commemorative_date_id: s.commemorative_date_name
        ? (params.dateIdByName.get(s.commemorative_date_name.toLowerCase()) ?? null)
        : null,
      angle: s.angle,
      subject: s.subject,
      channel: s.channel || "Email",
      targets,
      target_summary: s.target_summary ?? null,
      est_revenue: s.est_revenue ?? null,
      low_perf: s.low_perf ?? false,
      send_date: s.send_date ?? null,
    })
  }

  if (rows.length === 0) return 0
  const { error } = await admin.from("campaign_suggestions").insert(rows)
  if (error) throw error
  return rows.length
}
