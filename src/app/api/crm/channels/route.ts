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
  type: z.enum(["whatsapp"]),
  display_name: z.string().min(1).max(120),
  store_id: uuid().nullable().optional(),
  whatsapp: z
    .object({
      phone_number_id: z.string().min(1),
      access_token: z.string().min(10),
      business_account_id: z.string().optional(),
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

    const externalId = parsed.whatsapp!.phone_number_id

    const { data, error } = await admin
      .from("crm_channels")
      .insert({
        org_id: orgId,
        store_id: parsed.store_id || null,
        type: "whatsapp",
        provider: "whatsapp_cloud",
        display_name: parsed.display_name,
        external_id: externalId,
        config: {
          phone_number_id: externalId,
          access_token: parsed.whatsapp!.access_token,
          business_account_id: parsed.whatsapp!.business_account_id || null,
        },
      })
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
