/**
 * Guard-rail de custo diário da ConvertIA — limite POR USUÁRIO, por
 * dia (América/São Paulo), somando o que já foi gasto hoje em
 * `ai_usage_events` (feature 'convertia', cost_cents em centavos de
 * USD — as rotas passam o custo REAL do OpenRouter quando ele vem).
 *
 * Config zero-migration na tabela `settings` (key 'convertia_limits',
 * mesmo padrão de store_health_rules): override do default de código
 * sem deploy. Cache em memória de 60s — o guard roda a cada mensagem.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaLimits")

export const CONVERTIA_LIMITS_KEY = "convertia_limits"

/** Default: US$ 5,00/dia por usuário (500 centavos). */
export const DEFAULT_DAILY_USER_COST_CENTS = 500

export interface ConvertiaLimits {
  daily_user_cost_cents: number
}

function sanitizeLimits(input: unknown): ConvertiaLimits {
  const raw = (input ?? {}) as Record<string, unknown>
  const cents = Number(raw.daily_user_cost_cents)
  return {
    daily_user_cost_cents:
      Number.isFinite(cents) && cents > 0
        ? Math.min(Math.round(cents), 1_000_000)
        : DEFAULT_DAILY_USER_COST_CENTS,
  }
}

let cache: ConvertiaLimits | null = null
let cacheExpiresAt = 0

/** Invalida o cache desta instância (a rota PUT chama ao salvar). */
export function resetConvertiaLimitsCache(): void {
  cache = null
  cacheExpiresAt = 0
}

export async function getConvertiaLimits(): Promise<ConvertiaLimits> {
  const now = Date.now()
  if (cache && now < cacheExpiresAt) return cache
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", CONVERTIA_LIMITS_KEY)
      .maybeSingle()
    cache = sanitizeLimits(data?.value)
  } catch (err) {
    // Limite não pode derrubar o chat — degrada pro default.
    log.warn("limits.load_failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    cache = sanitizeLimits(null)
  }
  cacheExpiresAt = now + 60_000
  return cache
}

/**
 * Início do dia corrente em América/São Paulo (UTC-3 fixo — o Brasil
 * não tem mais horário de verão desde 2019), como ISO UTC.
 */
export function saoPauloDayStartIso(now: Date = new Date()): string {
  const spNow = new Date(now.getTime() - 3 * 3_600_000)
  const y = spNow.getUTCFullYear()
  const m = String(spNow.getUTCMonth() + 1).padStart(2, "0")
  const d = String(spNow.getUTCDate()).padStart(2, "0")
  // 00:00 em SP = 03:00 UTC
  return `${y}-${m}-${d}T03:00:00.000Z`
}

/** Soma (centavos USD) gasta HOJE pelo usuário na ConvertIA. */
export async function getConvertiaUsageTodayCents(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from("ai_usage_events")
      .select("cost_cents")
      .eq("feature", "convertia")
      .eq("user_id", userId)
      .gte("created_at", saoPauloDayStartIso())
      .limit(2000)
    if (error) throw error
    let total = 0
    for (const row of data ?? []) total += Number(row.cost_cents) || 0
    return total
  } catch (err) {
    // Falha de leitura NUNCA bloqueia o usuário — assume 0.
    log.warn("usage.read_failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

export interface ConvertiaBudget {
  today_cost_cents: number
  daily_limit_cents: number
  exceeded: boolean
}

export async function getConvertiaBudget(
  admin: SupabaseClient,
  userId: string,
): Promise<ConvertiaBudget> {
  const [limits, spent] = await Promise.all([
    getConvertiaLimits(),
    getConvertiaUsageTodayCents(admin, userId),
  ])
  return {
    today_cost_cents: Math.round(spent * 100) / 100,
    daily_limit_cents: limits.daily_user_cost_cents,
    exceeded: spent >= limits.daily_user_cost_cents,
  }
}
