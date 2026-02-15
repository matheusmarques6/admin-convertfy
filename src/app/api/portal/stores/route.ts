import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalStores")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





/**
 * Helper: get authenticated portal user with client_id
 */
async function getPortalUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: portalUser } = await adminClient
    .from("client_portal_users")
    .select("client_id, permissions")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single()

  return portalUser
}

// GET - Get stores list for portal user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const permissions = portalUser.permissions as { view_reports?: boolean }
    if (!permissions?.view_reports) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
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
        shopify_access_token,
        shopify_store_domain
      `)
      .eq("client_id", portalUser.client_id)
      .order("store_name")

    if (error) {
      log.error("[Portal Stores] Error:", error)
      return NextResponse.json({ error: "Erro ao buscar lojas" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // SECURITY: Convert credentials to boolean flags - never expose actual keys to client
    const storesWithFlags = (stores || []).map((store) => ({
      id: store.id,
      store_name: store.store_name,
      platform: store.platform,
      store_url: store.store_url,
      is_active: store.is_active,
      created_at: store.created_at,
      klaviyo_api_key: !!store.klaviyo_api_key,
      shopify_access_token: !!store.shopify_access_token,
      shopify_store_domain: store.shopify_store_domain || "",
    }))

    return NextResponse.json({ stores: storesWithFlags }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Portal Stores] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// PUT - Save credentials for a store (portal user)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()
    const { store_id, klaviyo_private_key, shopify_store_domain, shopify_access_token } = body

    if (!store_id) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client
    const { data: store } = await adminClient
      .from("client_stores")
      .select("id, client_id")
      .eq("id", store_id)
      .eq("client_id", portalUser.client_id)
      .single()

    if (!store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (klaviyo_private_key) {
      updateData.klaviyo_private_key = klaviyo_private_key
      updateData.klaviyo_api_key = klaviyo_private_key // backward compat
    }
    if (shopify_store_domain) {
      updateData.shopify_store_domain = shopify_store_domain
    }
    if (shopify_access_token) {
      updateData.shopify_access_token = shopify_access_token
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nenhuma credencial informada" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    const { error: updateError } = await adminClient
      .from("client_stores")
      .update(updateData)
      .eq("id", store_id)

    if (updateError) {
      log.error("[Portal Stores] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao salvar credenciais" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
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

    return NextResponse.json({
      success: true,
      message: "Credenciais salvas com sucesso",
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Portal Stores] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
