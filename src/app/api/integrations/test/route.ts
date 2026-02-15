import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationTest")
import { testIntegrationConnection } from "@/lib/integrations"
import type { IntegrationType } from "@/types"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { type, credentials } = body as {
      type: IntegrationType
      credentials: Record<string, string>
    }

    if (!type || !credentials) {
      return NextResponse.json(
        { error: "Tipo de integração e credenciais são obrigatórios" },
        { status: 400 }
      )
    }

    const result = await testIntegrationConnection(type, credentials)

    return NextResponse.json(result)
  } catch (error) {
    log.error("Error testing integration:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno do servidor"
      },
      { status: 500 }
    )
  }
}
