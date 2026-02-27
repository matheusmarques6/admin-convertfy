import { logger } from "@/lib/logger"

const log = logger.child("17Track")

const SEVENTEEN_TRACK_API_BASE = "https://api.17track.net/track/v2.2"

export interface TrackingEvent {
  date: string
  description: string
  location?: string
  status?: string
}

export interface TrackingResult {
  tracking_number: string
  carrier_code: string
  carrier_name: string
  status: string
  status_detail: string
  last_event: string
  last_event_at: string | null
  estimated_delivery: string | null
  events: TrackingEvent[]
}

// Status mapping from 17track to our internal status
const STATUS_MAP: Record<number, string> = {
  0: "pending",        // Not found
  10: "in_transit",    // In Transit
  20: "expired",       // Expired
  30: "pick_up",       // Ready to be Picked Up
  35: "undelivered",   // Undelivered / Returned
  40: "delivered",     // Delivered
  50: "alert",         // Alert / Exception
}

function mapStatus(trackStatus: number): string {
  return STATUS_MAP[trackStatus] || "pending"
}

/**
 * Infer status from tracking events when 17track returns pending/not-found
 * but there are clearly real tracking events present.
 */
function inferStatusFromEvents(events: TrackingEvent[]): string {
  if (events.length === 0) return "pending"

  const latest = events[0].description.toLowerCase()

  // Delivered
  if (
    latest.includes("delivered") ||
    latest.includes("entregue") ||
    latest.includes("signed")
  ) {
    return "delivered"
  }

  // Out for delivery
  if (
    latest.includes("out for delivery") ||
    latest.includes("saiu para entrega") ||
    latest.includes("em rota de entrega")
  ) {
    return "out_for_delivery"
  }

  // Pick up / ready
  if (
    latest.includes("ready for pickup") ||
    latest.includes("disponivel para retirada") ||
    latest.includes("aguardando retirada")
  ) {
    return "pick_up"
  }

  // If there are events at all, it's at least in transit
  if (events.length >= 1) {
    return "in_transit"
  }

  return "pending"
}

/**
 * Parse 17track gettrackinfo response into TrackingResult[]
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTrackInfoResponse(data: any): TrackingResult[] {
  const results: TrackingResult[] = []
  const accepted = data?.data?.accepted || []

  for (const item of accepted) {
    const trackInfo = item.track_info || {}
    const latestStatus = trackInfo.latest_status || {}
    const latestEvent = trackInfo.latest_event || {}
    const tracking = trackInfo.tracking || {}

    const events: TrackingEvent[] = (tracking.providers || []).flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (provider.events || []).map((evt: any) => ({
          date: evt.time_iso || evt.time || "",
          description: evt.description || "",
          location: evt.location || "",
          status: mapStatus(evt.stage),
        }))
    )

    let status = mapStatus(latestStatus.status)

    // If 17track says pending but events clearly show otherwise, infer the real status
    if (status === "pending" && events.length > 0) {
      status = inferStatusFromEvents(events)
    }

    results.push({
      tracking_number: item.number,
      carrier_code: trackInfo.carrier?.code || "",
      carrier_name: trackInfo.carrier?.name || "",
      status,
      status_detail: latestStatus.sub_status_descr || latestEvent.description || "",
      last_event: latestEvent.description || (events.length > 0 ? events[0].description : ""),
      last_event_at: latestEvent.time_iso || (events.length > 0 ? events[0].date : null),
      estimated_delivery: trackInfo.time_metrics?.estimated_delivery_date?.from || null,
      events,
    })
  }

  return results
}

/**
 * Call 17track gettrackinfo API
 */
async function callGetTrackInfo(
  trackingNumbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
  const body = trackingNumbers.map((num) => ({ number: num }))

  const response = await fetch(`${SEVENTEEN_TRACK_API_BASE}/gettrackinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "17token": apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    log.error("17track gettrackinfo failed", { status: response.status })
    return []
  }

  return parseTrackInfoResponse(await response.json())
}

/**
 * Call 17track register API
 * Returns true if at least one number was accepted
 */
async function callRegister(
  trackingNumbers: string[],
  apiKey: string
): Promise<boolean> {
  const body = trackingNumbers.map((num) => ({ number: num }))

  try {
    const response = await fetch(`${SEVENTEEN_TRACK_API_BASE}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "17token": apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      log.error("17track register failed", { status: response.status })
      return false
    }

    const data = await response.json()
    const accepted = data?.data?.accepted || []
    const rejected = data?.data?.rejected || []
    log.info("17track register result", {
      accepted: accepted.length,
      rejected: rejected.length,
    })
    return accepted.length > 0
  } catch (error) {
    log.error("17track register error", error)
    return false
  }
}

/**
 * Call 17track retrack API to force re-fetch from carrier
 */
async function callRetrack(
  trackingNumbers: string[],
  apiKey: string
): Promise<void> {
  const body = trackingNumbers.map((num) => ({ number: num }))

  try {
    const response = await fetch(`${SEVENTEEN_TRACK_API_BASE}/retrack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "17token": apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      log.warn("17track retrack failed", { status: response.status })
    }
  } catch (error) {
    log.warn("17track retrack error", error)
  }
}

/**
 * Check if results contain real tracking data (not just pending/empty)
 */
function hasRealTrackingData(results: TrackingResult[]): boolean {
  return results.some(
    (r) => r.status !== "pending" || r.events.length > 0 || r.last_event !== ""
  )
}

/**
 * Real 17track API integration
 *
 * Strategy:
 * 1. Try gettrackinfo (for already-registered numbers with data)
 * 2. If no real data: register (new) + retrack (existing) to trigger fetch
 * 3. Wait and retry gettrackinfo
 * 4. Return best available data or pending fallback
 */
async function trackReal(
  trackingNumbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
  // Step 1: Try gettrackinfo first
  let results = await callGetTrackInfo(trackingNumbers, apiKey)

  // If we got real data (not just pending/empty), return immediately
  if (results.length > 0 && hasRealTrackingData(results)) {
    return results
  }

  // Step 2: Register new numbers + retrack existing pending ones
  // Run both in parallel - register handles new numbers, retrack handles existing
  await Promise.all([
    callRegister(trackingNumbers, apiKey),
    callRetrack(trackingNumbers, apiKey),
  ])

  // Step 3: Wait 5s for 17track to fetch data from carrier
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // Step 4: Retry gettrackinfo
  results = await callGetTrackInfo(trackingNumbers, apiKey)
  if (results.length > 0 && hasRealTrackingData(results)) {
    return results
  }

  // Step 5: Second retry after 5 more seconds
  await new Promise((resolve) => setTimeout(resolve, 5000))
  results = await callGetTrackInfo(trackingNumbers, apiKey)
  if (results.length > 0 && hasRealTrackingData(results)) {
    return results
  }

  // Step 6: Return whatever 17track gave us (even if pending, it has carrier info)
  if (results.length > 0) {
    return results
  }

  // Step 7: Absolute fallback with locally detected carrier
  return trackingNumbers.map((num) => {
    const carrier = detectCarrier(num)
    return {
      tracking_number: num,
      carrier_code: carrier.code,
      carrier_name: carrier.name,
      status: "pending",
      status_detail: "Aguardando informações da transportadora",
      last_event: "",
      last_event_at: null,
      estimated_delivery: null,
      events: [],
    }
  })
}

/**
 * Track packages via 17track only (used as a provider in multi-carrier system)
 */
export async function track17trackOnly(
  trackingNumbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
  return await trackReal(trackingNumbers, apiKey)
}

/**
 * Main tracking function - multi-provider with 17track fallback
 * Tries: Carrier-specific → Cainiao (free) → 17track → TrackingMore → fallback
 */
export async function trackPackages(
  trackingNumbers: string[],
  apiKey?: string | null,
  carrierKeys?: Record<string, string | boolean>
): Promise<TrackingResult[]> {
  if (!trackingNumbers.length) return []

  const key = apiKey || process.env.SEVENTEEN_TRACK_API_KEY
  const keys: import("./carriers").CarrierKeys = {
    seventeen_track: key || undefined,
    trackingmore: (carrierKeys?.trackingmore as string) || undefined,
    postnl: (carrierKeys?.postnl as string) || undefined,
    cainiao: carrierKeys?.cainiao !== false,
  }

  const hasAnyKey = keys.seventeen_track || keys.trackingmore || keys.cainiao

  if (!hasAnyKey) {
    log.warn("No tracking API keys configured – cannot track packages")
    return []
  }

  // Use multi-provider tracking for each number
  const { trackWithBestProvider, detectCarrierProvider } = await import("./carriers")

  const results: TrackingResult[] = []

  for (const num of trackingNumbers) {
    const result = await trackWithBestProvider(num, keys, track17trackOnly)

    if (result) {
      results.push(result)
    } else {
      // Absolute fallback with detected carrier info
      const carrier = detectCarrierProvider(num)
      results.push({
        tracking_number: num,
        carrier_code: carrier.code,
        carrier_name: carrier.name,
        status: "pending",
        status_detail: "Aguardando informações da transportadora",
        last_event: "",
        last_event_at: null,
        estimated_delivery: null,
        events: [],
      })
    }
  }

  return results
}

/**
 * Map carrier names to common codes
 */
export function detectCarrier(trackingNumber: string): { code: string; name: string } {
  const num = trackingNumber.trim().toUpperCase()

  // Correios (Brazil): 13 chars starting with 2 letters, ending with BR
  if (/^[A-Z]{2}\d{9}BR$/.test(num)) {
    return { code: "correios", name: "Correios" }
  }

  // Jadlog
  if (/^\d{14}$/.test(num)) {
    return { code: "jadlog", name: "Jadlog" }
  }

  // Total Express
  if (num.startsWith("TE")) {
    return { code: "totalexpress", name: "Total Express" }
  }

  // Default
  return { code: "unknown", name: "Transportadora" }
}
