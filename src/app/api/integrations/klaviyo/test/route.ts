import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse, AppError } from "@/lib/api/errors"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { getAccountInfo } from "@/lib/integrations/klaviyo/account"
import { findPlacedOrderMetric } from "@/lib/integrations/klaviyo/metrics"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsKlaviyoTest")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// POST - Test Klaviyo API connection
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    // Accept both private_key and api_key (same pattern used across the app)
    const apiKey = body.private_key || body.api_key
    const storeId = body.store_id

    if (!apiKey) {
      throw new AppError("API key é obrigatória", 400)
    }

    const origin = request.headers.get("origin")
    const testedAt = new Date().toISOString()

    // Step 1: Test account access via klaviyoRequest (with retry/rate-limit)
    log.info("Testing Klaviyo connection...")
    const accountInfo = await getAccountInfo(apiKey)

    // If getAccountInfo returns defaults without orgName, the key may be invalid
    // but getAccountInfo doesn't throw — it falls back. Let's check deeper.
    if (!accountInfo.orgName) {
      // Persist validation failure if store_id provided
      if (storeId) {
        await persistKlaviyoValidation(storeId, testedAt, "API Key inválida ou sem permissões")
      }

      return NextResponse.json({
        success: false,
        error: "API Key inválida ou sem permissões. Verifique se é uma Private API Key válida.",
      }, { status: 401, headers: corsHeaders(origin) })
    }

    // Step 2: Test reporting permissions by checking if we can find metrics
    let hasReportingAccess = false
    try {
      const metricId = await findPlacedOrderMetric(apiKey)
      hasReportingAccess = !!metricId
    } catch {
      hasReportingAccess = false
    }

    log.info("Klaviyo connection successful:", {
      orgName: accountInfo.orgName,
      timezone: accountInfo.timezone,
      hasReportingAccess,
    })

    // Persist validation success if store_id provided
    if (storeId) {
      await persistKlaviyoValidation(storeId, testedAt, null)
    }

    return NextResponse.json({
      success: true,
      message: "Conexão bem sucedida!",
      account: accountInfo.orgName,
      details: {
        timezone: accountInfo.timezone,
        currency: accountInfo.currency,
        locale: accountInfo.locale,
        hasReportingAccess,
      },
    }, { headers: corsHeaders(origin) })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoTest")
  }
}

/**
 * Persist Klaviyo validation result in client_stores.
 */
async function persistKlaviyoValidation(
  storeId: string,
  testedAt: string,
  validationError: string | null
) {
  try {
    const adminClient = createAdminClient()
    await adminClient
      .from("client_stores")
      .update({
        klaviyo_validated_at: testedAt,
        klaviyo_validation_error: validationError,
      })
      .eq("id", storeId)
  } catch (err) {
    log.error("Failed to persist Klaviyo validation result", { storeId, error: err })
  }
}
