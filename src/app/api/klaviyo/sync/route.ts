import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoSync")
import { createKlaviyoSyncService } from "@/lib/integrations/klaviyo-sync"

/**
 * POST /api/klaviyo/sync
 *
 * Inicia sincronização de campanhas e métricas do Klaviyo
 * Pode sincronizar uma loja específica ou todas as lojas
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { store_id } = body

    const syncService = createKlaviyoSyncService()

    if (store_id) {
      // Sync single store
      const { data: store, error: storeError } = await supabase
        .from("client_stores")
        .select("id, klaviyo_private_key")
        .eq("id", store_id)
        .single()

      if (storeError || !store) {
        return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
      }

      if (!store.klaviyo_private_key) {
        return NextResponse.json(
          { error: "Loja não tem Klaviyo configurado" },
          { status: 400 }
        )
      }

      const result = await syncService.syncStore(store_id, store.klaviyo_private_key)

      // Update sync config
      await supabase
        .from("klaviyo_sync_config")
        .upsert({
          store_id,
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success",
          last_sync_campaigns_count: result.total,
        })

      return NextResponse.json({
        success: true,
        message: "Sincronização concluída",
        result,
      })
    } else {
      // Sync all stores
      const result = await syncService.syncAllStores(user.id)

      return NextResponse.json({
        success: true,
        message: "Sincronização de todas as lojas iniciada",
        result,
      })
    }
  } catch (error) {
    log.error("Error in sync API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro na sincronização" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/klaviyo/sync
 *
 * Retorna status da última sincronização e jobs em andamento
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    // Get recent sync jobs
    let jobsQuery = supabase
      .from("klaviyo_sync_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)

    if (storeId) {
      jobsQuery = jobsQuery.eq("store_id", storeId)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 })
    }

    // Get sync configs
    let configsQuery = supabase
      .from("klaviyo_sync_config")
      .select(`
        *,
        client_stores (
          id,
          store_name,
          clients (name)
        )
      `)

    if (storeId) {
      configsQuery = configsQuery.eq("store_id", storeId)
    }

    const { data: configs, error: configsError } = await configsQuery

    if (configsError) {
      return NextResponse.json({ error: configsError.message }, { status: 500 })
    }

    // Get stores with Klaviyo configured
    const { data: stores, error: storesError } = await supabase
      .from("client_stores")
      .select(`
        id,
        store_name,
        klaviyo_private_key,
        clients (name)
      `)
      .not("klaviyo_private_key", "is", null)
      .eq("is_active", true)

    if (storesError) {
      return NextResponse.json({ error: storesError.message }, { status: 500 })
    }

    // Get campaign counts per store
    const { data: campaignCounts } = await supabase
      .from("klaviyo_campaigns")
      .select("store_id")

    const countByStore = new Map<string, number>()
    for (const c of campaignCounts || []) {
      countByStore.set(c.store_id, (countByStore.get(c.store_id) || 0) + 1)
    }

    return NextResponse.json({
      jobs,
      configs: configs?.map((c) => ({
        ...c,
        store_name: Array.isArray(c.client_stores)
          ? c.client_stores[0]?.store_name
          : c.client_stores?.store_name,
      })),
      stores: stores?.map((s) => {
        const clients = s.clients as { name: string }[] | { name: string } | null
        const clientName = Array.isArray(clients) ? clients[0]?.name : clients?.name
        return {
          id: s.id,
          name: s.store_name,
          client_name: clientName,
          has_klaviyo: !!s.klaviyo_private_key,
          campaign_count: countByStore.get(s.id) || 0,
        }
      }),
      total_stores: stores?.length || 0,
      total_campaigns: campaignCounts?.length || 0,
    })
  } catch (error) {
    log.error("Error in sync status API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
