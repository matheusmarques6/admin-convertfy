import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  ValidationError,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { uuidSchema } from "@/lib/schemas/common"

const log = logger.child("PipelineMembers")

const addMemberSchema = z.object({
  pipeline_id: uuidSchema,
  user_id: uuidSchema,
  role: z.enum(["owner", "editor", "viewer"]),
})

const updateMemberSchema = z.object({
  member_id: uuidSchema,
  role: z.enum(["owner", "editor", "viewer"]),
})

// POST /api/pipeline/members - Add a member to a pipeline
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, addMemberSchema)

    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from("pipeline_members")
      .insert({
        pipeline_id: body.pipeline_id,
        user_id: body.user_id,
        role: body.role,
        added_by: user.id,
      })
      .select(`
        *,
        user:profiles!pipeline_members_user_id_fkey (id, name, email, avatar_url, role)
      `)
      .single()

    if (error) {
      log.error("Error adding pipeline member", { error: error.message })
      throw new AppError("Erro ao adicionar membro: " + error.message, 500)
    }

    return successResponse(request, data, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "PipelineMembers POST")
  }
}

// PATCH /api/pipeline/members - Update member role
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await parseAndValidate(request, updateMemberSchema)

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from("pipeline_members")
      .update({ role: body.role })
      .eq("id", body.member_id)

    if (error) {
      log.error("Error updating member role", { error: error.message })
      throw new AppError("Erro ao atualizar role: " + error.message, 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PipelineMembers PATCH")
  }
}

// DELETE /api/pipeline/members - Remove member
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const memberId = request.nextUrl.searchParams.get("id")
    if (!memberId) {
      throw new ValidationError("ID do membro é obrigatório")
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from("pipeline_members")
      .delete()
      .eq("id", memberId)

    if (error) {
      log.error("Error removing member", { error: error.message })
      throw new AppError("Erro ao remover membro: " + error.message, 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PipelineMembers DELETE")
  }
}
