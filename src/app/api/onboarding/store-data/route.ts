import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateBriefing } from "@/lib/services/briefing.service"

const log = logger.child("OnboardingStoreData")

/**
 * GET /api/onboarding/store-data?store_id=X or ?client_id=X
 * Returns combined data from client_stores + store_onboarding_data.
 * If client_id is provided, returns data for the first store of that client (if any).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    const clientId = request.nextUrl.searchParams.get("client_id")

    if (!storeId && !clientId) {
      throw new AppError("store_id ou client_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    let store = null
    let onboardingData = null

    if (storeId) {
      // Fetch by store_id
      const { data, error } = await adminClient
        .from("client_stores")
        .select("id, client_id, org_id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
        .eq("id", storeId)
        .single()

      if (error || !data) {
        throw new AppError("Loja não encontrada", 404)
      }
      store = data

      const { data: od } = await adminClient
        .from("store_onboarding_data")
        .select("*")
        .eq("store_id", storeId)
        .single()
      onboardingData = od
    } else if (clientId) {
      // Fetch first store for this client (if any)
      const { data: stores } = await adminClient
        .from("client_stores")
        .select("id, client_id, org_id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(1)

      if (stores && stores.length > 0) {
        store = stores[0]
        const { data: od } = await adminClient
          .from("store_onboarding_data")
          .select("*")
          .eq("store_id", store.id)
          .single()
        onboardingData = od
      }
      // If no store exists, return nulls - the form will create one on save
    }

    // Fetch client personal data
    let clientData = null
    const resolvedClientId = store?.client_id || clientId
    if (resolvedClientId) {
      const { data: cl } = await adminClient
        .from("clients")
        .select("name, email, phone, cpf_cnpj, company")
        .eq("id", resolvedClientId)
        .single()
      clientData = cl
    }

    return successResponse(request, {
      store: store || null,
      onboarding_data: onboardingData || null,
      client: clientData || null,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreData")
  }
}

/**
 * POST /api/onboarding/store-data
 * Save form data. Accepts store_id (update existing) or client_id (create new store if needed).
 * Splits fields between client_stores and store_onboarding_data.
 * Auto-generates briefing when is_complete=true or when a briefing already exists (auto-regenerate on edit).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const adminClient = createAdminClient()

    const body = await request.json()

    if (!body.store_id && !body.client_id) {
      throw new AppError("store_id ou client_id é obrigatório", 400)
    }

    let storeId = body.store_id as string | null
    let clientId = body.client_id as string
    let orgId: string

    if (storeId) {
      // Existing store - verify it exists
      const { data: store, error: storeError } = await adminClient
        .from("client_stores")
        .select("id, client_id, org_id")
        .eq("id", storeId)
        .single()

      if (storeError || !store) {
        throw new AppError("Loja não encontrada", 404)
      }
      clientId = store.client_id
      orgId = store.org_id
    } else {
      // No store_id - get client's org_id and check if a store already exists
      const { data: client, error: clientError } = await adminClient
        .from("clients")
        .select("id, org_id")
        .eq("id", clientId)
        .single()

      if (clientError || !client) {
        throw new AppError("Cliente não encontrado", 404)
      }
      orgId = client.org_id

      // Check if client already has a store
      const { data: existingStores } = await adminClient
        .from("client_stores")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(1)

      if (existingStores && existingStores.length > 0) {
        storeId = existingStores[0].id
      } else {
        // Create new store for this client
        const newStoreData: Record<string, unknown> = {
          client_id: clientId,
          org_id: orgId,
          store_name: body.store_name || "Nova Loja",
          store_url: body.store_url || null,
          platform: body.platform || null,
          is_active: true,
        }

        const { data: newStore, error: createError } = await adminClient
          .from("client_stores")
          .insert(newStoreData)
          .select("id")
          .single()

        if (createError || !newStore) {
          log.error("Error creating store for client", createError)
          throw new AppError("Erro ao criar loja para o cliente", 500)
        }
        storeId = newStore.id
      }
    }

    // Update client_stores fields
    const storeUpdate: Record<string, unknown> = {}
    const storeFields = ["store_name", "store_url", "platform", "niche", "country", "language", "target_audience", "free_shipping_type", "shopify_collaborator_code"]
    for (const field of storeFields) {
      if (body[field] !== undefined) {
        storeUpdate[field] = body[field]
      }
    }

    if (Object.keys(storeUpdate).length > 0) {
      storeUpdate.updated_at = new Date().toISOString()
      const { error: updateError } = await adminClient
        .from("client_stores")
        .update(storeUpdate)
        .eq("id", storeId)

      if (updateError) {
        log.error("Error updating client_stores", updateError)
        throw new AppError("Erro ao atualizar dados da loja", 500)
      }
    }

    // Upsert store_onboarding_data
    const onboardingDataFields: Record<string, unknown> = {
      store_id: storeId,
      client_id: clientId,
      org_id: orgId,
      updated_at: new Date().toISOString(),
    }

    const onboardingFields = ["price_sensitivity", "additional_notes", "logo_url", "design_direction_text", "design_direction_file_url", "brand_manual_url"]
    for (const field of onboardingFields) {
      if (body[field] !== undefined) {
        onboardingDataFields[field] = body[field]
      }
    }

    if (body.is_complete !== undefined) {
      onboardingDataFields.is_complete = body.is_complete
      if (body.is_complete) {
        onboardingDataFields.filled_at = new Date().toISOString()
        onboardingDataFields.filled_by = user.id
      }
    }

    const { data: onboardingData, error: upsertError } = await adminClient
      .from("store_onboarding_data")
      .upsert(onboardingDataFields, { onConflict: "store_id" })
      .select()
      .single()

    if (upsertError) {
      log.error("Error upserting store_onboarding_data", upsertError)
      throw new AppError("Erro ao salvar dados do formulário", 500)
    }

    // Update client personal data if provided
    const clientFields = ["client_name", "client_email", "client_phone", "client_cpf_cnpj", "client_company"]
    const clientUpdate: Record<string, unknown> = {}
    const clientFieldMap: Record<string, string> = {
      client_name: "name",
      client_email: "email",
      client_phone: "phone",
      client_cpf_cnpj: "cpf_cnpj",
      client_company: "company",
    }
    for (const field of clientFields) {
      if (body[field] !== undefined) {
        clientUpdate[clientFieldMap[field]] = body[field]
      }
    }

    if (Object.keys(clientUpdate).length > 0) {
      clientUpdate.updated_at = new Date().toISOString()
      const { error: clientUpdateError } = await adminClient
        .from("clients")
        .update(clientUpdate)
        .eq("id", clientId)

      if (clientUpdateError) {
        log.error("Error updating client personal data", clientUpdateError)
        // Non-blocking: don't throw, just log
      }
    }

    // Auto-generate briefing:
    // 1. When form is marked complete (is_complete=true)
    // 2. When form data is saved and a briefing already exists (auto-regenerate on edit)
    let briefing = null
    let shouldRegenerateBriefing = false

    if (body.is_complete) {
      shouldRegenerateBriefing = true
    } else if (storeId) {
      // Check if a briefing already exists for this store — if so, regenerate on any save
      const { data: existingBriefing } = await adminClient
        .from("store_briefings")
        .select("id")
        .eq("store_id", storeId)
        .eq("status", "current")
        .limit(1)
        .maybeSingle()

      if (existingBriefing) {
        shouldRegenerateBriefing = true
      }
    }

    if (shouldRegenerateBriefing) {
      if (body.is_complete) {
        // Blocking: wait for briefing on form completion
        try {
          briefing = await generateBriefing(storeId!)
        } catch (err) {
          log.error("Error generating briefing", err)
        }
      } else {
        // Fire-and-forget: don't block save response on edits
        generateBriefing(storeId!)
          .then((result) => log.info(`Briefing auto-regenerated for store ${storeId}, v${result.version}`))
          .catch((err) => log.error("Error auto-regenerating briefing", err))
      }
    }

    return successResponse(request, {
      store_id: storeId,
      onboarding_data: onboardingData,
      briefing,
      message: body.is_complete
        ? "Formulário concluído e briefing gerado"
        : shouldRegenerateBriefing
          ? "Dados salvos e briefing sendo atualizado"
          : "Rascunho salvo",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreData")
  }
}
