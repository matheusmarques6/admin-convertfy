import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { encrypt, encryptCredentialsJson } from "@/lib/crypto"
import { ENCRYPTED_FIELDS } from "@/lib/constants/credentials"
import { sanitizeStoreResponse, validateCredentialField } from "@/lib/services/credentials.service"
import { validateShopifyCredentials, validateKlaviyoCredentials, validateOmnisendCredentials } from "@/lib/services/credential-validator.service"
import type { ValidationResult } from "@/lib/services/credential-validator.service"
import { logger } from "@/lib/logger"

import { decrypt, decryptCredentialsJson } from "@/lib/crypto"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"

const log = logger.child("ClientStoresCredentials")

/**
 * Mascara uma credencial exibindo apenas os ultimos 4 caracteres.
 * Ex: 'pk_live_1234567890abcdef' → '••••••••••••cdef'
 */
function maskCredential(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length <= 4) return "••••"
  return "••••••••" + trimmed.slice(-4)
}

/**
 * GET /api/client-stores/credentials?store_id=xxx
 *
 * Retorna credenciais MASCARADAS (ultimos 4 chars) + status de cada
 * integracao. NUNCA retorna credenciais em plaintext.
 *
 * Formato de resposta:
 *   {
 *     credentials: {
 *       shopify: { store_domain, access_token_masked, configured },
 *       klaviyo: { public_key, private_key_masked, list_id, configured },
 *       omnisend: { api_key_masked, configured },
 *       ga4: { property_id, credentials_configured },
 *       meta: { access_token_masked, configured },
 *     },
 *     status: IntegrationStatus  // derived state per integration
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) throw new AppError("store_id e obrigatorio", 400)

    await requireStoreAccess(storeId, user.id)

    const adminClient = createAdminClient()
    const { data: store, error } = await adminClient
      .from("client_stores")
      .select(`
        id,
        shopify_store_domain,
        shopify_access_token,
        shopify_api_key,
        shopify_api_secret,
        klaviyo_api_key,
        klaviyo_private_key,
        klaviyo_public_key,
        klaviyo_list_id,
        omnisend_api_key,
        ga4_property_id,
        ga4_credentials,
        meta_access_token,
        meta_page_id,
        meta_ad_account_id
      `)
      .eq("id", storeId)
      .single()

    if (error || !store) throw new AppError("Loja nao encontrada", 404)

    // Descriptografa campos para mascarar (nunca expoe plaintext ao cliente)
    function safeDecrypt(value: string | null | undefined): string | null {
      if (!value) return null
      try {
        return decrypt(value)
      } catch {
        return null
      }
    }

    const shopifyToken = safeDecrypt(store.shopify_access_token)
    const klaviyoPrivate = safeDecrypt(store.klaviyo_private_key)
    const klaviyoPublic = safeDecrypt(store.klaviyo_public_key)
    const omnisendKey = safeDecrypt(store.omnisend_api_key)
    const metaToken = safeDecrypt(store.meta_access_token)
    const ga4Json = store.ga4_credentials
      ? (() => { try { return decryptCredentialsJson(store.ga4_credentials) } catch { return null } })()
      : null

    const integrationStatus = await getStoreIntegrationStatus(storeId)

    return successResponse(request, {
      credentials: {
        shopify: {
          store_domain: store.shopify_store_domain || "",
          access_token_masked: maskCredential(shopifyToken),
          configured: !!shopifyToken && !!store.shopify_store_domain,
        },
        klaviyo: {
          public_key: klaviyoPublic || "",
          private_key_masked: maskCredential(klaviyoPrivate),
          list_id: store.klaviyo_list_id || "",
          configured: !!klaviyoPrivate,
        },
        omnisend: {
          api_key_masked: maskCredential(omnisendKey),
          configured: !!omnisendKey,
        },
        ga4: {
          property_id: store.ga4_property_id || "",
          credentials_configured: !!ga4Json,
          client_email: (ga4Json && typeof ga4Json === "object" && "client_email" in ga4Json)
            ? String(ga4Json.client_email)
            : null,
        },
        meta: {
          access_token_masked: maskCredential(metaToken),
          page_id: store.meta_page_id || "",
          ad_account_id: store.meta_ad_account_id || "",
          configured: !!metaToken,
        },
      },
      status: integrationStatus,
    })
  } catch (error) {
    return errorResponse(request, error, "credentials.GET")
  }
}

/**
 * DELETE /api/client-stores/credentials?store_id=xxx&integration=klaviyo
 *
 * Remove credenciais de uma integracao especifica.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    const integration = request.nextUrl.searchParams.get("integration")
    if (!storeId) throw new AppError("store_id e obrigatorio", 400)
    if (!integration) throw new AppError("integration e obrigatorio", 400)

    await requireStoreAccess(storeId, user.id)

    const FIELDS_BY_INTEGRATION: Record<string, string[]> = {
      shopify: ["shopify_store_domain", "shopify_access_token", "shopify_api_key", "shopify_api_secret", "shopify_validated_at", "shopify_validation_error"],
      klaviyo: ["klaviyo_api_key", "klaviyo_private_key", "klaviyo_public_key", "klaviyo_list_id", "klaviyo_validated_at", "klaviyo_validation_error", "klaviyo_missing_scopes", "klaviyo_has_reporting_access"],
      omnisend: ["omnisend_api_key", "omnisend_validated_at", "omnisend_validation_error", "omnisend_has_reporting_access"],
      ga4: ["ga4_property_id", "ga4_credentials"],
      meta: ["meta_access_token", "meta_page_id", "meta_user_id", "meta_ad_account_id", "meta_instagram_account_id"],
    }

    const fields = FIELDS_BY_INTEGRATION[integration]
    if (!fields) throw new AppError(`Integracao '${integration}' invalida`, 400)

    const adminClient = createAdminClient()
    const updates: Record<string, null> = {}
    for (const f of fields) updates[f] = null

    const { error } = await adminClient
      .from("client_stores")
      .update(updates)
      .eq("id", storeId)

    if (error) throw error

    log.info(`Credentials deleted for integration ${integration}`, { storeId })
    return successResponse(request, { success: true, integration })
  } catch (error) {
    return errorResponse(request, error, "credentials.DELETE")
  }
}

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

const PLAIN_FIELDS = [
  "store_name",
  "store_url",
  "platform",
  "currency",
  "client_id",
  "shopify_store_domain",
  "klaviyo_list_id",
  "ga4_property_id",
  "is_active",
  // MRR em centavos — usado no dashboard operacional. Editado via UI
  // de stores em /admin/clients/[id].
  "mrr_cents",
]

const ALLOWED_FIELDS = [...ENCRYPTED_FIELDS, ...PLAIN_FIELDS]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processFields(fields: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processed: Record<string, any> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.includes(key)) continue
    if (value === undefined || value === null) continue

    if ((ENCRYPTED_FIELDS as ReadonlyArray<string>).includes(key) && typeof value === "string" && value) {
      const validated = validateCredentialField(key, value)
      processed[key] = encrypt(validated)
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
  omnisend?: ValidationResult
}> {
  const results: { shopify?: ValidationResult; klaviyo?: ValidationResult; omnisend?: ValidationResult } = {}

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

  // Validate Omnisend if credentials are present in body
  const omnisendKey = body.omnisend_api_key
  if (omnisendKey) {
    log.info("Validating Omnisend credentials...")
    const omnisendResult = await validateOmnisendCredentials(omnisendKey)
    results.omnisend = omnisendResult
    storeData.omnisend_validated_at = omnisendResult.tested_at
    storeData.omnisend_validation_error = omnisendResult.valid ? null : omnisendResult.error
    storeData.omnisend_has_reporting_access = omnisendResult.hasReportingAccess ?? false
  }

  return results
}

// POST - Create new store with encrypted credentials
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const authUser = await requireAuth(supabase)

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
    } else {
      // Fallback: derive org_id from the authenticated user's primary org
      // This handles cases where client.org_id is NULL (legacy data or race condition)
      const { resolveOrgId } = await import("@/lib/api/resolve-org")
      const fallbackOrgId = await resolveOrgId(authUser.id)
      storeData.org_id = fallbackOrgId
      console.warn(`[client-stores] Client ${client_id} has NULL org_id — using fallback org_id=${fallbackOrgId} from authenticated user`)
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

    return successResponse(request, { success: true, store: sanitizeStoreResponse(data), validation_results: validationResults })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}

/**
 * Deriva o novo email_platform a partir do estado atual da loja + payload
 * de fields. Retorna null se nao ha alteracao significativa.
 */
function derivePlatformAfterUpdate(
  currentStore: { email_platform?: string | null; omnisend_api_key?: string | null; klaviyo_private_key?: string | null; klaviyo_api_key?: string | null },
  fields: Record<string, unknown>
): "klaviyo" | "omnisend" | "none" {
  const nextOmnisend = "omnisend_api_key" in fields
    ? Boolean(fields.omnisend_api_key)
    : Boolean(currentStore.omnisend_api_key)
  const nextKlaviyoPriv = "klaviyo_private_key" in fields
    ? Boolean(fields.klaviyo_private_key)
    : Boolean(currentStore.klaviyo_private_key)
  const nextKlaviyoPub = "klaviyo_api_key" in fields
    ? Boolean(fields.klaviyo_api_key)
    : Boolean(currentStore.klaviyo_api_key)
  const nextKlaviyo = nextKlaviyoPriv || nextKlaviyoPub

  // Se ambos setados, prioriza aquele que esta sendo definido AGORA neste
  // request (indica intencao explicita de trocar). Se so um esta setado,
  // vence ele. Se nenhum, retorna "none".
  const addingOmnisend = "omnisend_api_key" in fields && Boolean(fields.omnisend_api_key)
  const addingKlaviyo = ("klaviyo_private_key" in fields && Boolean(fields.klaviyo_private_key))
    || ("klaviyo_api_key" in fields && Boolean(fields.klaviyo_api_key))

  if (addingOmnisend && !addingKlaviyo) return "omnisend"
  if (addingKlaviyo && !addingOmnisend) return "klaviyo"
  if (nextOmnisend && !nextKlaviyo) return "omnisend"
  if (nextKlaviyo && !nextOmnisend) return "klaviyo"
  if (nextOmnisend && nextKlaviyo) {
    // Ambas credenciais presentes e sem indicacao de troca no request:
    // manter o email_platform atual (se valido) para nao oscilar.
    if (currentStore.email_platform === "omnisend" || currentStore.email_platform === "klaviyo") {
      return currentStore.email_platform
    }
    return "klaviyo"
  }
  return "none"
}

/**
 * Migra a loja para uma nova plataforma de email marketing. Quando o
 * usuario troca de Klaviyo para Omnisend (ou vice-versa), os caches da
 * plataforma antiga ficam orfaos — o overview continua somando revenue
 * de Klaviyo que nao corresponde mais a realidade da loja. Este helper
 * executa o cleanup idempotente.
 *
 * Seguro para rodar quando newPlatform == oldPlatform (noop na troca).
 */
async function migrateEmailPlatform(
  storeId: string,
  newPlatform: "klaviyo" | "omnisend" | "none",
  oldPlatform: string | null | undefined,
) {
  const admin = createAdminClient()

  // Sempre atualiza email_platform para refletir o estado atual das
  // credenciais (mesmo que nao seja uma "troca" completa).
  if (oldPlatform !== newPlatform) {
    await admin
      .from("client_stores")
      .update({ email_platform: newPlatform })
      .eq("id", storeId)
  }

  const switchingFromKlaviyo = oldPlatform === "klaviyo" && newPlatform === "omnisend"
  const switchingFromOmnisend = oldPlatform === "omnisend" && newPlatform === "klaviyo"

  if (switchingFromKlaviyo) {
    log.info("[PlatformMigrate] Klaviyo -> Omnisend cleanup", { storeId })
    await admin
      .from("store_revenue_summary")
      .update({
        klaviyo_total_revenue: 0,
        klaviyo_campaign_revenue: 0,
        klaviyo_flow_revenue: 0,
      })
      .eq("store_id", storeId)
    await admin.from("klaviyo_campaign_metrics").delete().eq("store_id", storeId)
    await admin.from("klaviyo_flow_metrics").delete().eq("store_id", storeId)
  } else if (switchingFromOmnisend) {
    log.info("[PlatformMigrate] Omnisend -> Klaviyo cleanup", { storeId })
    await admin
      .from("store_revenue_summary")
      .update({
        omnisend_total_revenue: 0,
        omnisend_campaign_revenue: 0,
        omnisend_flow_revenue: 0,
      })
      .eq("store_id", storeId)
    // omnisend_total_orders sera zerado se a coluna existir
    await admin
      .from("store_revenue_summary")
      .update({ omnisend_total_orders: 0 })
      .eq("store_id", storeId)
      .then((res) => {
        if (res.error && !/omnisend_total_orders/.test(res.error.message || "")) {
          log.warn("[PlatformMigrate] Failed to zero omnisend_total_orders", { error: res.error.message })
        }
      })
    await admin.from("omnisend_campaign_metrics").delete().eq("store_id", storeId)
    await admin.from("omnisend_flow_metrics").delete().eq("store_id", storeId)
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

    // STEP 0: snapshot pre-update do estado de plataforma, para detectar
    // troca Klaviyo <-> Omnisend e executar o cleanup apos salvar.
    const adminForLookup = createAdminClient()
    const { data: preStore } = await adminForLookup
      .from("client_stores")
      .select("email_platform, omnisend_api_key, klaviyo_private_key, klaviyo_api_key")
      .eq("id", store_id)
      .single()

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

    // STEP 1.5: Reage a troca de plataforma de email marketing. Se o
    // usuario adicionou credenciais de uma nova plataforma, zera os
    // caches da antiga para nao poluir o overview. Falhas nao bloqueiam
    // o save — apenas logam.
    try {
      const newPlatform = derivePlatformAfterUpdate(
        (preStore as { email_platform?: string | null; omnisend_api_key?: string | null; klaviyo_private_key?: string | null; klaviyo_api_key?: string | null }) || {},
        fields as Record<string, unknown>,
      )
      const oldPlatform = preStore?.email_platform as string | null | undefined
      if (oldPlatform !== newPlatform || (oldPlatform === undefined && newPlatform !== "none")) {
        await migrateEmailPlatform(store_id, newPlatform, oldPlatform)
      }
    } catch (migrationError) {
      log.warn("Platform migration cleanup failed (credentials already saved)", { store_id, error: migrationError })
    }

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

    return successResponse(request, { success: true, store: sanitizeStoreResponse(data), validation_results: validationResults })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}

