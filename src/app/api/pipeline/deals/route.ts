import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("PipelineDeals")

// PATCH - Move deal to another stage
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { deal_id, stage_id } = body

    if (!deal_id || !stage_id) {
      throw new AppError("deal_id and stage_id are required", 400)
    }

    const { data, error } = await supabase
      .from("deals")
      .update({ stage_id })
      .eq("id", deal_id)
      .select()
      .single()

    if (error) throw error

    log.info("Deal moved", { deal_id, stage_id })
    return successResponse(request, { success: true, deal: data })
  } catch (error) {
    return errorResponse(request, error, "PipelineDeals")
  }
}

// DELETE - Delete a deal
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("deals")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Deal deleted", { deal_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PipelineDeals")
  }
}
