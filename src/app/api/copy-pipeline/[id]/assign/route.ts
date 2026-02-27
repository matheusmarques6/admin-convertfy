import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAnyFeature } from "@/lib/api/check-permission"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CopyPipeline")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

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

    // Get org member for org isolation check
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Membro da organização não encontrado", 403)
    }

    // Verify pipeline exists and belongs to user's org
    const { data: pipeline } = await adminClient
      .from("copy_pipeline")
      .select("id, status, org_id")
      .eq("id", id)
      .single()

    if (!pipeline) {
      throw new AppError("Pipeline não encontrado", 404)
    }

    if (pipeline.org_id !== orgMember.org_id) {
      throw new AppError("Acesso negado", 403)
    }

    // Verify member exists, is active, AND belongs to the same org
    const { data: member } = await adminClient
      .from("org_members")
      .select("id, display_name, role")
      .eq("id", member_id)
      .eq("org_id", orgMember.org_id)
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

    log.info("Pipeline member assigned", {
      pipeline_id: id,
      member_id,
      role,
      by: orgMember.id,
    })

    return successResponse(request, updated)
  } catch (error) {
    return errorResponse(request, error, "CopyPipeline.Assign.POST")
  }
}
