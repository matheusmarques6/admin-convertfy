import { fetchWithRetry } from "@/lib/utils/retry"
import { logger } from "@/lib/logger"

const log = logger.child("SeventeenTrack")

// =============================================
// Types
// =============================================

export type TrackingStatus =
  | "not_found"
  | "info_received"
  | "in_transit"
  | "expired"
  | "pickup"
  | "out_for_delivery"
  | "delivery_failure"
  | "delivered"
  | "exception"

export interface TrackingEvent {
  date: string
  description: string
  location?: string
  status: string
}

export interface TrackingResult {
  found: boolean
  tracking_code: string
  carrier: string
  carrier_logo?: string
  origin_country?: string
  destination_country?: string
  status: TrackingStatus
  status_label: string
  estimated_delivery?: string
  events: TrackingEvent[]
  last_update: string
}

// =============================================
// Status Mapping
// =============================================

interface StatusInfo {
  label: string
  icon: string
  color: string
}

export const STATUS_MAP: Record<TrackingStatus, StatusInfo> = {
  not_found: { label: "Não encontrado", icon: "search", color: "gray" },
  info_received: {
    label: "Informações recebidas",
    icon: "info",
    color: "blue",
  },
  in_transit: { label: "Em trânsito", icon: "truck", color: "yellow" },
  expired: { label: "Expirado", icon: "clock", color: "gray" },
  pickup: { label: "Disponível para retirada", icon: "package", color: "orange" },
  out_for_delivery: {
    label: "Saiu para entrega",
    icon: "truck",
    color: "orange",
  },
  delivery_failure: {
    label: "Falha na entrega",
    icon: "x-circle",
    color: "red",
  },
  delivered: { label: "Entregue", icon: "check-circle", color: "green" },
  exception: { label: "Exceção", icon: "alert-triangle", color: "red" },
}

// 17Track API status → our normalized status
const API_STATUS_MAP: Record<string, TrackingStatus> = {
  NotFound: "not_found",
  InfoReceived: "info_received",
  InTransit: "in_transit",
  Expired: "expired",
  AvailableForPickup: "pickup",
  OutForDelivery: "out_for_delivery",
  DeliveryFailure: "delivery_failure",
  Delivered: "delivered",
  Exception: "exception",
}

// =============================================
// 17Track API Response Types
// =============================================

interface ApiTrackEvent {
  time_iso?: string
  time_utc?: string
  description?: string
  description_translation?: string
  location?: string
  stage?: string
  sub_status?: string
}

interface ApiTrackInfo {
  number: string
  carrier?: number
  carrier_name?: string
  package_status?: string
  tracking_status?: string
  latest_event?: ApiTrackEvent
  origin_info?: {
    country?: string
    trackinfo?: ApiTrackEvent[]
  }
  destination_info?: {
    country?: string
    trackinfo?: ApiTrackEvent[]
  }
  time_metrics?: {
    days_after_order?: number
    days_of_transit?: number
    estimated_delivery_date?: string
  }
  milestones?: Array<{
    status?: string
    time_iso?: string
  }>
}

interface ApiResponse {
  code: number
  data: {
    accepted?: Array<{ number: string; carrier?: number }>
    rejected?: Array<{ number: string; error: { code: number; message: string } }>
    tracking?: ApiTrackInfo[]
  }
}

// =============================================
// Service
// =============================================

const BASE_URL = "https://api.17track.net/track/v2.2"

export class SeventeenTrackService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetchWithRetry(
      `${BASE_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "17token": this.apiKey,
        },
        body: JSON.stringify(body),
      },
      {
        maxRetries: 2,
        baseDelay: 1000,
        retryOn: (res) => res.status === 429 || res.status >= 500,
      }
    )

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      log.error(`17Track API error: ${response.status}`, { endpoint, body: text })
      throw new Error(`17Track API error: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Register tracking numbers for monitoring.
   * Must be called before gettrackinfo for new numbers.
   */
  async register(
    numbers: Array<{ number: string; carrier?: number }>
  ): Promise<{ accepted: string[]; rejected: Array<{ number: string; error: string }> }> {
    const response = await this.request<ApiResponse>("/register", numbers)

    return {
      accepted: response.data.accepted?.map((a) => a.number) ?? [],
      rejected:
        response.data.rejected?.map((r) => ({
          number: r.number,
          error: r.error.message,
        })) ?? [],
    }
  }

  /**
   * Get tracking info for a single tracking code.
   * Registers the number first if needed, then fetches info.
   */
  async track(trackingCode: string): Promise<TrackingResult> {
    // Register first (idempotent — already registered numbers are just rejected with "already exists")
    await this.register([{ number: trackingCode }]).catch(() => {
      log.warn(`Failed to register ${trackingCode}, attempting gettrackinfo anyway`)
    })

    const response = await this.request<ApiResponse>("/gettrackinfo", [
      { number: trackingCode },
    ])

    const trackInfo = response.data.tracking?.[0]
    if (!trackInfo) {
      return this.notFoundResult(trackingCode)
    }

    return this.normalizeTrackInfo(trackInfo)
  }

  /**
   * Get tracking info for multiple codes (max 40 per batch).
   */
  async trackBatch(codes: string[]): Promise<TrackingResult[]> {
    if (codes.length === 0) return []

    // Process in chunks of 40 (API limit)
    const results: TrackingResult[] = []
    for (let i = 0; i < codes.length; i += 40) {
      const chunk = codes.slice(i, i + 40)

      // Register all
      await this.register(chunk.map((c) => ({ number: c }))).catch(() => {
        log.warn(`Failed to register batch chunk ${i / 40 + 1}`)
      })

      // Fetch info
      const response = await this.request<ApiResponse>(
        "/gettrackinfo",
        chunk.map((c) => ({ number: c }))
      )

      const trackingMap = new Map(
        (response.data.tracking ?? []).map((t) => [t.number, t])
      )

      for (const code of chunk) {
        const info = trackingMap.get(code)
        results.push(info ? this.normalizeTrackInfo(info) : this.notFoundResult(code))
      }

      // Rate limit: 3 req/s max, wait between chunks
      if (i + 40 < codes.length) {
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }

    return results
  }

  // =============================================
  // Normalization
  // =============================================

  private normalizeTrackInfo(info: ApiTrackInfo): TrackingResult {
    const apiStatus = info.package_status || info.tracking_status || "NotFound"
    const status = API_STATUS_MAP[apiStatus] ?? "not_found"

    // Merge origin + destination events, sorted by date descending
    const events = this.mergeAndSortEvents(
      info.origin_info?.trackinfo,
      info.destination_info?.trackinfo
    )

    const lastEvent = events[0]

    return {
      found: status !== "not_found",
      tracking_code: info.number,
      carrier: info.carrier_name ?? `Carrier ${info.carrier ?? "unknown"}`,
      origin_country: info.origin_info?.country,
      destination_country: info.destination_info?.country,
      status,
      status_label: STATUS_MAP[status].label,
      estimated_delivery: info.time_metrics?.estimated_delivery_date,
      events,
      last_update: lastEvent?.date ?? new Date().toISOString(),
    }
  }

  private mergeAndSortEvents(
    origin?: ApiTrackEvent[],
    destination?: ApiTrackEvent[]
  ): TrackingEvent[] {
    const raw = [...(origin ?? []), ...(destination ?? [])]

    return raw
      .map((e) => ({
        date: e.time_iso || e.time_utc || "",
        description: e.description_translation || e.description || "",
        location: e.location || undefined,
        status: e.sub_status || e.stage || "",
      }))
      .filter((e) => e.date && e.description)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  private notFoundResult(trackingCode: string): TrackingResult {
    return {
      found: false,
      tracking_code: trackingCode,
      carrier: "unknown",
      status: "not_found",
      status_label: STATUS_MAP.not_found.label,
      events: [],
      last_update: new Date().toISOString(),
    }
  }
}
