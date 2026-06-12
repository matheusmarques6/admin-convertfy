/**
 * Montagem do contexto do ciclo da Central de Campanhas.
 *
 * REGRA (decisão de produto, jun/2026): lê EXCLUSIVAMENTE tabelas locais,
 * já mantidas frescas pelos crons sync-omnisend (30min), sync-reports
 * (30min), crm-health-compute (diário) e store-alerts-check (semanal).
 * ZERO requisições a APIs externas aqui.
 *
 * Plataforma de email = SOMENTE Omnisend: lojas elegíveis têm
 * omnisend_api_key; receita usa colunas omnisend_* de
 * store_revenue_summary.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCycleContext")

const DEFAULT_DATE_WINDOW_DAYS = 25

export interface CycleStoreContext {
  store_id: string
  store_name: string
  country: string
  language: string
  niche: string | null
  health_score: number | null
  revenue_30d: number
  revenue_7d: number
  revenue_delta_pct: number | null
  currency: string | null
  tone: string | null
  positioning: string | null
}

export interface CycleDateContext {
  id: string
  country: string
  date: string // YYYY-MM-DD resolvido pro ano corrente/próximo
  in_days: number
  name: string
  impact: string
  category: string | null
  note: string | null
  best_campaign_types: string[]
}

export interface CycleContext {
  stores: CycleStoreContext[]
  dates: CycleDateContext[]
  countries: string[]
}

/** Resolve 'MM-DD' (+year opcional) pra próxima ocorrência a partir de `from`. */
export function resolveNextOccurrence(
  monthDay: string,
  year: number | null,
  from: Date,
): Date | null {
  const [mm, dd] = monthDay.split("-").map(Number)
  if (!mm || !dd) return null
  if (year) {
    const d = new Date(Date.UTC(year, mm - 1, dd))
    return d.getTime() >= startOfUtcDay(from).getTime() ? d : null
  }
  const thisYear = new Date(Date.UTC(from.getUTCFullYear(), mm - 1, dd))
  if (thisYear.getTime() >= startOfUtcDay(from).getTime()) return thisYear
  return new Date(Date.UTC(from.getUTCFullYear() + 1, mm - 1, dd))
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime()) / 86_400_000)
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Normaliza país pro formato do catálogo (BR/US/PT/UK/ES). */
export function normalizeCountry(raw: string | null | undefined): string {
  const v = (raw || "BR").trim().toUpperCase()
  const map: Record<string, string> = {
    BRASIL: "BR",
    BRAZIL: "BR",
    "ESTADOS UNIDOS": "US",
    EUA: "US",
    USA: "US",
    "UNITED STATES": "US",
    PORTUGAL: "PT",
    "REINO UNIDO": "UK",
    "UNITED KINGDOM": "UK",
    GB: "UK",
    ESPANHA: "ES",
    SPAIN: "ES",
  }
  if (v.length === 2 && !map[v]) return v
  return map[v] || "BR"
}

/** Forma mínima de uma linha de client_stores usada no fan-out. */
export interface StoreRow {
  id: string
  store_name?: string | null
  country?: string | null
  countries?: string[] | null
  language?: string | null
  niche?: string | null
  health_score?: number | null
  currency?: string | null
}

/**
 * FAN-OUT por país. Cada loja vira UMA `CycleStoreContext` por país em
 * `countries` (fallback: `[country]` quando a lista estiver vazia/null).
 * Assim a loja entra no cluster de cada país e recebe datas + sugestões
 * para todos. `country` é sempre normalizado.
 */
export function expandStoreContexts(
  stores: StoreRow[],
  revenueByStore: Map<string, { d7: number; d30: number }>,
  briefingByStore: Map<string, Record<string, unknown>>,
): CycleStoreContext[] {
  return stores.flatMap((s) => {
    const rev = revenueByStore.get(s.id) ?? { d7: 0, d30: 0 }
    // Delta: 7d projetado vs média semanal dos 30d — sinal de tendência
    const weeklyAvg30 = rev.d30 / (30 / 7)
    const delta = weeklyAvg30 > 0 ? ((rev.d7 - weeklyAvg30) / weeklyAvg30) * 100 : null

    const briefing = briefingByStore.get(s.id)
    const marca = (briefing?.marca ?? {}) as Record<string, unknown>

    const base = {
      store_id: s.id,
      store_name: s.store_name ?? "",
      language: s.language ?? "pt-BR",
      niche: (s.niche ?? null) ?? ((marca.nicho as string) || null),
      health_score: s.health_score ?? null,
      revenue_30d: rev.d30,
      revenue_7d: rev.d7,
      revenue_delta_pct: delta != null ? Math.round(delta) : null,
      currency: s.currency ?? null,
      tone: (marca.tom_voz as string) || (marca.tomDeVoz as string) || null,
      positioning: (marca.posicionamento as string) || null,
    }

    const rawCountries =
      Array.isArray(s.countries) && s.countries.length ? s.countries : [s.country]

    // Normaliza, deduplica e garante ao menos uma entrada (default BR).
    const seen = new Set<string>()
    const countries: string[] = []
    for (const c of rawCountries) {
      const norm = normalizeCountry(c)
      if (!seen.has(norm)) {
        seen.add(norm)
        countries.push(norm)
      }
    }
    if (countries.length === 0) countries.push(normalizeCountry(null))

    return countries.map((country) => ({ ...base, country }))
  })
}

/**
 * Carrega lojas elegíveis (ativas + Omnisend) com briefing e receita.
 */
export async function loadCycleContext(
  orgId: string,
  now = new Date(),
  windowDays = DEFAULT_DATE_WINDOW_DAYS,
): Promise<CycleContext> {
  const admin = createAdminClient()

  const { data: storesRaw, error: storesErr } = await admin
    .from("client_stores")
    .select("id, store_name, country, countries, language, niche, health_score, currency, is_active, omnisend_api_key")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("omnisend_api_key", "is", null)

  if (storesErr) throw storesErr
  const stores = storesRaw ?? []
  if (stores.length === 0) {
    log.warn("context.no_eligible_stores", { orgId })
    return { stores: [], dates: [], countries: [] }
  }

  const storeIds = stores.map((s) => s.id as string)

  const [revenueRes, briefingsRes] = await Promise.all([
    admin
      .from("store_revenue_summary")
      .select("store_id, period_label, omnisend_total_revenue")
      .in("store_id", storeIds)
      .in("period_label", ["7d", "30d"]),
    admin
      .from("store_briefings")
      .select("store_id, briefing_data, created_at")
      .in("store_id", storeIds)
      .eq("status", "current"),
  ])

  if (revenueRes.error) throw revenueRes.error
  if (briefingsRes.error) throw briefingsRes.error

  const revenueByStore = new Map<string, { d7: number; d30: number }>()
  for (const r of revenueRes.data ?? []) {
    const sid = r.store_id as string
    const entry = revenueByStore.get(sid) ?? { d7: 0, d30: 0 }
    const v = Number(r.omnisend_total_revenue ?? 0)
    if (r.period_label === "7d") entry.d7 = v
    else if (r.period_label === "30d") entry.d30 = v
    revenueByStore.set(sid, entry)
  }

  const briefingByStore = new Map<string, Record<string, unknown>>()
  for (const b of briefingsRes.data ?? []) {
    // status='current' deve ser único por loja; em empate fica o último lido
    briefingByStore.set(b.store_id as string, (b.briefing_data ?? {}) as Record<string, unknown>)
  }

  const storeContexts = expandStoreContexts(
    stores as unknown as StoreRow[],
    revenueByStore,
    briefingByStore,
  )

  const countries = Array.from(new Set(storeContexts.map((s) => s.country)))

  // Datas na janela de 25 dias, só dos países das lojas
  const { data: datesRaw, error: datesErr } = await admin
    .from("commemorative_dates")
    .select("id, country, month_day, year, name, impact, category, note, best_campaign_types")
    .in("country", countries.length > 0 ? countries : ["BR"])
    .eq("is_active", true)

  if (datesErr) throw datesErr

  const dates: CycleDateContext[] = []
  for (const d of datesRaw ?? []) {
    const next = resolveNextOccurrence(d.month_day as string, (d.year as number | null) ?? null, now)
    if (!next) continue
    const inDays = daysBetween(now, next)
    if (inDays < 0 || inDays > windowDays) continue
    dates.push({
      id: d.id as string,
      country: d.country as string,
      date: toIsoDate(next),
      in_days: inDays,
      name: d.name as string,
      impact: d.impact as string,
      category: (d.category as string | null) ?? null,
      note: (d.note as string | null) ?? null,
      best_campaign_types: (d.best_campaign_types as string[]) ?? [],
    })
  }
  dates.sort((a, b) => a.in_days - b.in_days)

  return { stores: storeContexts, dates, countries }
}

/**
 * Agrupa lojas em clusters por (país, nicho aproximado) — 1 chamada IA
 * por cluster. Lojas sem nicho caem num cluster "geral" do país.
 */
export function clusterStores(
  stores: CycleStoreContext[],
  maxPerCluster = 6,
): Array<{ key: string; stores: CycleStoreContext[] }> {
  const groups = new Map<string, CycleStoreContext[]>()
  for (const s of stores) {
    const nicheKey = (s.niche || "geral").toLowerCase().trim().split(/\s+/)[0]
    const key = `${s.country}:${nicheKey}`
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }

  // Merge de clusters de 1 loja do mesmo país no cluster "geral" do país
  const merged = new Map<string, CycleStoreContext[]>()
  for (const [key, arr] of groups) {
    const [country] = key.split(":")
    if (arr.length === 1) {
      const generalKey = `${country}:geral`
      const g = merged.get(generalKey) ?? []
      g.push(...arr)
      merged.set(generalKey, g)
    } else {
      merged.set(key, [...(merged.get(key) ?? []), ...arr])
    }
  }

  // Split de clusters grandes
  const result: Array<{ key: string; stores: CycleStoreContext[] }> = []
  for (const [key, arr] of merged) {
    for (let i = 0; i < arr.length; i += maxPerCluster) {
      const chunk = arr.slice(i, i + maxPerCluster)
      result.push({ key: i === 0 ? key : `${key}:${i / maxPerCluster + 1}`, stores: chunk })
    }
  }
  return result
}
