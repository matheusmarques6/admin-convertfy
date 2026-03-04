import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { successResponse, errorResponse, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { getPortalUser } from "@/lib/portal/auth"

const log = logger.child("PortalTrackingStores")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const admin = createAdminClient()

    // Get client_stores for this client
    const { data: clientStores } = await admin
      .from("client_stores")
      .select("id")
      .eq("client_id", portalUser.client_id)

    if (!clientStores || clientStores.length === 0) {
      return successResponse(request, { stores: [] })
    }

    const clientStoreIds = clientStores.map(cs => cs.id)

    // Get tracking stores via client_store_id
    const { data: stores } = await admin
      .from("tracking_stores")
      .select("id, shop_domain, shop_name, is_active, last_sync_at, created_at, client_store_id")
      .in("client_store_id", clientStoreIds)
      .order("created_at", { ascending: false })

    return successResponse(request, { stores: stores || [] })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingStores GET")
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const { shop_domain, access_token, shop_name, client_store_id } = body as {
      shop_domain?: string
      access_token?: string
      shop_name?: string
      client_store_id?: string
    }

    if (!shop_domain || !access_token) {
      throw new AppError("Domínio da loja e access token são obrigatórios", 400)
    }

    const domain = shop_domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase()

    const admin = createAdminClient()

    // Determine client_store_id - either provided or find first active
    let resolvedClientStoreId = client_store_id
    let orgId: string | null = null

    if (resolvedClientStoreId) {
      // Verify ownership
      const { data: cs } = await admin
        .from("client_stores")
        .select("id, org_id")
        .eq("id", resolvedClientStoreId)
        .eq("client_id", portalUser.client_id)
        .single()

      if (!cs) {
        throw new AppError("Loja não encontrada", 404)
      }
      orgId = cs.org_id
    } else {
      // Get first client_store
      const { data: cs } = await admin
        .from("client_stores")
        .select("id, org_id")
        .eq("client_id", portalUser.client_id)
        .eq("is_active", true)
        .limit(1)
        .single()

      if (!cs) {
        throw new AppError("Nenhuma loja do cliente encontrada", 404)
      }
      resolvedClientStoreId = cs.id
      orgId = cs.org_id
    }

    // Check duplicate
    const { data: existing } = await admin
      .from("tracking_stores")
      .select("id, is_active")
      .eq("client_store_id", resolvedClientStoreId)
      .eq("shop_domain", domain)
      .maybeSingle()

    if (existing?.is_active) {
      return successResponse(request, { id: existing.id, message: "Loja já conectada" })
    }

    if (existing) {
      await admin
        .from("tracking_stores")
        .update({
          shopify_access_token: encrypt(access_token),
          shop_name: shop_name || domain,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)

      return successResponse(request, { id: existing.id, reactivated: true })
    }

    const crypto = await import("crypto")
    const webhookSecret = crypto.randomBytes(32).toString("hex")

    const { data: newStore, error } = await admin
      .from("tracking_stores")
      .insert({
        client_store_id: resolvedClientStoreId,
        org_id: orgId,
        shop_domain: domain,
        shop_name: shop_name || domain,
        shopify_access_token: encrypt(access_token),
        webhook_secret: webhookSecret,
        is_active: true,
      })
      .select("id")
      .single()

    if (error) throw error

    log.info("Tracking store connected", { storeId: newStore.id, domain })
    return successResponse(request, { id: newStore.id }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingStores POST")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const storeId = request.nextUrl.searchParams.get("id")
    if (!storeId) throw new AppError("ID da loja é obrigatório", 400)

    const admin = createAdminClient()

    // Verify ownership via client_stores
    const { data: clientStores } = await admin
      .from("client_stores")
      .select("id")
      .eq("client_id", portalUser.client_id)

    if (!clientStores || clientStores.length === 0) {
      throw new AppError("Loja não encontrada", 404)
    }

    const clientStoreIds = clientStores.map(cs => cs.id)

    // Deactivate (soft delete) - data persists
    const { error } = await admin
      .from("tracking_stores")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", storeId)
      .in("client_store_id", clientStoreIds)

    if (error) {
      throw new AppError("Erro ao desconectar loja", 500)
    }

    log.info("Tracking store deactivated", { storeId })
    return successResponse(request, { message: "Loja desconectada. Seus dados de rastreio foram preservados." })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingStores DELETE")
  }
}
