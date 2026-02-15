import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsKlaviyoTest")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// CORS headers helper


// Handle OPTIONS preflight requests


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
        "revision": "2024-10-15",
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
    log.error("Klaviyo test error:", error)
    return NextResponse.json(
      { error: "Erro ao testar conexão com Klaviyo" },
      { status: 500 }
    )
  }
}
