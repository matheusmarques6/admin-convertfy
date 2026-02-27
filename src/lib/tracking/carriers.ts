import { logger } from "@/lib/logger"
import type { TrackingResult, TrackingEvent } from "./seventeen-track"

const log = logger.child("Carriers")

// ─── Carrier Detection ──────────────────────────────────────────────────────

export interface CarrierInfo {
  code: string
  name: string
  provider: "cainiao" | "postnl" | "trackingmore" | "seventeen_track" | "unknown"
}

/**
 * Detect carrier from tracking number pattern and determine best provider
 */
export function detectCarrierProvider(trackingNumber: string): CarrierInfo {
  const num = trackingNumber.trim().toUpperCase()

  // PostNL: 3S + 13-15 chars, or starts with JVGL, or NL pattern
  if (/^3S[A-Z0-9]{11,15}$/.test(num) || /^JVGL/.test(num) || /^[A-Z]{2}\d{9}NL$/.test(num)) {
    return { code: "postnl", name: "PostNL", provider: "postnl" }
  }

  // Correios (Brazil): 13 chars, 2 letters + 9 digits + BR
  if (/^[A-Z]{2}\d{9}BR$/.test(num)) {
    return { code: "correios", name: "Correios", provider: "cainiao" }
  }

  // Yanwen: starts with LP, LV, UG, YT, YW + digits + YP (or CN)
  if (/^(LP|LV|UG|YT|YW)\d{9}(YP|CN)$/.test(num)) {
    return { code: "yanwen", name: "Yanwen", provider: "cainiao" }
  }

  // Wanb Express: WB prefix or typical pattern
  if (/^WB\d+$/.test(num) || /^WANB/.test(num)) {
    return { code: "wanbexpress", name: "Wanb Express", provider: "cainiao" }
  }

  // China Post / ePacket: 2 letters + 9 digits + CN
  if (/^[A-Z]{2}\d{9}CN$/.test(num)) {
    return { code: "chinapost", name: "China Post", provider: "cainiao" }
  }

  // SDH Express: SDH prefix or SH + digits
  if (/^(SDH|SH)\d+$/.test(num)) {
    return { code: "sdhexpress", name: "SDH Express", provider: "cainiao" }
  }

  // Cainiao: LP, CAINIAO prefix or long numeric (17+ digits - AliExpress format)
  if (/^LP\d{15,}$/.test(num) || /^CAINIAO/.test(num) || /^\d{17,}$/.test(num)) {
    return { code: "cainiao", name: "Cainiao", provider: "cainiao" }
  }

  // Jadlog (Brazil): 14 digits
  if (/^\d{14}$/.test(num)) {
    return { code: "jadlog", name: "Jadlog", provider: "trackingmore" }
  }

  // Total Express: TE prefix
  if (num.startsWith("TE")) {
    return { code: "totalexpress", name: "Total Express", provider: "trackingmore" }
  }

  return { code: "unknown", name: "Transportadora", provider: "unknown" }
}

// ─── Cainiao Tracking (Free - covers Chinese carriers) ─────────────────────

interface CainiaoEvent {
  time: string
  standerdDesc?: string
  desc?: string
  actionCode?: string
  city?: string
  country?: string
}

/**
 * Track via Cainiao Global (free, no API key needed)
 * Covers: Wanb Express, Yanwen, SDH Express, China Post, AliExpress shipments
 */
export async function trackViaCainiao(trackingNumber: string): Promise<TrackingResult | null> {
  try {
    const response = await fetch("https://global.cainiao.com/global/detail.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: `mailNoList=${encodeURIComponent(trackingNumber)}&language=en`,
    })

    if (!response.ok) {
      log.warn("Cainiao request failed", { status: response.status })
      return null
    }

    const data = await response.json()
    const cainiaoModule = data?.module?.[0]

    if (!cainiaoModule || !cainiaoModule.detailList || cainiaoModule.detailList.length === 0) {
      return null
    }

    const events: TrackingEvent[] = cainiaoModule.detailList.map((evt: CainiaoEvent) => ({
      date: evt.time || "",
      description: evt.standerdDesc || evt.desc || "",
      location: [evt.city, evt.country].filter(Boolean).join(", "),
      status: mapCainiaoAction(evt.actionCode),
    }))

    const latestEvent = events[0]
    const status = inferCainiaoStatus(cainiaoModule.status || cainiaoModule.latestStatus, events)

    return {
      tracking_number: trackingNumber,
      carrier_code: cainiaoModule.carrierCode || cainiaoModule.cpCode || "",
      carrier_name: cainiaoModule.carrierName || cainiaoModule.cpName || "Cainiao",
      status,
      status_detail: latestEvent?.description || "",
      last_event: latestEvent?.description || "",
      last_event_at: latestEvent?.date || null,
      estimated_delivery: cainiaoModule.daysRemainingTip || null,
      events,
    }
  } catch (error) {
    log.warn("Cainiao tracking error", error)
    return null
  }
}

function mapCainiaoAction(actionCode?: string): string {
  if (!actionCode) return "in_transit"
  const code = actionCode.toUpperCase()
  if (code.includes("DELIVER") || code === "SIGN") return "delivered"
  if (code.includes("PICKUP") || code === "ACCEPT") return "pick_up"
  if (code.includes("DEPART") || code.includes("TRANSIT") || code.includes("ARRIVE")) return "in_transit"
  return "in_transit"
}

function inferCainiaoStatus(status: string | undefined, events: TrackingEvent[]): string {
  if (!status && events.length === 0) return "pending"

  const s = (status || "").toUpperCase()
  if (s.includes("DELIVER") || s.includes("SIGN") || s === "SIGN_IN") return "delivered"
  if (s.includes("PICKUP") || s.includes("ACCEPT")) return "pick_up"
  if (s.includes("TRANSIT") || s.includes("DEPART") || s.includes("ARRIVE")) return "in_transit"

  // Infer from latest event
  if (events.length > 0) {
    const desc = events[0].description.toLowerCase()
    if (desc.includes("delivered") || desc.includes("entregue") || desc.includes("signed")) return "delivered"
    if (desc.includes("out for delivery") || desc.includes("saiu para entrega")) return "out_for_delivery"
    return "in_transit"
  }

  return "pending"
}

// ─── TrackingMore API (Paid - covers 1500+ carriers) ────────────────────────

const TRACKINGMORE_API_BASE = "https://api.trackingmore.com/v4"

/**
 * Track via TrackingMore API (paid, requires API key)
 * Cheaper alternative to 17track - covers all carriers
 */
export async function trackViaTrackingMore(
  trackingNumber: string,
  apiKey: string,
  courierCode?: string
): Promise<TrackingResult | null> {
  try {
    // First try realtime tracking
    const response = await fetch(`${TRACKINGMORE_API_BASE}/trackings/realtime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Tracking-Api-Key": apiKey,
      },
      body: JSON.stringify({
        tracking_number: trackingNumber,
        courier_code: courierCode || undefined,
      }),
    })

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("TrackingMore rate limit hit")
        return null
      }
      log.warn("TrackingMore request failed", { status: response.status })
      return null
    }

    const data = await response.json()

    if (data.meta?.code !== 200 || !data.data) {
      return null
    }

    const tracking = data.data
    const events: TrackingEvent[] = (tracking.origin_info?.trackinfo || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .concat(tracking.destination_info?.trackinfo || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((evt: any) => ({
        date: evt.Date || evt.checkpoint_date || "",
        description: evt.StatusDescription || evt.tracking_detail || "",
        location: evt.Details || evt.location || "",
      }))
      // Sort by date descending
      .sort((a: TrackingEvent, b: TrackingEvent) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )

    const status = mapTrackingMoreStatus(tracking.delivery_status)
    const latestEvent = events[0]

    return {
      tracking_number: trackingNumber,
      carrier_code: tracking.courier_code || "",
      carrier_name: tracking.courier_name || "",
      status,
      status_detail: tracking.latest_checkpoint_time
        ? latestEvent?.description || ""
        : "",
      last_event: latestEvent?.description || "",
      last_event_at: latestEvent?.date || null,
      estimated_delivery: tracking.estimated_delivery_date || null,
      events,
    }
  } catch (error) {
    log.warn("TrackingMore tracking error", error)
    return null
  }
}

function mapTrackingMoreStatus(status?: string): string {
  if (!status) return "pending"
  switch (status.toLowerCase()) {
    case "delivered": return "delivered"
    case "transit": return "in_transit"
    case "pickup": return "pick_up"
    case "undelivered": return "undelivered"
    case "expired": return "expired"
    case "exception": return "alert"
    case "notfound": return "pending"
    case "inforeceived": return "pending"
    default: return "pending"
  }
}

/**
 * Get the TrackingMore courier code for a carrier
 */
export function getTrackingMoreCourierCode(carrierCode: string): string | undefined {
  const map: Record<string, string> = {
    wanbexpress: "wanb-express",
    yanwen: "yanwen",
    sdhexpress: "sdh-express",
    chinapost: "china-post",
    postnl: "postnl",
    correios: "correios",
    jadlog: "jadlog",
    cainiao: "cainiao",
  }
  return map[carrierCode]
}

// ─── PostNL API (Direct - requires PostNL API key) ──────────────────────────

const POSTNL_API_BASE = "https://api.postnl.nl"

/**
 * Track via PostNL ShippingStatus API (requires API key from PostNL developer portal)
 */
export async function trackViaPostNL(
  trackingNumber: string,
  apiKey: string
): Promise<TrackingResult | null> {
  try {
    const response = await fetch(
      `${POSTNL_API_BASE}/shipment/v2/status/barcode/${encodeURIComponent(trackingNumber)}?detail=true&language=EN`,
      {
        method: "GET",
        headers: {
          apikey: apiKey,
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      log.warn("PostNL request failed", { status: response.status })
      return null
    }

    const data = await response.json()
    const shipment = data?.CompleteStatus?.Shipment ||
      data?.CurrentStatus?.Shipment

    if (!shipment) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: TrackingEvent[] = (shipment.Events || []).map((evt: any) => ({
      date: evt.TimeStamp || "",
      description: evt.Description || "",
      location: evt.LocationName || "",
      status: mapPostNLStatus(evt.Code),
    })).sort((a: TrackingEvent, b: TrackingEvent) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    const status = events.length > 0 ? events[0].status || "in_transit" : "pending"
    const latestEvent = events[0]

    return {
      tracking_number: trackingNumber,
      carrier_code: "postnl",
      carrier_name: "PostNL",
      status,
      status_detail: latestEvent?.description || "",
      last_event: latestEvent?.description || "",
      last_event_at: latestEvent?.date || null,
      estimated_delivery: shipment.ExpectedDeliveryDate || null,
      events,
    }
  } catch (error) {
    log.warn("PostNL tracking error", error)
    return null
  }
}

function mapPostNLStatus(code?: string): string {
  if (!code) return "in_transit"
  // PostNL status codes
  if (code.startsWith("1")) return "pending" // Label created
  if (code.startsWith("2")) return "in_transit" // In transit
  if (code.startsWith("3")) return "delivered" // Delivered
  if (code.startsWith("4")) return "undelivered" // Not delivered
  if (code.startsWith("5")) return "pick_up" // Ready for pickup
  return "in_transit"
}

// ─── Multi-Provider Orchestration ───────────────────────────────────────────

export interface CarrierKeys {
  seventeen_track?: string
  trackingmore?: string
  cainiao?: boolean // Free, no key needed
  postnl?: string
}

/**
 * Track a package using the best available provider
 * Priority: Carrier-specific → Cainiao (free) → 17track → TrackingMore → fallback
 */
export async function trackWithBestProvider(
  trackingNumber: string,
  keys: CarrierKeys,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackVia17track: (numbers: string[], apiKey: string) => Promise<any[]>
): Promise<TrackingResult | null> {
  const carrier = detectCarrierProvider(trackingNumber)

  // 1. Try carrier-specific API
  if (carrier.provider === "postnl" && keys.postnl) {
    log.info("Trying PostNL direct API", { trackingNumber })
    const result = await trackViaPostNL(trackingNumber, keys.postnl)
    if (result && result.events.length > 0) return result
  }

  // 2. Try Cainiao (free, no key needed) for Chinese carriers
  if (carrier.provider === "cainiao" || keys.cainiao !== false) {
    const isChinese = ["yanwen", "wanbexpress", "sdhexpress", "chinapost", "cainiao"].includes(carrier.code)
    if (isChinese) {
      log.info("Trying Cainiao tracking", { trackingNumber, carrier: carrier.code })
      const result = await trackViaCainiao(trackingNumber)
      if (result && result.events.length > 0) return result
    }
  }

  // 3. Try 17track
  if (keys.seventeen_track) {
    log.info("Trying 17track", { trackingNumber })
    const results = await trackVia17track([trackingNumber], keys.seventeen_track)
    if (results.length > 0 && (results[0].events?.length > 0 || results[0].status !== "pending")) {
      return results[0]
    }
  }

  // 4. Try TrackingMore
  if (keys.trackingmore) {
    log.info("Trying TrackingMore", { trackingNumber })
    const courierCode = getTrackingMoreCourierCode(carrier.code)
    const result = await trackViaTrackingMore(trackingNumber, keys.trackingmore, courierCode)
    if (result && result.events.length > 0) return result
  }

  // 5. Fallback
  return null
}
