/**
 * POST /api/crm/inbox/threads/[id]/read
 * Zera o unread_count.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", id)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-inbox-read")
  }
}
