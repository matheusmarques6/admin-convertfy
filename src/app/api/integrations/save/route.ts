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
    const { integration_id, type, name, credentials, is_active, last_sync } = body

    if (!type || !credentials) {
      throw new AppError("type and credentials are required", 400)
    }

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
        .select()
        .single()

      if (error) throw error
      log.info("Integration updated", { integration_id, type })
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
        })
        .select()
        .single()

      if (error) throw error
      log.info("Integration created", { type })
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
    await requireAuth(supabase)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      throw new AppError("id is required", 400)
    }

    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("id", id)

    if (error) throw error
    log.info("Integration deleted", { id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsSave")
  }
}
