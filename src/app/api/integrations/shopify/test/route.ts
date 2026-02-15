import { NextRequest, NextResponse } from "next/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// CORS headers helper


// Handle OPTIONS preflight requests


// Helper to normalize Shopify domain
function normalizeShopifyDomain(domain: string): string {
  // Remove protocol and trailing slashes
  let clean = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")

  // If it doesn't contain .myshopify.com, add it
  if (!clean.includes(".myshopify.com")) {
    // Remove any other domain suffixes if present
    clean = clean.replace(/\.(com|com\.br|net|org|store|shop)$/i, "")
    clean = `${clean}.myshopify.com`
  }

  return clean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { store_domain, access_token } = body

    if (!store_domain || !access_token) {
      return NextResponse.json(
        { success: false, error: "Domínio e Access Token são obrigatórios" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Normalize the domain to ensure it's in the correct format
    const cleanDomain = normalizeShopifyDomain(store_domain)

    console.log("Testing Shopify connection:", {
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
      console.log("Trying Shopify API URL:", url)

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

          console.log("Shopify connection successful:", shop.name)

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
        console.error(`Shopify API error (v${apiVersion}):`, response.status, errorText)

        // If it's a 401 or 403, the token is wrong - don't try other versions
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            {
              success: false,
              error: "Access Token inválido ou sem permissões necessárias. Verifique se o token tem permissão para ler dados da loja (read_products, read_orders, read_customers).",
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
        console.error(`Fetch error with API v${apiVersion}:`, fetchError)
        lastError = fetchError instanceof Error ? fetchError.message : "Erro de conexão"
      }
    }

    // If we get here, all versions failed
    return NextResponse.json(
      {
        success: false,
        error: `Erro na API Shopify: ${responseStatus || "conexão falhou"}`,
        details: lastError,
      },
      { status: responseStatus || 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("Error testing Shopify connection:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao testar conexão",
      },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
