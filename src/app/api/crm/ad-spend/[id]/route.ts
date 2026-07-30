/**
 * PATCH  /api/crm/ad-spend/[id]  — edita lançamento de investimento
 * DELETE /api/crm/ad-spend/[id]  — remove lançamento
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAdSpendDetail")

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const patchSchema = z.object({
  day: z.string().regex(DATE_RE).optional(),
  platform: z.enum(["meta", "google", "tiktok", "other"]).optional(),
  account_name: z.string().trim().max(120).optional(),
  amount: z.number().min(0).max(999_999_999).optional(),
  notes: z.string().max(500).nullable().optional(),
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
    if (Object.keys(parsed).length === 0) {
      return successResponse(request, { ok: true })
    }

    const { error } = await admin
      .from("crm_ad_spend")
      .update(parsed)
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          "Já existe um lançamento para essa conta/plataforma nesse dia.",
          409,
          "conflict",
        )
      }
      throw error
    }
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Ad spend PATCH error:", error)
    return errorResponse(request, error, "crm-ad-spend-patch")
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

    const { error } = await admin
      .from("crm_ad_spend")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Ad spend DELETE error:", error)
    return errorResponse(request, error, "crm-ad-spend-delete")
  }
}
