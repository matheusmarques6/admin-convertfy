/**
 * GET/PUT /api/admin/settings/evolution
 *
 * Configuração write-only da Evolution API (WhatsApp QR / Baileys):
 * EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SECRET passam a poder vir da
 * tabela global `settings` (key `evolution_integration`), cifradas via
 * AES-256-GCM. A URL do servidor é FIXA na env (EVOLUTION_API_URL).
 *
 * Segurança:
 *  - GET devolve APENAS metadata (configured/last4/source) — nunca valores
 *  - PUT exige admin/super_admin de profile, valida a key com prova real
 *    contra a Evolution (fetchInstances) antes de salvar e re-aponta os
 *    webhooks de todos os canais evolution ativos quando o secret muda
 *  - Rotação de secret mantém o anterior válido por 24h no receiver
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { checkRateLimit } from "@/lib/rate-limit"
import { decrypt, encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { appUrl } from "@/lib/whatsapp/queue"
import { createEvolutionClient, EvolutionAPIError, verifyEvolutionApiKey } from "@/lib/whatsapp/evolution-api"
import {
  EVOLUTION_SETTINGS_KEY,
  buildRotatedValue,
  clearEvolutionConfigCache,
  maskLast4,
  readEvolutionSettingsValue,
  type EvolutionSettingsValue,
} from "@/lib/whatsapp/evolution-settings"

const log = logger.child("EvolutionSettingsRoute")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// PUT pode re-apontar o webhook de N canais em série (com retry do
// client) — sem teto maior a função estoura antes de devolver o rewire.
export const maxDuration = 60

async function requireGlobalAdmin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    throw new AppError("Acesso negado", 403, "FORBIDDEN")
  }
}

interface EvolutionSettingsMetadata {
  base_url_configured: boolean
  api_key: { configured: boolean; last4: string | null; source: "db" | "env" | null }
  webhook_secret: { configured: boolean; source: "db" | "env" | null }
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

async function buildMetadata(
  admin: ReturnType<typeof createAdminClient>,
  value: EvolutionSettingsValue | null,
): Promise<EvolutionSettingsMetadata> {
  let updatedByName: string | null = null
  if (value?.updated_by) {
    const { data } = await admin
      .from("profiles")
      .select("name, email")
      .eq("id", value.updated_by)
      .maybeSingle()
    updatedByName = (data?.name as string | null) ?? (data?.email as string | null) ?? null
  }

  return {
    base_url_configured: Boolean(process.env.EVOLUTION_API_URL),
    api_key: {
      configured: Boolean(value?.api_key_enc || process.env.EVOLUTION_API_KEY),
      last4: value?.api_key_last4 ?? null,
      source: value?.api_key_enc ? "db" : process.env.EVOLUTION_API_KEY ? "env" : null,
    },
    webhook_secret: {
      configured: Boolean(value?.webhook_secret_enc || process.env.EVOLUTION_WEBHOOK_SECRET),
      source: value?.webhook_secret_enc ? "db" : process.env.EVOLUTION_WEBHOOK_SECRET ? "env" : null,
    },
    updated_at: value?.updated_at ?? null,
    updated_by: value?.updated_by ?? null,
    updated_by_name: updatedByName,
  }
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await requireGlobalAdmin(admin, user.id)

    const value = await readEvolutionSettingsValue(admin)
    return successResponse(request, { settings: await buildMetadata(admin, value) })
  } catch (error) {
    return errorResponse(request, error, "evolution-settings-get")
  }
}

const putSchema = z
  .object({
    api_key: z.string().min(10).optional(),
    webhook_secret: z
      .string()
      .min(16)
      .regex(/^[A-Za-z0-9_-]+$/, "Só letras, números, hífen e underscore")
      .optional(),
  })
  .refine((v) => v.api_key !== undefined || v.webhook_secret !== undefined, {
    message: "Informe api_key e/ou webhook_secret",
  })

interface RewireResult {
  channel_id: string
  instance: string
  ok: boolean
  error?: string
}

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await requireGlobalAdmin(admin, user.id)

    const limited = await checkRateLimit(request, `evolution-settings:${user.id}`, {
      limit: 5,
      windowSeconds: 60,
    })
    if (limited) return limited

    const parsed = putSchema.parse(await request.json())

    const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "")
    if (!baseUrl) {
      throw new AppError(
        "EVOLUTION_API_URL ausente no servidor — configure a env antes de salvar credenciais",
        422,
        "evolution-env",
      )
    }

    // Prova real da key contra a Evolution ANTES de persistir.
    if (parsed.api_key) {
      let verified: { ok: boolean }
      try {
        verified = await verifyEvolutionApiKey(baseUrl, parsed.api_key)
      } catch (error) {
        const message = error instanceof EvolutionAPIError ? error.message : "Evolution inacessível"
        throw new AppError(message, 502, "evolution-unreachable")
      }
      if (!verified.ok) {
        throw new AppError("API key inválida (Evolution recusou a autenticação)", 422, "invalid-api-key")
      }
    }

    const current = await readEvolutionSettingsValue(admin)

    // Secret mudou? Compara com o efetivo atual (banco decifrado ou env).
    const currentSecret = current?.webhook_secret_enc
      ? safeDecrypt(current.webhook_secret_enc)
      : (process.env.EVOLUTION_WEBHOOK_SECRET ?? null)
    const secretChanged = Boolean(parsed.webhook_secret && parsed.webhook_secret !== currentSecret)

    const nowIso = new Date().toISOString()
    // webhookSecretEnc só entra quando o secret MUDOU (comparação de
    // plaintext acima) — re-submeter o mesmo secret não pode renovar a
    // janela nem sobrescrever um previous de rotação em andamento. O
    // previous cifrado cobre também o secret que vinha da ENV.
    const nextValue = buildRotatedValue(
      current,
      {
        ...(parsed.api_key
          ? { apiKeyEnc: encrypt(parsed.api_key), apiKeyLast4: maskLast4(parsed.api_key) }
          : {}),
        ...(secretChanged && parsed.webhook_secret
          ? { webhookSecretEnc: encrypt(parsed.webhook_secret) }
          : {}),
      },
      nowIso,
      user.id,
      { previousSecretEnc: currentSecret ? encrypt(currentSecret) : null },
    )

    const { error: upsertError } = await admin
      .from("settings")
      .upsert(
        { key: EVOLUTION_SETTINGS_KEY, value: nextValue, updated_at: nowIso },
        { onConflict: "key" },
      )
    if (upsertError) {
      log.error("upsert settings evolution falhou", { code: upsertError.code, msg: upsertError.message })
      throw new AppError("Erro ao salvar configuração", 500)
    }

    clearEvolutionConfigCache()

    // Rewire: re-aponta o webhook de todos os canais evolution ativos
    // pro novo secret (config global — todas as orgs).
    let rewire: RewireResult[] = []
    if (secretChanged && parsed.webhook_secret) {
      const effectiveApiKey =
        parsed.api_key ??
        (nextValue.api_key_enc ? safeDecrypt(nextValue.api_key_enc) : null) ??
        process.env.EVOLUTION_API_KEY ??
        null
      rewire = await rewireChannels(admin, baseUrl, effectiveApiKey, parsed.webhook_secret)
    }

    log.info("configuração evolution atualizada", {
      by: user.id,
      api_key_updated: Boolean(parsed.api_key),
      webhook_secret_updated: Boolean(parsed.webhook_secret),
      secret_changed: secretChanged,
      rewired: rewire.length,
    })

    return successResponse(request, {
      settings: await buildMetadata(admin, nextValue),
      rewire,
    })
  } catch (error) {
    return errorResponse(request, error, "evolution-settings-put")
  }
}

function safeDecrypt(enc: string): string | null {
  try {
    return decrypt(enc) || null
  } catch {
    return null
  }
}

async function rewireChannels(
  admin: ReturnType<typeof createAdminClient>,
  baseUrl: string,
  apiKey: string | null,
  newSecret: string,
): Promise<RewireResult[]> {
  const { data: channels, error } = await admin
    .from("crm_channels")
    .select("id, external_id")
    .eq("type", "whatsapp")
    .eq("provider", "evolution")
    .eq("is_active", true)
  if (error) {
    log.error("falha ao listar canais evolution pro rewire", { message: error.message })
    return []
  }
  if (!channels?.length) return []

  const base = appUrl()
  const results: RewireResult[] = []

  for (const channel of channels as Array<{ id: string; external_id: string }>) {
    if (!base || !apiKey) {
      results.push({
        channel_id: channel.id,
        instance: channel.external_id,
        ok: false,
        error: !base ? "NEXT_PUBLIC_APP_URL ausente" : "API key efetiva indisponível",
      })
      continue
    }
    try {
      const client = createEvolutionClient({ baseUrl, apiKey, instanceName: channel.external_id })
      await client.setWebhook(`${base}/api/webhooks/evolution/${newSecret}`)
      results.push({ channel_id: channel.id, instance: channel.external_id, ok: true })
    } catch (err) {
      results.push({
        channel_id: channel.id,
        instance: channel.external_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
