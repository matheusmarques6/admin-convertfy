import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { encrypt } from "@/lib/crypto"
import { getPortalUser } from "@/lib/portal/auth"
import { logger } from "@/lib/logger"

const log = logger.child("PortalStores")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Get stores list for portal user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const permissions = portalUser.permissions as { view_reports?: boolean }
    if (!permissions?.view_reports) {
      throw new AppError("Sem permissão", 403)
    }

    // Use admin client to read credential presence flags
    const adminClient = createAdminClient()

    const { data: stores, error } = await adminClient
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        is_active,
        created_at,
        klaviyo_api_key,
        klaviyo_private_key,
        shopify_access_token,
        shopify_store_domain
      `)
      .eq("client_id", portalUser.client_id)
      .order("store_name")

    if (error) {
      log.error("[Portal Stores] Error:", error)
      throw new AppError("Erro ao buscar lojas", 500)
    }

    // SECURITY: Convert credentials to boolean flags - never expose actual keys to client
    const storesWithFlags = (stores || []).map((store) => ({
      id: store.id,
      store_name: store.store_name,
      platform: store.platform,
      store_url: store.store_url,
      is_active: store.is_active,
      created_at: store.created_at,
      hasKlaviyo: !!(store.klaviyo_private_key || store.klaviyo_api_key),
      shopify_access_token: !!store.shopify_access_token,
      shopify_store_domain: store.shopify_store_domain || "",
    }))

    return successResponse(request, { stores: storesWithFlags })
  } catch (error) {
    return errorResponse(request, error, "PortalStores")
  }
}

// PUT - Save credentials for a store (portal user)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const { store_id, klaviyo_private_key, shopify_store_domain, shopify_access_token } = body

    if (!store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client
    const { data: store } = await adminClient
      .from("client_stores")
      .select("id, client_id, integration_status")
      .eq("id", store_id)
      .eq("client_id", portalUser.client_id)
      .single()

    if (!store) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    const currentStatus = (store.integration_status as Record<string, unknown>) || {}

    if (klaviyo_private_key) {
      updateData.klaviyo_private_key = encrypt(klaviyo_private_key)
      updateData.klaviyo_api_key = encrypt(klaviyo_private_key) // backward compat
      updateData.integration_status = {
        ...currentStatus,
        klaviyo: { connected: true, connected_at: new Date().toISOString() },
      }
    }
    if (shopify_store_domain) {
      updateData.shopify_store_domain = shopify_store_domain
    }
    if (shopify_access_token) {
      updateData.shopify_access_token = encrypt(shopify_access_token)
      // Merge shopify status into integration_status
      const statusSoFar = (updateData.integration_status as Record<string, unknown>) || currentStatus
      updateData.integration_status = {
        ...statusSoFar,
        shopify: { connected: true, connected_at: new Date().toISOString() },
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError("Nenhuma credencial informada", 400)
    }

    const { error: updateError } = await adminClient
      .from("client_stores")
      .update(updateData)
      .eq("id", store_id)

    if (updateError) {
      log.error("[Portal Stores] Update error:", updateError)
      throw new AppError("Erro ao salvar credenciais", 500)
    }

    // Auto-mark onboarding steps
    const markStep = async (stepName: string) => {
      try {
        const { data: onboarding } = await adminClient
          .from("client_onboardings")
          .select("id")
          .eq("client_id", portalUser.client_id)
          .in("status", ["in_progress", "not_started"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        if (!onboarding) return

        const { data: step } = await adminClient
          .from("client_onboarding_steps")
          .select("id, status")
          .eq("onboarding_id", onboarding.id)
          .eq("name", stepName)
          .neq("status", "completed")
          .limit(1)
          .single()

        if (!step) return

        await adminClient
          .from("client_onboarding_steps")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", step.id)

        // Recalculate progress
        const { data: allSteps } = await adminClient
          .from("client_onboarding_steps")
          .select("status")
          .eq("onboarding_id", onboarding.id)

        if (allSteps) {
          const total = allSteps.length
          const completed = allSteps.filter(
            (s) => s.status === "completed" || s.status === "skipped"
          ).length
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0

          const onboardingUpdate: Record<string, unknown> = {
            progress_percent: percent,
          }
          if (percent === 100) {
            onboardingUpdate.status = "completed"
            onboardingUpdate.completed_at = new Date().toISOString()
          }

          await adminClient
            .from("client_onboardings")
            .update(onboardingUpdate)
            .eq("id", onboarding.id)
        }
      } catch (error) {
        log.error(`[Portal Stores] Error auto-marking "${stepName}":`, error)
      }
    }

    if (klaviyo_private_key) {
      await markStep("Klaviyo Conectado")
    }
    if (shopify_access_token) {
      await markStep("Acesso à Loja Configurado")
    }

    return successResponse(request, {
      success: true,
      message: "Credenciais salvas com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "PortalStores")
  }
}
