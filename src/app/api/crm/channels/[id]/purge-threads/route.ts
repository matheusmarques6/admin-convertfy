/**
 * GET  /api/crm/channels/[id]/purge-threads — prévia: quantas conversas
 *      e mensagens deste canal seriam afetadas.
 * POST /api/crm/channels/[id]/purge-threads — limpa as conversas do
 *      canal. Body { mode: 'archive' | 'delete' } (default 'archive').
 *
 * Caso de uso: trocou de número (instância nova = canal novo) e o inbox
 * continua mostrando as conversas do número antigo. O inbox lista por
 * org — nunca por canal — e "Remover" só desativa o canal, então as
 * conversas velhas ficam na lista para sempre. Esta rota é o inverso do
 * migrate-threads: em vez de trazer o histórico para o canal novo,
 * tira-o de circulação.
 *
 * 'archive' é reversível: muda o status para 'archived' (some dos
 * filtros Abertos/Pendentes/Resolvidos, ainda visível em "Todos") e
 * zera o não-lido. 'delete' é permanente: apaga as threads e, por
 * CASCADE, as mensagens; as notificações in-app da thread (ligadas por
 * metadata->>thread_id, sem FK) são limpas junto, senão sobram avisos
 * apontando para conversa inexistente.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmChannelPurgeThreads")

export const dynamic = "force-dynamic"
export const maxDuration = 120

type Admin = ReturnType<typeof createAdminClient>

type ChannelRow = {
  id: string
  org_id: string
  display_name: string
  is_active: boolean
}

async function loadOwnChannel(channelId: string): Promise<{ admin: Admin; channel: ChannelRow }> {
  const sb = await createClient()
  const user = await requireAuth(sb)
  const admin = createAdminClient()
  const orgId = await resolveOrgId(user.id)

  const { data } = await admin
    .from("crm_channels")
    .select("id, org_id, display_name, is_active")
    .eq("id", channelId)
    .maybeSingle<ChannelRow>()

  if (!data || data.org_id !== orgId) {
    throw new AppError("Canal não encontrado", 404, "not-found")
  }
  return { admin, channel: data }
}

/** Ids das threads do canal, paginados (PostgREST corta em 1000 linhas). */
async function listThreadIds(admin: Admin, channelId: string): Promise<string[]> {
  const pageSize = 1000
  const ids: string[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("crm_threads")
      .select("id")
      .eq("channel_id", channelId)
      .order("id")
      .range(from, from + pageSize - 1)
      .returns<{ id: string }[]>()

    if (error) throw error
    const rows = data ?? []
    ids.push(...rows.map((r) => r.id))
    if (rows.length < pageSize) break
  }

  return ids
}

/** crm_messages não tem channel_id — conta por lotes de thread_id. */
async function countMessages(admin: Admin, threadIds: string[]): Promise<number> {
  let total = 0

  for (let i = 0; i < threadIds.length; i += 200) {
    const { count, error } = await admin
      .from("crm_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds.slice(i, i + 200))

    if (error) throw error
    total += count ?? 0
  }

  return total
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin, channel } = await loadOwnChannel(channelId)

    const threadIds = await listThreadIds(admin, channelId)
    const messages = await countMessages(admin, threadIds)

    return successResponse(request, {
      channel: { id: channel.id, display_name: channel.display_name, is_active: channel.is_active },
      threads: threadIds.length,
      messages,
    })
  } catch (error) {
    log.error("purge-threads preview error:", error)
    return errorResponse(request, error, "crm-channel-purge-threads-preview")
  }
}

const bodySchema = z.object({
  mode: z.enum(["archive", "delete"]).default("archive"),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin, channel } = await loadOwnChannel(channelId)

    const raw = await request.json().catch(() => ({}))
    const { mode } = bodySchema.parse(raw)

    const threadIds = await listThreadIds(admin, channelId)
    if (threadIds.length === 0) {
      return successResponse(request, { mode, threads: 0, messages: 0 })
    }

    const messages = await countMessages(admin, threadIds)

    if (mode === "archive") {
      const { error } = await admin
        .from("crm_threads")
        .update({ status: "archived", unread_count: 0 })
        .eq("channel_id", channelId)
      if (error) throw error

      log.info("conversas arquivadas", { channelId, threads: threadIds.length })
      return successResponse(request, { mode, threads: threadIds.length, messages })
    }

    // Notificações in-app não têm FK para a thread — limpa antes do
    // delete, senão sobram avisos abrindo conversa que não existe mais.
    for (let i = 0; i < threadIds.length; i += 200) {
      const slice = threadIds.slice(i, i + 200)
      const { error } = await admin
        .from("notifications")
        .delete()
        .filter("metadata->>thread_id", "in", `(${slice.join(",")})`)
      if (error) {
        log.warn("limpeza de notificações falhou (seguindo com o delete)", {
          channelId,
          message: error.message,
        })
        break
      }
    }

    // Apaga pelos ids contados, não por channel_id: uma conversa que
    // chegue no meio da operação não some sem ter entrado na prévia que
    // o operador confirmou. crm_messages cai por CASCADE;
    // crm_automation_runs.thread_id é SET NULL.
    for (let i = 0; i < threadIds.length; i += 200) {
      const { error } = await admin
        .from("crm_threads")
        .delete()
        .in("id", threadIds.slice(i, i + 200))
      if (error) throw error
    }

    log.info("conversas apagadas", {
      channelId,
      channel: channel.display_name,
      threads: threadIds.length,
      messages,
    })
    return successResponse(request, { mode, threads: threadIds.length, messages })
  } catch (error) {
    log.error("purge-threads error:", error)
    return errorResponse(request, error, "crm-channel-purge-threads")
  }
}
