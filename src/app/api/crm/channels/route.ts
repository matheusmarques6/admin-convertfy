/**
 * GET  /api/crm/channels   — lista channels da org
 * POST /api/crm/channels   — registra channel (WhatsApp Cloud API)
 *
 * Importante: access_token e armazenado em config (JSONB). Em producao
 * convem criptografar via supabase secrets ou KMS — por ora, o campo
 * fica em texto plano, mas a coluna NUNCA e enviada na resposta GET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

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
      .select("id, org_id, store_id, type, provider, display_name, external_id, is_active, last_sync_at, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (error) throw error
    // Nao retorna config (contem access_token)

    return successResponse(request, { channels: data || [] })
  } catch (error) {
    log.error("Channels GET error:", error)
    return errorResponse(request, error, "crm-channels-get")
  }
}

const createSchema = z.object({
  type: z.enum(["whatsapp", "instagram"]),
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
