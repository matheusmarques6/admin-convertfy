/**
 * Sincronização de feriados oficiais via Nager.Date API.
 *
 * API pública (sem chave) que cobre feriados oficiais (Public) de ~110
 * países, com datas móveis já calculadas (Easter, Mother's Day, etc).
 * Docs: https://date.nager.at/Api
 *
 * Como conversa com o catálogo:
 * - source='nager', year=ano específico (datas exatas, não recorrente)
 * - NÃO sobrescreve linhas source='manual' do mesmo (country, month_day)
 *   — a curadoria comercial prevalece sobre o feed oficial
 * - countryCode 'GB' do Nager é normalizado pra 'UK' (códigos do seed
 *   inicial). Suporta os 16 países do popover.
 *
 * O Nager cobre só feriados OFICIAIS. Datas comerciais (Black Friday,
 * Cyber Monday, Dia do Consumidor, Semana Brasil...) continuam sendo
 * curadas manualmente no seed da migration inicial.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("NagerSync")

const NAGER_BASE = "https://date.nager.at/api/v3"

interface NagerHoliday {
  date: string // YYYY-MM-DD
  localName: string
  name: string
  countryCode: string
  fixed: boolean
  global: boolean
  types: string[] // "Public", "Bank", "School", "Observance", "Authorities", "Optional"
}

/** Países do popover → countryCode aceito pela Nager API. */
const COUNTRY_TO_NAGER: Record<string, string> = {
  BR: "BR",
  US: "US",
  PT: "PT",
  ES: "ES",
  MX: "MX",
  AR: "AR",
  CO: "CO",
  CL: "CL",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  GB: "GB",
  UK: "GB", // back-compat: seed inicial usa UK
  CA: "CA",
  AU: "AU",
  JP: "JP",
}

/** countryCode da resposta Nager → código do nosso catálogo. */
const NAGER_TO_CATALOG: Record<string, string> = {
  BR: "BR",
  US: "US",
  PT: "PT",
  ES: "ES",
  MX: "MX",
  AR: "AR",
  CO: "CO",
  CL: "CL",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  GB: "UK", // Nager usa GB, nosso catálogo usa UK por causa do seed
  CA: "CA",
  AU: "AU",
  JP: "JP",
}

export interface NagerSyncResult {
  country: string
  year: number
  fetched: number
  inserted: number
  skipped_manual: number
  skipped_existing: number
  error?: string
}

async function fetchPublicHolidays(
  countryCode: string,
  year: number,
): Promise<NagerHoliday[]> {
  const url = `${NAGER_BASE}/PublicHolidays/${year}/${countryCode}`
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Cache 6h — feriados oficiais não mudam dia a dia
    next: { revalidate: 21_600 },
  })
  if (!res.ok) {
    throw new Error(`Nager ${countryCode}/${year} HTTP ${res.status}`)
  }
  return (await res.json()) as NagerHoliday[]
}

function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (/(christmas|natal|new year|ano novo|easter|páscoa|epifania)/.test(n)) return "seasonal"
  if (/(mother|father|valentine|namorado|amig|consumidor)/.test(n)) return "commercial"
  if (/(independence|labor|day of|liberty|libertad)/.test(n)) return "cultural"
  return "cultural"
}

/**
 * Sincroniza feriados oficiais pros países informados, nos anos
 * informados (default: ano corrente + próximo). Retorna telemetria por
 * (país × ano).
 */
export async function syncHolidaysFromNager(params: {
  countries: string[]
  years?: number[]
}): Promise<NagerSyncResult[]> {
  const admin = createAdminClient()
  const now = new Date()
  const years = params.years ?? [now.getUTCFullYear(), now.getUTCFullYear() + 1]

  // Distintos + mapeados pro Nager. Países sem suporte são pulados.
  const requests: Array<{ ourCode: string; nagerCode: string; year: number }> = []
  for (const c of new Set(params.countries.map((x) => x.toUpperCase()))) {
    const nagerCode = COUNTRY_TO_NAGER[c]
    if (!nagerCode) continue
    for (const y of years) requests.push({ ourCode: c, nagerCode, year: y })
  }

  // Pré-carrega o que já existe no catálogo pra esses países (qualquer
  // ano OU recorrente), pra decidir skip vs insert sem N+1.
  const ourCodes = Array.from(new Set(requests.map((r) => NAGER_TO_CATALOG[r.nagerCode] ?? r.ourCode)))
  const { data: existingRaw } = await admin
    .from("commemorative_dates")
    .select("country, month_day, year, source")
    .in("country", ourCodes.length > 0 ? ourCodes : ["BR"])

  // chave: country|month_day → { hasManual, years: Set<number|null> }
  const existing = new Map<string, { hasManual: boolean; years: Set<number | null> }>()
  for (const e of existingRaw ?? []) {
    const key = `${e.country}|${e.month_day}`
    const entry = existing.get(key) ?? { hasManual: false, years: new Set<number | null>() }
    if ((e.source as string) === "manual") entry.hasManual = true
    entry.years.add((e.year as number | null) ?? null)
    existing.set(key, entry)
  }

  const results: NagerSyncResult[] = []

  for (const { ourCode, nagerCode, year } of requests) {
    const catalogCountry = NAGER_TO_CATALOG[nagerCode] ?? ourCode
    const result: NagerSyncResult = {
      country: catalogCountry,
      year,
      fetched: 0,
      inserted: 0,
      skipped_manual: 0,
      skipped_existing: 0,
    }
    try {
      const holidays = await fetchPublicHolidays(nagerCode, year)
      const publicOnly = holidays.filter((h) => h.types?.includes("Public"))
      result.fetched = publicOnly.length

      const rows: Array<Record<string, unknown>> = []
      for (const h of publicOnly) {
        const monthDay = h.date.slice(5) // 'MM-DD'
        const key = `${catalogCountry}|${monthDay}`
        const entry = existing.get(key)

        // Curadoria comercial (manual) prevalece — nem sobrescreve nem
        // duplica. Notícia: Christmas, New Year etc. já estão no seed
        // BR/US como manual, e ficam intocados.
        if (entry?.hasManual) {
          result.skipped_manual++
          continue
        }
        // Já existe row do Nager pra mesmo (country, month_day, year)
        if (entry?.years.has(year)) {
          result.skipped_existing++
          continue
        }

        rows.push({
          country: catalogCountry,
          month_day: monthDay,
          year,
          name: h.localName || h.name,
          impact: "med",
          category: inferCategory(h.name),
          note: h.localName !== h.name ? `${h.name} · ${h.localName}` : h.name,
          tips: [],
          best_campaign_types: [],
          is_active: true,
          source: "nager",
          external_id: `nager:${nagerCode}:${h.date}`,
        })

        // Atualiza o cache local pra evitar dupes no mesmo run
        const ent = entry ?? { hasManual: false, years: new Set<number | null>() }
        ent.years.add(year)
        existing.set(key, ent)
      }

      if (rows.length > 0) {
        const { error } = await admin.from("commemorative_dates").insert(rows)
        if (error) throw error
        result.inserted = rows.length
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
      log.warn("nager.country_failed", { country: ourCode, year, error: result.error })
    }
    results.push(result)
  }

  log.info("nager.sync_done", {
    requests: requests.length,
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    skipped_manual: results.reduce((s, r) => s + r.skipped_manual, 0),
    failed: results.filter((r) => r.error).length,
  })
  return results
}

/**
 * Sincroniza só os países onde a org tem loja ativa com Omnisend.
 * Helper pro endpoint /sync-holidays e pro cron anual.
 */
export async function syncHolidaysForOrg(orgId: string, years?: number[]): Promise<NagerSyncResult[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("client_stores")
    .select("country")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("omnisend_api_key", "is", null)
    .not("country", "is", null)
  if (error) throw error

  const countries = Array.from(
    new Set((data ?? []).map((s) => (s.country as string).toUpperCase())),
  )
  if (countries.length === 0) return []
  return syncHolidaysFromNager({ countries, years })
}
