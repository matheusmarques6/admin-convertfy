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
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const member = await getUserOrgRole(user.id)
    if (!member) throw new AppError("Sem org membership", 403)
    const params = request.nextUrl.searchParams
    const tasks = await listVisibleTasks(
      {
        orgId: member.orgId,
        memberId: member.memberId,
        roles: member.roles,
      },
      {
        status: params.get("status"),
        sourceType: params.get("source_type"),
        type: params.get("type"),
        clientId: params.get("client_id"),
        storeId: params.get("store_id"),
        priority: params.get("priority"),
        limit: Math.min(
          Math.max(Number(params.get("limit") ?? 200) || 200, 1),
          500,
        ),
      },
    )
    return successResponse(request, { tasks })
  } catch (error) {
    return errorResponse(request, error, "tasks-list")
  }
}

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

    const admin = createAdminClient()
    if (body.onboarding_id) {
      const { data: onboarding } = await admin
        .from("onboardings")
        .select("id, current_column_id, current_version")
        .eq("id", body.onboarding_id)
        .eq("org_id", member.orgId)
        .eq("status", "in_progress")
        .maybeSingle()
      if (!onboarding) throw new AppError("Onboarding nao encontrado", 404)
      if (
        body.operational_column_id &&
        body.operational_column_id !== onboarding.current_column_id
      ) {
        throw new AppError("Task deve pertencer a etapa atual", 409)
      }
      body.operational_column_id = onboarding.current_column_id
      body.version = onboarding.current_version ?? 1
    }

    const { data, error } = await admin
      .from("tasks")
      .insert({
        org_id: member.orgId,
        title,
        description: body.description ?? null,
        type: body.type ?? "general",
        status: body.status ?? "pending",
        priority: body.priority ?? "medium",
        assignee_id: body.assignee_id ?? null,
        assignee_role: body.assignee_role ?? null,
        client_id: body.client_id ?? null,
        store_id: body.store_id ?? null,
        due_date: body.due_date ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        metadata: body.metadata ?? {},
        onboarding_id: body.onboarding_id ?? null,
        operational_column_id: body.operational_column_id ?? null,
        version: body.version ?? 1,
        source_type: body.source_type ?? "manual",
        created_by: user.id,
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { task: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "tasks-create")
  }
}
