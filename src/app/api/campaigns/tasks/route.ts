import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignTasks")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autorizado", 401)
    }

    const { searchParams } = new URL(request.url)
    const generationId = searchParams.get("generation_id")
    const status = searchParams.get("status")

    // RLS filters by org_id automatically
    let query = supabase
      .from("campaign_generation_tasks")
      .select(
        `
        id, generation_id, org_id, role, assignee_id, status,
        started_at, completed_at, completed_by, notes,
        created_at, updated_at,
        generation:campaign_generations(
          id, name, status, reference_doc_url, drive_folder_url, client_id,
          client:clients(id, name, company)
        ),
        assignee:org_members!assignee_id(
          id, profile_id,
          profile:profiles!org_members_profile_id_fkey(name, avatar_url)
        )
      `
      )
      .order("created_at", { ascending: false })

    if (generationId) {
      query = query.eq("generation_id", generationId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    const { data: tasks, error: fetchError } = await query

    if (fetchError) {
      log.error("Failed to fetch tasks", fetchError)
      throw new AppError("Erro ao buscar tarefas", 500)
    }

    return successResponse(request, { tasks: tasks ?? [] })
  } catch (error) {
    return errorResponse(request, error, "CampaignTasks")
  }
}
