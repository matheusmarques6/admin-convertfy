import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateRequestSchema } from "@/lib/schemas/campaign-generation"
import { logger } from "@/lib/logger"
import { handleCorsPreFlight } from "@/lib/cors"
import { AppError, errorResponse, successResponse } from "@/lib/api/errors"

// Route-level schema: extends the base schema but relaxes UUID validation on store_ids
// to allow the DB layer to handle ID format validation. Keeps the base schema as reference.
const routeRequestSchema = generateRequestSchema.extend({
  store_ids: z.array(z.string().min(1)).min(1, "Selecione pelo menos uma loja"),
  generation_id: z.string().min(1).nullable().optional(),
})

const log = logger.child("CampaignGenerate")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate body
    const body = await request.json()
    const parsed = routeRequestSchema.parse(body)

    // 2. Auth: get user via createClient
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Nao autorizado", 401)
    }

    // 3. Lookup portal user to get client_id
    const adminClient = createAdminClient()

    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const clientId = portalUser.client_id

    // 4. Filter store_ids by client ownership
    const uniqueStoreIds = [...new Set(parsed.store_ids)]

    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id, store_name, country, language")
      .eq("client_id", clientId)
      .in("id", uniqueStoreIds)

    if (!clientStores || clientStores.length === 0) {
      throw new AppError("Nenhuma loja valida encontrada", 400)
    }

    const validStoreMap = new Map(
      clientStores.map((s: { id: string; store_name: string; country: string; language: string }) => [s.id, s])
    )
    const validStoreIds = uniqueStoreIds.filter((id) => validStoreMap.has(id))

    if (validStoreIds.length === 0) {
      throw new AppError("Nenhuma loja valida encontrada", 400)
    }

    // 5. Regeneration or new campaign
    let generationId: string
    let driveFolderId: string | null = null
    const storeVersions: Map<string, number> = new Map()

    if (parsed.generation_id) {
      // --- Regeneration flow ---
      const { data: existingGen } = await adminClient
        .from("campaign_generations")
        .select("*")
        .eq("id", parsed.generation_id)
        .single()

      if (!existingGen) {
        throw new AppError("Campanha nao encontrada", 404)
      }

      if (existingGen.client_id !== clientId) {
        throw new AppError("Acesso negado", 403)
      }

      generationId = existingGen.id as string
      driveFolderId = (existingGen.drive_folder_id as string) || null

      // Update campaign status to processing
      await adminClient
        .from("campaign_generations")
        .update({ status: "processing" })
        .eq("id", generationId)

      // Get existing store entries
      const { data: existingStores } = await adminClient
        .from("campaign_generation_stores")
        .select("*")
        .eq("generation_id", generationId)

      const existingStoreMap = new Map(
        (existingStores || []).map((s: { store_id: string; version: number }) => [s.store_id, s])
      )

      // Build upsert data for stores
      const storeUpsertData = validStoreIds.map((storeId) => {
        const existing = existingStoreMap.get(storeId) as { id?: string; version?: number } | undefined
        if (existing) {
          const newVersion = (existing.version || 1) + 1
          storeVersions.set(storeId, newVersion)
          return {
            id: existing.id,
            generation_id: generationId,
            store_id: storeId,
            version: newVersion,
            status: "generating",
          }
        } else {
          storeVersions.set(storeId, 1)
          return {
            generation_id: generationId,
            store_id: storeId,
            version: 1,
            status: "pending",
          }
        }
      })

      await adminClient
        .from("campaign_generation_stores")
        .upsert(storeUpsertData)
    } else {
      // --- New campaign flow ---
      const { data: newGen, error: insertError } = await adminClient
        .from("campaign_generations")
        .insert({
          name: parsed.name,
          date: parsed.date,
          reference_doc_url: parsed.reference_doc_url ?? null,
          client_id: clientId,
          status: "processing",
        })
        .select()
        .single()

      if (insertError || !newGen) {
        log.error("Failed to create campaign_generations", { error: insertError })
        throw new AppError("Erro ao criar campanha", 500)
      }

      generationId = newGen.id as string

      // Insert store entries
      const storeInsertData = validStoreIds.map((storeId) => {
        storeVersions.set(storeId, 1)
        return {
          generation_id: generationId,
          store_id: storeId,
          status: "pending",
          version: 1,
        }
      })

      await adminClient
        .from("campaign_generation_stores")
        .insert(storeInsertData)
    }

    // 6. Fire webhook (non-blocking)
    const webhookUrl = process.env.N8N_CAMPAIGNS_WEBHOOK_URL
    if (webhookUrl) {
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/campaigns/webhook-callback`

      const stores = validStoreIds.map((storeId) => {
        const store = validStoreMap.get(storeId)!
        return {
          store_id: storeId,
          store_name: store.store_name,
          country: store.country,
          language: store.language,
          version: storeVersions.get(storeId) || 1,
        }
      })

      const webhookPayload = {
        generation_id: generationId,
        campaign_name: parsed.name,
        campaign_date: parsed.date,
        reference_doc_url: parsed.reference_doc_url ?? null,
        drive_folder_id: driveFolderId,
        callback_url: callbackUrl,
        stores,
      }

      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        })
      } catch (webhookError) {
        log.error("Webhook dispatch failed", { error: webhookError })
      }
    }

    // 7. Return success
    return successResponse(request, {
      generation_id: generationId,
      status: "processing",
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignGenerate")
  }
}
