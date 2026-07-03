/**
 * Templates Meta do canal WhatsApp.
 *
 * GET  ?channel_id=&approved=1 — lista templates sincronizados
 * POST { channel_id, action: "sync" } — sync manual com a Meta
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { listTemplates, syncTemplatesForChannel } from "@/lib/whatsapp/template-service"
import { uuid } from "@/lib/validations/uuid"

const log = logger.child("CrmWhatsAppTemplates")

export const dynamic = "force-dynamic"
export const maxDuration = 60

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

/** Garante que o canal pertence à org do usuário. */
async function assertChannelInOrg(
  admin: ReturnType<typeof createAdminClient>,
  channelId: string,
  orgId: string,
): Promise<void> {
  const { data } = await admin
    .from("crm_channels")
    .select("id")
    .eq("id", channelId)
    .eq("org_id", orgId)
    .eq("type", "whatsapp")
    .maybeSingle()
  if (!data) throw new AppError("Canal não encontrado na sua organização", 404, "not-found")
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const channelId = uuid().parse(request.nextUrl.searchParams.get("channel_id"))
    await assertChannelInOrg(admin, channelId, orgId)

    const approvedOnly = request.nextUrl.searchParams.get("approved") === "1"
    const templates = await listTemplates(admin, { channelId, approvedOnly })

    return successResponse(request, { templates })
  } catch (error) {
    return errorResponse(request, error, "crm-whatsapp-templates-list")
  }
}

const syncSchema = z.object({
  channel_id: uuid(),
  action: z.literal("sync"),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const parsed = syncSchema.parse(await request.json())
    await assertChannelInOrg(admin, parsed.channel_id, orgId)

    const result = await syncTemplatesForChannel(admin, parsed.channel_id)
    log.info("sync manual de templates", { by: user.id, ...result })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "crm-whatsapp-templates-sync")
  }
}
