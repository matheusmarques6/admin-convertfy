/**
 * POST /api/crm/channels/[id]/migrate-threads
 *
 * Migra as conversas (crm_threads) dos canais Evolution DESATIVADOS da
 * org para este canal (ativo). Caso de uso: a instância corrompeu, o
 * operador removeu o canal e conectou uma instância nova — as conversas
 * antigas ficam amarradas ao canal morto e responder nelas falha com
 * "Canal Evolution indisponível". A migração re-aponta as threads.
 *
 * Merge: se o contato já tem conversa no canal novo (mandou mensagem
 * depois da troca), as mensagens da thread antiga são movidas para a
 * nova (unread somado, last_message_* mais recente vence) e a antiga é
 * deletada (crm_messages já foi movida; refs de automação são SET NULL).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmChannelMigrateThreads")

export const dynamic = "force-dynamic"
export const maxDuration = 120

type ThreadRow = {
  id: string
  contact_external_id: string
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: string | null
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetChannelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: target } = await admin
      .from("crm_channels")
      .select("id, org_id, type, provider, is_active")
      .eq("id", targetChannelId)
      .maybeSingle<{ id: string; org_id: string; type: string; provider: string; is_active: boolean }>()

    if (!target || target.org_id !== orgId || target.type !== "whatsapp" || target.provider !== "evolution") {
      throw new AppError("Canal evolution não encontrado", 404, "not-found")
    }
    if (!target.is_active) {
      throw new AppError("O canal de destino precisa estar ativo", 422, "inactive-target")
    }

    // Origem: canais evolution DESATIVADOS da mesma org
    const { data: sources } = await admin
      .from("crm_channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "whatsapp")
      .eq("provider", "evolution")
      .eq("is_active", false)
      .neq("id", targetChannelId)

    const sourceIds = (sources ?? []).map((s) => s.id as string)
    if (sourceIds.length === 0) {
      return successResponse(request, { migrated: 0, merged: 0, failed: 0, sources: 0 })
    }

    const { data: oldThreads } = await admin
      .from("crm_threads")
      .select("id, contact_external_id, unread_count, last_message_at, last_message_preview, last_message_direction")
      .in("channel_id", sourceIds)
      .returns<ThreadRow[]>()

    const { data: targetThreads } = await admin
      .from("crm_threads")
      .select("id, contact_external_id, unread_count, last_message_at, last_message_preview, last_message_direction")
      .eq("channel_id", targetChannelId)
      .returns<ThreadRow[]>()

    const byContact = new Map<string, ThreadRow>()
    for (const t of targetThreads ?? []) byContact.set(t.contact_external_id, t)

    let migrated = 0
    let merged = 0
    let failed = 0

    for (const old of oldThreads ?? []) {
      const existing = byContact.get(old.contact_external_id)

      if (!existing) {
        // Sem duplicata: só re-aponta a thread pro canal novo.
        const { error } = await admin
          .from("crm_threads")
          .update({ channel_id: targetChannelId })
          .eq("id", old.id)
        if (error) {
          failed++
          log.warn("re-point falhou", { threadId: old.id, message: error.message })
          continue
        }
        migrated++
        byContact.set(old.contact_external_id, old)
        continue
      }

      // Duplicata: move as mensagens pra thread nova e mescla metadados.
      const { error: moveErr } = await admin
        .from("crm_messages")
        .update({ thread_id: existing.id })
        .eq("thread_id", old.id)
      if (moveErr) {
        // Colisão de (thread_id, external_id) é teoricamente possível —
        // não força: mantém a thread antiga intacta e reporta.
        failed++
        log.warn("merge de mensagens falhou — thread antiga preservada", {
          oldThreadId: old.id,
          targetThreadId: existing.id,
          message: moveErr.message,
        })
        continue
      }

      const oldIsNewer =
        (old.last_message_at ?? "") > (existing.last_message_at ?? "")
      const { error: mergeErr } = await admin
        .from("crm_threads")
        .update({
          unread_count: (existing.unread_count ?? 0) + (old.unread_count ?? 0),
          ...(oldIsNewer
            ? {
                last_message_at: old.last_message_at,
                last_message_preview: old.last_message_preview,
                last_message_direction: old.last_message_direction,
              }
            : {}),
        })
        .eq("id", existing.id)
      if (mergeErr) log.warn("merge de metadados falhou (mensagens já movidas)", { threadId: existing.id, message: mergeErr.message })

      const { error: delErr } = await admin.from("crm_threads").delete().eq("id", old.id)
      if (delErr) log.warn("delete da thread antiga falhou (vazia, inofensiva)", { threadId: old.id, message: delErr.message })

      merged++
    }

    log.info("migração de threads concluída", { targetChannelId, migrated, merged, failed, sources: sourceIds.length })
    return successResponse(request, { migrated, merged, failed, sources: sourceIds.length })
  } catch (error) {
    log.error("migrate-threads error:", error)
    return errorResponse(request, error, "crm-channel-migrate-threads")
  }
}
