import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { encryptCredentialsJson } from "@/lib/crypto"
import { updateStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsSave")

// Map integration type to client_stores credential fields
function mapCredentialsToStoreFields(
  type: string,
  credentials: Record<string, string>
): Record<string, unknown> {
  switch (type) {
    case "shopify":
      return {
        shopify_store_domain: credentials.store_url || credentials.shop,
        shopify_access_token: credentials.access_token,
        shopify_api_key: credentials.api_key,
        shopify_api_secret: credentials.api_secret,
      }
    case "klaviyo":
      return {
        klaviyo_api_key: credentials.api_key,
        klaviyo_private_key: credentials.private_key,
        klaviyo_public_key: credentials.public_key,
        klaviyo_list_id: credentials.list_id,
      }
    case "meta_ads":
    case "instagram":
      return {
        meta_access_token: credentials.access_token,
        meta_ad_account_id: credentials.ad_account_id,
        meta_instagram_account_id: credentials.instagram_account_id,
      }
    case "google_ads":
      return { google_ads_credentials: credentials }
    case "google_calendar":
      return { google_calendar_credentials: credentials }
    case "ga4":
      return {
        ga4_property_id: credentials.property_id,
        ga4_credentials: credentials,
      }
    default:
      return {}
  }
}

// POST - Save integration credentials (encrypted)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    const { integration_id, store_id, type, name, credentials, is_active, last_sync } = body

    if (!type || !credentials) {
      throw new AppError("type and credentials are required", 400)
    }

    // If store_id is provided, save to client_stores (per-client)
    if (store_id) {
      const storeFields = mapCredentialsToStoreFields(type, credentials)

      if (Object.keys(storeFields).length === 0) {
        throw new AppError(`Unsupported integration type for store: ${type}`, 400)
      }

      await updateStoreCredentials(store_id, storeFields, type as "shopify" | "klaviyo" | "meta" | "ga4" | "google_ads" | "google_calendar")

      log.info("Integration saved to client_stores", { store_id, type })
      return successResponse(request, { success: true, saved_to: "client_stores" })
    }

    // Fallback: save to integrations table (for global/org-level integrations)
    const encryptedCredentials = encryptCredentialsJson(credentials)

    if (integration_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {
        credentials: encryptedCredentials,
        is_active: is_active ?? true,
        updated_at: new Date().toISOString(),
      }
      if (last_sync) updateData.last_sync = last_sync

      const { data, error } = await supabase
        .from("integrations")
        .update(updateData)
        .eq("id", integration_id)
        .eq("org_id", orgId)
        .select()
        .single()

      if (error) throw error
      log.info("Integration updated in integrations table", { integration_id, type })
      return successResponse(request, { success: true, integration: data })
    } else {
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          type,
          name: name || type,
          credentials: encryptedCredentials,
          is_active: is_active ?? false,
          last_sync: last_sync || null,
          org_id: orgId,
        })
        .select()
        .single()

      if (error) throw error
      log.info("Integration created in integrations table", { type })
      return successResponse(request, { success: true, integration: data })
    }
  } catch (error) {
    return errorResponse(request, error, "IntegrationsSave")
  }
}

// DELETE - Remove integration
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      throw new AppError("id is required", 400)
    }

    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    log.info("Integration deleted", { id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsSave")
  }
}
