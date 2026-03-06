import { logger } from "@/lib/logger"
/** Local type for carrier tracking results */
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

export interface TrackingEvent {
  date: string
  description: string
  location?: string
  status?: string
}

const log = logger.child("Carriers")

// ─── Carrier Detection ──────────────────────────────────────────────────────

export interface CarrierInfo {
  code: string
  name: string
  provider: "correios" | "cainiao" | "postnl" | "trackingmore" | "seventeen_track" | "unknown"
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
    return { code: "correios", name: "Correios", provider: "correios" }
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

// ─── Correios API Rastro (Free - Brazil direct) ─────────────────────────────

const CORREIOS_API_BASE = "https://proxyapp.correios.com.br/v1/sro-rastro"

interface CorreiosEvento {
  dtHrCriado: string
  descricao: string
  unidade: {
    nome?: string
    endereco?: { cidade?: string; uf?: string }
  }
  unidadeDestino?: {
    nome?: string
    endereco?: { cidade?: string; uf?: string }
  }
}

interface CorreiosObjeto {
  codObjeto: string
  tipoPostal?: { categoria?: string; descricao?: string }
  dtPrevista?: string
  eventos?: CorreiosEvento[]
  mensagem?: string
}

/**
 * Normalize description for status matching: lowercase + remove accents
 */
function normalizeDesc(desc: string): string {
  return desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Infer tracking status from Correios event description (Portuguese)
 */
function inferCorreiosStatus(descricao: string): string {
  const d = normalizeDesc(descricao)

  if (d.includes("entregue") || d.includes("entrega efetuada")) return "delivered"
  if (d.includes("saiu para entrega")) return "out_for_delivery"
  if (d.includes("aguardando retirada")) return "out_for_delivery"
  if (d.includes("tentativa de entrega") || d.includes("nao foi possivel")) return "failed_attempt"
  if (d.includes("devolvido") || d.includes("retornado")) return "exception"
  if (d.includes("apreendido") || d.includes("roubado")) return "exception"
  if (d.includes("aguardando pagamento") || d.includes("tributado")) return "exception"
  if (d.includes("postado") || d.includes("coletado") || d.includes("recebido pelos correios")) return "info_received"
  if (d.includes("objeto nao localizado")) return "pending"
  if (d.includes("em transito") || d.includes("encaminhado") || d.includes("fiscalizacao aduaneira")) return "in_transit"

  return "in_transit"
}

/**
 * Track via Correios API Rastro (free, public, no auth)
 * NOTE: This is an unofficial public endpoint with no SLA. May change URL or block without notice.
 * TOP 1 for Brazilian tracking numbers (XX123456789BR pattern).
 */
export async function trackViaCorreios(trackingNumber: string): Promise<TrackingResult | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${CORREIOS_API_BASE}/${encodeURIComponent(trackingNumber)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      log.warn("Correios request failed", { status: response.status, trackingNumber })
      return null
    }

    const data = await response.json()
    const objeto: CorreiosObjeto | undefined = data?.objetos?.[0]

    if (!objeto || !objeto.eventos || objeto.eventos.length === 0) {
      return null
    }

    const events: TrackingEvent[] = objeto.eventos.map((evt: CorreiosEvento) => {
      const location = [
        evt.unidade?.endereco?.cidade,
        evt.unidade?.endereco?.uf,
      ].filter(Boolean).join(", ")

      return {
        date: evt.dtHrCriado,
        description: evt.descricao,
        location: location || evt.unidade?.nome || "",
        status: inferCorreiosStatus(evt.descricao),
      }
    })

    const latestEvent = events[0]
    const status = inferCorreiosStatus(latestEvent?.description || "")

    return {
      tracking_number: trackingNumber,
      carrier_code: "correios",
      carrier_name: "Correios",
      status,
      status_detail: latestEvent?.description || "",
      last_event: latestEvent?.description || "",
      last_event_at: latestEvent?.date || null,
      estimated_delivery: objeto.dtPrevista || null,
      events,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("Correios timeout", { trackingNumber })
    } else {
      log.warn("Correios tracking error", error)
    }
    return null
  }
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
 * Also tried for non-Chinese tracking (returns null quickly if not recognized)
 */
export async function trackViaCainiao(trackingNumber: string): Promise<TrackingResult | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch("https://global.cainiao.com/global/detail.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: `mailNoList=${encodeURIComponent(trackingNumber)}&language=en`,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

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
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("Cainiao timeout", { trackingNumber })
    } else {
      log.warn("Cainiao tracking error", error)
    }
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

const TRACKINGMORE_API_BASE = "https://api.trackingmore.com/v3"

/**
 * Track via TrackingMore API (paid, requires API key)
 * Cheaper alternative to 17track - covers all carriers
 */
export async function trackViaTrackingMore(
  trackingNumber: string,
  apiKey: string,
  courierCode?: string
): Promise<TrackingResult | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
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
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("TrackingMore rate limit hit")
        return null
      }
      log.warn("TrackingMore request failed", { status: response.status })
      return null
    }

    const data = await response.json()

    const code = data.meta?.code ?? data.code
    if (code !== 200 || !data.data) {
      log.warn("TrackingMore API error", { code, message: data.meta?.message ?? data.message })
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
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("TrackingMore timeout", { trackingNumber })
    } else {
      log.warn("TrackingMore tracking error", error)
    }
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
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(
      `${POSTNL_API_BASE}/shipment/v2/status/barcode/${encodeURIComponent(trackingNumber)}?detail=true&language=EN`,
      {
        method: "GET",
        headers: {
          apikey: apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    )
    clearTimeout(timeoutId)

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
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("PostNL timeout", { trackingNumber })
    } else {
      log.warn("PostNL tracking error", error)
    }
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

// ─── Provider Registry ──────────────────────────────────────────────────────

interface ProviderEntry {
  label: string
  canRun: (keys: CarrierKeys, carrier: CarrierInfo) => boolean
  execute: (
    trackingNumber: string,
    keys: CarrierKeys,
    carrier: CarrierInfo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trackVia17trackFn?: (numbers: string[], apiKey: string) => Promise<any[]>
  ) => Promise<TrackingResult | null>
}

const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
  correios: {
    label: "Correios",
    canRun: (_k, c) => c.code === "correios",
    execute: (tn) => trackViaCorreios(tn),
  },
  postnl: {
    label: "PostNL",
    canRun: (k, c) => c.provider === "postnl" && !!k.postnl,
    execute: (tn, k) => trackViaPostNL(tn, k.postnl!),
  },
  cainiao: {
    label: "Cainiao",
    canRun: (k) => k.cainiao !== false,
    execute: (tn) => trackViaCainiao(tn),
  },
  trackingmore: {
    label: "TrackingMore",
    canRun: (k) => !!k.trackingmore,
    execute: (tn, k, c) => trackViaTrackingMore(tn, k.trackingmore!, getTrackingMoreCourierCode(c.code)),
  },
  seventeen_track: {
    label: "17track",
    canRun: (k) => !!k.seventeen_track,
    execute: async (tn, k, _c, trackVia17trackFn) => {
      if (!trackVia17trackFn) return null
      const results = await trackVia17trackFn([tn], k.seventeen_track!)
      if (results.length > 0 && (results[0].events?.length > 0 || results[0].status !== "pending")) {
        return results[0]
      }
      return null
    },
  },
}

const DEFAULT_PROVIDER_ORDER = ["correios", "postnl", "cainiao", "trackingmore", "seventeen_track"]

/**
 * Resolve provider order, ensuring 17track is ALWAYS last.
 */
function resolveProviderOrder(configOrder: string[] | null): string[] {
  const order = configOrder ?? DEFAULT_PROVIDER_ORDER
  const without17 = order.filter(p => p !== "seventeen_track")
  return [...without17, "seventeen_track"]
}

/**
 * Track a package using the best available provider (dynamic registry loop).
 * Priority: Correios (BR) → PostNL (carrier-specific) → Cainiao (free) → TrackingMore → 17track (ALWAYS LAST)
 */
export async function trackWithBestProvider(
  trackingNumber: string,
  keys: CarrierKeys,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackVia17track: (numbers: string[], apiKey: string) => Promise<any[]>,
  providerOrder?: string[],
  globalTimeoutMs = 25_000
): Promise<TrackingResult | null> {
  const carrier = detectCarrierProvider(trackingNumber)
  const order = resolveProviderOrder(providerOrder ?? null)
  const deadline = Date.now() + globalTimeoutMs

  for (const providerName of order) {
    const remaining = deadline - Date.now()
    if (remaining <= 500) {
      log.warn("Global timeout reached, stopping provider loop", { trackingNumber, lastProvider: providerName })
      break
    }

    const provider = PROVIDER_REGISTRY[providerName]
    if (!provider) { log.warn("Unknown provider in order", { provider: providerName }); continue }
    if (!provider.canRun(keys, carrier)) continue

    const t0 = Date.now()
    const providerTimeout = Math.min(remaining, 5_000)
    log.info(`Trying ${provider.label}`, { trackingNumber, remainingMs: remaining })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), providerTimeout)

    try {
      const result = await Promise.race([
        provider.execute(trackingNumber, keys, carrier, trackVia17track),
        new Promise<null>((resolve) => {
          controller.signal.addEventListener("abort", () => resolve(null), { once: true })
        }),
      ])

      const found = !!(result && result.events.length > 0)
      log.info("Provider attempt", { provider: providerName, trackingNumber, durationMs: Date.now() - t0, found })

      if (found) {
        if (providerName !== "seventeen_track") {
          log.debug("17track avoided", { trackingNumber, resolvedBy: providerName })
        }
        return result
      }
    } catch (err) {
      log.warn("Provider execution error", {
        provider: providerName,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}
