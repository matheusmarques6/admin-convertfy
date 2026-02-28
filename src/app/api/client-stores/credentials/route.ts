import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { encrypt, encryptCredentialsJson } from "@/lib/crypto"
import { validateShopifyCredentials, validateKlaviyoCredentials } from "@/lib/services/credential-validator.service"
import type { ValidationResult } from "@/lib/services/credential-validator.service"
import { logger } from "@/lib/logger"

const log = logger.child("ClientStoresCredentials")

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
  "currency",
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

    const storeData = processFields(fields)

    // Para lojas avulsas, buscar org_member do usuario autenticado
    let orgMember: { id: string; org_id: string } | null = null

    if (client_id) {
      // Fluxo existente: loja vinculada a cliente
      storeData.client_id = client_id
    } else {
      // Fluxo novo: loja avulsa (sem cliente)
      // org_id sera preenchido pelo trigger set_store_org_id() no banco
      // Mas tambem buscamos aqui para garantir consistencia na API
      const adminClient = createAdminClient()
      const { data: { user } } = await supabase.auth.getUser()

      const { data: member } = await adminClient
        .from("org_members")
        .select("id, org_id")
        .eq("profile_id", user!.id)
        .single()

      if (!member) {
        throw new AppError("Usuário não pertence a nenhuma organização", 400)
      }

      orgMember = member
      storeData.org_id = member.org_id
    }

    // Handle ga4_credentials (encrypt as JSON string)
    if (ga4_credentials) {
      storeData.ga4_credentials = encryptCredentialsJson(ga4_credentials)
    }

    // Validate credentials BEFORE inserting (using plain-text values from body)
    const validationResults = await runCredentialValidation(fields, storeData)

    const { data, error } = await supabase
      .from("client_stores")
      .insert(storeData)
      .select()
      .single()

    if (error) throw error

    // (GAP-G4) Se loja avulsa, auto-criar agent_store_access para o criador
    if (!client_id && orgMember) {
      const adminClient = createAdminClient()
      const { data: { user } } = await supabase.auth.getUser()

      await adminClient
        .from("agent_store_access")
        .insert({
          org_member_id: orgMember.id,
          store_id: data.id,
          can_view: true,
          can_edit: true,
          assigned_by: user!.id,
        })
    }

    log.info("Store created", { store_id: data.id, client_id: client_id || null, standalone: !client_id })
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

    // Handle ga4_credentials (encrypt as JSON string)
    if (ga4_credentials !== undefined) {
      updates.ga4_credentials = ga4_credentials ? encryptCredentialsJson(ga4_credentials) : null
    }

    if (Object.keys(updates).length === 0) {
      return successResponse(request, { success: true, message: "No fields to update" })
    }

    // Validate credentials if they are being updated (using plain-text values from body)
    const validationResults = await runCredentialValidation(fields, updates)

    const { data, error } = await supabase
      .from("client_stores")
      .update(updates)
      .eq("id", store_id)
      .select()
      .single()

    if (error) throw error

    log.info("Store updated", { store_id, fields: Object.keys(updates) })
    return successResponse(request, { success: true, store: data, validation_results: validationResults })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}

