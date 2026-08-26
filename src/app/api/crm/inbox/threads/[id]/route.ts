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
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertThreadInOrg } from "@/lib/crm/inbox-thread-guard"
import { ensureThreadAvatar } from "@/lib/services/crm-contact-avatar.service"
import { normalizeThreadTags, THREAD_TAG_MAX_LENGTH, THREAD_TAGS_MAX_COUNT } from "@/lib/crm/thread-tags"
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
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const sp = request.nextUrl.searchParams
    const limit = Math.min(parseInt(sp.get("limit") || "100", 10), 500)
    const before = sp.get("before") // ISO timestamp para paginacao

    const { data: thread, error } = await admin
      .from("crm_threads")
      .select(`
        id, org_id, status, contact_name, contact_external_id, contact_avatar_url,
        last_message_at, last_message_preview, last_message_direction, unread_count, tags,
        assigned_to, lead_id, deal_id, client_id, contact_id, channel_id,
        is_window_open, window_expires_at,
        created_at, updated_at,
        assignee:profiles!crm_threads_assigned_to_fkey (id, name, avatar_url, email),
        channel:crm_channels (id, type, provider, display_name, external_id),
        lead:crm_leads (id, name, status),
        deal:deals (id, title, status, value, pipeline_id, stage_id),
        client:clients (id, name, email, phone)
      `)
      .eq("id", id)
      .single<{ org_id: string } & Record<string, unknown>>()

    // PGRST116 = zero linhas (aí sim, 404). Qualquer OUTRO erro é falha
    // de query e tem de subir como 500 com a mensagem real — tratar tudo
    // como "não encontrada" mascarou uma coluna inexistente no select e
    // derrubou a abertura de TODA conversa (incidente ago/2026).
    if (error && (error as { code?: string }).code !== "PGRST116") {
      throw error
    }
    if (!thread) {
      throw new AppError("Conversa não encontrada", 404, "not-found")
    }
    assertThreadInOrg(thread.org_id, orgId)

    // Foto de perfil do contato: webhooks não entregam — busca na
    // primeira abertura (IG Messaging Profile / Evolution) e persiste.
    // Só na página inicial (sem cursor) pra não pagar em todo scroll.
    if (!before && !thread.contact_avatar_url) {
      const avatarUrl = await ensureThreadAvatar(
        admin,
        thread as unknown as Parameters<typeof ensureThreadAvatar>[1],
      )
      if (avatarUrl) (thread as Record<string, unknown>).contact_avatar_url = avatarUrl
    }

    let mq = admin
      .from("crm_messages")
      .select(`
        id, external_id, direction, content_type, body, media_url, media_mime,
        media_storage_path, media_filename, media_size,
        sent_by, sent_by_kind, status, status_updated_at, error_code, error_message,
        created_at,
        sender_username:metadata->>sender_username,
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
  /** Array COMPLETO substitui (mesmo modelo de deals.tags). */
  tags: z.array(z.string().trim().min(1).max(THREAD_TAG_MAX_LENGTH)).max(THREAD_TAGS_MAX_COUNT).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { data: current } = await admin
      .from("crm_threads")
      .select("org_id")
      .eq("id", id)
      .maybeSingle<{ org_id: string }>()
    if (!current) throw new AppError("Conversa não encontrada", 404, "not-found")
    assertThreadInOrg(current.org_id, orgId)

    const update: Record<string, unknown> = { ...parsed }
    // Desatribuir também limpa a marca de quando foi atribuída — senão
    // fica uma data pendurada de um dono que não existe mais.
    if (parsed.assigned_to !== undefined) {
      update.assigned_at = parsed.assigned_to ? new Date().toISOString() : null
    }
    if (parsed.tags) update.tags = normalizeThreadTags(parsed.tags)

    // Devolve a linha atualizada: o cliente confirma o efeito sem
    // precisar de um GET extra (e consegue reverter update otimista).
    const { data: updated, error } = await admin
      .from("crm_threads")
      .update(update)
      .eq("id", id)
      .select("id, status, assigned_to, assigned_at, tags, lead_id, deal_id, client_id")
      .single()
    if (error) throw error

    return successResponse(request, { ok: true, thread: updated })
  } catch (error) {
    log.error("Inbox thread patch error:", error)
    return errorResponse(request, error, "crm-inbox-thread-patch")
  }
}
