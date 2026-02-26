import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAnyFeature } from "@/lib/api/check-permission"

// GET - List copy pipeline items (filtered by status/client)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireAnyFeature(supabase, user.id, ["campaign_copy", "campaign_control", "campaign_view"])

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const clientId = searchParams.get("client_id")
    const storeId = searchParams.get("store_id")

    const adminClient = createAdminClient()

    // Get user's org
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      return successResponse(request, [])
    }

    let query = adminClient
      .from("copy_pipeline")
      .select(`
        *,
        client:clients(id, name),
        store:client_stores(id, store_name),
        design_assignee:org_members!copy_pipeline_design_assigned_to_fkey(id, display_name, role),
        impl_assignee:org_members!copy_pipeline_impl_assigned_to_fkey(id, display_name, role),
        approver:org_members!copy_pipeline_approved_by_fkey(id, display_name)
      `)
      .eq("org_id", orgMember.org_id)
      .order("created_at", { ascending: false })

    if (status) {
      query = query.eq("status", status)
    }
    if (clientId) {
      query = query.eq("client_id", clientId)
    }
    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return successResponse(request, data || [])
  } catch (error) {
    return errorResponse(request, error, "CopyPipeline.GET")
  }
}
