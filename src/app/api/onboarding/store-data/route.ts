import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateBriefing } from "@/lib/services/briefing.service"

const log = logger.child("OnboardingStoreData")

/**
 * GET /api/onboarding/store-data?store_id=X
 * Returns combined data from client_stores + store_onboarding_data
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Fetch store data
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, client_id, org_id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Fetch onboarding data
    const { data: onboardingData } = await adminClient
      .from("store_onboarding_data")
      .select("*")
      .eq("store_id", storeId)
      .single()

    return successResponse(request, {
      store,
      onboarding_data: onboardingData || null,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreData")
  }
}

/**
 * POST /api/onboarding/store-data
 * Save form data. Splits fields between client_stores and store_onboarding_data.
 * Auto-generates briefing when is_complete=true.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const adminClient = createAdminClient()

    const body = await request.json()

    if (!body.store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Verify store exists
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, client_id, org_id")
      .eq("id", body.store_id)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
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
        .eq("id", body.store_id)

      if (updateError) {
        log.error("Error updating client_stores", updateError)
        throw new AppError("Erro ao atualizar dados da loja", 500)
      }
    }

    // Upsert store_onboarding_data
    const onboardingDataFields: Record<string, unknown> = {
      store_id: body.store_id,
      client_id: store.client_id,
      org_id: store.org_id,
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

    // Auto-generate briefing when form is complete
    let briefing = null
    if (body.is_complete) {
      try {
        briefing = await generateBriefing(body.store_id)
      } catch (err) {
        log.error("Error generating briefing", err)
        // Don't fail the whole request if briefing generation fails
      }
    }

    return successResponse(request, {
      onboarding_data: onboardingData,
      briefing,
      message: body.is_complete ? "Formulário concluído e briefing gerado" : "Rascunho salvo",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreData")
  }
}
