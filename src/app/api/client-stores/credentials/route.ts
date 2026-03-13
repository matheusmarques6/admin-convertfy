import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { encrypt, encryptCredentialsJson } from "@/lib/crypto"
import { validateShopifyCredentials, validateKlaviyoCredentials } from "@/lib/services/credential-validator.service"
import type { ValidationResult } from "@/lib/services/credential-validator.service"
import { logger } from "@/lib/logger"

const log = logger.child("ClientStoresCredentials")

/**
 * Auto-mark an onboarding step as completed when credentials are saved.
 * Uses adminClient to bypass RLS (same pattern as /api/portal/stores/route.ts).
 * Fails silently — credential save must never be blocked by onboarding logic.
 */
async function markOnboardingStepCompleted(
  storeId: string,
  stepName: string
) {
  try {
    const adminClient = createAdminClient()

    // Lookup client_id from the store (PUT handler only has store_id)
    const { data: store } = await adminClient
      .from("client_stores")
      .select("client_id")
      .eq("id", storeId)
      .single()

    if (!store?.client_id) return

    // Find active onboarding for this client
    const { data: onboarding } = await adminClient
      .from("client_onboardings")
      .select("id")
      .eq("client_id", store.client_id)
      .in("status", ["in_progress", "not_started"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!onboarding) return

    // Find the matching step that is not yet completed
    const { data: step } = await adminClient
      .from("client_onboarding_steps")
      .select("id, status")
      .eq("onboarding_id", onboarding.id)
      .eq("name", stepName)
      .neq("status", "completed")
      .limit(1)
      .single()

    if (!step) return

    // Mark step as completed
    await adminClient
      .from("client_onboarding_steps")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", step.id)

    // Recalculate onboarding progress
    const { data: allSteps } = await adminClient
      .from("client_onboarding_steps")
      .select("status")
      .eq("onboarding_id", onboarding.id)

    if (allSteps) {
      const total = allSteps.length
      const completed = allSteps.filter(
        (s) => s.status === "completed" || s.status === "skipped"
      ).length
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0

      const onboardingUpdate: Record<string, unknown> = {
        progress_percent: percent,
      }
      if (percent === 100) {
        onboardingUpdate.status = "completed"
        onboardingUpdate.completed_at = new Date().toISOString()
      }

      await adminClient
        .from("client_onboardings")
        .update(onboardingUpdate)
        .eq("id", onboarding.id)
    }
  } catch (error) {
    log.error(`[Credentials] Error auto-marking onboarding step "${stepName}":`, error)
  }
}

function escapeLike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_")
}

const ENCRYPTED_FIELDS = [
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
]

const PLAIN_FIELDS = [
  "store_name",
  "store_url",
  "platform",
  "client_id",
  "shopify_store_domain",
  "klaviyo_list_id",
  "ga4_property_id",
  "is_active",
]

const ALLOWED_FIELDS = [...ENCRYPTED_FIELDS, ...PLAIN_FIELDS]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processFields(fields: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processed: Record<string, any> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.includes(key)) continue
    if (value === undefined || value === null) continue

    if (ENCRYPTED_FIELDS.includes(key) && typeof value === "string" && value) {
      processed[key] = encrypt(value)
    } else {
      processed[key] = value
    }
  }
  return processed
}

/**
 * Run credential validation using plain-text values from the request body.
 * Returns validation results and the fields to persist in the database.
 */
async function runCredentialValidation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeData: Record<string, any>
): Promise<{
  shopify?: ValidationResult
  klaviyo?: ValidationResult
}> {
  const results: { shopify?: ValidationResult; klaviyo?: ValidationResult } = {}

  // Validate Shopify if credentials are present in body
  const shopifyDomain = body.shopify_store_domain
  const shopifyToken = body.shopify_access_token
  if (shopifyDomain && shopifyToken) {
    log.info("Validating Shopify credentials...")
    const shopifyResult = await validateShopifyCredentials(shopifyDomain, shopifyToken)
    results.shopify = shopifyResult
    storeData.shopify_validated_at = shopifyResult.tested_at
    storeData.shopify_validation_error = shopifyResult.valid ? null : shopifyResult.error
  }

  // Validate Klaviyo if credentials are present in body
  const klaviyoKey = body.klaviyo_private_key || body.klaviyo_api_key
  if (klaviyoKey) {
    log.info("Validating Klaviyo credentials...")
    const klaviyoResult = await validateKlaviyoCredentials(klaviyoKey)
    results.klaviyo = klaviyoResult
    storeData.klaviyo_validated_at = klaviyoResult.tested_at
    storeData.klaviyo_validation_error = klaviyoResult.valid ? null : klaviyoResult.error
  }

  return results
}

// POST - Create new store with encrypted credentials
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { client_id, ga4_credentials, ...fields } = body

    if (!client_id) {
      throw new AppError("client_id is required", 400)
    }

    const storeData = processFields(fields)
    storeData.client_id = client_id

    // Buscar org_id do cliente para garantir visibilidade na pagina /stores
    const adminClient = createAdminClient()
    const { data: client, error: clientLookupError } = await adminClient
      .from("clients")
      .select("org_id")
      .eq("id", client_id)
      .single()

    if (clientLookupError) {
      console.warn(`[client-stores] Failed to lookup client org_id for client_id=${client_id}:`, clientLookupError.message)
    }

    if (client?.org_id) {
      storeData.org_id = client.org_id
    }

    // Handle ga4_credentials (encrypt as JSON string)
    if (ga4_credentials) {
      storeData.ga4_credentials = encryptCredentialsJson(ga4_credentials)
    }

    // Fix 3: Trim store_name before insert
    if (storeData.store_name) {
      storeData.store_name = storeData.store_name.trim()
    }

    // Anti-duplicate check: verify no active store with same name in this org
    if (storeData.store_name && storeData.org_id) {
      const adminClient = createAdminClient()
      const { data: existing } = await adminClient
        .from("client_stores")
        .select("id, store_name")
        .eq("org_id", storeData.org_id)
        .eq("is_active", true)
        .ilike("store_name", escapeLike(storeData.store_name))
        .limit(1)
        .maybeSingle()

      if (existing) {
        throw new AppError(`Loja "${storeData.store_name}" já existe nesta organização`, 409)
      }
    }

    // STEP 1: Insert store FIRST (before validation).
    // This prevents data loss if Klaviyo/Shopify API validation times out.
    const { data, error } = await supabase
      .from("client_stores")
      .insert(storeData)
      .select()
      .single()

    // Fix 1: Handle unique constraint violation (race condition)
    if (error) {
      if (error.code === "23505") {
        throw new AppError("Loja com este nome já existe nesta organização", 409)
      }
      throw error
    }

    log.info("Store created", { store_id: data.id, client_id })

    // STEP 2: Validate credentials asynchronously and update validation fields.
    let validationResults: { shopify?: ValidationResult; klaviyo?: ValidationResult } = {}
    try {
      const validationUpdates: Record<string, unknown> = {}
      validationResults = await runCredentialValidation(fields, validationUpdates)

      if (Object.keys(validationUpdates).length > 0) {
        await supabase
          .from("client_stores")
          .update(validationUpdates)
          .eq("id", data.id)
      }
    } catch (validationError) {
      log.warn("Credential validation failed (store already created)", { store_id: data.id, error: validationError })
    }

    // STEP 3: Auto-mark onboarding steps (silent, non-blocking)
    if (fields.klaviyo_private_key || fields.klaviyo_api_key) {
      await markOnboardingStepCompleted(data.id, "Klaviyo Conectado")
    }
    if (fields.shopify_access_token) {
      await markOnboardingStepCompleted(data.id, "Acesso à Loja Configurado")
    }

    return successResponse(request, { success: true, store: data, validation_results: validationResults })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}

// PUT - Update store with encrypted credentials
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const { store_id, ga4_credentials, ...fields } = body

    if (!store_id) {
      throw new AppError("store_id is required", 400)
    }

    // Validate user has access to this store (multi-tenant isolation)
    await requireStoreAccess(store_id, user.id)

    const updates = processFields(fields)

    // Fix 4: Rename protection — check for duplicate store name on rename
    if (updates.store_name) {
      updates.store_name = updates.store_name.trim()
      const adminClient = createAdminClient()
      const { data: currentStore } = await adminClient
        .from("client_stores")
        .select("org_id")
        .eq("id", store_id)
        .single()

      if (currentStore?.org_id) {
        const { data: existing } = await adminClient
          .from("client_stores")
          .select("id, store_name")
          .eq("org_id", currentStore.org_id)
          .eq("is_active", true)
          .ilike("store_name", escapeLike(updates.store_name))
          .neq("id", store_id)
          .limit(1)
          .maybeSingle()

        if (existing) {
          throw new AppError(`Loja "${updates.store_name}" já existe nesta organização`, 409)
        }
      }
    }

    // Handle ga4_credentials (encrypt as JSON string)
    if (ga4_credentials !== undefined) {
      updates.ga4_credentials = ga4_credentials ? encryptCredentialsJson(ga4_credentials) : null
    }

    if (Object.keys(updates).length === 0) {
      return successResponse(request, { success: true, message: "No fields to update" })
    }

    // STEP 1: Save credentials FIRST (before validation).
    // This prevents data loss if Klaviyo/Shopify API validation times out.
    const { data, error } = await supabase
      .from("client_stores")
      .update(updates)
      .eq("id", store_id)
      .select()
      .single()

    if (error) throw error

    log.info("Store updated (pre-validation)", { store_id, fields: Object.keys(updates) })

    // STEP 2: Validate credentials asynchronously and update validation fields.
    // Even if this times out, the credentials are already persisted.
    let validationResults: { shopify?: ValidationResult; klaviyo?: ValidationResult } = {}
    try {
      const validationUpdates: Record<string, unknown> = {}
      validationResults = await runCredentialValidation(fields, validationUpdates)

      if (Object.keys(validationUpdates).length > 0) {
        await supabase
          .from("client_stores")
          .update(validationUpdates)
          .eq("id", store_id)
      }
    } catch (validationError) {
      log.warn("Credential validation failed (credentials already saved)", { store_id, error: validationError })
    }

    // STEP 3: Auto-mark onboarding steps (silent, non-blocking)
    if (fields.klaviyo_private_key || fields.klaviyo_api_key) {
      await markOnboardingStepCompleted(store_id, "Klaviyo Conectado")
    }
    if (fields.shopify_access_token) {
      await markOnboardingStepCompleted(store_id, "Acesso à Loja Configurado")
    }

    return successResponse(request, { success: true, store: data, validation_results: validationResults })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}

