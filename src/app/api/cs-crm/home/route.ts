import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/cs-crm/home
 *
 * Retorna dados agregados pro kanban CRM do Customer Success (Ryan).
 * 6 colunas:
 *  1. Urgente (SLA vencendo / lojas em risco)
 *  2. Calls hoje (reuniões agendadas no dia)
 *  3. Feedbacks WhatsApp (lojas em Etapa 3 do Acompanhamento)
 *  4. Agendar calls (lojas próximas de 30d desde última call ou sem call recente)
 *  5. Pós-call pendente (calls feitas mas sem ações registradas)
 *  6. Concluídos hoje (lojas que mudaram pra Etapa 4 hoje)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    // Pega org
    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setUTCHours(23, 59, 59, 999)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

    // Coluna 3: Feedbacks WhatsApp prontos (Etapa 3 do pipeline)
    const { data: feedbacksRaw } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, store_id, ai_message, flag_reason, health_state, health_score, " +
          "store:client_stores(id, store_name, mrr_value, client:clients!client_stores_client_id_fkey(id, name))",
      )
      .eq("org_id", member.org_id)
      .eq("current_stage", 3)
      .eq("is_active", true)

    // Coluna 2: Calls hoje
    const { data: callsTodayRaw } = await admin
      .from("store_feedback_calls")
      .select(
        "id, conducted_at, store_id, next_call_date, " +
          "store:client_stores(id, store_name, mrr_value, client:clients!client_stores_client_id_fkey(id, name))",
      )
      .gte("conducted_at", todayStart.toISOString())
      .lte("conducted_at", todayEnd.toISOString())

    // Coluna 4: Agendar calls (lojas sem call nos últimos 30 dias)
    const { data: storesNeedingCall } = await admin
      .from("client_stores")
      .select(
        "id, store_name, mrr_value, " +
          "client:clients!client_stores_client_id_fkey(id, name, owner_id), " +
          "calls:store_feedback_calls(conducted_at, next_call_date)",
      )
      .eq("is_active", true)
      .eq("client.owner_id", user.id)
      .limit(50)

    const needingCall = (storesNeedingCall ?? []).filter((s) => {
      const sx = s as unknown as { calls: Array<{ conducted_at: string | null }> }
      const calls = sx.calls ?? []
      if (calls.length === 0) return true
      const latest = calls
        .map((c) => c.conducted_at)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined
      return !latest || latest < monthAgo
    })

    // Coluna 1: Urgente — lojas em "risk" no pipeline (semana atual)
    const { data: urgentsRaw } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, store_id, health_state, health_score, flag_reason, " +
          "store:client_stores(id, store_name, mrr_value, client:clients!client_stores_client_id_fkey(id, name))",
      )
      .eq("org_id", member.org_id)
      .eq("health_state", "risk")
      .eq("is_active", true)

    // Coluna 5: Pós-call pendente — calls dos últimos 3 dias sem action_items
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const { data: postCallRaw } = await admin
      .from("store_feedback_calls")
      .select(
        "id, conducted_at, action_items, store_id, " +
          "store:client_stores(id, store_name, mrr_value, client:clients!client_stores_client_id_fkey(id, name))",
      )
      .gte("conducted_at", threeDaysAgo)
      .lte("conducted_at", todayEnd.toISOString())
      .is("action_items", null)

    // Coluna 6: Concluídos hoje (Etapa 4 com feedback_sent_at hoje)
    const { data: completedTodayRaw } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, store_id, feedback_sent_at, feedback_method, " +
          "store:client_stores(id, store_name, mrr_value, client:clients!client_stores_client_id_fkey(id, name))",
      )
      .eq("org_id", member.org_id)
      .eq("current_stage", 4)
      .gte("feedback_sent_at", todayStart.toISOString())

    return successResponse(request, {
      urgente: urgentsRaw ?? [],
      calls_hoje: callsTodayRaw ?? [],
      feedbacks: feedbacksRaw ?? [],
      agendar_call: needingCall.slice(0, 20),
      pos_call_pendente: postCallRaw ?? [],
      concluidos_hoje: completedTodayRaw ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "CSCRMHome")
  }
}
