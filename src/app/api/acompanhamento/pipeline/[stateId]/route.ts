import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * PATCH /api/acompanhamento/pipeline/[stateId]
 *
 * Atualiza estado:
 *  - current_stage: move pra próxima etapa (auto-stamp dos timestamps)
 *  - approved_actions: registra ações aprovadas na call
 *  - ai_message: salva mensagem gerada
 *  - feedback_sent_at: Ryan marca como enviado
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stateId: string }> },
) {
  try {
    const { stateId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const admin = createAdminClient()

    const { data: current } = await admin
      .from("weekly_pipeline_states")
      .select("current_stage")
      .eq("id", stateId)
      .maybeSingle()
    if (!current) throw new AppError("Estado não encontrado", 404)

    const updates: Record<string, unknown> = {}

    if (typeof body.current_stage === "number") {
      if (body.current_stage < 1 || body.current_stage > 4) {
        throw new AppError("current_stage deve estar entre 1 e 4", 400)
      }
      updates.current_stage = body.current_stage
      // Stamps automáticos por transição
      const stage = body.current_stage
      if (stage === 2 && current.current_stage !== 2) {
        updates.approved_at = new Date().toISOString()
        updates.approved_by = user.id
      }
      if (stage === 3 && current.current_stage !== 3) {
        updates.ai_message_generated_at = updates.ai_message_generated_at ?? new Date().toISOString()
      }
      if (stage === 4 && current.current_stage !== 4) {
        updates.feedback_sent_at = new Date().toISOString()
        updates.feedback_sent_by = user.id
        updates.feedback_method = body.feedback_method ?? "whatsapp"
      }
    }

    if (Array.isArray(body.approved_actions)) {
      updates.approved_actions = body.approved_actions
    }
    if (typeof body.ai_message === "string") {
      updates.ai_message = body.ai_message
      if (!updates.ai_message_generated_at) {
        updates.ai_message_generated_at = new Date().toISOString()
      }
    }
    if (typeof body.flag_reason === "string") updates.flag_reason = body.flag_reason
    if (typeof body.health_state === "string") updates.health_state = body.health_state
    if (typeof body.health_score === "number") updates.health_score = body.health_score

    if (Object.keys(updates).length === 0) {
      throw new AppError("Nenhum campo válido para atualizar", 400)
    }

    const { data: updated, error } = await admin
      .from("weekly_pipeline_states")
      .update(updates)
      .eq("id", stateId)
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { state: updated })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoPipelineState")
  }
}

/**
 * DELETE /api/acompanhamento/pipeline/[stateId]
 *
 * Remove loja do pipeline desta semana (soft delete via is_active=false).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stateId: string }> },
) {
  try {
    const { stateId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { error } = await admin
      .from("weekly_pipeline_states")
      .update({ is_active: false })
      .eq("id", stateId)

    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { removed: true })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoPipelineState")
  }
}
