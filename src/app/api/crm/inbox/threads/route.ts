/**
 * GET /api/crm/inbox/threads
 *
 * Lista threads do inbox. Suporta filtros:
 *   - status: open | pending | resolved | archived (default: open)
 *   - assigned_to: uuid (default: nenhum filtro)
 *   - mine: 1 = apenas threads atribuidas ao current user
 *   - search: busca por contact_name ou contact_external_id
 *   - limit: default 50, max 200
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThreads")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const status = sp.get("status") || "open"
    const assignedTo = sp.get("assigned_to")
    const mine = sp.get("mine") === "1"
    const search = sp.get("search")
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200)

    let q = admin
      .from("crm_threads")
      .select(`
        id, status, contact_name, contact_external_id, contact_avatar_url,
        last_message_at, last_message_preview, last_message_direction, unread_count,
        assigned_to, lead_id, deal_id, client_id, channel_id,
        is_window_open, window_expires_at,
        created_at, updated_at,
        assignee:profiles!crm_threads_assigned_to_fkey (id, name, avatar_url),
        channel:crm_channels (id, type, display_name)
      `)
      .order("last_message_at", { ascending: false })
      .limit(limit)

    if (status !== "all") q = q.eq("status", status)
    if (mine) q = q.eq("assigned_to", user.id)
    else if (assignedTo) q = q.eq("assigned_to", assignedTo)

    if (search) {
      q = q.or(`contact_name.ilike.%${search}%,contact_external_id.ilike.%${search}%`)
    }

    const { data, error } = await q
    if (error) throw error

    return successResponse(request, { threads: data || [] })
  } catch (error) {
    log.error("Inbox threads error:", error)
    return errorResponse(request, error, "crm-inbox-threads")
  }
}
