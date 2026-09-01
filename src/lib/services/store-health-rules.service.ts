/**
 * Leitura/gravação das regras do health score de loja na tabela
 * `settings` (key/value JSONB — zero migration, mesmo padrão do
 * implementation-flow). Defaults vivem em código; o banco só guarda o
 * override. Cache em memória com TTL curto porque o cron chama isto a
 * cada loja.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  DEFAULT_STORE_HEALTH_RULES,
  STORE_HEALTH_RULES_KEY,
  sanitizeStoreHealthRules,
  type StoreHealthRules,
} from "./store-health-rules"
import { logger } from "@/lib/logger"

const log = logger.child("StoreHealthRules")

let cache: StoreHealthRules | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 60 * 1000

export async function getStoreHealthRules(): Promise<StoreHealthRules> {
  const now = Date.now()
  if (cache && now < cacheExpiresAt) return cache

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", STORE_HEALTH_RULES_KEY)
      .maybeSingle()
    cache = sanitizeStoreHealthRules(data?.value)
  } catch (err) {
    // Regras não podem derrubar o cálculo do score — degrada pro default.
    log.warn("leitura falhou, usando defaults", {
      err: err instanceof Error ? err.message : String(err),
    })
    cache = DEFAULT_STORE_HEALTH_RULES
  }
  cacheExpiresAt = now + CACHE_TTL_MS
  return cache
}

export async function saveStoreHealthRules(input: unknown): Promise<StoreHealthRules> {
  const rules = sanitizeStoreHealthRules(input)
  const admin = createAdminClient()
  const { error } = await admin
    .from("settings")
    .upsert(
      { key: STORE_HEALTH_RULES_KEY, value: rules, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
  if (error) throw error
  cache = rules
  cacheExpiresAt = Date.now() + CACHE_TTL_MS
  return rules
}

export function clearStoreHealthRulesCache(): void {
  cache = null
  cacheExpiresAt = 0
}
