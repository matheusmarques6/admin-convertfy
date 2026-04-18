import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

const log = logger.child("PortalOnboardingWizard")

function escapeLike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_")
}

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
    // Inclui omnisend_api_key; resiliente a migration pendente
    const selectNew = `
        id, store_name, store_url, platform, niche, country, language,
        target_audience, free_shipping_type, shopify_collaborator_code,
        shopify_access_token, klaviyo_api_key, klaviyo_private_key, omnisend_api_key
      `
    const selectLegacy = `
        id, store_name, store_url, platform, niche, country, language,
        target_audience, free_shipping_type, shopify_collaborator_code,
        shopify_access_token, klaviyo_api_key, klaviyo_private_key
      `
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let storesResp: any = await adminClient
      .from("client_stores")
      .select(selectNew)
      .eq("client_id", portalUser.client_id)
      .eq("is_active", true)
    if (storesResp.error && /omnisend_api_key/.test(storesResp.error.message || "")) {
      storesResp = await adminClient
        .from("client_stores")
        .select(selectLegacy)
        .eq("client_id", portalUser.client_id)
        .eq("is_active", true)
    }
    const stores = (storesResp.data || []) as Array<Record<string, unknown>>

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
    const isShopify = (store?.platform || "shopify") === "shopify"
    const step3Complete = isShopify ? !!store?.shopify_collaborator_code : true
    // Step 4: "plataforma de email" — aceita Klaviyo OU Omnisend
    const hasKlaviyo = !!(store?.klaviyo_private_key || store?.klaviyo_api_key)
    const hasOmnisend = !!store?.omnisend_api_key
    const step4Complete = hasKlaviyo || hasOmnisend

    return successResponse(request, {
      wizardComplete: hasApprovedOnboarding || (step1Complete && step2Complete && step3Complete && step4Complete),
      hasApprovedOnboarding,
      steps: {
        personalInfo: { complete: step1Complete },
        storeData: { complete: step2Complete },
        shopifyCode: { complete: step3Complete },
        klaviyoKeys: { complete: step4Complete }, // Mantido nome legado — ver emailPlatformKeys
        emailPlatformKeys: { complete: step4Complete },
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
          has_klaviyo: hasKlaviyo,
          has_omnisend: hasOmnisend,
          has_email_platform: step4Complete,
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
          store_name: store_name?.trim(),
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
          // Fix 5: Get org_id from client (needed for duplicate check and insert)
          const { data: clientData } = await adminClient
            .from("clients")
            .select("org_id")
            .eq("id", portalUser.client_id)
            .single()

          // Anti-duplicate check before creating new store
          if (store_name && clientData?.org_id) {
            const { data: existing } = await adminClient
              .from("client_stores")
              .select("id, store_name")
              .eq("org_id", clientData.org_id)
              .eq("is_active", true)
              .ilike("store_name", escapeLike(store_name.trim()))
              .limit(1)
              .maybeSingle()

            if (existing) {
              throw new AppError(`Loja "${store_name.trim()}" já existe nesta organização`, 409)
            }
          }

          // Create new store WITH org_id
          const { error } = await adminClient
            .from("client_stores")
            .insert({
              ...storeUpdate,
              client_id: portalUser.client_id,
              org_id: clientData?.org_id,
              is_active: true,
            })

          // Fix 1: Handle unique constraint violation (race condition)
          if (error) {
            if (error.code === "23505") {
              throw new AppError("Loja com este nome já existe nesta organização", 409)
            }
            throw error
          }
        }

        log.info("Wizard step 2 saved", { clientId: portalUser.client_id })
        return successResponse(request, { success: true, step: "store_data" })
      }

      case "create_shopify_app": {
        const { store_id, token, shopify_myshopify_domain } = data

        if (!store_id) throw new AppError("store_id é obrigatório", 400)

        // Verify store belongs to this client
        const { data: ownedStoreApp } = await adminClient
          .from("client_stores")
          .select("id, org_id")
          .eq("id", store_id)
          .eq("client_id", portalUser.client_id)
          .single()

        if (!ownedStoreApp) throw new AppError("Loja não encontrada", 404)

        // If token is provided, validate and save
        if (token) {
          // Format validation
          if (!token.startsWith("shpat_") || token.length < 20) {
            throw new AppError("Token deve começar com shpat_ e ter pelo menos 20 caracteres", 400)
          }

          if (!shopify_myshopify_domain) {
            throw new AppError("Domínio .myshopify.com é obrigatório quando o token é informado", 400)
          }

          // Clean domain (remove protocol, trailing slashes)
          const domain = shopify_myshopify_domain
            .replace(/^https?:\/\//, "")
            .replace(/\/+$/, "")
            .trim()

          // Test token against Shopify Admin API
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10_000)

          let testRes: Response
          try {
            testRes = await fetch(`https://${domain}/admin/api/2024-10/shop.json`, {
              headers: {
                "X-Shopify-Access-Token": token,
                "Content-Type": "application/json",
              },
              signal: controller.signal,
            })
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              throw new AppError("Não foi possível validar o token. Verifique o domínio da loja.", 504)
            }
            throw new AppError("Não foi possível validar o token. Verifique o domínio da loja.", 502)
          } finally {
            clearTimeout(timeout)
          }

          if (testRes.status === 401) {
            throw new AppError("Token inválido. Verifique se copiou corretamente.", 400)
          }
          if (testRes.status === 403) {
            throw new AppError("Token sem permissões suficientes. Verifique os escopos configurados.", 400)
          }
          if (!testRes.ok) {
            throw new AppError("Não foi possível validar o token. Verifique o domínio da loja.", 400)
          }

          // Save encrypted via credentials service
          await updateStoreCredentials(
            store_id,
            { shopify_access_token: token, shopify_store_domain: domain },
            "shopify",
            { orgId: ownedStoreApp.org_id }
          )

          log.info("Shopify token validated and saved", { storeId: store_id })
        }

        return successResponse(request, { success: true, step: "create_shopify_app" })
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
          .select("id, org_id")
          .eq("id", store_id)
          .eq("client_id", portalUser.client_id)
          .single()

        if (!ownedStore4) throw new AppError("Loja não encontrada", 404)

        // Test the key - use /api/metrics/ which requires metrics:read (minimum scope needed)
        let testRes: Response
        try {
          testRes = await fetch("https://a.klaviyo.com/api/metrics/?page[size]=1", {
            headers: {
              Authorization: `Klaviyo-API-Key ${private_key}`,
              revision: KLAVIYO_REVISION,
              Accept: "application/json",
            },
          })
        } catch {
          throw new AppError("Não foi possível conectar ao Klaviyo. Tente novamente.", 502)
        }

        if (testRes.status === 401) {
          throw new AppError("Chave da API inválida. Verifique e tente novamente.", 400)
        }
        if (testRes.status === 403) {
          throw new AppError(
            "Chave válida, mas sem permissões necessárias. Crie uma Private API Key com scope 'metrics:read' habilitado.",
            400
          )
        }
        if (!testRes.ok) {
          throw new AppError("Erro ao validar chave do Klaviyo. Tente novamente.", 400)
        }

        // Save encrypted key via centralized service (validates ASCII, encrypts)
        // Key already validated against API above, so resetValidation: false (sets validated_at = NOW)
        await updateStoreCredentials(store_id, {
          klaviyo_private_key: private_key,
          klaviyo_api_key: private_key,
        }, "klaviyo", { orgId: ownedStore4.org_id })

        // Set reporting access flag (confirmed by API test above)
        await adminClient
          .from("client_stores")
          .update({ klaviyo_has_reporting_access: true })
          .eq("id", store_id)

        log.info("Wizard step 4 saved (klaviyo)", { storeId: store_id })
        return successResponse(request, { success: true, step: "klaviyo_keys" })
      }

      case "omnisend_keys": {
        const { store_id, api_key } = data

        if (!store_id) throw new AppError("store_id é obrigatório", 400)
        if (!api_key) throw new AppError("api_key é obrigatório", 400)

        // Verify store belongs to this client
        const { data: ownedStoreOmni } = await adminClient
          .from("client_stores")
          .select("id, org_id")
          .eq("id", store_id)
          .eq("client_id", portalUser.client_id)
          .single()

        if (!ownedStoreOmni) throw new AppError("Loja não encontrada", 404)

        // Test the key via /v5/brands/current (endpoint mais leve)
        let omniRes: Response
        try {
          omniRes = await fetch("https://api.omnisend.com/v5/brands/current", {
            headers: {
              "X-API-KEY": api_key,
              Accept: "application/json",
            },
          })
        } catch {
          throw new AppError("Não foi possível conectar ao Omnisend. Tente novamente.", 502)
        }

        if (omniRes.status === 401) {
          throw new AppError("Chave da API Omnisend inválida. Verifique e tente novamente.", 400)
        }
        if (omniRes.status === 403) {
          throw new AppError("Chave sem permissões necessárias. Confira as permissões da API key no Omnisend.", 400)
        }
        if (!omniRes.ok) {
          throw new AppError("Erro ao validar chave do Omnisend. Tente novamente.", 400)
        }

        // Save encrypted key via centralized service
        await updateStoreCredentials(store_id, {
          omnisend_api_key: api_key,
        }, "omnisend", { orgId: ownedStoreOmni.org_id })

        log.info("Wizard step 4 saved (omnisend)", { storeId: store_id })
        return successResponse(request, { success: true, step: "omnisend_keys" })
      }

      default:
        throw new AppError(`Step inválido: ${step}`, 400)
    }
  } catch (error) {
    return errorResponse(request, error, "PortalOnboardingWizard")
  }
}
