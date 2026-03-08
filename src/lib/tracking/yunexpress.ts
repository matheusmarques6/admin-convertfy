import { logger } from "@/lib/logger"
import type { TrackingResult, TrackingEvent } from "./carriers"

const log = logger.child("YunExpress")

const DEFAULT_BASE_URL = "https://oms-api.yunexpress.com/api"
const TIMEOUT_MS = 5_000

export interface YunExpressCredentials {
  customerNumber: string
  apiKey: string
}

export interface YunExpressSender {
  name: string
  company: string
  address: string
  city: string
  state: string
  country: string
  phone: string
  email: string
}

// ─── Internal response types (defensive — all fields optional) ──────────────

interface YunExpressBaseResponse {
  Code?: number
  ResultCode?: number
  Message?: string
  ResultDesc?: string
}

interface YunExpressWaybillData {
  WaybillNumber?: string
  TrackingNumber?: string
  CustomerNumber?: string
  CustomerOrderNumber?: string
  Status?: string
  ReceiverCountry?: string
  SenderCountry?: string
  Weight?: number
  CreatedOn?: string
  CreatedAt?: string
}

interface YunExpressSenderData {
  SenderName?: string
  SenderCompany?: string
  SenderAddress?: string
  SenderCity?: string
  SenderState?: string
  SenderCountry?: string
  SenderPhone?: string
  SenderEmail?: string
}

interface YunExpressTrackEvent {
  ProcessDate?: string
  ProcessContent?: string
  ProcessLocation?: string
}

interface YunExpressTrackItem {
  WaybillNumber?: string
  TrackingNumber?: string
  TrackingEvents?: YunExpressTrackEvent[]
  DeliveryStatus?: string
  LastMileCarrier?: string
  LastMileTrackingNumber?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.YUNEXPRESS_API_BASE_URL || DEFAULT_BASE_URL
}

function buildAuthHeader(credentials: YunExpressCredentials): string {
  const raw = `${credentials.customerNumber}:${credentials.apiKey}`
  return `Basic ${Buffer.from(raw).toString("base64")}`
}

function mapStatus(status?: string): string {
  if (!status) return "pending"
  const s = status.toLowerCase().replace(/[_\s-]/g, "")
  if (s.includes("delivered") || s === "signed") return "delivered"
  if (s.includes("outfordelivery") || s.includes("lastmile")) return "out_for_delivery"
  if (s.includes("intransit") || s.includes("transit") || s.includes("shipping")) return "in_transit"
  if (s.includes("exception") || s.includes("failed") || s.includes("returned")) return "exception"
  if (s.includes("pickup") || s.includes("collected")) return "pick_up"
  if (s.includes("inforeceived") || s.includes("created") || s.includes("accepted")) return "info_received"
  if (s.includes("expired")) return "expired"
  return "in_transit"
}

function mapEvents(events?: YunExpressTrackEvent[]): TrackingEvent[] {
  if (!events || !Array.isArray(events)) return []
  return events
    .map((evt) => ({
      date: evt.ProcessDate || "",
      description: evt.ProcessContent || "",
      location: evt.ProcessLocation || "",
    }))
    .filter((e) => e.date || e.description)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function isSuccess(data: YunExpressBaseResponse): boolean {
  // Defensivo: aceitar Code=0, ResultCode=0, ou ausencia de ambos com dados presentes
  return (data.Code === 0 || data.ResultCode === 0 || (data.Code === undefined && data.ResultCode === undefined))
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Track via YunExpress GET /WayBill/GetTrackingNumber (single)
 * Used by provider registry for individual tracking lookups.
 */
export async function trackViaYunExpress(
  trackingNumber: string,
  credentials: YunExpressCredentials,
  signal?: AbortSignal
): Promise<TrackingResult | null> {
  const ownController = signal ? null : new AbortController()
  const timeoutId = ownController ? setTimeout(() => ownController.abort(), TIMEOUT_MS) : null
  const effectiveSignal = signal ?? ownController!.signal

  try {
    const baseUrl = getBaseUrl()
    const url = `${baseUrl}/WayBill/GetTrackingNumber?trackingNumber=${encodeURIComponent(trackingNumber)}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(credentials),
        Accept: "application/json",
      },
      signal: effectiveSignal,
    })

    if (timeoutId) clearTimeout(timeoutId)

    if (!response.ok) {
      log.warn("YunExpress waybill request failed", { status: response.status, trackingNumber })
      return null
    }

    const data = (await response.json()) as YunExpressBaseResponse & { Data?: YunExpressWaybillData }

    if (!isSuccess(data) || !data.Data) {
      log.warn("YunExpress waybill no data", { code: data.Code ?? data.ResultCode, message: data.Message ?? data.ResultDesc, trackingNumber })
      return null
    }

    const waybill = data.Data
    const status = mapStatus(waybill.Status)

    return {
      tracking_number: trackingNumber,
      carrier_code: "yunexpress",
      carrier_name: "YunExpress",
      status,
      status_detail: waybill.Status || "",
      last_event: waybill.Status || "",
      last_event_at: waybill.CreatedOn || waybill.CreatedAt || null,
      estimated_delivery: null,
      events: [],
    }
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("YunExpress waybill timeout", { trackingNumber })
    } else {
      log.warn("YunExpress waybill error", error)
    }
    return null
  }
}

/**
 * Get sender info via YunExpress GET /WayBill/GetSender (single)
 */
export async function getYunExpressSender(
  trackingNumber: string,
  credentials: YunExpressCredentials
): Promise<YunExpressSender | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const baseUrl = getBaseUrl()
    const url = `${baseUrl}/WayBill/GetSender?trackingNumber=${encodeURIComponent(trackingNumber)}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(credentials),
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      log.warn("YunExpress sender request failed", { status: response.status, trackingNumber })
      return null
    }

    const data = (await response.json()) as YunExpressBaseResponse & { Data?: YunExpressSenderData }

    if (!isSuccess(data) || !data.Data) {
      return null
    }

    const s = data.Data
    return {
      name: s.SenderName || "",
      company: s.SenderCompany || "",
      address: s.SenderAddress || "",
      city: s.SenderCity || "",
      state: s.SenderState || "",
      country: s.SenderCountry || "",
      phone: s.SenderPhone || "",
      email: s.SenderEmail || "",
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("YunExpress sender timeout", { trackingNumber })
    } else {
      log.warn("YunExpress sender error", error)
    }
    return null
  }
}

/**
 * Track via YunExpress POST /Tracking/GetTrackInfo (batch, max 20)
 * Exported for future batch sync optimization. NOT used by provider registry.
 */
export async function trackViaYunExpressLastMile(
  trackingNumbers: string[],
  credentials: YunExpressCredentials
): Promise<TrackingResult[]> {
  if (!trackingNumbers.length) return []
  if (trackingNumbers.length > 20) {
    log.warn("YunExpress batch exceeds max 20, truncating", { count: trackingNumbers.length })
    trackingNumbers = trackingNumbers.slice(0, 20)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const baseUrl = getBaseUrl()
    const url = `${baseUrl}/Tracking/GetTrackInfo`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(credentials),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(trackingNumbers),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      log.warn("YunExpress last mile request failed", { status: response.status })
      return []
    }

    const data = (await response.json()) as YunExpressBaseResponse & { Data?: YunExpressTrackItem[] }

    if (!isSuccess(data) || !data.Data || !Array.isArray(data.Data)) {
      log.warn("YunExpress last mile no data", { code: data.Code ?? data.ResultCode })
      return []
    }

    return data.Data.map((item): TrackingResult => {
      const events = mapEvents(item.TrackingEvents)
      const latestEvent = events[0]
      const status = mapStatus(item.DeliveryStatus)

      return {
        tracking_number: item.WaybillNumber || item.TrackingNumber || "",
        carrier_code: "yunexpress",
        carrier_name: item.LastMileCarrier || "YunExpress",
        status,
        status_detail: item.DeliveryStatus || "",
        last_event: latestEvent?.description || "",
        last_event_at: latestEvent?.date || null,
        estimated_delivery: null,
        events,
      }
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("YunExpress last mile timeout", { count: trackingNumbers.length })
    } else {
      log.warn("YunExpress last mile error", error)
    }
    return []
  }
}
