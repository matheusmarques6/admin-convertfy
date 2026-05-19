import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/cs-crm/calls-pipeline
 *
 * Pipeline de call mensal do Customer Success (6 etapas).
 * Etapas derivadas dos campos existentes em store_feedback_calls:
 *  1. A marcar             — store ativa sem call há > 30d nem next_call_date
 *  2. Aguardando            — next_call_date 4-30d (presumido enviado convite)
 *  3. Agendadas             — next_call_date 1-3d
 *  4. Hoje                  — next_call_date hoje OU conducted_at hoje
 *  5. Pós-call pendente     — conducted_at 1-3d sem action_items
 *  6. Finalizadas           — conducted_at 4-30d com action_items
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)
    const threeDaysFromNow = new Date(Date.now() + 3 * 86_400_000)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86_400_000)
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)

    // 1. Stores ativas com info do owner
    const { data: storesRaw } = await admin
      .from("client_stores")
      .select(
        "id, store_name, mrr_value, " +
          "client:clients!client_stores_client_id_fkey(id, name, owner_id)",
      )
      .eq("is_active", true)
      .limit(500)

    const stores = (storesRaw ?? []) as unknown as Array<{
      id: string
      store_name: string
      mrr_value: number | null
      client: { id: string; name: string; owner_id: string | null } | null
    }>

    // 2. Todas as calls dos últimos 60 dias OU planejadas próximos 60 dias
    const lookbackStart = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const { data: callsRaw } = await admin
      .from("store_feedback_calls")
      .select("id, store_id, conducted_at, next_call_date, action_items, notes, duration_minutes")
      .or(`conducted_at.gte.${lookbackStart},next_call_date.gte.${now.toISOString()}`)
      .order("conducted_at", { ascending: false })
      .limit(500)

    const calls = (callsRaw ?? []) as unknown as Array<{
      id: string
      store_id: string
      conducted_at: string
      next_call_date: string | null
      action_items: string | null
      notes: string | null
      duration_minutes: number | null
    }>

    // Agrupa calls por store
    const callsByStore = new Map<string, typeof calls>()
    for (const c of calls) {
      const arr = callsByStore.get(c.store_id) ?? []
      arr.push(c)
      callsByStore.set(c.store_id, arr)
    }

    // Classifica cada store/call em uma das 6 etapas
    interface PipelineItem {
      id: string
      store_id: string
      store_name: string
      mrr_value: number | null
      client_name: string | null
      call_id: string | null
      conducted_at: string | null
      next_call_date: string | null
      action_items: string | null
      duration_minutes: number | null
    }

    const stages: Record<string, PipelineItem[]> = {
      a_marcar: [],
      aguardando: [],
      agendadas: [],
      hoje: [],
      pos_call_pendente: [],
      finalizadas: [],
    }

    for (const store of stores) {
      const storeCalls = callsByStore.get(store.id) ?? []
      const latestCall = storeCalls.find((c) => c.conducted_at && new Date(c.conducted_at) <= now)
      const upcomingCall = storeCalls.find((c) => c.next_call_date && new Date(c.next_call_date) > now)
      const todayCall = storeCalls.find(
        (c) =>
          (c.next_call_date && new Date(c.next_call_date) >= todayStart && new Date(c.next_call_date) <= todayEnd) ||
          (c.conducted_at && new Date(c.conducted_at) >= todayStart && new Date(c.conducted_at) <= todayEnd),
      )

      const baseItem: PipelineItem = {
        id: store.id,
        store_id: store.id,
        store_name: store.store_name,
        mrr_value: store.mrr_value,
        client_name: store.client?.name ?? null,
        call_id: null,
        conducted_at: null,
        next_call_date: null,
        action_items: null,
        duration_minutes: null,
      }

      if (todayCall) {
        stages.hoje!.push({
          ...baseItem,
          call_id: todayCall.id,
          conducted_at: todayCall.conducted_at,
          next_call_date: todayCall.next_call_date,
          action_items: todayCall.action_items,
        })
        continue
      }

      if (
        latestCall &&
        new Date(latestCall.conducted_at) >= threeDaysAgo &&
        new Date(latestCall.conducted_at) < todayStart &&
        !latestCall.action_items?.trim()
      ) {
        stages.pos_call_pendente!.push({
          ...baseItem,
          call_id: latestCall.id,
          conducted_at: latestCall.conducted_at,
          duration_minutes: latestCall.duration_minutes,
        })
        continue
      }

      if (upcomingCall) {
        const dateLeft = new Date(upcomingCall.next_call_date!).getTime() - Date.now()
        const daysLeft = dateLeft / 86_400_000
        if (daysLeft <= 3) {
          stages.agendadas!.push({
            ...baseItem,
            call_id: upcomingCall.id,
            next_call_date: upcomingCall.next_call_date,
          })
        } else if (daysLeft <= 30) {
          stages.aguardando!.push({
            ...baseItem,
            call_id: upcomingCall.id,
            next_call_date: upcomingCall.next_call_date,
          })
        }
        continue
      }

      if (
        latestCall &&
        new Date(latestCall.conducted_at) >= thirtyDaysAgo &&
        latestCall.action_items?.trim()
      ) {
        stages.finalizadas!.push({
          ...baseItem,
          call_id: latestCall.id,
          conducted_at: latestCall.conducted_at,
          action_items: latestCall.action_items,
        })
        continue
      }

      // Sem call recente nem agendada → a marcar
      stages.a_marcar!.push(baseItem)
    }

    return successResponse(request, {
      stages,
      counts: {
        a_marcar: stages.a_marcar!.length,
        aguardando: stages.aguardando!.length,
        agendadas: stages.agendadas!.length,
        hoje: stages.hoje!.length,
        pos_call_pendente: stages.pos_call_pendente!.length,
        finalizadas: stages.finalizadas!.length,
      },
      total: stores.length,
    })
  } catch (error) {
    return errorResponse(request, error, "CSCRMCallsPipeline")
  }
}
