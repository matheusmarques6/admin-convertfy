import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
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

const ALLOWED_FIELDS = [
  ...ENCRYPTED_FIELDS,
  "shopify_store_domain",
  "klaviyo_list_id",
]

// PUT - Update store credentials (encrypted)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { store_id, ...fields } = body

    if (!store_id) {
      throw new AppError("store_id is required", 400)
    }

    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.includes(key)) continue
      if (typeof value !== "string" || !value) continue

      if (ENCRYPTED_FIELDS.includes(key)) {
        updates[key] = encrypt(value)
      } else {
        updates[key] = value
      }
    }

    if (Object.keys(updates).length === 0) {
      return successResponse(request, { success: true, message: "No fields to update" })
    }

    const { error } = await supabase
      .from("client_stores")
      .update(updates)
      .eq("id", store_id)

    if (error) throw error

    log.info("Store credentials updated", { store_id, fields: Object.keys(updates) })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "ClientStoresCredentials")
  }
}
