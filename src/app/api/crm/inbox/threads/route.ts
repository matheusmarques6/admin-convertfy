import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/crm/inbox/threads
 *
 * Lista threads do inbox (escopadas pela org do usuário). Filtros:
 *   - status: open | pending | resolved | archived (default: open)
 *   - assigned_to: uuid (default: nenhum filtro)
 *   - mine: 1 = apenas threads atribuidas ao current user
 *   - search: busca por contact_name ou contact_external_id
 *   - tag: nome exato de uma tag da conversa (array-contains, GIN)
 *   - limit: default 50, max 200
 *
 * UM statement no banco (`crm_inbox_list_threads`). Eram NOVE — página
 * com `count: exact`, varredura de não-lidas, dois selects de canais e
 * QUATRO `count exact, head:true` para os contadores das abas — mais até
 * doze no `after()` do backfill de avatar. E esta rota é chamada por
 * poll, por evento de realtime em TODAS as abas da org e depois de cada
 * mutação: uma mensagem recebida custava ~20 statements por aba.
 *
 * O backfill de avatar saiu daqui: ele fazia `UPDATE crm_threads`, que
 * acorda o realtime, que faz as abas relistarem, que dispara o backfill
 * de novo. Agora é o cron `crm-avatar-backfill`.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { sanitizeSearchTerm } from "@/lib/crm/inbox-thread-guard"
import { tagCaseVariants } from "@/lib/crm/thread-tags"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThreads")

export const dynamic = "force-dynamic"

interface InboxListPayload {
  org_id: string
  threads: unknown[]
  total: number
  has_more: boolean
  total_unread: number
  channel_counts: {
    whatsapp: number
    instagram: number
    instagram_direct: number
    instagram_comment: number
  }
  has_whatsapp_channel: boolean
  has_instagram_channel: boolean
}

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const orgId = await resolveOrgId(user.id)

    const sp = request.nextUrl.searchParams
    const status = sp.get("status") || "open"
    const assignedTo = sp.get("assigned_to")
    const mine = sp.get("mine") === "1"
    const search = sp.get("search")
    const tag = sp.get("tag")
    const channelType = sp.get("channel_type") // whatsapp | instagram
    const channelId = sp.get("channel_id") // conta específica
    // Sub-aba do Instagram: direct | comment (comentário de post usa
    // contact_external_id "comment:{media_id}" — filtro server-side pra
    // paginação/contagem baterem, não só a página carregada).
    const kind = sp.get("kind")
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200)
    const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0)

    // Vírgula/parênteses são SINTAXE do filtro `or` do PostgREST; a busca
    // agora vai como parâmetro da função, mas a sanitização continua
    // valendo para não deixar lixo virar padrão de ILIKE.
    const cleanSearch = search ? sanitizeSearchTerm(search) : ""

    const { data, error } = await admin.rpc("crm_inbox_list_threads", {
      p_org_id: orgId,
      p_status: status,
      p_assigned_to: mine ? user.id : assignedTo || null,
      // `contains` compara EXATO: a conversa guarda a grafia da primeira
      // ocorrência ("teste") e a lista de tags pode ter outra ("Teste").
      p_tag_variants: tag ? tagCaseVariants(tag) : null,
      p_search: cleanSearch || null,
      p_channel_type: channelType === "whatsapp" || channelType === "instagram" ? channelType : null,
      p_channel_id: channelId || null,
      p_kind: kind === "direct" || kind === "comment" ? kind : null,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error

    const payload = data as InboxListPayload | null
    if (!payload) throw new Error("crm_inbox_list_threads devolveu vazio")

    // Sem canal desse tipo NÃO é o mesmo que sem conversa — a UI precisa
    // distinguir para não mostrar "inbox vazia".
    const noChannelOfType =
      (channelType === "whatsapp" && !payload.has_whatsapp_channel) ||
      (channelType === "instagram" && !payload.has_instagram_channel)
        ? channelType
        : undefined

    return successResponse(request, {
      org_id: payload.org_id,
      threads: noChannelOfType ? [] : payload.threads,
      total: noChannelOfType ? 0 : payload.total,
      has_more: noChannelOfType ? false : payload.has_more,
      total_unread: payload.total_unread,
      channel_counts: payload.channel_counts,
      ...(noChannelOfType ? { no_channel_of_type: noChannelOfType } : {}),
    })
  } catch (error) {
    log.error("Inbox threads error:", error)
    return errorResponse(request, error, "crm-inbox-threads")
  }
}

export const GET = withTiming("crm/inbox/threads", handleGet)
