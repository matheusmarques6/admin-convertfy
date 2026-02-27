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
 * Real 17track API integration
 */
async function trackReal(
  trackingNumbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
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
    throw new Error(`17track API error: ${response.status}`)
  }

  // After registering, fetch track info
  const trackResponse = await fetch(`${SEVENTEEN_TRACK_API_BASE}/gettrackinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "17token": apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!trackResponse.ok) {
    log.error("17track gettrackinfo failed", { status: trackResponse.status })
    throw new Error(`17track API error: ${trackResponse.status}`)
  }

  const data = await trackResponse.json()
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
 * Mock tracking service for development
 */
function trackMock(trackingNumbers: string[]): TrackingResult[] {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  const twoDaysAgo = new Date(now.getTime() - 172800000)
  const threeDaysAgo = new Date(now.getTime() - 259200000)

  return trackingNumbers.map((num) => ({
    tracking_number: num,
    carrier_code: "correios",
    carrier_name: "Correios",
    status: "in_transit",
    status_detail: "Objeto em trânsito - por favor aguarde",
    last_event: "Objeto em trânsito - de Unidade de Tratamento em CURITIBA/PR para Unidade de Distribuição em SÃO PAULO/SP",
    last_event_at: yesterday.toISOString(),
    estimated_delivery: new Date(now.getTime() + 172800000).toISOString(),
    events: [
      {
        date: yesterday.toISOString(),
        description: "Objeto em trânsito - de Unidade de Tratamento em CURITIBA/PR para Unidade de Distribuição em SÃO PAULO/SP",
        location: "CURITIBA / PR",
        status: "in_transit",
      },
      {
        date: twoDaysAgo.toISOString(),
        description: "Objeto postado após o horário limite da unidade",
        location: "CURITIBA / PR",
        status: "in_transit",
      },
      {
        date: threeDaysAgo.toISOString(),
        description: "Objeto postado",
        location: "CURITIBA / PR",
        status: "pick_up",
      },
    ],
  }))
}

/**
 * Main tracking function - uses real API if key is available, mock otherwise
 */
export async function trackPackages(
  trackingNumbers: string[],
  apiKey?: string | null
): Promise<TrackingResult[]> {
  if (!trackingNumbers.length) return []

  const key = apiKey || process.env.SEVENTEEN_TRACK_API_KEY

  if (key) {
    try {
      return await trackReal(trackingNumbers, key)
    } catch (error) {
      log.error("17track real API failed, falling back to mock", { error })
      return trackMock(trackingNumbers)
    }
  }

  log.info("Using mock tracking service (no SEVENTEEN_TRACK_API_KEY)")
  return trackMock(trackingNumbers)
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
