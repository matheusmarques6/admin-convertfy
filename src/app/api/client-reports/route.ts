import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientReports")

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }
  return orgMember.org_id
}

// POST - Create a new report
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await request.json()
    const { client_id, store_id, store_name, report_type, period, date_range, report_data } = body

    if (!client_id || !store_id) {
      throw new AppError("client_id and store_id are required", 400)
    }

    const { data, error } = await supabase
      .from("client_reports")
      .insert({
        client_id,
        store_id,
        org_id: orgId,
        store_name: store_name || "Loja",
        report_type: report_type || "manual",
        period: period || "30d",
        date_range,
        report_data,
      })
      .select()
      .single()

    if (error) throw error

    log.info("Report created", { report_id: data.id, client_id })
    return successResponse(request, { success: true, report: data })
  } catch (error) {
    return errorResponse(request, error, "ClientReports")
  }
}

// PUT - Update report status
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await request.json()
    const { report_id, status } = body

    if (!report_id || !status) {
      throw new AppError("report_id and status are required", 400)
    }

    const { data, error } = await supabase
      .from("client_reports")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", report_id)
      .eq("org_id", orgId)
      .select()
      .single()

    if (error) throw error

    log.info("Report status updated", { report_id, status })
    return successResponse(request, { success: true, report: data })
  } catch (error) {
    return errorResponse(request, error, "ClientReports")
  }
}

// DELETE - Delete a report
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("client_reports")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error

    log.info("Report deleted", { report_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientReports")
  }
}
