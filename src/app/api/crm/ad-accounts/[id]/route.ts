/**
 * PATCH  /api/crm/ad-accounts/[id]  — ativa/desativa ou troca o token
 * DELETE /api/crm/ad-accounts/[id]  — desconecta (remove insights junto)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAdAccountDetail")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  access_token: z.string().trim().min(20).optional(),
})

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const update: Record<string, unknown> = {}
    if (parsed.is_active !== undefined) update.is_active = parsed.is_active
    if (parsed.access_token) update.access_token = encrypt(parsed.access_token)
    if (Object.keys(update).length === 0) {
      return successResponse(request, { ok: true })
    }

    const { error } = await admin
      .from("crm_ad_accounts")
      .update(update)
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Ad account PATCH error:", error)
    return errorResponse(request, error, "crm-ad-account-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    // insights caem por ON DELETE CASCADE
    const { error } = await admin
      .from("crm_ad_accounts")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Ad account DELETE error:", error)
    return errorResponse(request, error, "crm-ad-account-delete")
  }
}
