/**
 * GET    /api/crm/inbox/threads/[id]   — thread + mensagens (paginadas)
 * PATCH  /api/crm/inbox/threads/[id]   — atualiza status, assigned_to,
 *                                        vincula a lead/deal/client
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThread")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const limit = Math.min(parseInt(sp.get("limit") || "100", 10), 500)
    const before = sp.get("before") // ISO timestamp para paginacao

    const { data: thread, error } = await admin
      .from("crm_threads")
      .select(`
        id, status, contact_name, contact_external_id, contact_avatar_url,
        last_message_at, last_message_preview, unread_count,
        assigned_to, lead_id, deal_id, client_id, contact_id, channel_id,
        is_window_open, window_expires_at,
        created_at, updated_at,
        assignee:profiles!crm_threads_assigned_to_fkey (id, name, avatar_url, email),
        channel:crm_channels (id, type, display_name, external_id),
        lead:crm_leads (id, name, status),
        deal:deals (id, title, status, pipeline_id, stage_id),
        client:clients (id, name, email, phone)
      `)
      .eq("id", id)
      .single()

    if (error || !thread) {
      throw new AppError("Thread nao encontrada", 404, "not-found")
    }

    let mq = admin
      .from("crm_messages")
      .select(`
        id, external_id, direction, content_type, body, media_url, media_mime,
        media_storage_path, media_filename, media_size,
        sent_by, sent_by_kind, status, status_updated_at, error_code, error_message,
        created_at,
        sender:profiles!crm_messages_sent_by_fkey (id, name, avatar_url)
      `)
      .eq("thread_id", id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (before) mq = mq.lt("created_at", before)

    const { data: messages, error: mErr } = await mq
    if (mErr) throw mErr

    return successResponse(request, {
      thread,
      messages: (messages || []).reverse(), // ordem cronologica
    })
  } catch (error) {
    log.error("Inbox thread error:", error)
    return errorResponse(request, error, "crm-inbox-thread")
  }
}

const patchSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "archived"]).optional(),
  assigned_to: uuid().nullable().optional(),
  lead_id: uuid().nullable().optional(),
  deal_id: uuid().nullable().optional(),
  client_id: uuid().nullable().optional(),
  contact_id: uuid().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const update: Record<string, unknown> = { ...parsed }
    if (parsed.assigned_to) update.assigned_at = new Date().toISOString()

    const { error } = await admin.from("crm_threads").update(update).eq("id", id)
    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Inbox thread patch error:", error)
    return errorResponse(request, error, "crm-inbox-thread-patch")
  }
}
