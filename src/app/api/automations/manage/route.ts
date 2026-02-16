import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AutomationsManage")

// PATCH - Toggle automation active status
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { id, is_active } = body

    if (!id || typeof is_active !== "boolean") {
      throw new AppError("id and is_active (boolean) are required", 400)
    }

    const { data, error } = await supabase
      .from("automations")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    log.info("Automation toggled", { automation_id: id, is_active })
    return successResponse(request, { success: true, automation: data })
  } catch (error) {
    return errorResponse(request, error, "AutomationsManage")
  }
}

// DELETE - Delete an automation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Automation deleted", { automation_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "AutomationsManage")
  }
}
