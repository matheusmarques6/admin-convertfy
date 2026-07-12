/**
 * Configuração runtime da Evolution API — env + tabela global `settings`.
 *
 * EVOLUTION_API_URL é SEMPRE da env (fixa por deploy). API key e webhook
 * secret podem vir do banco (row `evolution_integration` em `settings`,
 * cifrados via @/lib/crypto) com fallback para as envs EVOLUTION_API_KEY
 * e EVOLUTION_WEBHOOK_SECRET quando o banco não tem valor.
 *
 * Rotação de webhook secret: o secret anterior fica válido por 24h
 * (previous_webhook_secret_enc + previous_secret_until) para não derrubar
 * webhooks em trânsito enquanto o rewire dos canais acontece.
 *
 * Funções puras (resolve/build/validate) são exportadas para teste; o IO
 * (getEvolutionRuntimeConfig) tem cache module-level de 30s.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { isValidWebhookSecret } from "./evolution-content"

const log = logger.child("EvolutionSettings")

export const EVOLUTION_SETTINGS_KEY = "evolution_integration"

export interface EvolutionSettingsValue {
  api_key_enc?: string
  /** Display-only: "•••• a1b2" (já mascarado — nunca o valor). */
  api_key_last4?: string
  webhook_secret_enc?: string
  previous_webhook_secret_enc?: string
  /** ISO — até quando o secret anterior ainda é aceito no receiver. */
  previous_secret_until?: string
  updated_at?: string
  updated_by?: string
}

export interface EvolutionRuntimeConfig {
  baseUrl: string
  apiKey: string
  webhookSecret: string
  apiKeySource: "db" | "env"
  webhookSecretSource: "db" | "env"
  previousWebhookSecret: string | null
  previousSecretUntil: Date | null
}

// ─── Puros ────────────────────────────────────────────────────────

/** "sk-abcdef1234" → "•••• 1234". */
export function maskLast4(secret: string): string {
  return `•••• ${secret.slice(-4)}`
}

/**
 * Resolve a config efetiva: baseUrl SEMPRE da env; apiKey/webhookSecret
 * do banco (decifrados) com fallback pra env.
 *
 * Decisão documentada: retorna null quando falta QUALQUER um dos 3
 * (baseUrl, apiKey, webhookSecret) — mesma semântica do getEvolutionEnv
 * legado: sem o trio completo a integração não funciona.
 *
 * Falha de decrypt num campo não derruba o resolve — cai no fallback
 * env daquele campo (comportamento defensivo pra ciphertext corrompido).
 */
export function resolveEvolutionRuntimeConfig(
  env: { baseUrl?: string | null; apiKey?: string | null; webhookSecret?: string | null },
  value: EvolutionSettingsValue | null,
  decryptFn: (s: string) => string,
): EvolutionRuntimeConfig | null {
  const baseUrl = env.baseUrl?.replace(/\/+$/, "") || null
  if (!baseUrl) return null

  const safeDecrypt = (enc: string | undefined): string | null => {
    if (!enc) return null
    try {
      return decryptFn(enc) || null
    } catch {
      return null
    }
  }

  const dbApiKey = safeDecrypt(value?.api_key_enc)
  const dbWebhookSecret = safeDecrypt(value?.webhook_secret_enc)

  const apiKey = dbApiKey ?? env.apiKey ?? null
  const webhookSecret = dbWebhookSecret ?? env.webhookSecret ?? null
  if (!apiKey || !webhookSecret) return null

  const untilRaw = value?.previous_secret_until ? new Date(value.previous_secret_until) : null
  const previousSecretUntil = untilRaw && !Number.isNaN(untilRaw.getTime()) ? untilRaw : null

  return {
    baseUrl,
    apiKey,
    webhookSecret,
    apiKeySource: dbApiKey ? "db" : "env",
    webhookSecretSource: dbWebhookSecret ? "db" : "env",
    previousWebhookSecret: safeDecrypt(value?.previous_webhook_secret_enc),
    previousSecretUntil,
  }
}

const PREVIOUS_SECRET_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Monta o novo value da row após um PUT.
 *
 * IMPORTANTE (achados de revisão): a decisão de que o secret MUDOU é do
 * CALLER, por comparação de PLAINTEXT — ciphertext AES-GCM tem IV
 * aleatório e nunca repete, então comparar enc vs enc aqui seria sempre
 * "diferente". O caller só passa `updates.webhookSecretEnc` quando o
 * secret realmente mudou; re-submeter o mesmo secret NÃO toca em
 * previous_* (preserva uma janela de rotação em andamento).
 *
 * `rotation.previousSecretEnc` é o secret EFETIVO anterior cifrado —
 * inclusive quando ele vinha da ENV (primeira migração env→db também
 * ganha janela de graça de 24h; sem isso o secret da env morreria na
 * hora e canais com rewire falho quebrariam imediatamente).
 */
export function buildRotatedValue(
  current: EvolutionSettingsValue | null,
  updates: { apiKeyEnc?: string; apiKeyLast4?: string; webhookSecretEnc?: string },
  nowIso: string,
  userId: string,
  rotation?: { previousSecretEnc: string | null },
): EvolutionSettingsValue {
  const next: EvolutionSettingsValue = { ...(current ?? {}) }

  if (updates.apiKeyEnc) {
    next.api_key_enc = updates.apiKeyEnc
    if (updates.apiKeyLast4) next.api_key_last4 = updates.apiKeyLast4
  }

  if (updates.webhookSecretEnc) {
    const previousEnc = rotation?.previousSecretEnc ?? current?.webhook_secret_enc ?? null
    if (previousEnc) {
      next.previous_webhook_secret_enc = previousEnc
      next.previous_secret_until = new Date(
        new Date(nowIso).getTime() + PREVIOUS_SECRET_WINDOW_MS,
      ).toISOString()
    }
    next.webhook_secret_enc = updates.webhookSecretEnc
  }

  next.updated_at = nowIso
  next.updated_by = userId
  return next
}

/**
 * Valida o secret recebido no path do webhook: primeiro contra o atual;
 * se falhar, contra o anterior APENAS dentro da janela de rotação.
 */
export function isWebhookSecretValidFor(
  received: string,
  cfg: { webhookSecret: string | null; previousWebhookSecret: string | null; previousSecretUntil: Date | null },
  now: Date,
): boolean {
  if (isValidWebhookSecret(received, cfg.webhookSecret)) return true
  if (!cfg.previousWebhookSecret || !cfg.previousSecretUntil) return false
  if (cfg.previousSecretUntil.getTime() <= now.getTime()) return false
  return isValidWebhookSecret(received, cfg.previousWebhookSecret)
}

// ─── IO ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

let configCache: { value: EvolutionRuntimeConfig | null; expiresAt: number } | null = null

/** Limpa o cache (testes + pós-PUT da rota admin). */
export function clearEvolutionConfigCache(): void {
  configCache = null
}

/** Row crua de settings (para a rota admin montar metadata). */
export async function readEvolutionSettingsValue(
  admin: SupabaseClient,
): Promise<EvolutionSettingsValue | null> {
  const { data, error } = await admin
    .from("settings")
    .select("value")
    .eq("key", EVOLUTION_SETTINGS_KEY)
    .maybeSingle()
  if (error) {
    log.error("falha ao ler settings da Evolution", { message: error.message })
    return null
  }
  return (data?.value as EvolutionSettingsValue | null) ?? null
}

/**
 * Config efetiva (banco > env), com cache de 30s. Retorna null quando
 * a integração não está configurada (falta baseUrl, key ou secret).
 */
export async function getEvolutionRuntimeConfig(
  admin: SupabaseClient,
): Promise<EvolutionRuntimeConfig | null> {
  if (configCache && configCache.expiresAt > Date.now()) return configCache.value

  const value = await readEvolutionSettingsValue(admin)
  const cfg = resolveEvolutionRuntimeConfig(
    {
      baseUrl: process.env.EVOLUTION_API_URL ?? null,
      apiKey: process.env.EVOLUTION_API_KEY ?? null,
      webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET ?? null,
    },
    value,
    decrypt,
  )

  configCache = { value: cfg, expiresAt: Date.now() + CACHE_TTL_MS }
  return cfg
}
