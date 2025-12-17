import { NextRequest, NextResponse } from "next/server"

const SHOPIFY_API_VERSION = "2024-01"

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { store_domain, access_token } = body

    if (!store_domain || !access_token) {
      return NextResponse.json(
        { success: false, error: "Domínio e Access Token são obrigatórios" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Clean the domain (remove https:// and trailing slashes)
    const cleanDomain = store_domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")

    // Test connection by fetching shop info
    const url = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Shopify API error:", response.status, errorText)

      if (response.status === 401) {
        return NextResponse.json(
          { success: false, error: "Access Token inválido ou expirado" },
          { status: 401, headers: corsHeaders() }
        )
      }

      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: "Domínio da loja não encontrado" },
          { status: 404, headers: corsHeaders() }
        )
      }

      return NextResponse.json(
        { success: false, error: `Erro na API Shopify: ${response.status}` },
        { status: response.status, headers: corsHeaders() }
      )
    }

    const data = await response.json()
    const shop = data.shop

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
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("Error testing Shopify connection:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao testar conexão",
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
