import { withTiming } from "@/lib/api/with-timing"
import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { isOnboardingBypass } from "@/lib/permissions/onboarding-stage-access"
import { listVisibleTasks } from "@/lib/services/visible-tasks.service"
import { createUnifiedTask } from "@/lib/services/tasks-unified.service"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const member = await getUserOrgRole(user.id)
    if (!member || !isOnboardingBypass(member.roles)) {
      throw new AppError("Sem permissao para criar tasks", 403)
    }
    const body = await request.json()
    const title = String(body.title ?? "").trim()
    if (!title) throw new AppError("Titulo obrigatorio", 400)

    const task = await createUnifiedTask({
      orgId: member.orgId,
      title,
      description: body.description ?? null,
      sourceType: body.source_type ?? "manual",
      sourceMetadata: body.source_metadata ?? {},
      assigneeId: body.assignee_id ?? null,
      assigneeRole: body.assignee_role ?? null,
      slaHours: body.sla_hours ?? null,
      dueDate: body.due_date ?? null,
      priority: body.priority ?? "medium",
      createdBy: user.id,
    })
    if (!task) throw new AppError("Falha ao criar task", 500)
    return successResponse(request, { task }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "me-tasks-create")
  }
}

async function handleGet(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const member = await getUserOrgRole(user.id)
    if (!member) throw new AppError("Sem org membership", 403)
    const params = request.nextUrl.searchParams
    const status = params.get("status") ?? "pending"
    const sourceType = params.get("source_type")
    const dateFilter = params.get("date_filter")

    let tasks = await listVisibleTasks(
      {
        orgId: member.orgId,
        memberId: member.memberId,
        roles: member.roles,
      },
      {
        status,
        sourceType,
        limit: 500,
      },
    )

    const now = new Date()
    if (dateFilter === "today") {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      const end = new Date(now)
      end.setHours(23, 59, 59, 999)
      tasks = tasks.filter((task) => {
        if (!task.due_date) return false
        const due = new Date(task.due_date as string)
        return due >= start && due <= end
      })
    } else if (dateFilter === "week") {
      const end = new Date(now)
      end.setDate(end.getDate() + 7)
      tasks = tasks.filter((task) => {
        if (!task.due_date) return false
        const due = new Date(task.due_date as string)
        return due >= now && due <= end
      })
    } else if (dateFilter === "overdue") {
      tasks = tasks.filter(
        (task) =>
          Boolean(task.due_date) &&
          new Date(task.due_date as string) < now &&
          task.status !== "completed",
      )
    }

    const assigneeIds = Array.from(
      new Set(
        tasks
          .map((task) => task.assignee_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const assigneeMap = new Map<string, Record<string, unknown>>()
    const admin = createAdminClient()
    if (assigneeIds.length > 0) {
      const [{ data: profiles }, { data: members }] = await Promise.all([
        admin
          .from("profiles")
          .select("id, name, email, avatar_url")
          .in("id", assigneeIds),
        admin
          .from("org_members")
          .select(
            "id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)",
          )
          .in("id", assigneeIds),
      ])
      for (const profile of profiles ?? []) {
        assigneeMap.set(profile.id as string, profile)
      }
      for (const row of members ?? []) {
        const profile = Array.isArray(row.profile)
          ? row.profile[0]
          : row.profile
        if (profile) assigneeMap.set(row.id as string, profile)
      }
    }

    const enrichedTasks = tasks.map((task) => ({
      ...task,
      assignee: task.assignee_id
        ? (assigneeMap.get(task.assignee_id as string) ?? null)
        : null,
    }))
    const grouped: Record<string, typeof enrichedTasks> = {}
    const bySource: Record<string, number> = {}
    for (const task of enrichedTasks) {
      const source = String(task.source_type ?? "manual")
      if (!grouped[source]) grouped[source] = []
      grouped[source].push(task)
      bySource[source] = (bySource[source] ?? 0) + 1
    }
    const statusCounts = enrichedTasks.reduce<Record<string, number>>(
      (counts, task) => {
        const key = String(task.status)
        counts[key] = (counts[key] ?? 0) + 1
        return counts
      },
      {},
    )

    return successResponse(request, {
      tasks: enrichedTasks,
      grouped,
      counts: { total: enrichedTasks.length, by_source: bySource },
      status_counts: statusCounts,
      member: {
        id: member.memberId,
        profile_id: user.id,
        role: member.role,
        roles: member.roles,
        is_elevated: isOnboardingBypass(member.roles),
      },
    })
  } catch (error) {
    return errorResponse(request, error, "me-tasks")
  }
}

export const GET = withTiming("me/tasks", handleGet)
