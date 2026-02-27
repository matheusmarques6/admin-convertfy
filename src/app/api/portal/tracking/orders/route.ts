import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalTrackingOrders")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

async function getPortalUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: portalUser } = await adminClient
    .from("client_portal_users")
    .select("client_id, permissions")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single()

  return portalUser
}

/**
 * GET - List tracking orders with their codes
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const url = new URL(request.url)
    const storeId = url.searchParams.get("store_id")
    const status = url.searchParams.get("status")
    const search = url.searchParams.get("search")
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100)
    const offset = (page - 1) * limit

    const adminClient = createAdminClient()

    // First get tracking stores for this client
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id")
      .eq("client_id", portalUser.client_id)

    if (!clientStores || clientStores.length === 0) {
      return successResponse(request, { orders: [], total: 0, page, limit })
    }

    const clientStoreIds = clientStores.map((s) => s.id)

    const { data: trackingStores } = await adminClient
      .from("tracking_stores")
      .select("id")
      .in("client_store_id", clientStoreIds)

    if (!trackingStores || trackingStores.length === 0) {
      return successResponse(request, { orders: [], total: 0, page, limit })
    }

    const trackingStoreIds = trackingStores.map((s) => s.id)

    // Build query
    let query = adminClient
      .from("tracking_orders")
      .select(`
        id,
        shopify_order_id,
        shopify_order_number,
        order_name,
        customer_name,
        customer_email,
        financial_status,
        fulfillment_status,
        total_price,
        currency,
        order_created_at,
        shipped_at,
        delivered_at,
        tracking_store_id,
        created_at
      `, { count: "exact" })
      .in("tracking_store_id", trackingStoreIds)
      .order("order_created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (storeId) {
      // Filter by specific store
      const storeTrackingIds = trackingStores
        .filter((_, i) => clientStoreIds[i] === storeId)
        .map((s) => s.id)
      if (storeTrackingIds.length > 0) {
        query = query.in("tracking_store_id", storeTrackingIds)
      }
    }

    if (search) {
      query = query.or(
        `order_name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,shopify_order_number.ilike.%${search}%`
      )
    }

    const { data: orders, error, count } = await query

    if (error) {
      log.error("Error fetching tracking orders:", error)
      throw new AppError("Erro ao buscar pedidos", 500)
    }

    // Get tracking codes for these orders
    const orderIds = (orders || []).map((o) => o.id)
    let codes: Array<{
      id: string
      tracking_order_id: string
      tracking_number: string
      carrier_code: string
      carrier_name: string
      status: string
      status_detail: string
      last_event: string
      last_event_at: string | null
      estimated_delivery: string | null
    }> = []

    if (orderIds.length > 0) {
      const { data: trackingCodes } = await adminClient
        .from("tracking_codes")
        .select("id, tracking_order_id, tracking_number, carrier_code, carrier_name, status, status_detail, last_event, last_event_at, estimated_delivery")
        .in("tracking_order_id", orderIds)

      codes = trackingCodes || []
    }

    // Filter by tracking status if needed
    let filteredOrders = orders || []
    if (status && status !== "all") {
      const orderIdsWithStatus = new Set(
        codes.filter((c) => c.status === status).map((c) => c.tracking_order_id)
      )
      filteredOrders = filteredOrders.filter((o) => orderIdsWithStatus.has(o.id))
    }

    // Merge codes into orders
    const ordersWithCodes = filteredOrders.map((order) => ({
      ...order,
      tracking_codes: codes.filter((c) => c.tracking_order_id === order.id),
    }))

    return successResponse(request, {
      orders: ordersWithCodes,
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingOrders")
  }
}
