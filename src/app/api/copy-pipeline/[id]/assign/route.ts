import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAnyFeature } from "@/lib/api/check-permission"

// POST - Assign a team member to design or implementation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireAnyFeature(supabase, user.id, ["campaign_copy", "campaign_control"])

    const body = await request.json()
    const { role, member_id } = body

    if (!role || !["design", "implementation"].includes(role)) {
      throw new AppError("role deve ser 'design' ou 'implementation'", 400)
    }
    if (!member_id) {
      throw new AppError("member_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify pipeline exists
    const { data: pipeline } = await adminClient
      .from("copy_pipeline")
      .select("id, status")
      .eq("id", id)
      .single()

    if (!pipeline) {
      throw new AppError("Pipeline não encontrado", 404)
    }

    // Verify member exists and is active
    const { data: member } = await adminClient
      .from("org_members")
      .select("id, display_name, role")
      .eq("id", member_id)
      .eq("is_active", true)
      .single()

    if (!member) {
      throw new AppError("Membro não encontrado ou inativo", 404)
    }

    // Build update
    const updatePayload: Record<string, unknown> =
      role === "design"
        ? { design_assigned_to: member_id }
        : { impl_assigned_to: member_id }

    const { data: updated, error } = await adminClient
      .from("copy_pipeline")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return successResponse(request, updated)
  } catch (error) {
    return errorResponse(request, error, "CopyPipeline.Assign.POST")
  }
}
