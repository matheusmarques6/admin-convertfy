import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { OrderLookupService, OrderLookupResult } from "@/lib/services/order-lookup.service"
import { syncTrackingCode, trackVia17track } from "@/lib/services/tracking.service"
import { trackWithBestProvider, detectCarrierProvider, type CarrierKeys } from "@/lib/tracking/carriers"
import { decrypt } from "@/lib/crypto"
import { translateEventDescription } from "@/lib/tracking/translate-events"
import { sanitizePostgrestValue, escapePostgrestLike, isSuspiciousQuery } from "@/lib/tracking/sanitize"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { ShopifyService } from "@/lib/integrations/shopify"

const log = logger.child("TrackingLookup")

const LOOKUP_RATE_LIMIT = { limit: 20, windowSeconds: 60 }

/** Cache TTL by tracking status (seconds) — used for Vercel edge cache (s-maxage) */
const CACHE_TTL: Record<string, number> = {
  delivered: 3600,        // 1h
  in_transit: 300,        // 5min
  out_for_delivery: 120,  // 2min
  pending: 600,           // 10min
  info_received: 600,     // 10min
  failed_attempt: 300,    // 5min (delivery attempt failed, may update soon)
  exception: 900,         // 15min
  expired: 3600,          // 1h
}

function getCacheTtl(results: Array<{ tracking: Array<{ status: string }> }>): number {
  if (results.length === 0) return 60

  let minTtl = 3600
  for (const result of results) {
    for (const track of result.tracking) {
      const ttl = CACHE_TTL[track.status] ?? 300
      if (ttl < minTtl) minTtl = ttl
    }
  }
  return minTtl
}

/** Public CORS — this endpoint is called from merchant storefronts */
const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/** Map OrderLookupResult[] to the widget-compatible format */
function mapLookupResults(lookupResults: OrderLookupResult[]) {
  return lookupResults
    .filter((r) => r.found && r.order)
    .map((r) => {
      const o = r.order!
      const fulfillmentToStatus: Record<string, string> = {
        fulfilled: "delivered",
        unfulfilled: "pending",
        partial: "in_transit",
      }
      const status = fulfillmentToStatus[o.fulfillment_status] || "pending"

      return {
        order: {
          id: `${r.source}-${o.order_number}`,
          order_name: o.order_number,
          customer_name: o.customer_name,
          customer_email: null,
          order_created_at: o.order_date,
          shipped_at: o.fulfillment_status === "fulfilled" ? o.order_date : null,
          delivered_at: o.fulfillment_status === "fulfilled" ? o.order_date : null,
          total_price: parseFloat(o.total_price) || null,
          currency: o.currency,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          line_items: (o.items || []).map((item: any) => ({
            title: item.title || "",
            quantity: item.quantity || 1,
            price: item.price || "0",
            image_url: item.image_url || null,
          })),
          shipping_address: {} as Record<string, string>,
        },
        tracking: o.tracking_code
          ? [
              {
                id: `${r.source}-${o.tracking_code}`,
                tracking_number: o.tracking_code,
                carrier_name: o.carrier,
                status,
                status_detail: null,
                last_event: null,
                tracking_events: [] as unknown[],
                estimated_delivery: null as string | null,
              },
            ]
          : [],
      }
    })
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS })
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "tracking:lookup", LOOKUP_RATE_LIMIT)
  if (limited) return limited

  try {
    const query = request.nextUrl.searchParams.get("q")?.trim()
    const storeParam = request.nextUrl.searchParams.get("store")?.trim()

    if (!query || query.length < 3) {
      return NextResponse.json(
        { error: "Query deve ter pelo menos 3 caracteres" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    if (isSuspiciousQuery(query)) {
      log.warn("Suspicious query blocked", { query, ip: getClientIp(request) })
      return NextResponse.json(
        { error: "Consulta invalida" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    const admin = createAdminClient()
    const ip = getClientIp(request)

    // Resolve storeParam → tracking_store_id (required for data isolation)
    let trackingStoreId: string | null = null
    let clientStoreId: string | null = null
    let storeLang = "pt-BR"

    if (storeParam) {
      // Try as tracking_store_id first
      const { data: tsCheck } = await admin
        .from("tracking_stores")
        .select("id, client_store_id, widget_config")
        .eq("id", storeParam)
        .eq("is_active", true)
        .single()

      if (tsCheck) {
        trackingStoreId = tsCheck.id
        clientStoreId = tsCheck.client_store_id
        const wc = tsCheck.widget_config as Record<string, unknown> | null
        if (wc?.language && typeof wc.language === "string") storeLang = wc.language
      } else {
        // Try as client_store_id → resolve to tracking_store_id
        const { data: byClientStore } = await admin
          .from("tracking_stores")
          .select("id, client_store_id, widget_config")
          .eq("client_store_id", storeParam)
          .eq("is_active", true)
          .limit(1)
          .single()

        if (byClientStore) {
          trackingStoreId = byClientStore.id
          clientStoreId = byClientStore.client_store_id
          const wc = byClientStore.widget_config as Record<string, unknown> | null
          if (wc?.language && typeof wc.language === "string") storeLang = wc.language
        }
      }
    }

    if (!trackingStoreId) {
      return NextResponse.json(
        { error: "Store not found or inactive" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    // Determine search type
    const isEmail = query.includes("@")
    const isOrderNumber = query.startsWith("#") || /^\d{3,6}$/.test(query)
    const cleanQuery = query.replace(/^#/, "")

    type WidgetResult = {
      order: {
        id: string
        order_name: string | null
        customer_name: string | null
        customer_email: string | null
        order_created_at: string | null
        shipped_at: string | null
        delivered_at: string | null
        total_price: number | null
        currency: string
        line_items: unknown[]
        shipping_address: Record<string, string>
      }
      tracking: Array<{
        id: string
        tracking_number: string
        carrier_name: string | null
        status: string
        status_detail: string | null
        last_event: string | null
        tracking_events: unknown[]
        estimated_delivery: string | null
      }>
    }

    let results: WidgetResult[] = []

    if (isEmail) {
      // Use OrderLookupService cascade if we have a clientStoreId
      if (clientStoreId) {
        try {
          const lookupService = new OrderLookupService()
          const lookupResults = await lookupService.findByEmail(clientStoreId, cleanQuery)
          results = mapLookupResults(lookupResults)
        } catch (err) {
          log.warn("OrderLookupService failed, falling back to local", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Fallback to local Supabase search — scoped to this store
      if (results.length === 0) {
        const { data: orders } = await admin
          .from("tracking_orders")
          .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
          .eq("tracking_store_id", trackingStoreId)
          .ilike("customer_email", cleanQuery)
          .order("order_created_at", { ascending: false })
          .limit(10)

        if (orders) {
          for (const order of orders) {
            const { data: codes } = await admin
              .from("tracking_codes")
              .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery, last_checked_at")
              .eq("tracking_order_id", order.id)

            results.push({ order, tracking: codes || [] })
          }
        }
      }
    } else if (isOrderNumber) {
      const safeQuery = sanitizePostgrestValue(cleanQuery)

      const [{ data: byNumber }, { data: byName }] = await Promise.all([
        admin
          .from("tracking_orders")
          .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
          .eq("tracking_store_id", trackingStoreId)
          .eq("shopify_order_number", safeQuery)
          .order("order_created_at", { ascending: false })
          .limit(10),
        admin
          .from("tracking_orders")
          .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
          .eq("tracking_store_id", trackingStoreId)
          .ilike("order_name", `%${safeQuery}%`)
          .order("order_created_at", { ascending: false })
          .limit(10),
      ])

      // Deduplicate by id
      const seen = new Set<string>()
      const orders = [...(byNumber || []), ...(byName || [])].filter((o) => {
        if (seen.has(o.id)) return false
        seen.add(o.id)
        return true
      })

      if (orders.length > 0) {
        for (const order of orders) {
          const { data: codes } = await admin
            .from("tracking_codes")
            .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery, last_checked_at")
            .eq("tracking_order_id", order.id)

          results.push({ order, tracking: codes || [] })
        }
      }
    } else {
      const { data: codes } = await admin
        .from("tracking_codes")
        .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery, last_checked_at, tracking_order_id")
        .eq("tracking_store_id", trackingStoreId)
        .ilike("tracking_number", `%${escapePostgrestLike(query)}%`)
        .limit(5)

      if (codes) {
        for (const code of codes) {
          const { data: order } = await admin
            .from("tracking_orders")
            .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
            .eq("id", code.tracking_order_id)
            .single()

          if (order) {
            const { tracking_order_id: _, ...codeData } = code
            results.push({ order, tracking: [codeData] })
          }
        }
      }
    }

    // ─── Live tracking: if no DB results for a tracking code, call providers directly ───
    if (results.length === 0 && !isEmail && !isOrderNumber && trackingStoreId) {
      try {
        const { data: store } = await admin
          .from("tracking_stores")
          .select("seventeen_track_api_key, carrier_api_keys")
          .eq("id", trackingStoreId)
          .single()

        const globalKey = process.env.SEVENTEEN_TRACK_API_KEY
        const storeKeys = (store?.carrier_api_keys ?? {}) as Record<string, string | boolean | undefined>

        function safeDecrypt(val: string, label: string): string | undefined {
          try { return decrypt(val) } catch { log.warn(`Failed to decrypt ${label}`); return undefined }
        }

        const decrypted17 = store?.seventeen_track_api_key
          ? safeDecrypt(store.seventeen_track_api_key, "17track")
          : undefined

        const keys: CarrierKeys = {
          seventeen_track: decrypted17 || globalKey,
          trackingmore: typeof storeKeys.trackingmore === "string"
            ? safeDecrypt(storeKeys.trackingmore, "trackingmore")
            : undefined,
          postnl: typeof storeKeys.postnl === "string"
            ? safeDecrypt(storeKeys.postnl, "postnl")
            : undefined,
          cainiao: storeKeys.cainiao !== false,
        }

        log.info("Live tracking attempt", {
          trackingStoreId,
          query,
          has17track: !!keys.seventeen_track,
          hasTrackingMore: !!keys.trackingmore,
          hasCainiao: keys.cainiao,
          usedGlobal17: !decrypted17 && !!globalKey,
        })

        const liveResult = await trackWithBestProvider(
          query,
          keys,
          trackVia17track,
        )

        if (liveResult && liveResult.events.length > 0) {
          // Try to enrich with Shopify order data (line_items, price, etc.)
          let orderData: WidgetResult["order"] = {
            id: `live-${query}`,
            order_name: null,
            customer_name: null,
            customer_email: null,
            order_created_at: null,
            shipped_at: null,
            delivered_at: null,
            total_price: null,
            currency: "BRL",
            line_items: [],
            shipping_address: {},
          }

          if (clientStoreId) {
            try {
              const creds = await getStoreCredentials(clientStoreId)
              if (creds.shopify_store_domain && creds.shopify_access_token) {
                const shopify = new ShopifyService({
                  storeUrl: creds.shopify_store_domain,
                  accessToken: creds.shopify_access_token,
                })
                const shopifyOrder = await shopify.getOrderByTrackingCode(query)
                if (shopifyOrder) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const items = shopifyOrder.line_items.map((item: any) => ({
                    title: item.title || "",
                    quantity: item.quantity || 1,
                    price: item.price || "0",
                    image_url: item.image?.src || null,
                  }))
                  orderData = {
                    id: `shopify-${shopifyOrder.id}`,
                    order_name: shopifyOrder.name || `#${shopifyOrder.order_number}`,
                    customer_name: shopifyOrder.customer
                      ? `${shopifyOrder.customer.first_name || ""} ${shopifyOrder.customer.last_name || ""}`.trim()
                      : null,
                    customer_email: shopifyOrder.email || null,
                    order_created_at: shopifyOrder.created_at,
                    shipped_at: shopifyOrder.fulfillments?.[0]?.created_at || null,
                    delivered_at: null,
                    total_price: parseFloat(shopifyOrder.total_price) || null,
                    currency: shopifyOrder.currency || "BRL",
                    line_items: items,
                    shipping_address: {},
                  }
                  log.info("Shopify order enrichment success", {
                    trackingStoreId,
                    query,
                    orderId: shopifyOrder.id,
                    lineItemsCount: items.length,
                  })
                }
              }
            } catch (err) {
              log.warn("Shopify order enrichment failed", {
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }

          results.push({
            order: orderData,
            tracking: [
              {
                id: `live-${query}`,
                tracking_number: liveResult.tracking_number,
                carrier_name: liveResult.carrier_name,
                status: liveResult.status,
                status_detail: liveResult.status_detail,
                last_event: liveResult.last_event,
                tracking_events: liveResult.events,
                estimated_delivery: liveResult.estimated_delivery,
              },
            ],
          })

          log.info("Live tracking success", {
            trackingStoreId,
            query,
            status: liveResult.status,
            events: liveResult.events.length,
            carrier: liveResult.carrier_name,
            hasShopifyOrder: orderData.line_items.length > 0,
          })
        } else {
          // Fallback: detect carrier locally and return pending status
          // so the widget never shows "not found" for valid tracking codes
          const carrier = detectCarrierProvider(query)
          const pendingDetail = storeLang === "pt-BR"
            ? "Aguardando informações da transportadora"
            : "Waiting for carrier information"

          results.push({
            order: {
              id: `live-${query}`,
              order_name: null,
              customer_name: null,
              customer_email: null,
              order_created_at: null,
              shipped_at: null,
              delivered_at: null,
              total_price: null,
              currency: "BRL",
              line_items: [],
              shipping_address: {},
            },
            tracking: [
              {
                id: `live-${query}`,
                tracking_number: query,
                carrier_name: carrier.name,
                status: "pending",
                status_detail: pendingDetail,
                last_event: pendingDetail,
                tracking_events: [],
                estimated_delivery: null,
              },
            ],
          })

          log.info("Live tracking fallback to pending", {
            trackingStoreId,
            query,
            carrier: carrier.name,
            providerResult: liveResult ? "no_events" : "null",
          })
        }
      } catch (err) {
        log.warn("Live tracking failed", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Log lookup (fire and forget)
    try {
      await admin
        .from("tracking_lookups")
        .insert({
          tracking_store_id: trackingStoreId,
          tracking_number: !isEmail && !isOrderNumber ? query : null,
          order_number: isOrderNumber ? cleanQuery : null,
          customer_email: isEmail ? cleanQuery : null,
          ip_address: ip,
          found: results.length > 0,
        })
    } catch (err) {
      log.warn("Failed to log lookup", err)
    }

    // ─── Sync real-time: tracking codes without events (Story 22.3) ───
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const staleIds: string[] = []
    for (const result of results) {
      for (const track of result.tracking) {
        const hasEvents = Array.isArray(track.tracking_events) && track.tracking_events.length > 0
        const neverSynced = !(track as Record<string, unknown>).last_checked_at
        if (!hasEvents && neverSynced && track.id && UUID_RE.test(track.id)) {
          staleIds.push(track.id)
        }
      }
    }

    let didSync = false
    if (staleIds.length > 0) {
      didSync = true
      const t0 = Date.now()
      const syncController = new AbortController()
      const syncTimeout = setTimeout(() => syncController.abort(), 15000)
      let syncedCount = 0

      try {
        for (const id of staleIds.slice(0, 3)) {
          if (syncController.signal.aborted) break
          await syncTrackingCode(id)
          syncedCount++
        }
      } catch {
        // timeout or error — continue with partial data
      } finally {
        clearTimeout(syncTimeout)
      }

      log.info("Real-time sync triggered", {
        trackingStoreId,
        staleCount: staleIds.length,
        syncedCount,
        durationMs: Date.now() - t0,
      })

      // Re-read synced tracking codes from DB
      if (syncedCount > 0) {
        for (const result of results) {
          for (let i = 0; i < result.tracking.length; i++) {
            const track = result.tracking[i]
            if (staleIds.includes(track.id)) {
              const { data: updated } = await admin
                .from("tracking_codes")
                .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery, last_checked_at")
                .eq("id", track.id)
                .single()
              if (updated) result.tracking[i] = updated
            }
          }
        }
      }
    }

    // Translate tracking event descriptions to store's configured language
    // Uses dictionary first, then Google Translate API as fallback (cached)
    const translationPromises: Promise<void>[] = []
    for (const result of results) {
      for (const track of result.tracking) {
        if (track.status_detail) {
          translationPromises.push(
            translateEventDescription(track.status_detail, storeLang).then(t => { track.status_detail = t })
          )
        }
        if (track.last_event) {
          translationPromises.push(
            translateEventDescription(track.last_event, storeLang).then(t => { track.last_event = t })
          )
        }
        if (Array.isArray(track.tracking_events)) {
          for (const event of track.tracking_events as Array<{ description?: string }>) {
            if (event.description) {
              translationPromises.push(
                translateEventDescription(event.description, storeLang).then(t => { event.description = t })
              )
            }
          }
        }
      }
    }
    await Promise.all(translationPromises)

    const cacheTtl = didSync ? 0 : getCacheTtl(results)
    return NextResponse.json(
      { results, query, found: results.length > 0 },
      {
        headers: {
          ...PUBLIC_CORS,
          "Cache-Control": cacheTtl === 0
            ? "public, s-maxage=0, stale-while-revalidate=60"
            : `public, s-maxage=${cacheTtl}, stale-while-revalidate=60`,
        },
      }
    )
  } catch (error) {
    log.error("Lookup error", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: PUBLIC_CORS }
    )
  }
}
