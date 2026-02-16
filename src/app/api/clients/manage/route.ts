import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientsManage")

// DELETE - Delete a client
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      throw new AppError("id query parameter is required", 400)
    }

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", id)

    if (error) throw error

    log.info("Client deleted", { client_id: id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientsManage")
  }
}
