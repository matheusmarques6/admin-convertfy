import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminPortalUsers")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single portal user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const { id } = await params

    const { data: portalUser, error } = await supabase
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email),
        notification_preferences:client_notification_preferences(*)
      `)
      .eq("id", id)
      .single()

    if (error) {
      throw new AppError("Usuário não encontrado", 404)
    }

    return successResponse(request, { portalUser })
  } catch (error) {
    return errorResponse(request, error, "AdminPortalUsers")
  }
}

// PUT - Update portal user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      throw new AppError("Acesso negado", 403)
    }

    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.is_primary !== undefined) updateData.is_primary = body.is_primary
    if (body.permissions !== undefined) updateData.permissions = body.permissions

    const { data: portalUser, error } = await supabase
      .from("client_portal_users")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        client:clients(id, name, company)
      `)
      .single()

    if (error) {
      log.error("[Portal Users] Update error:", error)
      throw new AppError("Erro ao atualizar", 500)
    }

    return successResponse(request, { portalUser })
  } catch (error) {
    return errorResponse(request, error, "AdminPortalUsers")
  }
}

// DELETE - Delete portal user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      throw new AppError("Acesso negado", 403)
    }

    const { id } = await params

    // Get portal user to find auth_user_id
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("auth_user_id")
      .eq("id", id)
      .single()

    // Delete portal user record
    const { error: deleteError } = await supabase
      .from("client_portal_users")
      .delete()
      .eq("id", id)

    if (deleteError) {
      log.error("[Portal Users] Delete error:", deleteError)
      throw new AppError("Erro ao excluir", 500)
    }

    // Delete auth user if exists (requires admin client with service role)
    if (portalUser?.auth_user_id) {
      try {
        const adminClient = createAdminClient()
        await adminClient.auth.admin.deleteUser(portalUser.auth_user_id)
      } catch (e) {
        log.error("[Portal Users] Error deleting auth user:", e)
      }
    }

    return successResponse(request, { message: "Usuário excluído com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminPortalUsers")
  }
}
