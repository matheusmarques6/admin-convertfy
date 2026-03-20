import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { validateShopifyCredentials, validateKlaviyoCredentials } from "@/lib/services/credential-validator.service"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import type { ValidationResult } from "@/lib/services/credential-validator.service"
import { logger } from "@/lib/logger"

const log = logger.child("CredentialsRevalidate")

/**
 * POST /api/client-stores/credentials/revalidate
 *
 * Server-side credential revalidation. Reads credentials server-side,
 * validates them against external APIs, persists the result, and returns
 * ONLY the validation outcome (never the credentials themselves).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const { store_id } = body

    if (!store_id) {
      throw new AppError("store_id is required", 400)
    }

    // Validate user has access to this store (multi-tenant isolation)
    const storeAccess = await requireStoreAccess(store_id, user.id)

    // Read credentials server-side (decrypted) — pass orgId for defense-in-depth
    const credentials = await getStoreCredentials(store_id, storeAccess.orgId)

    const results: { shopify?: ValidationResult; klaviyo?: ValidationResult } = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbUpdates: Record<string, any> = {}

    // Validate Shopify if credentials are present
    const shopifyDomain = credentials.shopify_store_domain
    const shopifyToken = credentials.shopify_access_token
    if (shopifyDomain && shopifyToken) {
      log.info("Revalidating Shopify credentials", { store_id })
      const shopifyResult = await validateShopifyCredentials(shopifyDomain, shopifyToken)
      results.shopify = shopifyResult
      dbUpdates.shopify_validated_at = shopifyResult.tested_at
      dbUpdates.shopify_validation_error = shopifyResult.valid ? null : shopifyResult.error
    }

    // Validate Klaviyo if credentials are present
    const klaviyoKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (klaviyoKey) {
      log.info("Revalidating Klaviyo credentials", { store_id })
      const klaviyoResult = await validateKlaviyoCredentials(klaviyoKey)
      results.klaviyo = klaviyoResult
      dbUpdates.klaviyo_validated_at = klaviyoResult.tested_at
      dbUpdates.klaviyo_validation_error = klaviyoResult.valid ? null : klaviyoResult.error
      dbUpdates.klaviyo_missing_scopes = klaviyoResult.missingScopes || null
      dbUpdates.klaviyo_has_reporting_access = klaviyoResult.hasReportingAccess ?? null
    }

    // Persist validation results in the database
    if (Object.keys(dbUpdates).length > 0) {
      const adminClient = createAdminClient()
      const { error: updateError } = await adminClient
        .from("client_stores")
        .update(dbUpdates)
        .eq("id", store_id)

      if (updateError) {
        log.error("Failed to persist revalidation result", { store_id, error: updateError })
      }
    }

    log.info("Revalidation complete", { store_id, results: Object.keys(results) })

    // Return ONLY validation results (no credentials)
    return successResponse(request, {
      success: true,
      validation_results: results,
    })
  } catch (error) {
    return errorResponse(request, error, "CredentialsRevalidate")
  }
}
