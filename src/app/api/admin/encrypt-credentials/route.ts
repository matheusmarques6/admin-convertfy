import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { errorResponse, successResponse, requireRole } from "@/lib/api/errors"
import { encrypt, encryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("EncryptCredentials")

const STORE_CREDENTIAL_FIELDS = [
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
]

const PREFIX = "enc:v1:"

// POST - One-time migration to encrypt all existing plain-text credentials
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireRole(supabase, ["admin"])
    const adminClient = createAdminClient()

    let storesEncrypted = 0
    let integrationsEncrypted = 0

    // 1. Encrypt client_stores credentials
    const { data: stores } = await adminClient
      .from("client_stores")
      .select("id, shopify_access_token, shopify_api_key, shopify_api_secret, klaviyo_api_key, klaviyo_private_key, klaviyo_public_key")

    if (stores) {
      for (const store of stores) {
        const updates: Record<string, string> = {}
        let hasUpdates = false

        for (const field of STORE_CREDENTIAL_FIELDS) {
          const value = store[field as keyof typeof store] as string | null
          if (value && typeof value === "string" && !value.startsWith(PREFIX)) {
            updates[field] = encrypt(value)
            hasUpdates = true
          }
        }

        if (hasUpdates) {
          await adminClient.from("client_stores").update(updates).eq("id", store.id)
          storesEncrypted++
        }
      }
    }

    // 2. Encrypt integrations credentials
    const { data: integrations } = await adminClient
      .from("integrations")
      .select("id, credentials")

    if (integrations) {
      for (const integration of integrations) {
        if (integration.credentials && typeof integration.credentials === "object") {
          const encrypted = encryptCredentialsJson(integration.credentials as Record<string, unknown>)
          await adminClient.from("integrations").update({ credentials: encrypted }).eq("id", integration.id)
          integrationsEncrypted++
        }
      }
    }

    log.info("Credential encryption migration complete", { storesEncrypted, integrationsEncrypted })

    return successResponse(request, {
      message: "Migration complete",
      storesEncrypted,
      integrationsEncrypted,
    })
  } catch (error) {
    return errorResponse(request, error, "EncryptCredentials")
  }
}
