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
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { sanitizeSearchTerm } from "@/lib/crm/inbox-thread-guard"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThreads")

export const dynamic = "force-dynamic"

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
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200)
    const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0)

    // Filtro por TIPO de canal: channel_type vive em crm_channels, não
    // na thread — resolve os ids dos canais do tipo (1 query pequena) e
    // filtra por channel_id, que é coluna direta da thread.
    let channelIdsOfType: string[] | null = null
    if (channelType === "whatsapp" || channelType === "instagram") {
      const { data: chs } = await admin
        .from("crm_channels")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", channelType)
      channelIdsOfType = (chs ?? []).map((c) => c.id)
      if (channelIdsOfType.length === 0) {
        // Sem canal desse tipo NÃO é o mesmo que sem conversa — a UI
        // precisa distinguir para não mostrar "inbox vazia".
        return successResponse(request, {
          org_id: orgId,
          threads: [],
          total: 0,
          has_more: false,
          total_unread: 0,
          no_channel_of_type: channelType,
        })
      }
    }

    let q = admin
      .from("crm_threads")
      .select(
        `
        id, status, contact_name, contact_external_id, contact_avatar_url,
        last_message_at, last_message_preview, last_message_direction, unread_count, tags,
        assigned_to, lead_id, deal_id, client_id, channel_id,
        is_window_open, window_expires_at,
        created_at, updated_at,
        assignee:profiles!crm_threads_assigned_to_fkey (id, name, avatar_url),
        channel:crm_channels (id, type, provider, display_name)
      `,
        { count: "exact" },
      )
      .eq("org_id", orgId)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status !== "all") q = q.eq("status", status)
    if (mine) q = q.eq("assigned_to", user.id)
    else if (assignedTo) q = q.eq("assigned_to", assignedTo)
    // `contains` compara EXATO: a conversa guarda a grafia da primeira
    // ocorrência ("teste") e a lista de tags pode ter outra ("Teste"),
    // então o filtro voltava vazio sem erro nenhum. `overlaps` com as
    // variantes de caixa cobre o caso real sem exigir índice novo.
    if (tag) {
      const variants = Array.from(
        new Set([tag, tag.toLowerCase(), tag.toUpperCase(), tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()]),
      )
      q = q.overlaps("tags", variants)
    }
    // Conta específica vence o filtro por tipo (é mais restrita).
    if (channelId) q = q.eq("channel_id", channelId)
    else if (channelIdsOfType) q = q.in("channel_id", channelIdsOfType)

    // Vírgula/parênteses são SINTAXE do filtro `or` do PostgREST:
    // buscar "Silva, João" quebrava a query inteira.
    const cleanSearch = search ? sanitizeSearchTerm(search) : ""
    if (cleanSearch) {
      q = q.or(`contact_name.ilike.%${cleanSearch}%,contact_external_id.ilike.%${cleanSearch}%`)
    }

    // Não-lidas de TODA a org (não só da página): o badge do inbox tem
    // de bater com o do sino, independente de filtro e de paginação.
    const unreadQ = admin
      .from("crm_threads")
      .select("unread_count")
      .eq("org_id", orgId)
      .in("status", ["open", "pending"])
      .gt("unread_count", 0)
      .limit(500)

    const [{ data, error, count }, { data: unreadRows }] = await Promise.all([q, unreadQ])
    if (error) throw error

    const total = count ?? (data?.length ?? 0)
    const totalUnread = (unreadRows ?? []).reduce(
      (sum, t) => sum + (Number(t.unread_count) || 0),
      0,
    )

    return successResponse(request, {
      org_id: orgId,
      threads: data || [],
      total,
      has_more: offset + (data?.length ?? 0) < total,
      total_unread: totalUnread,
    })
  } catch (error) {
    log.error("Inbox threads error:", error)
    return errorResponse(request, error, "crm-inbox-threads")
  }
}

export const GET = withTiming("crm/inbox/threads", handleGet)
