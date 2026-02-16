import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminCampaignBatches")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all campaign batches (admin view)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")

    // Use admin client to bypass RLS
    let query = adminClient
      .from("campaign_batches")
      .select(`
        *,
        creator:profiles!created_by(
          id,
          full_name,
          email
        )
      `)
      .order("scheduled_at", { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq("status", status)
    }

    const { data: batches, error } = await query

    if (error) {
      log.error("[Campaign Batches] Error fetching:", error)
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    // Enrich with store names
    const storeIds = Array.from(new Set(batches?.flatMap(b => b.store_ids || []) || []))

    let storeNames: Record<string, string> = {}
    if (storeIds.length > 0) {
      const { data: stores } = await adminClient
        .from("client_stores")
        .select("id, store_name")
        .in("id", storeIds)

      storeNames = Object.fromEntries(stores?.map(s => [s.id, s.store_name]) || [])
    }

    // Add store names to each batch
    const enrichedBatches = batches?.map(batch => ({
      ...batch,
      store_names: (batch.store_ids || []).map((id: string) => storeNames[id] || "Loja desconhecida"),
    }))

    return successResponse(request, {
      batches: enrichedBatches || [],
      totalCount: enrichedBatches?.length || 0,
    })
  } catch (error) {
    return errorResponse(request, error, "AdminCampaignBatches")
  }
}

// POST - Create new campaign batch
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const user = await requireAuth(supabase)

    // Verify user exists in profiles table (internal staff)
    // Users in profiles table can create campaigns, even if they're also portal users
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      throw new AppError("Acesso negado - usuário não encontrado", 403)
    }

    const body = await request.json()
    const {
      name,
      campaign_type,
      scheduled_at,
      instructions_doc_url,
      store_ids,
      notes,
    } = body

    // Validations
    if (!name || name.trim().length < 3) {
      throw new AppError("Nome da campanha deve ter pelo menos 3 caracteres", 400)
    }

    if (!campaign_type) {
      throw new AppError("Tipo de campanha é obrigatório", 400)
    }

    if (!scheduled_at) {
      throw new AppError("Data e hora de envio são obrigatórios", 400)
    }

    if (!store_ids || !Array.isArray(store_ids) || store_ids.length === 0) {
      throw new AppError("Selecione pelo menos uma loja", 400)
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at)
    if (scheduledDate <= new Date()) {
      throw new AppError("Data de envio deve ser no futuro", 400)
    }

    // Validate URL if provided
    if (instructions_doc_url && instructions_doc_url.trim()) {
      try {
        new URL(instructions_doc_url)
      } catch {
        throw new AppError("URL do documento de instruções inválida", 400)
      }
    }

    // Verify all store_ids exist (using admin client to bypass RLS)
    const { data: validStores, error: storeError } = await adminClient
      .from("client_stores")
      .select("id")
      .in("id", store_ids)

    if (storeError || !validStores || validStores.length !== store_ids.length) {
      throw new AppError("Uma ou mais lojas selecionadas não existem", 400)
    }

    // Create the campaign batch (using admin client to bypass RLS)
    log.debug("[Campaign Batches] Attempting to create:", {
      name: name.trim(),
      campaign_type,
      scheduled_at: scheduledDate.toISOString(),
      store_ids,
      user_id: user.id,
    })

    const { data: newBatch, error: insertError } = await adminClient
      .from("campaign_batches")
      .insert({
        name: name.trim(),
        campaign_type,
        scheduled_at: scheduledDate.toISOString(),
        instructions_doc_url: instructions_doc_url?.trim() || null,
        store_ids,
        notes: notes?.trim() || null,
        // Removed created_by temporarily - foreign key might be failing
        status: "scheduled",
      })
      .select()
      .single()

    if (insertError) {
      log.error("[Campaign Batches] Error creating:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar campanha: " + insertError.message },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    log.debug("[Campaign Batches] Created:", newBatch)

    return NextResponse.json({
      success: true,
      batch: newBatch,
      message: `Campanha "${name}" criada com sucesso para ${store_ids.length} loja(s)`,
    }, { status: 201, headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "AdminCampaignBatches")
  }
}
