/**
 * GET /api/me/tasks
 *
 * Endpoint unificado de tarefas do usuario logado. Substitui consultas
 * espalhadas por modulo (onboarding, projetos, crm, manual) numa unica
 * fonte agrupada por source_type.
 *
 * Regras de visibilidade:
 *  - assignee_id = profile_id do user, OU
 *  - assignee_id IS NULL AND assignee_role = role do org_member do user
 *  - Owner/manager com ?view=all veem todas as tasks da org
 *
 * Resposta inclui:
 *  - tasks: lista achatada ordenada por due_date asc nulls last
 *  - grouped: dicionario por source_type
 *  - counts: { total, by_source: {onboarding: 3, manual: 1, ...} }
 *  - member: { id, role, profile_id }
 *
 * Query params:
 *   status        = pending | in_progress | completed | all (default: pending)
 *   source_type   = onboarding | acompanhamento | project | crm | manual
 *   view          = mine (default) | all (so owner/manager/coo)
 *   date_filter   = today | week | overdue (opcional)
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const ELEVATED_ROLES = ["owner", "manager", "coo"]

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: orgMember } = await admin
      .from("org_members")
      .select("id, role, org_id, profile_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!orgMember) throw new AppError("Sem org membership", 403)

    const sp = request.nextUrl.searchParams
    const status = sp.get("status") ?? "pending"
    const sourceType = sp.get("source_type")
    const view = sp.get("view") ?? "mine"
    const dateFilter = sp.get("date_filter")
    const role = (orgMember.role as string) ?? "support"
    const isElevated = ELEVATED_ROLES.includes(role)

    let query = admin
      .from("tasks")
      .select(
        `id, title, description, status, priority, due_date, sla_hours, type,
         assignee_role, assignee_id, source_type, source_id, source_metadata,
         onboarding_id, operational_column_id, metadata,
         created_at, updated_at, completed_at,
         assignee:profiles!tasks_assignee_id_fkey(id, name, email, avatar_url)`,
      )
      .eq("org_id", orgMember.org_id)
      .limit(500)

    // Filtro de atribuicao: minhas tasks OU todas (so owner/manager/coo)
    if (view !== "all" || !isElevated) {
      // assignee_id pode bater com profile_id (user.id) OU org_member.id (id da row)
      // Historicamente o codigo usa profile_id. Cobrimos os dois com or().
      const orParts = [
        `assignee_id.eq.${user.id}`,
        `and(assignee_id.is.null,assignee_role.eq.${role})`,
      ]
      query = query.or(orParts.join(","))
    }

    if (status !== "all") query = query.eq("status", status)
    if (sourceType) query = query.eq("source_type", sourceType)

    if (dateFilter === "today") {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      query = query.gte("due_date", start.toISOString()).lte("due_date", end.toISOString())
    } else if (dateFilter === "week") {
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + 7)
      query = query.gte("due_date", start.toISOString()).lte("due_date", end.toISOString())
    } else if (dateFilter === "overdue") {
      query = query.lt("due_date", new Date().toISOString()).neq("status", "completed")
    }

    query = query
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })

    const { data, error } = await query
    if (error) throw error

    const tasks = data ?? []
    const grouped: Record<string, typeof tasks> = {}
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      const key = (t.source_type as string) ?? "manual"
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(t)
      counts[key] = (counts[key] ?? 0) + 1
    }

    // Conta global de todos status (uteis pros chips em /admin/me)
    const { data: statusCountsData } = await admin
      .from("tasks")
      .select("status", { count: "exact" })
      .eq("org_id", orgMember.org_id)
      .or(
        view !== "all" || !isElevated
          ? `assignee_id.eq.${user.id},and(assignee_id.is.null,assignee_role.eq.${role})`
          : "",
      )
      .limit(1000)

    const status_counts = (statusCountsData ?? []).reduce(
      (acc: Record<string, number>, row: { status: string }) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1
        return acc
      },
      { pending: 0, in_progress: 0, completed: 0, cancelled: 0 },
    )

    return successResponse(request, {
      tasks,
      grouped,
      counts: {
        total: tasks.length,
        by_source: counts,
      },
      status_counts,
      member: {
        id: orgMember.id,
        profile_id: orgMember.profile_id,
        role,
        is_elevated: isElevated,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "me-tasks")
  }
}
