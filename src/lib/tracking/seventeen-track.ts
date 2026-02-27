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

    results.push({
      tracking_number: item.number,
      carrier_code: trackInfo.carrier?.code || "",
      carrier_name: trackInfo.carrier?.name || "",
      status: mapStatus(latestStatus.status),
      status_detail: latestStatus.sub_status_descr || "",
      last_event: latestEvent.description || "",
      last_event_at: latestEvent.time_iso || null,
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
 */
async function callRegister(
  trackingNumbers: string[],
  apiKey: string
): Promise<void> {
  const body = trackingNumbers.map((num) => ({ number: num }))

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
  }
}

/**
 * Real 17track API integration
 * Strategy: try gettrackinfo first (already registered numbers),
 * then register + retry, then fallback to pending with detected carrier.
 */
async function trackReal(
  trackingNumbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
  // Step 1: Try gettrackinfo first (works for already-registered numbers)
  let results = await callGetTrackInfo(trackingNumbers, apiKey)
  if (results.length > 0) return results

  // Step 2: Register numbers with 17track (starts tracking)
  await callRegister(trackingNumbers, apiKey)

  // Step 3: Wait 3s for 17track to fetch data from carrier
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // Step 4: Retry gettrackinfo
  results = await callGetTrackInfo(trackingNumbers, apiKey)
  if (results.length > 0) return results

  // Step 5: Return pending results with locally detected carrier
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
 * Main tracking function - uses real 17track API
 * Requires a valid API key (per-store or global env)
 */
export async function trackPackages(
  trackingNumbers: string[],
  apiKey?: string | null
): Promise<TrackingResult[]> {
  if (!trackingNumbers.length) return []

  const key = apiKey || process.env.SEVENTEEN_TRACK_API_KEY

  if (!key) {
    log.warn("No 17track API key configured – cannot track packages")
    return []
  }

  return await trackReal(trackingNumbers, key)
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
