import { NextRequest, NextResponse } from "next/server"

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

// POST - Test Klaviyo API connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { api_key } = body

    if (!api_key) {
      return NextResponse.json(
        { error: "API key é obrigatória" },
        { status: 400 }
      )
    }

    // Test Klaviyo API connection
    const response = await fetch("https://a.klaviyo.com/api/accounts/", {
      method: "GET",
      headers: {
        "Authorization": `Klaviyo-API-Key ${api_key}`,
        "revision": "2024-02-15",
        "Accept": "application/json",
      },
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        message: "Conexão bem sucedida!",
        account: data.data?.[0]?.attributes?.contact_information?.organization_name || "Conta Klaviyo",
      })
    } else {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json({
        success: false,
        error: errorData.errors?.[0]?.detail || "Falha na autenticação",
      }, { status: response.status })
    }
  } catch (error) {
    console.error("Klaviyo test error:", error)
    return NextResponse.json(
      { error: "Erro ao testar conexão com Klaviyo" },
      { status: 500 }
    )
  }
}
