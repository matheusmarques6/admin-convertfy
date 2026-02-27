import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError, ForbiddenError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientStoreDelete")

// DELETE - Remove a store and all related data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const { id: storeId } = await params

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify store exists
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, store_name, client_id, org_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Authorization: must be admin OR have can_edit access on this store
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.role === "admin"

    if (!isAdmin) {
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .single()

      const { data: access } = await adminClient
        .from("agent_store_access")
        .select("can_edit")
        .eq("store_id", storeId)
        .eq("org_member_id", orgMember?.id || "")
        .single()

      if (!access?.can_edit) {
        throw new ForbiddenError("Sem permissão para excluir esta loja")
      }
    }

    // Delete the store — all satellite tables have ON DELETE CASCADE
    // (store_alerts, store_briefings, store_onboarding_data, agent_store_access,
    //  client_onboardings, store_feedback_calls, dashboard_cache, campaigns_calendar,
    //  klaviyo_metrics tables, advanced_reporting tables)
    const { error: deleteError } = await adminClient
      .from("client_stores")
      .delete()
      .eq("id", storeId)

    if (deleteError) {
      log.error("Failed to delete store", { storeId, error: deleteError })
      throw new AppError("Erro ao excluir a loja: " + deleteError.message, 500)
    }

    log.info("Store deleted", {
      store_id: storeId,
      store_name: store.store_name,
      client_id: store.client_id,
      deleted_by: user.id,
    })

    return successResponse(request, {
      success: true,
      message: `Loja "${store.store_name}" excluída com sucesso`,
    })
  } catch (error) {
    return errorResponse(request, error, "ClientStoreDelete")
  }
}
