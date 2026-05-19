import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/stores/[id]/onboarding-status
 *
 * Retorna o estado do onboarding ativo da loja:
 *  - Onboarding atual + coluna atual
 *  - Lista de colunas do pipeline (7 etapas)
 *  - Tasks ativas agrupadas por coluna
 *  - Progresso geral (% completas)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()

    // Onboarding ativo
    const { data: onbRaw } = await admin
      .from("onboardings")
      .select(
        "id, status, current_column_id, current_version, payment_status, contract_status, " +
          "briefing_status, form_submitted_at, briefing_confirmed_at, entered_at, " +
          "last_column_change_at, completed_at, pipeline_id, " +
          "current_column:operational_pipeline_columns!onboardings_current_column_id_fkey(id, position, name, responsible_role, sla_days)",
      )
      .eq("store_id", id)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const onb = onbRaw as unknown as
      | { id: string; status: string; current_column_id: string | null; current_version: number; payment_status: string; contract_status: string; briefing_status: string; form_submitted_at: string | null; briefing_confirmed_at: string | null; entered_at: string; last_column_change_at: string; completed_at: string | null; pipeline_id: string; current_column: unknown }
      | null

    if (!onb) {
      const { data: lastOnbRaw } = await admin
        .from("onboardings")
        .select("id, status, completed_at, current_column_id")
        .eq("store_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const lastOnb = lastOnbRaw as unknown as
        | { id: string; status: string; completed_at: string | null; current_column_id: string | null }
        | null

      return successResponse(request, {
        active: false,
        last_onboarding: lastOnb,
        columns: [],
        tasks: [],
        progress_pct: lastOnb?.status === "completed" ? 100 : 0,
      })
    }

    // Colunas do pipeline
    const { data: columns } = await admin
      .from("operational_pipeline_columns")
      .select("id, position, name, responsible_role, sla_days, color")
      .eq("pipeline_id", onb.pipeline_id)
      .order("position", { ascending: true })

    // Tasks do onboarding (ativas e concluidas pra estatistica)
    const { data: tasksRaw } = await admin
      .from("tasks")
      .select(
        "id, title, status, priority, assignee_id, completed_at, operational_column_id, " +
          "due_date, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url)",
      )
      .eq("onboarding_id", onb.id)
      .order("created_at", { ascending: true })

    const tasks = (tasksRaw ?? []) as unknown as Array<{
      id: string
      title: string
      status: string
      priority: string | null
      assignee_id: string | null
      completed_at: string | null
      operational_column_id: string | null
      due_date: string | null
      assignee: unknown
    }>

    const total = tasks.length
    const completed = tasks.filter((t) => t.status === "completed" || t.completed_at).length
    const progress_pct = total > 0 ? Math.round((completed / total) * 100) : 0

    // Agrupa tasks por coluna
    const tasksByColumn: Record<string, typeof tasks> = {}
    for (const t of tasks) {
      const col = t.operational_column_id ?? "unassigned"
      if (!tasksByColumn[col]) tasksByColumn[col] = []
      tasksByColumn[col]!.push(t)
    }

    return successResponse(request, {
      active: true,
      onboarding: onb,
      columns: columns ?? [],
      tasks: tasks ?? [],
      tasks_by_column: tasksByColumn,
      progress_pct,
      total_tasks: total,
      completed_tasks: completed,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreOnboardingStatus")
  }
}
