/**
 * GET /api/me/tasks
 * Retorna tasks atribuidas ao usuario logado:
 *   1) assignee_id = meu org_member.id, OU
 *   2) assignee_id is null AND assignee_role = meu role
 * Inclui contexto onboarding/cliente/loja.
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

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: orgMember } = await admin
      .from("org_members")
      .select("id, role, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!orgMember) throw new AppError("Sem org membership", 403)

    // Filtros
    const status = request.nextUrl.searchParams.get("status")

    const orFilter = `assignee_id.eq.${orgMember.id},and(assignee_id.is.null,assignee_role.eq.${orgMember.role})`

    let query = admin
      .from("tasks")
      .select(
        `id, title, status, priority, due_date, type, assignee_role, assignee_id,
         onboarding_id, operational_column_id, metadata, created_at, updated_at,
         client:clients(id, name, company),
         store:client_stores(id, store_name, platform),
         column:operational_pipeline_columns!tasks_operational_column_id_fkey(id, name, slug, color)`,
      )
      .eq("org_id", orgMember.org_id)
      .or(orFilter)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .limit(200)

    if (status) query = query.eq("status", status)

    const { data, error } = await query
    if (error) throw error
    return successResponse(request, {
      tasks: data ?? [],
      member: { id: orgMember.id, role: orgMember.role },
    })
  } catch (error) {
    return errorResponse(request, error, "me-tasks")
  }
}
