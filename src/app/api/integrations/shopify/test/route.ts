import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { normalizeShopifyDomain } from "@/lib/services/credential-validator.service"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsShopifyTest")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * Persist Shopify validation result in client_stores.
 */
async function persistShopifyValidation(
  storeId: string,
  testedAt: string,
  validationError: string | null
) {
  try {
    const adminClient = createAdminClient()
    await adminClient
      .from("client_stores")
      .update({
        shopify_validated_at: testedAt,
        shopify_validation_error: validationError,
      })
      .eq("id", storeId)
  } catch (err) {
    log.error("Failed to persist Shopify validation result", { storeId, error: err })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { store_domain, access_token, store_id } = body

    if (!store_domain || !access_token) {
      return NextResponse.json(
        { success: false, error: "Domínio e Access Token são obrigatórios" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Normalize the domain to ensure it's in the correct format
    const cleanDomain = normalizeShopifyDomain(store_domain)
    const testedAt = new Date().toISOString()

    log.debug("Testing Shopify connection:", {
      originalDomain: store_domain,
      cleanDomain,
      tokenPrefix: access_token.substring(0, 10) + "..."
    })

    // Test connection by fetching shop info
    // Try multiple API versions in case one is deprecated
    const apiVersions = ["2024-10", "2024-07", "2024-04", "2024-01"]
    let lastError: string | null = null
    let responseStatus = 0

    for (const apiVersion of apiVersions) {
      const url = `https://${cleanDomain}/admin/api/${apiVersion}/shop.json`
      log.debug("Trying Shopify API URL:", url)

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
          },
        })

        responseStatus = response.status

        if (response.ok) {
          const data = await response.json()
          const shop = data.shop

          log.debug("Shopify connection successful:", shop.name)

          // Persist validation success
          if (store_id) {
            await persistShopifyValidation(store_id, testedAt, null)
          }

          return NextResponse.json(
            {
              success: true,
              shop: {
                id: shop.id,
                name: shop.name,
                email: shop.email,
                domain: shop.domain,
                currency: shop.currency,
                country: shop.country_name,
                plan: shop.plan_name,
              },
              apiVersion,
            },
            { headers: corsHeaders(request.headers.get("origin")) }
          )
        }

        const errorText = await response.text()
        log.error(`Shopify API error (v${apiVersion}): ${response.status} ${errorText}`)

        // If it's a 401 or 403, the token is wrong - don't try other versions
        if (response.status === 401 || response.status === 403) {
          const errorMsg = "Access Token inválido ou sem permissões necessárias"

          // Persist validation failure
          if (store_id) {
            await persistShopifyValidation(store_id, testedAt, errorMsg)
          }

          return NextResponse.json(
            {
              success: false,
              error: `${errorMsg}. Verifique se o token tem permissão para ler dados da loja (read_products, read_orders, read_customers).`,
              details: {
                domain: cleanDomain,
                status: response.status,
              },
            },
            { status: response.status, headers: corsHeaders(request.headers.get("origin")) }
          )
        }

        // If it's a 404 on first try, the domain might be wrong
        if (response.status === 404 && apiVersion === apiVersions[0]) {
          const errorMsg = `Loja não encontrada: ${cleanDomain}`

          // Persist validation failure
          if (store_id) {
            await persistShopifyValidation(store_id, testedAt, errorMsg)
          }

          return NextResponse.json(
            {
              success: false,
              error: `Loja não encontrada. Verifique se o domínio está correto: ${cleanDomain}`,
              details: {
                originalDomain: store_domain,
                normalizedDomain: cleanDomain,
              },
            },
            { status: 404, headers: corsHeaders(request.headers.get("origin")) }
          )
        }

        lastError = errorText
      } catch (fetchError) {
        log.error(`Fetch error with API v${apiVersion}:`, fetchError)
        lastError = fetchError instanceof Error ? fetchError.message : "Erro de conexão"
      }
    }

    // If we get here, all versions failed
    const errorMsg = `Erro na API Shopify: ${responseStatus || "conexão falhou"}`
    if (store_id) {
      await persistShopifyValidation(store_id, testedAt, errorMsg)
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        details: lastError,
      },
      { status: responseStatus || 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("Error testing Shopify connection:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao testar conexão",
      },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
