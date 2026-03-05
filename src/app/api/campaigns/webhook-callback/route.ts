import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { webhookCallbackSchema } from "@/lib/schemas/campaign-generation"
import { logger } from "@/lib/logger"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { errorResponse, successResponse, AppError, ValidationError } from "@/lib/api/errors"

const log = logger.child("WebhookCallback")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validate webhook secret (timing-safe comparison)
    const secret = request.headers.get("x-webhook-secret")
    const expected = process.env.N8N_WEBHOOK_SECRET
    if (!secret || !expected || secret.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // 2. Parse and validate body
    const body = await request.json()
    const result = webhookCallbackSchema.safeParse(body)

    if (!result.success) {
      throw new ValidationError(result.error.issues.map((i) => i.message).join("; "))
    }

    const parsed = result.data

    const adminClient = createAdminClient()

    // 3. Look up generation
    const { data: generation, error: genError } = await adminClient
      .from("campaign_generations")
      .select("id, status")
      .eq("id", parsed.generation_id)
      .single()

    if (genError || !generation) {
      throw new AppError("Generation not found", 404, "NOT_FOUND")
    }

    // 4. Fetch existing generation stores to validate store_ids
    const { data: existingStores } = await adminClient
      .from("campaign_generation_stores")
      .select("id, store_id")
      .eq("generation_id", parsed.generation_id)

    // Build map: store_id -> record id
    const storeMap = new Map<string, string>()
    for (const store of existingStores || []) {
      storeMap.set(store.store_id, store.id)
    }

    // 5. Update campaign_generations: drive info + status = "done" ALWAYS
    const genUpdateData: Record<string, unknown> = {
      status: "done",
    }
    if (parsed.drive_folder_id) {
      genUpdateData.drive_folder_id = parsed.drive_folder_id
    }
    if (parsed.drive_folder_url) {
      genUpdateData.drive_folder_url = parsed.drive_folder_url
    }

    await adminClient
      .from("campaign_generations")
      .update(genUpdateData)
      .eq("id", parsed.generation_id)

    // 6. Update each store status
    for (const storePayload of parsed.stores) {
      const recordId = storeMap.get(storePayload.store_id)
      if (!recordId) {
        // Unknown store_id -- silently ignore
        log.warn(`Unknown store_id in callback: ${storePayload.store_id}`)
        continue
      }

      const storeUpdateData: Record<string, unknown> = {
        status: storePayload.status,
      }

      if (storePayload.status === "done") {
        storeUpdateData.generated_at = new Date().toISOString()
      }

      if (storePayload.status === "error" && storePayload.error_message) {
        storeUpdateData.error_message = storePayload.error_message
      }

      await adminClient
        .from("campaign_generation_stores")
        .update(storeUpdateData)
        .eq("id", recordId)
    }

    log.info(`Webhook callback processed for generation ${parsed.generation_id}`)

    return successResponse(request, { received: true })
  } catch (error) {
    return errorResponse(request, error, "WebhookCallback")
  }
}
