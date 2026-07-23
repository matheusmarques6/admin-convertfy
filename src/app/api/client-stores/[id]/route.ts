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

    // ── Exclusão em cascata explícita ────────────────────────────────
    // Duas FKs para client_stores NÃO têm ON DELETE CASCADE no banco:
    //   • onboardings.store_id        (migration 20260513015053)
    //   • campaign_generations.store_id (migration 20260305)
    // Por isso o DELETE direto na loja falha com violação de foreign key
    // ("onboardings_store_id_fkey"). Removemos os dependentes na ordem
    // correta antes de apagar a loja. As demais tabelas satélite já têm
    // ON DELETE CASCADE (store_alerts, store_briefings, store_onboarding_data,
    // agent_store_access, store_feedback_calls, dashboard_cache, klaviyo_metrics,
    // advanced_reporting, etc.) e caem junto no delete final.

    // 1. IDs dos onboardings da loja (para limpar filhos sem cascade)
    const { data: onboardingRows } = await adminClient
      .from("onboardings")
      .select("id")
      .eq("store_id", storeId)
    const onboardingIds = (onboardingRows ?? []).map((o) => o.id)

    // 2. task_overrides é filho de onboardings SEM cascade → apagar antes
    if (onboardingIds.length > 0) {
      const { error: overridesError } = await adminClient
        .from("task_overrides")
        .delete()
        .in("onboarding_id", onboardingIds)
      if (overridesError) {
        log.error("Failed to delete task_overrides", { storeId, error: overridesError })
        throw new AppError(
          "Erro ao excluir dados de onboarding da loja: " + overridesError.message,
          500,
        )
      }
    }

    // 3. onboardings — cascateia para tasks e onboarding_versions (têm CASCADE)
    const { error: onboardingError } = await adminClient
      .from("onboardings")
      .delete()
      .eq("store_id", storeId)
    if (onboardingError) {
      log.error("Failed to delete onboardings", { storeId, error: onboardingError })
      throw new AppError("Erro ao excluir o onboarding da loja: " + onboardingError.message, 500)
    }

    // 4. campaign_generation_stores — filho por-loja que referencia client_stores
    //    SEM cascade. A coluna store_id vive AQUI, não em campaign_generations
    //    (que é por client_id). Sem remover isto, o delete da loja quebra na FK.
    const { error: genStoresError } = await adminClient
      .from("campaign_generation_stores")
      .delete()
      .eq("store_id", storeId)
    if (genStoresError) {
      log.error("Failed to delete campaign_generation_stores", { storeId, error: genStoresError })
      throw new AppError(
        "Erro ao excluir gerações de campanha da loja: " + genStoresError.message,
        500,
      )
    }

    // 5. A loja em si — as demais satélites caem por ON DELETE CASCADE
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
