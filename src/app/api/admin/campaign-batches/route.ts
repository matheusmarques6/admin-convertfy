import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - List all campaign batches (admin view)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

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
      console.error("[Campaign Batches] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar campanhas" }, { status: 500, headers: corsHeaders() })
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

    return NextResponse.json({
      batches: enrichedBatches || [],
      totalCount: enrichedBatches?.length || 0,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Campaign Batches] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Create new campaign batch
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Verify user is NOT a portal user (only internal staff can create campaigns)
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()

    if (portalUser) {
      return NextResponse.json({ error: "Acesso negado - clientes não podem criar campanhas" }, { status: 403, headers: corsHeaders() })
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
      return NextResponse.json(
        { error: "Nome da campanha deve ter pelo menos 3 caracteres" },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!campaign_type) {
      return NextResponse.json(
        { error: "Tipo de campanha é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!scheduled_at) {
      return NextResponse.json(
        { error: "Data e hora de envio são obrigatórios" },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!store_ids || !Array.isArray(store_ids) || store_ids.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma loja" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at)
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: "Data de envio deve ser no futuro" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Validate URL if provided
    if (instructions_doc_url && instructions_doc_url.trim()) {
      try {
        new URL(instructions_doc_url)
      } catch {
        return NextResponse.json(
          { error: "URL do documento de instruções inválida" },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    // Verify all store_ids exist (using admin client to bypass RLS)
    const { data: validStores, error: storeError } = await adminClient
      .from("client_stores")
      .select("id")
      .in("id", store_ids)

    if (storeError || !validStores || validStores.length !== store_ids.length) {
      return NextResponse.json(
        { error: "Uma ou mais lojas selecionadas não existem" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Create the campaign batch (using admin client to bypass RLS)
    console.log("[Campaign Batches] Attempting to create:", {
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
      console.error("[Campaign Batches] Error creating:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar campanha: " + insertError.message },
        { status: 500, headers: corsHeaders() }
      )
    }

    console.log("[Campaign Batches] Created:", newBatch)

    return NextResponse.json({
      success: true,
      batch: newBatch,
      message: `Campanha "${name}" criada com sucesso para ${store_ids.length} loja(s)`,
    }, { status: 201, headers: corsHeaders() })
  } catch (error) {
    console.error("[Campaign Batches] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
