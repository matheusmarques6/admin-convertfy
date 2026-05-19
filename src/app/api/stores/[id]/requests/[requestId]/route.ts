import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { requestId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (typeof body.title === "string") updates.title = body.title
    if (typeof body.description === "string") updates.description = body.description
    if (typeof body.priority === "string") updates.priority = body.priority
    if (typeof body.category === "string") updates.category = body.category
    if (typeof body.status === "string") {
      updates.status = body.status
      if (body.status === "completed") {
        updates.completed_at = new Date().toISOString()
        updates.completed_by = user.id
      } else {
        updates.completed_at = null
        updates.completed_by = null
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError("Nenhum campo válido para atualizar", 400)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_store_requests")
      .update(updates)
      .eq("id", requestId)
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { request: data })
  } catch (error) {
    return errorResponse(request, error, "StoreRequest")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { requestId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { error } = await admin
      .from("client_store_requests")
      .delete()
      .eq("id", requestId)

    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { deleted: true })
  } catch (error) {
    return errorResponse(request, error, "StoreRequest")
  }
}
