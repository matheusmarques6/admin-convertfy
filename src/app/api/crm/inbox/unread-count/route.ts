import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/crm/inbox/unread-count
 *
 * Contagem leve de não-lidas do inbox da ORG (badge da sidebar).
 * Mesma régua do total_unread de /api/crm/inbox/threads — threads
 * open/pending com unread_count > 0 — mas sem carregar a lista: a
 * sidebar chama isso a cada 60s e a rota cheia seria desperdício.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("crm_threads")
      .select("unread_count")
      .eq("org_id", orgId)
      .in("status", ["open", "pending"])
      .gt("unread_count", 0)
      .limit(500)

    if (error) throw error

    const totalUnread = (data ?? []).reduce(
      (sum, t) => sum + (Number(t.unread_count) || 0),
      0,
    )

    return successResponse(request, { total_unread: totalUnread })
  } catch (error) {
    return errorResponse(request, error, "crm-inbox-unread-count")
  }
}

export const GET = withTiming("crm/inbox/unread-count", handleGet)
