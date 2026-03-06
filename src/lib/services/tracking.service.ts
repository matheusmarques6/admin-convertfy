import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"
import {
  trackWithBestProvider,
  type CarrierKeys,
  type TrackingResult,
} from "@/lib/tracking/carriers"
import type { TrackingStatus, TrackingEvent } from "@/types/tracking"

const log = logger.child("TrackingService")

const SEVENTEEN_TRACK_API = "https://api.17track.net/track/v2.2"
const API_KEY = process.env.SEVENTEEN_TRACK_API_KEY

// 17track carrier codes for international carriers
// Full list: https://api.17track.net/track/v2.2/getcarrierlist
export const CARRIER_CODES: Record<string, number> = {
  // Global / Multi-country
  "dhl": 100001,
  "dhl-express": 100001,
  "ups": 100002,
  "fedex": 100003,
  "tnt": 100004,
  "aramex": 100005,
  "dpd": 100006,
  "gls": 100007,
  "toll": 100008,
  "usps": 21051,
  "royal-mail": 10041,
  "canada-post": 3041,
  "australia-post": 1151,
  "china-post": 4041,
  "china-ems": 4042,
  "yanwen": 190271,
  "cainiao": 190272,
  "4px": 190011,
  "yun-express": 190131,
  "sf-express": 190021,
  // Brazil
  "correios": 5011,
  "jadlog": 190351,
  "sequoia": 190352,
  "loggi": 190353,
  "total-express": 190354,
  "azul-cargo": 190355,
  "latam-cargo": 190356,
  // Europe
  "deutsche-post": 6161,
  "hermes-de": 6162,
  "poste-italiane": 10061,
  "correos-spain": 15041,
  "ctt-portugal": 12041,
  "bpost": 2041,
  "postnl": 11041,
  "swiss-post": 16041,
  "colissimo": 7011,
  "chronopost": 7012,
  // Asia
  "japan-post": 8041,
  "korea-post": 9041,
  "india-post": 190091,
  "singpost": 14041,
  // Auto-detect (let 17track figure it out)
  "auto": 0,
}

// Reverse map: 17track carrier code → human-readable name
const CARRIER_NAMES: Record<number, string> = {
  100001: "DHL",
  100002: "UPS",
  100003: "FedEx",
  100004: "TNT",
  100005: "Aramex",
  100006: "DPD",
  100007: "GLS",
  21051: "USPS",
  10041: "Royal Mail",
  3041: "Canada Post",
  1151: "Australia Post",
  4041: "China Post",
  4042: "China EMS",
  190271: "YanWen",
  190272: "Cainiao",
  190011: "4PX",
  190131: "YunExpress",
  190021: "SF Express",
  5011: "Correios",
  190351: "Jadlog",
  6161: "Deutsche Post",
  10061: "Poste Italiane",
  15041: "Correos",
  12041: "CTT",
  7011: "Colissimo",
  7012: "Chronopost",
  8041: "Japan Post",
  9041: "Korea Post",
}

interface SeventeenTrackResult {
  number: string
  carrier: number
  param: unknown
  tag: string
  track: {
    z: Array<{
      a: string // date
      z: string // description
      c: string // location
    }>
  }
}

function mapSeventeenTrackStatus(tag: string): TrackingStatus {
  const map: Record<string, TrackingStatus> = {
    NotFound: "pending",
    InfoReceived: "info_received",
    InTransit: "in_transit",
    OutForDelivery: "out_for_delivery",
    Delivered: "delivered",
    FailedAttempt: "failed_attempt",
    Exception: "exception",
    Expired: "expired",
  }
  return map[tag] || "pending"
}

function mapSeventeenTrackEvents(track: SeventeenTrackResult["track"]): TrackingEvent[] {
  if (!track?.z) return []
  return track.z.map((e) => ({
    date: e.a,
    status: "in_transit" as TrackingStatus,
    description: e.z,
    location: e.c || null,
  }))
}

/**
 * Auto-detect carrier from tracking number pattern
 */
export function detectCarrier(trackingNumber: string): { code: number; name: string } {
  const tn = trackingNumber.trim().toUpperCase()

  // Correios Brazil: 2 letters + 9 digits + 2 letters (e.g. BR123456789BR)
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(tn)) {
    const suffix = tn.slice(-2)
    if (suffix === "BR") return { code: 5011, name: "Correios" }
    if (suffix === "CN") return { code: 4041, name: "China Post" }
    if (suffix === "DE") return { code: 6161, name: "Deutsche Post" }
    if (suffix === "IT") return { code: 10061, name: "Poste Italiane" }
    if (suffix === "ES") return { code: 15041, name: "Correos" }
    if (suffix === "PT") return { code: 12041, name: "CTT" }
    if (suffix === "JP") return { code: 8041, name: "Japan Post" }
    if (suffix === "US") return { code: 21051, name: "USPS" }
    if (suffix === "GB") return { code: 10041, name: "Royal Mail" }
    if (suffix === "CA") return { code: 3041, name: "Canada Post" }
    if (suffix === "AU") return { code: 1151, name: "Australia Post" }
    if (suffix === "FR") return { code: 7011, name: "Colissimo" }
    // Other countries - let 17track auto-detect
    return { code: 0, name: "International Post" }
  }

  // FedEx: 12-15 digits or starts with 6
  if (/^\d{12,15}$/.test(tn) && tn.startsWith("6")) return { code: 100003, name: "FedEx" }

  // UPS: starts with 1Z
  if (tn.startsWith("1Z")) return { code: 100002, name: "UPS" }

  // DHL: 10-digit number or starts with JD/JJD
  if (/^\d{10}$/.test(tn) || tn.startsWith("JD") || tn.startsWith("JJD")) return { code: 100001, name: "DHL" }

  // USPS: starts with 9 and is 22 digits or 94 with 20-22 digits
  if (/^9[0-9]{21}$/.test(tn) || /^94[0-9]{18,20}$/.test(tn)) return { code: 21051, name: "USPS" }

  // 4PX: starts with 4PX or JNTCU
  if (tn.startsWith("4PX") || tn.startsWith("JNTCU")) return { code: 190011, name: "4PX" }

  // YunExpress: starts with YT
  if (tn.startsWith("YT")) return { code: 190131, name: "YunExpress" }

  // Cainiao: starts with LP or CAINIAO
  if (tn.startsWith("LP") || tn.startsWith("CAINIAO")) return { code: 190272, name: "Cainiao" }

  // SF Express: starts with SF
  if (tn.startsWith("SF")) return { code: 190021, name: "SF Express" }

  // Jadlog: 14-digit number
  if (/^\d{14}$/.test(tn)) return { code: 190351, name: "Jadlog" }

  // Default: auto-detect by 17track
  return { code: 0, name: "Auto" }
}

function resolveCarrierName(carrierCode: number, detectedName: string | null): string {
  if (carrierCode && CARRIER_NAMES[carrierCode]) {
    return CARRIER_NAMES[carrierCode]
  }
  return detectedName || "Unknown"
}

// --- Mock Service (used when API key is not configured) ---

function generateMockEvents(trackingNumber: string): TrackingEvent[] {
  const now = new Date()
  const events: TrackingEvent[] = []
  const base = trackingNumber.charCodeAt(trackingNumber.length - 1) % 5

  events.push({
    date: new Date(now.getTime() - 5 * 86400000).toISOString(),
    status: "info_received",
    description: "Objeto postado",
    location: "São Paulo, SP",
  })

  if (base >= 1) {
    events.push({
      date: new Date(now.getTime() - 4 * 86400000).toISOString(),
      status: "in_transit",
      description: "Objeto em trânsito - por favor aguarde",
      location: "Centro de Distribuição - São Paulo, SP",
    })
  }

  if (base >= 2) {
    events.push({
      date: new Date(now.getTime() - 3 * 86400000).toISOString(),
      status: "in_transit",
      description: "Objeto encaminhado para unidade de distribuição",
      location: "Curitiba, PR",
    })
  }

  if (base >= 3) {
    events.push({
      date: new Date(now.getTime() - 1 * 86400000).toISOString(),
      status: "out_for_delivery",
      description: "Objeto saiu para entrega ao destinatário",
      location: "Curitiba, PR",
    })
  }

  if (base >= 4) {
    events.push({
      date: new Date(now.getTime() - 2 * 3600000).toISOString(),
      status: "delivered",
      description: "Objeto entregue ao destinatário",
      location: "Curitiba, PR",
    })
  }

  return events.reverse()
}

function getMockStatus(events: TrackingEvent[]): TrackingStatus {
  return events.length > 0 ? events[0].status : "pending"
}

// --- Carrier Status Mapping ---

// Explicit map: provider status strings → valid TrackingStatus
// Avoids direct `as TrackingStatus` cast for values that don't exist in the union
const CARRIER_STATUS_MAP: Record<string, TrackingStatus> = {
  delivered:        "delivered",
  in_transit:       "in_transit",
  out_for_delivery: "out_for_delivery",
  pending:          "pending",
  info_received:    "info_received",
  failed_attempt:   "failed_attempt",
  exception:        "exception",
  expired:          "expired",
  // Provider-specific statuses that need normalization:
  pick_up:          "in_transit",      // Cainiao/PostNL: collected = in transit
  undelivered:      "failed_attempt",  // TrackingMore: not delivered = failed attempt
  alert:            "exception",       // TrackingMore: alert = exception
}

function mapCarriersResultToTrackResult(result: TrackingResult): TrackResult {
  // Normalize each event: carriers.TrackingEvent has optional status/location,
  // but types/tracking.TrackingEvent requires status: TrackingStatus and location: string | null
  const normalizedEvents: TrackingEvent[] = result.events.map((evt) => ({
    date: evt.date,
    description: evt.description,
    status: CARRIER_STATUS_MAP[evt.status ?? ""] ?? "in_transit",
    location: evt.location ?? null,
  }))

  return {
    status: CARRIER_STATUS_MAP[result.status] ?? "pending",
    statusDescription: result.status_detail || result.last_event || "",
    location: normalizedEvents[0]?.location || null,
    events: normalizedEvents,
    carrier: result.carrier_name || null,
    estimatedDelivery: result.estimated_delivery,
  }
}

// --- Task 1: Standalone trackVia17track function ---

/**
 * Calls 17track API for the given tracking numbers using the provided API key.
 * Returns an array of TrackingResult objects compatible with trackWithBestProvider.
 */
export async function trackVia17track(
  numbers: string[],
  apiKey: string
): Promise<TrackingResult[]> {
  if (numbers.length === 0) return []

  const results: TrackingResult[] = []

  for (const trackingNumber of numbers) {
    const detected = detectCarrier(trackingNumber)
    const resolvedCarrierCode = detected.code

    try {
      // Register tracking number with 17track (timeout: 8s)
      const regController = new AbortController()
      const regTimeout = setTimeout(() => regController.abort(), 8000)
      try {
        const registerRes = await fetch(`${SEVENTEEN_TRACK_API}/register`, {
          method: "POST",
          headers: {
            "17token": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{ number: trackingNumber, carrier: resolvedCarrierCode }]),
          signal: regController.signal,
        })
        clearTimeout(regTimeout)

        if (!registerRes.ok) {
          log.warn("17track register failed", { status: registerRes.status, trackingNumber })
        }
      } catch (regErr) {
        clearTimeout(regTimeout)
        if (regErr instanceof Error && regErr.name === "AbortError") {
          log.warn("17track register timeout", { trackingNumber })
        } else {
          log.warn("17track register error", { trackingNumber, error: regErr instanceof Error ? regErr.message : String(regErr) })
        }
        // Continue to try gettrackinfo anyway — registration may have been processed before
      }

      // Brief pause for 17track to process registration
      await new Promise((r) => setTimeout(r, 300))

      // Get tracking info (timeout: 8s)
      const infoController = new AbortController()
      const infoTimeout = setTimeout(() => infoController.abort(), 8000)
      const response = await fetch(`${SEVENTEEN_TRACK_API}/gettrackinfo`, {
        method: "POST",
        headers: {
          "17token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ number: trackingNumber, carrier: resolvedCarrierCode }]),
        signal: infoController.signal,
      })
      clearTimeout(infoTimeout)

      if (!response.ok) {
        log.error("17track API response error", { status: response.status, trackingNumber })
        continue
      }

      const data = await response.json()
      const raw = data?.data?.accepted?.[0] as SeventeenTrackResult | undefined

      if (!raw) {
        log.warn("No tracking result from 17track", {
          trackingNumber,
          data: JSON.stringify(data?.data?.rejected?.slice(0, 2)),
        })
        continue
      }

      const mappedEvents = mapSeventeenTrackEvents(raw.track)
      const statusTag = mapSeventeenTrackStatus(raw.tag)
      const carrierName = resolveCarrierName(raw.carrier, detected.name)

      // carriers.TrackingEvent has optional fields; cast to satisfy TrackingResult shape
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const carrierEvents = mappedEvents as any[]

      results.push({
        tracking_number: trackingNumber,
        carrier_code: "17track",
        carrier_name: carrierName,
        status: statusTag,
        status_detail: mappedEvents[0]?.description || raw.tag,
        last_event: mappedEvents[0]?.description || "",
        last_event_at: mappedEvents[0]?.date || null,
        estimated_delivery: null,
        events: carrierEvents,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        log.warn("17track gettrackinfo timeout", { trackingNumber })
      } else {
        log.error("17track API error", { trackingNumber, err })
      }
    }
  }

  return results
}

// --- Public API ---

export interface TrackResult {
  status: TrackingStatus
  statusDescription: string
  location: string | null
  events: TrackingEvent[]
  carrier: string | null
  estimatedDelivery: string | null
}

/** @deprecated Use trackWithBestProvider() via syncTrackingCode() instead. Will be removed in a future version. */
export async function trackNumber(trackingNumber: string, carrierCode = 0): Promise<TrackResult> {
  if (!API_KEY) {
    log.info("Using mock tracking (no 17track API key)", { trackingNumber })
    return getMockTrackResult(trackingNumber)
  }

  // carrierCode param kept for backward-compat with callers; auto-detection handled inside trackVia17track
  void carrierCode

  try {
    // Use the standalone trackVia17track internally
    const results = await trackVia17track([trackingNumber], API_KEY)

    if (results.length > 0) {
      return mapCarriersResultToTrackResult(results[0])
    }

    // trackVia17track returned no results — fallback to mock
    log.warn("trackVia17track returned no results, falling back to mock", { trackingNumber })
    return getMockTrackResult(trackingNumber)
  } catch (err) {
    log.error("17track API error, falling back to mock", err)
    return getMockTrackResult(trackingNumber)
  }
}

function getMockTrackResult(trackingNumber: string): TrackResult {
  const events = generateMockEvents(trackingNumber)
  const status = getMockStatus(events)
  return {
    status,
    statusDescription: events[0]?.description || "Aguardando atualização",
    location: events[0]?.location || null,
    events,
    carrier: "Correios",
    estimatedDelivery: null,
  }
}

// --- Freshness Guard ---

const FRESHNESS_MS: Record<string, number> = {
  pending:          6 * 3600_000,       // 6h
  info_received:    6 * 3600_000,       // 6h
  in_transit:       4 * 3600_000,       // 4h
  out_for_delivery: 30 * 60_000,        // 30min
  delivered:        30 * 86400_000,     // 30 days
  failed_attempt:   2 * 3600_000,       // 2h (delivery attempt failed, re-check sooner)
  exception:        24 * 3600_000,      // 24h
  expired:          24 * 3600_000,      // 24h
}

function isWithinFreshness(lastCheckedAt: string | null, status: string | null, hasEvents = true): boolean {
  if (!lastCheckedAt) return false
  // Tracking without events uses short threshold (30min) for faster re-check
  const thresholdMs = (!hasEvents && (status === "pending" || !status))
    ? 30 * 60_000  // 30min
    : FRESHNESS_MS[status || "pending"] ?? FRESHNESS_MS.pending
  return Date.now() - new Date(lastCheckedAt).getTime() < thresholdMs
}

function getFreshnessThresholdMs(status: string | null): number {
  return FRESHNESS_MS[status || "pending"] ?? FRESHNESS_MS.pending
}

// --- Safe Decrypt ---

function safeDecrypt(value: string, keyName: string, trackingCodeId: string): string | undefined {
  try {
    return decrypt(value)
  } catch (err) {
    log.warn("Failed to decrypt carrier key", {
      trackingCodeId,
      keyName,
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}

// --- Resolve carrier keys per store ---

interface StoreCarrierApiKeys {
  trackingmore?: string
  postnl?: string
  [key: string]: string | undefined
}

async function resolveCarrierKeys(trackingCodeId: string, trackingStoreId: string | null): Promise<CarrierKeys> {
  const globalApiKey = process.env.SEVENTEEN_TRACK_API_KEY

  // If no store id, use global fallback only
  if (!trackingStoreId) {
    return {
      seventeen_track: globalApiKey,
      cainiao: true,
    }
  }

  const admin = createAdminClient()

  const { data: store, error } = await admin
    .from("tracking_stores")
    .select("seventeen_track_api_key, carrier_api_keys")
    .eq("id", trackingStoreId)
    .single()

  if (error || !store) {
    log.warn("tracking_store not found, using global fallback", { trackingCodeId })
    return {
      seventeen_track: globalApiKey,
      cainiao: true,
    }
  }

  const apiKeys = (store.carrier_api_keys ?? {}) as StoreCarrierApiKeys

  const keys: CarrierKeys = {
    // Prefer store key, fall back to global env var
    seventeen_track: store.seventeen_track_api_key
      ? safeDecrypt(store.seventeen_track_api_key, "seventeen_track_api_key", trackingCodeId)
      : globalApiKey,
    trackingmore: apiKeys.trackingmore
      ? safeDecrypt(apiKeys.trackingmore, "trackingmore", trackingCodeId)
      : undefined,
    postnl: apiKeys.postnl
      ? safeDecrypt(apiKeys.postnl, "postnl", trackingCodeId)
      : undefined,
    cainiao: true, // always enabled (free)
  }

  return keys
}

export async function syncTrackingCode(trackingCodeId: string): Promise<void> {
  const admin = createAdminClient()

  // Task 2.1: fetch tracking_code including tracking_store_id
  const { data: code, error } = await admin
    .from("tracking_codes")
    .select("*, tracking_store_id")
    .eq("id", trackingCodeId)
    .single()

  if (error || !code) {
    log.error("Tracking code not found for sync", { trackingCodeId, error })
    return
  }

  // Freshness guard: skip sync if data was recently checked
  const hasEvents = Array.isArray(code.tracking_events) && code.tracking_events.length > 0
  if (isWithinFreshness(code.last_checked_at, code.status, hasEvents)) {
    log.info("Skipping sync, data is fresh", {
      trackingCodeId,
      status: code.status,
      lastCheckedAt: code.last_checked_at,
      thresholdMs: getFreshnessThresholdMs(code.status),
    })
    return
  }

  // Resolve carrier keys for this store (with fallback)
  const keys = await resolveCarrierKeys(trackingCodeId, code.tracking_store_id ?? null)

  // Call trackWithBestProvider with resolved keys
  let trackResult: TrackResult | null = null
  const multiCarrierResult = await trackWithBestProvider(
    code.tracking_number,
    keys,
    trackVia17track
  )

  if (multiCarrierResult) {
    // Map TrackingResult → TrackResult via explicit status map
    trackResult = mapCarriersResultToTrackResult(multiCarrierResult)

    // Log the provider used after successful result
    log.info("Tracking synced via provider", {
      trackingCodeId,
      trackingNumber: code.tracking_number,
      provider: multiCarrierResult.carrier_code || "unknown",
      status: multiCarrierResult.status,
    })
  } else {
    // All providers returned null — update last_checked_at to avoid retry storm
    log.warn("No tracking data available", { trackingCodeId, trackingNumber: code.tracking_number })
    await admin
      .from("tracking_codes")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", trackingCodeId)
    return
  }

  if (!trackResult) return

  const updateData: Record<string, unknown> = {
    status: trackResult.status,
    status_detail: trackResult.statusDescription,
    last_event: trackResult.location || trackResult.events[0]?.description || null,
    last_event_at: trackResult.events[0]?.date || null,
    tracking_events: trackResult.events,
    last_checked_at: new Date().toISOString(),
    provider_used: multiCarrierResult.carrier_code || "unknown",
  }

  if (trackResult.estimatedDelivery) {
    updateData.estimated_delivery = trackResult.estimatedDelivery
  }

  if (trackResult.carrier) {
    updateData.carrier_name = trackResult.carrier
  }

  // Update shipped_at / delivered_at on the parent tracking_order
  if (code.tracking_order_id) {
    const orderUpdate: Record<string, unknown> = {}
    if (trackResult.status === "delivered") {
      orderUpdate.delivered_at = trackResult.events[0]?.date || new Date().toISOString()
    }
    if (trackResult.status === "in_transit" || trackResult.status === "out_for_delivery") {
      orderUpdate.shipped_at = trackResult.events[trackResult.events.length - 1]?.date || new Date().toISOString()
    }
    if (Object.keys(orderUpdate).length > 0) {
      await admin
        .from("tracking_orders")
        .update(orderUpdate)
        .eq("id", code.tracking_order_id)
    }
  }

  await admin
    .from("tracking_codes")
    .update(updateData)
    .eq("id", trackingCodeId)

  log.info("Tracking code synced", { trackingCodeId, status: trackResult.status })
}

export async function syncAllPendingCodes(): Promise<number> {
  const admin = createAdminClient()

  const { data: codes } = await admin
    .from("tracking_codes")
    .select("id")
    .not("status", "in", '("delivered","expired")')
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(50)

  if (!codes || codes.length === 0) return 0

  for (const code of codes) {
    await syncTrackingCode(code.id)
    // Rate limit: 500ms between calls
    await new Promise((r) => setTimeout(r, 500))
  }

  return codes.length
}
