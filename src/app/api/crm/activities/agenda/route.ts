/**
 * GET /api/crm/activities/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD[&mine=true]
 *
 * Atividades com vencimento (due_at) no intervalo, com o negócio de
 * cada uma — alimenta o calendário da agenda comercial. Pendentes e
 * concluídas vêm juntas (o calendário diferencia visualmente).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAgenda")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    const mine = sp.get("mine") === "true"
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new AppError("from/to obrigatórios (YYYY-MM-DD)", 422, "validation-error")
    }

    let q = admin
      .from("crm_deal_activities")
      .select(
        `id, deal_id, type, content, due_at, completed_at, created_by,
         deal:deals (id, title, pipeline_id, status,
           owner:profiles!deals_owner_id_fkey (id, name))`,
      )
      .gte("due_at", `${from}T00:00:00.000Z`)
      .lte("due_at", `${to}T23:59:59.999Z`)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(1000)

    if (mine) q = q.eq("created_by", user.id)

    const { data, error } = await q
    if (error) throw error

    type Row = {
      id: string
      deal_id: string | null
      type: string
      content: string | null
      due_at: string
      completed_at: string | null
      deal:
        | { id: string; title: string; status: string; owner: { id: string; name: string } | { id: string; name: string }[] | null }
        | { id: string; title: string; status: string; owner: { id: string; name: string } | { id: string; name: string }[] | null }[]
        | null
    }

    const items = ((data ?? []) as unknown as Row[]).map((a) => {
      const deal = Array.isArray(a.deal) ? a.deal[0] : a.deal
      const owner = deal ? (Array.isArray(deal.owner) ? deal.owner[0] : deal.owner) : null
      return {
        id: a.id,
        deal_id: a.deal_id,
        type: a.type,
        content: a.content,
        due_at: a.due_at,
        done: !!a.completed_at,
        deal_title: deal?.title ?? null,
        deal_status: deal?.status ?? null,
        owner_name: owner?.name ?? null,
      }
    })

    return successResponse(request, { items })
  } catch (error) {
    log.error("Agenda GET error:", error)
    return errorResponse(request, error, "crm-agenda-get")
  }
}
