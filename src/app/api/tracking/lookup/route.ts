import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { trackPackages, detectCarrier } from "@/lib/tracking/seventeen-track"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingLookup")

/** CORS headers for public endpoint (called from any store domain) */
const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

/** OPTIONS - Handle preflight for CORS */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS })
}

/** Helper to return JSON with public CORS headers */
function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PUBLIC_CORS })
}

/**
 * POST - Public lookup for order tracking
 * No auth required - used by public page and widget
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tracking_number, order_number, email, store_id } = body

    if (!tracking_number && !order_number) {
      return respond({ error: "Informe o número de rastreio ou número do pedido" }, 400)
    }

    const adminClient = createAdminClient()
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || ""
    const userAgent = request.headers.get("user-agent") || ""

    let trackingStoreId: string | null = null
    let seventeenTrackKey: string | null = null
    const carrierKeys: Record<string, string | boolean> = { cainiao: true }

    // If store_id provided, use it to find tracking store
    if (store_id) {
      const { data: trackingStore } = await adminClient
        .from("tracking_stores")
        .select("id, seventeen_track_api_key, carrier_api_keys")
        .eq("client_store_id", store_id)
        .eq("is_active", true)
        .single()

      if (trackingStore) {
        trackingStoreId = trackingStore.id
        if (trackingStore.seventeen_track_api_key) {
          try {
            seventeenTrackKey = decrypt(trackingStore.seventeen_track_api_key)
          } catch {
            // Use global key
          }
        }
        // Decrypt carrier-specific API keys
        const storedKeys = (trackingStore.carrier_api_keys as Record<string, string>) || {}
        for (const [carrier, encKey] of Object.entries(storedKeys)) {
          if (typeof encKey === "string" && encKey.startsWith("enc::")) {
            try {
              carrierKeys[carrier] = decrypt(encKey)
            } catch {
              log.warn(`Failed to decrypt ${carrier} key`)
            }
          } else if (typeof encKey === "boolean") {
            carrierKeys[carrier] = encKey
          }
        }
      }
    }

    // Search by tracking number
    if (tracking_number) {
      // First check our database
      const { data: codes } = await adminClient
        .from("tracking_codes")
        .select(`
          id,
          tracking_number,
          carrier_code,
          carrier_name,
          status,
          status_detail,
          last_event,
          last_event_at,
          estimated_delivery,
          tracking_events,
          tracking_order_id,
          tracking_orders (
            order_name,
            customer_name,
            shopify_order_number
          )
        `)
        .eq("tracking_number", tracking_number)
        .limit(1)

      // Log the lookup
      await adminClient.from("tracking_lookups").insert({
        tracking_store_id: trackingStoreId,
        tracking_number,
        order_number: order_number || null,
        customer_email: email || null,
        ip_address: ip,
        user_agent: userAgent,
        found: !!(codes && codes.length > 0),
        source: store_id ? "widget" : "public",
      })

      if (codes && codes.length > 0) {
        const code = codes[0]

        // If events are empty or stale, try to fetch from 17track
        const events = code.tracking_events as Array<Record<string, unknown>>
        const shouldRefresh = !events || events.length === 0 ||
          (code.last_event_at && Date.now() - new Date(code.last_event_at).getTime() > 3600000) // >1h old

        if (shouldRefresh && code.status !== "delivered") {
          try {
            const results = await trackPackages([tracking_number], seventeenTrackKey, carrierKeys)
            if (results.length > 0) {
              const result = results[0]
              // Update the tracking code with fresh data
              await adminClient
                .from("tracking_codes")
                .update({
                  carrier_code: result.carrier_code || code.carrier_code,
                  carrier_name: result.carrier_name || code.carrier_name,
                  status: result.status,
                  status_detail: result.status_detail,
                  last_event: result.last_event,
                  last_event_at: result.last_event_at,
                  estimated_delivery: result.estimated_delivery,
                  tracking_events: result.events,
                  last_checked_at: new Date().toISOString(),
                })
                .eq("id", code.id)

              // If delivered, update order
              if (result.status === "delivered") {
                await adminClient
                  .from("tracking_orders")
                  .update({ delivered_at: new Date().toISOString() })
                  .eq("id", code.tracking_order_id)
              }

              return respond({
                found: true,
                tracking: {
                  tracking_number: result.tracking_number,
                  carrier_code: result.carrier_code || code.carrier_code,
                  carrier_name: result.carrier_name || code.carrier_name,
                  status: result.status,
                  status_detail: result.status_detail,
                  last_event: result.last_event,
                  last_event_at: result.last_event_at,
                  estimated_delivery: result.estimated_delivery,
                  events: result.events,
                  order_name: (code.tracking_orders as unknown as { order_name: string })?.order_name || "",
                },
              })
            }
          } catch (error) {
            log.error("Error refreshing tracking from 17track:", error)
          }
        }

        // Return cached data
        return respond({
          found: true,
          tracking: {
            tracking_number: code.tracking_number,
            carrier_code: code.carrier_code,
            carrier_name: code.carrier_name,
            status: code.status,
            status_detail: code.status_detail,
            last_event: code.last_event,
            last_event_at: code.last_event_at,
            estimated_delivery: code.estimated_delivery,
            events: code.tracking_events || [],
            order_name: (code.tracking_orders as unknown as { order_name: string })?.order_name || "",
          },
        })
      }

      // Not in our DB - try 17track directly
      try {
        const results = await trackPackages([tracking_number], seventeenTrackKey, carrierKeys)
        if (results.length > 0) {
          return respond({
            found: true,
            tracking: {
              tracking_number: results[0].tracking_number,
              carrier_code: results[0].carrier_code,
              carrier_name: results[0].carrier_name,
              status: results[0].status,
              status_detail: results[0].status_detail,
              last_event: results[0].last_event,
              last_event_at: results[0].last_event_at,
              estimated_delivery: results[0].estimated_delivery,
              events: results[0].events,
              order_name: "",
            },
          })
        }
      } catch (error) {
        log.error("Error querying 17track:", error)
      }

      // Fallback: detect carrier locally and return pending status
      const carrier = detectCarrier(tracking_number)
      return respond({
        found: true,
        tracking: {
          tracking_number,
          carrier_code: carrier.code,
          carrier_name: carrier.name,
          status: "pending",
          status_detail: "Aguardando informações da transportadora",
          last_event: "",
          last_event_at: null,
          estimated_delivery: null,
          events: [],
          order_name: "",
        },
      })
    }

    // Search by order number
    if (order_number) {
      let query = adminClient
        .from("tracking_orders")
        .select(`
          id,
          order_name,
          customer_name,
          shopify_order_number,
          fulfillment_status,
          tracking_codes (
            tracking_number,
            carrier_code,
            carrier_name,
            status,
            status_detail,
            last_event,
            last_event_at,
            estimated_delivery,
            tracking_events
          )
        `)
        .or(`order_name.ilike.%${order_number}%,shopify_order_number.eq.${order_number}`)

      if (email) {
        query = query.eq("customer_email", email.toLowerCase())
      }

      const { data: orders } = await query.limit(5)

      // Log the lookup
      await adminClient.from("tracking_lookups").insert({
        tracking_store_id: trackingStoreId,
        tracking_number: null,
        order_number,
        customer_email: email || null,
        ip_address: ip,
        user_agent: userAgent,
        found: !!(orders && orders.length > 0),
        source: store_id ? "widget" : "public",
      })

      if (orders && orders.length > 0) {
        return respond({
          found: true,
          orders: orders.map((order) => ({
            order_name: order.order_name,
            customer_name: order.customer_name,
            fulfillment_status: order.fulfillment_status,
            tracking_codes: (order.tracking_codes || []).map((code: Record<string, unknown>) => ({
              tracking_number: code.tracking_number,
              carrier_code: code.carrier_code,
              carrier_name: code.carrier_name,
              status: code.status,
              status_detail: code.status_detail,
              last_event: code.last_event,
              last_event_at: code.last_event_at,
              estimated_delivery: code.estimated_delivery,
              events: code.tracking_events || [],
            })),
          })),
        })
      }
    }

    return respond({ found: false })
  } catch (error) {
    log.error("Lookup error:", error)
    return respond({ error: "Erro interno" }, 500)
  }
}
