/**
 * GET  /api/crm/channels   — lista channels da org
 * POST /api/crm/channels   — registra channel (WhatsApp Cloud API,
 *                            Evolution/Baileys via QR, ou Instagram)
 *
 * Importante: access_token e armazenado em config (JSONB). Em producao
 * convem criptografar via supabase secrets ou KMS — por ora, o campo
 * fica em texto plano, mas a coluna NUNCA e enviada na resposta GET
 * (o GET expõe só derivados seguros: connection_state/needs_reconnect).
 *
 * Evolution: cria a instância no servidor remoto (instance name
 * determinístico por org), aponta o webhook por instância de volta pra
 * cá e grava o canal com provider='evolution' (external_id = instance).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { encrypt } from "@/lib/crypto"
import { appUrl } from "@/lib/whatsapp/queue"
import { createEvolutionClient } from "@/lib/whatsapp/evolution-api"
import { getEvolutionConfigGaps, getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import { buildInstanceName } from "@/lib/whatsapp/evolution-content"

const log = logger.child("CrmChannels")

export const dynamic = "force-dynamic"

async function resolveOrgId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  if (!data?.org_id) throw new AppError("Acesso negado: usuario sem organizacao", 403)
  return data.org_id
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const { data, error } = await admin
      .from("crm_channels")
      .select(
        "id, org_id, store_id, type, provider, display_name, external_id, config, is_active, last_sync_at, created_at, updated_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (error) throw error

    // Nao retorna config (contem access_token) — só derivados seguros
    // pro estado da conexão dos canais evolution.
    const channels = (data || []).map((row) => {
      const { config, ...safe } = row as { config: Record<string, unknown> | null } & Record<string, unknown>
      if (safe.provider === "evolution") {
        return {
          ...safe,
          connection_state:
            typeof config?.connection_state === "string" ? config.connection_state : "unknown",
          owner_jid: typeof config?.owner_jid === "string" ? config.owner_jid : null,
          needs_reconnect: Boolean(config?.needs_reconnect_at),
        }
      }
      return safe
    })

    return successResponse(request, { channels })
  } catch (error) {
    log.error("Channels GET error:", error)
    return errorResponse(request, error, "crm-channels-get")
  }
}

const createSchema = z.object({
  type: z.enum(["whatsapp", "instagram"]),
  /** Só para type=whatsapp: cloud oficial (default) ou evolution via QR. */
  provider: z.enum(["whatsapp_cloud", "evolution"]).default("whatsapp_cloud"),
  display_name: z.string().min(1).max(120),
  store_id: uuid().nullable().optional(),
  whatsapp: z
    .object({
      phone_number_id: z.string().min(1),
      access_token: z.string().min(10),
      business_account_id: z.string().optional(),
    })
    .optional(),
  instagram: z
    .object({
      /** IG Business Account ID (necessario tanto pra DMs quanto comments). */
      instagram_business_account_id: z.string().min(1),
      /** Page Access Token com escopos instagram_manage_messages + comments. */
      access_token: z.string().min(10),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const body = await request.json()
    const parsed = createSchema.parse(body)

    // ── Evolution (WhatsApp via QR): cria instância + webhook + canal ──
    if (parsed.type === "whatsapp" && parsed.provider === "evolution") {
      const cfg = await getEvolutionRuntimeConfig(admin)
      if (!cfg) {
        // Diz EXATAMENTE qual peça falta (URL da env, key ou secret) —
        // o erro genérico gerou vários ciclos de adivinhação em prod.
        const gaps = await getEvolutionConfigGaps(admin)
        throw new AppError(
          `Evolution não configurada — faltando: ${gaps.missing.join("; ")}`,
          422,
          "evolution-env",
        )
      }
      const base = appUrl()
      if (!base) {
        throw new AppError("NEXT_PUBLIC_APP_URL ausente — necessário pro webhook da Evolution", 422, "evolution-env")
      }

      const instanceName = buildInstanceName(orgId)
      const client = createEvolutionClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, instanceName })

      const created = await client.createInstance()
      try {
        await client.setWebhook(`${base}/api/webhooks/evolution/${cfg.webhookSecret}`)
      } catch (err) {
        // Sem webhook a integração não funciona — desfaz a instância.
        await client.deleteInstance().catch(() => {})
        throw err
      }

      const { data, error } = await admin
        .from("crm_channels")
        .insert({
          org_id: orgId,
          store_id: parsed.store_id || null,
          type: "whatsapp" as const,
          provider: "evolution" as const,
          display_name: parsed.display_name,
          external_id: instanceName,
          config: {
            instance_name: instanceName,
            integration: "WHATSAPP-BAILEYS",
            connection_state: "connecting",
            ...(created.instanceApikey ? { instance_apikey: encrypt(created.instanceApikey) } : {}),
          },
        })
        .select("id")
        .single()

      if (error) {
        // Compensação best-effort: instância órfã no servidor remoto.
        await client.deleteInstance().catch(() => {})
        throw error
      }

      log.info("[Channels] evolution created", { id: data.id, instanceName })
      return successResponse(request, {
        id: data.id,
        instance_name: instanceName,
        qr_base64: created.qrBase64,
        pairing_code: created.pairingCode,
      })
    }

    if (parsed.type === "whatsapp" && !parsed.whatsapp) {
      throw new AppError("Config whatsapp obrigatoria", 400, "validation")
    }
    if (parsed.type === "instagram" && !parsed.instagram) {
      throw new AppError("Config instagram obrigatoria", 400, "validation")
    }

    const insertPayload =
      parsed.type === "whatsapp"
        ? {
            org_id: orgId,
            store_id: parsed.store_id || null,
            type: "whatsapp" as const,
            provider: "whatsapp_cloud" as const,
            display_name: parsed.display_name,
            external_id: parsed.whatsapp!.phone_number_id,
            config: {
              phone_number_id: parsed.whatsapp!.phone_number_id,
              access_token: parsed.whatsapp!.access_token,
              business_account_id: parsed.whatsapp!.business_account_id || null,
            },
          }
        : {
            org_id: orgId,
            store_id: parsed.store_id || null,
            type: "instagram" as const,
            provider: "instagram_basic" as const,
            display_name: parsed.display_name,
            external_id: parsed.instagram!.instagram_business_account_id,
            config: {
              instagram_business_account_id:
                parsed.instagram!.instagram_business_account_id,
              access_token: parsed.instagram!.access_token,
            },
          }

    const { data, error } = await admin
      .from("crm_channels")
      .insert(insertPayload)
      .select("id")
      .single()

    if (error) throw error

    log.info("[Channels] created", { id: data.id, type: parsed.type })
    return successResponse(request, { id: data.id })
  } catch (error) {
    log.error("Channels POST error:", error)
    return errorResponse(request, error, "crm-channels-post")
  }
}
