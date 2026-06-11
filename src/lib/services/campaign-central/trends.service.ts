/**
 * Trends ("Temas em alta") v2 — captura por CLUSTER (país × nichos)
 * com cascata TrendTrack → Web Search em idioma local.
 *
 * Fluxo por cluster:
 *   1. captureFromTrendtrack  (stub fase 1; ativa quando TRENDTRACK_API_KEY)
 *   2. captureFromWebSearch   sempre, na language local do país
 *   3. Pós-processamento determinístico:
 *      - filtro de risco (palavras-chave)
 *      - exclui títulos que duplicam datas comerciais já em commemorative_dates
 *      - dedup entre clusters por (normalize(title), country)
 *
 * Falha em um cluster NÃO aborta o ciclo — trends é enriquecimento. Cada
 * chamada IA gera 1 row em campaign_ai_runs (kind='trends').
 *
 * Web search é incompatível com structured outputs (citations), então
 * JSON é instruído no prompt e parseado manualmente.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { callAnthropicWithWebSearch } from "./anthropic-client"
import { aiTrendsOutputSchema, type AiTrend } from "@/lib/validations/campaign-central"
import type { CampaignTrend } from "@/types/campaign-central"
import { getSearchLocale } from "@/lib/constants/country-search-language"
import { evaluateRisk } from "@/lib/constants/risk-keywords"
import { captureFromTrendtrack } from "./trendtrack.service"

const log = logger.child("CampaignTrends")

const TRENDS_MODEL = "claude-sonnet-4-6"

export type TrendInput = Pick<
  CampaignTrend,
  | "title"
  | "source"
  | "delta_label"
  | "tag"
  | "niche"
  | "country"
  | "category"
  | "commercial_potential"
  | "urgency"
  | "risk_flag"
  | "risk_reason"
  | "campaign_angle"
  | "fetched_via"
>

export interface ClusterParams {
  country: string
  niches: string[]
}

const SYSTEM_PROMPT_V2 = `You are a consumer trends analyst for e-commerce email marketing.
Your task: identify viral/cultural/social/sports trends in ONE country that e-commerce stores can ride in email campaigns within the next 2-4 weeks.

CRITICAL RULES:
1. SEARCH IN THE LOCAL LANGUAGE provided ({{search_language}}). Use the query hints as starting points.
2. DO NOT INCLUDE COMMERCIAL DATES already covered by the internal calendar: {{excluded_dates}}. We already handle Black Friday, Mother's Day, Valentine's Day, Cyber Monday, Christmas, Dia do Consumidor, Independence Day, etc. Focus on what is NOT in that list.
3. Focus on: cultural events (festivals, religious holidays not in the list), sports (championships, finals, derbies), social/viral trends (TikTok, Instagram, memes, aesthetics), trending products/categories of the moment.
4. NEVER return news without a clear campaign angle ("nothing to sell on top of a tragedy").

FOR EACH TREND, ASSIGN:
- "category": consumo | cultural | esportivo | social | viral | outros
- "commercial_potential" (0-100):
    80-100 = directly turns into a product offer ("gift kit", "limited edition")
    50-79  = emotional/storytelling angle ("share the moment", "celebrate together")
    0-49   = low campaign value, only contextual
- "urgency": week (next 7 days) | month (next 30 days) | quarter (next 90 days)
- "campaign_angle": 1-2 sentences on HOW to ride this trend in email (offer, copy hook, segmentation)
- "evidence": up to 3 items {url, title, quote} from sources you actually visited
- "delta_label": qualitative magnitude when source cites it (e.g. "+180%"). Without a number, use "rising", "viral", "trending".
- "source": where the signal comes from (Google Trends, TikTok, press name, etc.)

OUTPUT: ONLY valid JSON in the format:
{"trends": [{"title", "category", "source", "delta_label", "tag", "niche", "country", "commercial_potential", "urgency", "campaign_angle", "evidence": [{"url", "title", "quote"}]}]}
No markdown, no text before or after. Between 3 and 6 trends. Quality > quantity.`

interface CaptureCycleParams {
  orgId: string
  cycleId: string
  clusters: ClusterParams[]
}

/**
 * Carrega nomes de datas comerciais ativas pros países do ciclo, pra IA
 * NÃO devolver "Black Friday" como trend (já vive em commemorative_dates).
 */
async function loadExcludedDateNames(countries: string[]): Promise<Map<string, string[]>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("commemorative_dates")
    .select("country, name")
    .in("country", countries.length > 0 ? countries : ["BR"])
    .eq("is_active", true)
  if (error) {
    log.warn("trends.excluded_dates_failed", { error: error.message })
    return new Map()
  }
  const byCountry = new Map<string, string[]>()
  for (const d of data ?? []) {
    const c = d.country as string
    const arr = byCountry.get(c) ?? []
    arr.push(d.name as string)
    byCountry.set(c, arr)
  }
  return byCountry
}

function buildUserPrompt(params: {
  country: string
  niches: string[]
  excludedDates: string[]
  searchLanguage: string
  hints: string[]
}): string {
  return [
    `COUNTRY: ${params.country}`,
    `SEARCH IN: ${params.searchLanguage}`,
    `Query hints (use these as starting points, adapt as needed): ${params.hints.join(" | ")}`,
    ``,
    `STORE NICHES IN THIS CLUSTER: ${params.niches.length > 0 ? params.niches.join(", ") : "general e-commerce"}`,
    `TODAY: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Capture trends for this country following the system rules. Output JSON only.`,
  ].join("\n")
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacritics
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Levenshtein simples (sem dependência externa). Limitado a strings
 * curtas — usamos só pra dedup de títulos de trends.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = a.length
  const n = b.length
  let prev = new Array(n + 1).fill(0)
  let curr = new Array(n + 1).fill(0)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** Match fuzzy: título do trend bate com nome de data comemorativa. */
function matchesExcludedDate(title: string, excluded: string[]): boolean {
  const norm = normalizeTitle(title)
  for (const d of excluded) {
    const nd = normalizeTitle(d)
    if (norm === nd) return true
    if (norm.includes(nd) || nd.includes(norm)) return true
    // Fuzzy só pra títulos curtos (evita falso-positivo em strings longas)
    if (Math.min(norm.length, nd.length) >= 6 && levenshtein(norm, nd) <= 2) return true
  }
  return false
}

/**
 * Captura via web search em idioma local. Retorna TrendInput[] ainda
 * SEM filtro de risco/calendário (aplicados depois).
 */
async function captureFromWebSearch(params: {
  cluster: ClusterParams
  excludedDates: string[]
}): Promise<{
  trends: AiTrend[]
  rawText: string
  tokensIn: number
  tokensOut: number
  costCents: number
  parseError: string | null
}> {
  const locale = getSearchLocale(params.cluster.country)
  const system = SYSTEM_PROMPT_V2.replace("{{search_language}}", locale.name).replace(
    "{{excluded_dates}}",
    params.excludedDates.length > 0
      ? params.excludedDates.join(", ")
      : "(none — no commercial calendar overlap)",
  )
  const user = buildUserPrompt({
    country: params.cluster.country,
    niches: params.cluster.niches,
    excludedDates: params.excludedDates,
    searchLanguage: locale.name,
    hints: locale.hints,
  })

  const result = await callAnthropicWithWebSearch({
    model: TRENDS_MODEL,
    system,
    user,
    maxTokens: 4096,
    temperature: 0.6,
    maxSearches: 5,
  })

  if (!result.parsed) {
    return {
      trends: [],
      rawText: result.rawText,
      tokensIn: result.tokensInput,
      tokensOut: result.tokensOutput,
      costCents: result.costCents,
      parseError: result.parseError ?? "Output sem JSON",
    }
  }

  const validation = aiTrendsOutputSchema.safeParse(result.parsed)
  if (!validation.success) {
    return {
      trends: [],
      rawText: result.rawText,
      tokensIn: result.tokensInput,
      tokensOut: result.tokensOutput,
      costCents: result.costCents,
      parseError: validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    }
  }
  return {
    trends: validation.data.trends,
    rawText: result.rawText,
    tokensIn: result.tokensInput,
    tokensOut: result.tokensOutput,
    costCents: result.costCents,
    parseError: null,
  }
}

/**
 * Aplica pós-processamento determinístico:
 *  - filtro de risco
 *  - exclui títulos que duplicam datas comerciais
 *  - garante country no row (default = country do cluster)
 *  - marca fetched_via
 */
export function postprocessTrends(params: {
  trends: AiTrend[]
  country: string
  excludedDates: string[]
  fetchedVia: "trendtrack" | "web_search" | "manual"
}): TrendInput[] {
  const out: TrendInput[] = []
  for (const t of params.trends) {
    if (matchesExcludedDate(t.title, params.excludedDates)) continue
    const riskInput = [t.title, t.tag ?? "", t.campaign_angle ?? "", t.source ?? ""]
      .filter(Boolean)
      .join(" · ")
    const risk = evaluateRisk(riskInput)
    out.push({
      title: t.title,
      source: t.source ?? null,
      delta_label: t.delta_label ?? null,
      tag: t.tag ?? null,
      niche: t.niche ?? null,
      country: (t.country ?? params.country).toUpperCase(),
      category: t.category ?? "outros",
      commercial_potential: t.commercial_potential ?? null,
      urgency: t.urgency ?? null,
      risk_flag: risk.flag,
      risk_reason: risk.reason,
      campaign_angle: t.campaign_angle ?? null,
      fetched_via: params.fetchedVia,
    })
  }
  return out
}

/** Dedup entre clusters: mantém a primeira ocorrência por (normalize(title), country). */
export function dedupeTrends(trends: TrendInput[]): TrendInput[] {
  const seen = new Set<string>()
  const out: TrendInput[] = []
  for (const t of trends) {
    const key = `${normalizeTitle(t.title)}|${t.country ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/**
 * Captura trends pra TODOS os clusters do ciclo. 1 chamada IA por cluster
 * (web search). Persiste em campaign_trends e devolve a lista mergeada.
 */
export async function captureTrends(params: CaptureCycleParams): Promise<TrendInput[]> {
  const admin = createAdminClient()
  const { orgId, cycleId, clusters } = params
  const countries = Array.from(new Set(clusters.map((c) => c.country.toUpperCase())))
  const excludedByCountry = await loadExcludedDateNames(countries)

  const collected: TrendInput[] = []

  for (const cluster of clusters) {
    const country = cluster.country.toUpperCase()
    const excludedDates = excludedByCountry.get(country) ?? []

    // 1. TrendTrack stub (futuro: fonte primária)
    let fromTt: TrendInput[] = []
    try {
      const ttRaw = await captureFromTrendtrack({
        country,
        niches: cluster.niches,
      })
      fromTt = ttRaw
    } catch (err) {
      log.warn("trends.trendtrack_failed", {
        cluster: country,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // 2. Web search SEMPRE (até TrendTrack devolver volume suficiente)
    const t0 = Date.now()
    let raw: string | null = null
    let runStatus: "completed" | "failed" | "invalid_output" = "completed"
    let errorMessage: string | null = null
    let tokensIn = 0
    let tokensOut = 0
    let costCents = 0
    let fromWeb: TrendInput[] = []

    try {
      const ws = await captureFromWebSearch({ cluster, excludedDates })
      raw = ws.rawText
      tokensIn = ws.tokensIn
      tokensOut = ws.tokensOut
      costCents = ws.costCents
      if (ws.parseError) {
        runStatus = "invalid_output"
        errorMessage = ws.parseError
      } else {
        fromWeb = postprocessTrends({
          trends: ws.trends,
          country,
          excludedDates,
          fetchedVia: "web_search",
        })
      }
    } catch (err) {
      runStatus = "failed"
      errorMessage = err instanceof Error ? err.message : String(err)
      log.warn("trends.web_search_failed", {
        cluster: country,
        error: errorMessage,
      })
    }

    await admin.from("campaign_ai_runs").insert({
      org_id: orgId,
      cycle_id: cycleId,
      kind: "trends",
      model: TRENDS_MODEL,
      status: runStatus,
      input_vars: {
        country,
        niches: cluster.niches,
        search_language: getSearchLocale(country).name,
        excluded_count: excludedDates.length,
      },
      raw_output: raw,
      parsed_output: fromWeb.length > 0 ? { trends: fromWeb } : null,
      error_message: errorMessage,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_cents: costCents,
      duration_ms: Date.now() - t0,
    })

    collected.push(...fromTt, ...fromWeb)
  }

  // Dedup entre clusters
  const final = dedupeTrends(collected)
  if (final.length > 0) {
    const rows = final.map((t) => ({
      org_id: orgId,
      cycle_id: cycleId,
      title: t.title,
      source: t.source,
      delta_label: t.delta_label,
      tag: t.tag,
      niche: t.niche,
      country: t.country,
      category: t.category,
      commercial_potential: t.commercial_potential,
      urgency: t.urgency,
      risk_flag: t.risk_flag,
      risk_reason: t.risk_reason,
      campaign_angle: t.campaign_angle,
      fetched_via: t.fetched_via,
      evidence: [],
    }))
    const { error } = await admin.from("campaign_trends").insert(rows)
    if (error) {
      log.warn("trends.insert_failed", { error: error.message })
    }
  }

  log.info("trends.cycle_done", {
    cycleId,
    clusters: clusters.length,
    captured: collected.length,
    deduped: final.length,
    risk_high: final.filter((t) => t.risk_flag === "high").length,
  })
  return final
}
