import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/ritual/sessions/[sessionId]/diagnostics
 * Cria/atualiza diagnóstico de uma loja durante a sessão.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    if (!body.store_id) throw new AppError("store_id obrigatório", 400)

    const admin = createAdminClient()

    // Pega pipeline_state_id da semana
    const { data: session } = await admin
      .from("ritual_sessions")
      .select("week_start, org_id")
      .eq("id", sessionId)
      .maybeSingle()
    if (!session) throw new AppError("Sessão não encontrada", 404)

    const { data: pipelineState } = await admin
      .from("weekly_pipeline_states")
      .select("id")
      .eq("store_id", body.store_id)
      .eq("week_start", session.week_start)
      .eq("is_active", true)
      .maybeSingle()

    const upsertData: Record<string, unknown> = {
      ritual_session_id: sessionId,
      store_id: body.store_id,
      pipeline_state_id: pipelineState?.id ?? null,
    }
    if (typeof body.notes === "string") upsertData.notes = body.notes
    if (Array.isArray(body.approved_actions)) upsertData.approved_actions = body.approved_actions
    if (typeof body.skipped === "boolean") upsertData.skipped = body.skipped
    if (typeof body.skip_reason === "string") upsertData.skip_reason = body.skip_reason
    if (Array.isArray(body.chat_messages)) upsertData.chat_messages = body.chat_messages
    if (typeof body.duration_seconds === "number") upsertData.duration_seconds = body.duration_seconds

    const { data, error } = await admin
      .from("ritual_store_diagnostics")
      .upsert(upsertData, { onConflict: "ritual_session_id,store_id" })
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)

    // Quando ações aprovadas e não skipped → avança pipeline_state pra Etapa 2
    if (
      pipelineState &&
      Array.isArray(body.approved_actions) &&
      body.approved_actions.length > 0 &&
      !body.skipped
    ) {
      await admin
        .from("weekly_pipeline_states")
        .update({
          current_stage: 2,
          approved_actions: body.approved_actions,
          approved_at: new Date().toISOString(),
        })
        .eq("id", pipelineState.id)
        .eq("current_stage", 1) // só se ainda está em 1
    }

    return successResponse(request, { diagnostic: data })
  } catch (error) {
    return errorResponse(request, error, "RitualDiagnostics")
  }
}
