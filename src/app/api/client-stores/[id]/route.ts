import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { logger } from "@/lib/logger"
import { withTiming } from "@/lib/api/with-timing"

const log = logger.child("ClientStoreDelete")

export const dynamic = "force-dynamic"

// GET - Fetch single store with full row (todos os campos do client_stores)
// Usado pelas abas v2 (Contexto, Setup, Atividade, Pesquisa) que precisam
// ler campos diversos sem ter que listar cada coluna no select.
export const GET = withTiming("client-stores/[id]", handleGet)

async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const { id: storeId } = await params

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Valida acesso (org isolation · sem requirement explicito = read-only)
    await requireStoreAccess(storeId, user.id)

    const adminClient = createAdminClient()
    const { data: store, error } = await adminClient
      .from("client_stores")
      .select(
        `*,
         clients (id, name, email, phone, cpf_cnpj)`,
      )
      .eq("id", storeId)
      .single()

    if (error || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    return successResponse(request, { store })
  } catch (error) {
    return errorResponse(request, error, "ClientStoreGet")
  }
}

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

    // Validate access + require can_edit permission (admin/owner bypass built-in)
    const store = await requireStoreAccess(storeId, user.id, "can_edit")

    const adminClient = createAdminClient()

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
      store_name: store.storeName,
      client_id: store.clientId,
      deleted_by: user.id,
    })

    return successResponse(request, {
      success: true,
      message: `Loja "${store.storeName}" excluída com sucesso`,
    })
  } catch (error) {
    return errorResponse(request, error, "ClientStoreDelete")
  }
}
