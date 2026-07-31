/**
 * POST /api/crm/ad-accounts/[id]/sync — sincroniza insights sob demanda
 *
 * Body opcional: { days: number } (default 30, max 90).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { syncAdAccount, defaultWindow } from "@/lib/services/crm-meta-ads-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAdAccountSync")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: userOrg } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!userOrg?.org_id) throw new AppError("Sem org membership", 403)

    let days = 30
    try {
      const parsed = bodySchema.parse(await request.json())
      if (parsed.days) days = parsed.days
    } catch {
      // body opcional
    }

    const { data: account, error } = await admin
      .from("crm_ad_accounts")
      .select("id, org_id, account_id, account_name, business_id, access_token")
      .eq("id", id)
      .eq("org_id", userOrg.org_id)
      .single()

    if (error || !account) throw new AppError("Conta não encontrada", 404, "not-found")

    const result = await syncAdAccount(account, defaultWindow(days))
    if (result.error) {
      throw new AppError(`Sync falhou: ${result.error}`, 422, "validation-error")
    }

    return successResponse(request, { result })
  } catch (error) {
    log.error("Ad account sync error:", error)
    return errorResponse(request, error, "crm-ad-account-sync")
  }
}
