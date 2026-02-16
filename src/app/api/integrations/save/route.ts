import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { encryptCredentialsJson } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsSave")

// POST - Save integration credentials (encrypted)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { integration_id, type, name, credentials, is_active } = body

    if (!type || !credentials) {
      throw new AppError("type and credentials are required", 400)
    }

    const encryptedCredentials = encryptCredentialsJson(credentials)

    if (integration_id) {
      const { error } = await supabase
        .from("integrations")
        .update({
          credentials: encryptedCredentials,
          is_active: is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration_id)

      if (error) throw error
      log.info("Integration updated", { integration_id, type })
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({
          type,
          name: name || type,
          credentials: encryptedCredentials,
          is_active: is_active ?? false,
        })

      if (error) throw error
      log.info("Integration created", { type })
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsSave")
  }
}
