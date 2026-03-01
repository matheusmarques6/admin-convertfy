import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("PortalOnboardingWizard")

/**
 * GET /api/portal/onboarding/wizard
 *
 * Returns the current wizard state: which steps are completed, user and store data.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id, name, email")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    // Get client data
    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, email, cpf_cnpj, company")
      .eq("id", portalUser.client_id)
      .single()

    // Get stores for this client
    const { data: stores } = await adminClient
      .from("client_stores")
      .select(`
        id, store_name, store_url, platform, niche, country, language,
        target_audience, free_shipping_type, shopify_collaborator_code,
        shopify_access_token, klaviyo_api_key, klaviyo_private_key
      `)
      .eq("client_id", portalUser.client_id)
      .eq("is_active", true)

    // Check if client has an approved onboarding (skip wizard)
    const { data: approvedOnboarding } = await adminClient
      .from("client_onboardings")
      .select("id")
      .eq("client_id", portalUser.client_id)
      .in("current_phase", ["generating_copies", "design", "implementation", "completed"])
      .limit(1)
      .maybeSingle()

    const hasApprovedOnboarding = !!approvedOnboarding

    // Determine completed steps
    const step1Complete = !!(client?.cpf_cnpj && portalUser?.name)
    const store = stores?.[0]
    const step2Complete = !!(store?.store_name && store?.niche)
    const step3Complete = !!store?.shopify_collaborator_code
    const step4Complete = !!(store?.klaviyo_private_key || store?.klaviyo_api_key)

    return successResponse(request, {
      wizardComplete: hasApprovedOnboarding || (step1Complete && step2Complete && step3Complete && step4Complete),
      hasApprovedOnboarding,
      steps: {
        personalInfo: { complete: step1Complete },
        storeData: { complete: step2Complete },
        shopifyCode: { complete: step3Complete },
        klaviyoKeys: { complete: step4Complete },
      },
      data: {
        name: portalUser.name || "",
        email: portalUser.email || "",
        cpf_cnpj: client?.cpf_cnpj || "",
        company: client?.company || "",
        store: store ? {
          id: store.id,
          store_name: store.store_name || "",
          store_url: store.store_url || "",
          platform: store.platform || "shopify",
          niche: store.niche || "",
          country: store.country || "BR",
          language: store.language || "pt-BR",
          target_audience: store.target_audience || "",
          free_shipping_type: store.free_shipping_type || "",
          shopify_collaborator_code: store.shopify_collaborator_code || "",
          has_shopify: !!store.shopify_access_token,
          has_klaviyo: !!(store.klaviyo_private_key || store.klaviyo_api_key),
        } : null,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "PortalOnboardingWizard")
  }
}

/**
 * POST /api/portal/onboarding/wizard
 *
 * Saves wizard data. Accepts a step parameter and step-specific data.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id, id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const { step, data } = body

    if (!step || !data) {
      throw new AppError("step e data são obrigatórios", 400)
    }

    switch (step) {
      case "personal_info": {
        const { name, email, cpf_cnpj, company } = data

        // Update portal user name/email
        if (name || email) {
          await adminClient
            .from("client_portal_users")
            .update({
              ...(name && { name }),
              ...(email && { email }),
            })
            .eq("id", portalUser.id)
        }

        // Update client cpf_cnpj and company
        if (cpf_cnpj || company) {
          await adminClient
            .from("clients")
            .update({
              ...(cpf_cnpj && { cpf_cnpj }),
              ...(company && { company }),
            })
            .eq("id", portalUser.client_id)
        }

        log.info("Wizard step 1 saved", { clientId: portalUser.client_id })
        return successResponse(request, { success: true, step: "personal_info" })
      }

      case "store_data": {
        const { store_id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type } = data

        const storeUpdate = {
          store_name,
          store_url,
          platform: platform || "shopify",
          niche,
          country: country || "BR",
          language: language || "pt-BR",
          target_audience,
          free_shipping_type,
          updated_at: new Date().toISOString(),
        }

        if (store_id) {
          // Verify store belongs to this client
          const { data: ownedStore } = await adminClient
            .from("client_stores")
            .select("id")
            .eq("id", store_id)
            .eq("client_id", portalUser.client_id)
            .single()

          if (!ownedStore) throw new AppError("Loja não encontrada", 404)

          // Update existing store
          await adminClient
            .from("client_stores")
            .update(storeUpdate)
            .eq("id", store_id)
        } else {
          // Create new store
          const { error } = await adminClient
            .from("client_stores")
            .insert({
              ...storeUpdate,
              client_id: portalUser.client_id,
              is_active: true,
            })
          if (error) throw error
        }

        log.info("Wizard step 2 saved", { clientId: portalUser.client_id })
        return successResponse(request, { success: true, step: "store_data" })
      }

      case "shopify_code": {
        const { store_id, collaborator_code } = data

        if (!store_id) throw new AppError("store_id é obrigatório", 400)

        // Verify store belongs to this client
        const { data: ownedStore3 } = await adminClient
          .from("client_stores")
          .select("id")
          .eq("id", store_id)
          .eq("client_id", portalUser.client_id)
          .single()

        if (!ownedStore3) throw new AppError("Loja não encontrada", 404)

        await adminClient
          .from("client_stores")
          .update({
            shopify_collaborator_code: collaborator_code,
            updated_at: new Date().toISOString(),
          })
          .eq("id", store_id)

        log.info("Wizard step 3 saved", { storeId: store_id })
        return successResponse(request, { success: true, step: "shopify_code" })
      }

      case "klaviyo_keys": {
        const { store_id, private_key } = data

        if (!store_id) throw new AppError("store_id é obrigatório", 400)
        if (!private_key) throw new AppError("private_key é obrigatório", 400)

        // Verify store belongs to this client
        const { data: ownedStore4 } = await adminClient
          .from("client_stores")
          .select("id")
          .eq("id", store_id)
          .eq("client_id", portalUser.client_id)
          .single()

        if (!ownedStore4) throw new AppError("Loja não encontrada", 404)

        // Test the key first
        const testRes = await fetch("https://a.klaviyo.com/api/accounts/", {
          headers: {
            Authorization: `Klaviyo-API-Key ${private_key}`,
            revision: "2024-10-15",
            Accept: "application/json",
          },
        })

        if (!testRes.ok) {
          throw new AppError("Chave da API inválida. Verifique e tente novamente.", 400)
        }

        // Save encrypted key
        await adminClient
          .from("client_stores")
          .update({
            klaviyo_private_key: encrypt(private_key),
            integration_status: {
              klaviyo: { connected: true, connected_at: new Date().toISOString() },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", store_id)

        log.info("Wizard step 4 saved", { storeId: store_id })
        return successResponse(request, { success: true, step: "klaviyo_keys" })
      }

      default:
        throw new AppError(`Step inválido: ${step}`, 400)
    }
  } catch (error) {
    return errorResponse(request, error, "PortalOnboardingWizard")
  }
}
