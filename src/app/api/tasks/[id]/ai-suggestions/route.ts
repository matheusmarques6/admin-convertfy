import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { generateAISuggestions } from "@/lib/services/ai-task-suggestions.service"

const log = logger.child("TasksAISuggestions")

export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET — retorna sugestões cacheadas, ou gera se ainda não existe
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: task, error } = await admin
      .from("tasks")
      .select("ai_suggestions, onboarding_id")
      .eq("id", id)
      .maybeSingle()

    if (error || !task) throw new AppError("Task não encontrada", 404)

    if (task.ai_suggestions) {
      return successResponse(request, { suggestions: task.ai_suggestions, cached: true })
    }

    // Sem cache — gera agora (lazy)
    const targetBlock = request.nextUrl.searchParams.get("target_block") ?? "hero"
    const result = await generateAISuggestions(id, targetBlock)
    if (!result) {
      return successResponse(request, {
        suggestions: null,
        cached: false,
        error: "Não foi possível gerar sugestões. Verifique se a task tem onboarding com briefing.",
      })
    }
    return successResponse(request, { suggestions: result, cached: false })
  } catch (error) {
    return errorResponse(request, error, "TasksAISuggestions")
  }
}

// POST — força regeneração (force_regenerate=true) ou gera primeira vez
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json().catch(() => ({}))
    const targetBlock = (body.target_block as string) ?? "hero"
    const force = body.force_regenerate === true

    if (!force) {
      const admin = createAdminClient()
      const { data: task } = await admin
        .from("tasks")
        .select("ai_suggestions")
        .eq("id", id)
        .maybeSingle()
      if (task?.ai_suggestions) {
        return successResponse(request, { suggestions: task.ai_suggestions, cached: true })
      }
    }

    log.info("[TasksAISuggestions] Gerando", { taskId: id, targetBlock, force })
    const result = await generateAISuggestions(id, targetBlock)
    if (!result) {
      throw new AppError(
        "Falha ao gerar sugestões. Verifique se a task tem onboarding com briefing aprovado.",
        500,
      )
    }
    return successResponse(request, { suggestions: result, cached: false })
  } catch (error) {
    return errorResponse(request, error, "TasksAISuggestions")
  }
}
