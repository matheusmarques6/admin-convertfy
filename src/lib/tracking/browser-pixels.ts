/**
 * Helpers client-only para pixels de browser (Meta fbq + Google gtag).
 *
 * No-op seguro no servidor. Usado pelo formulario publico pra disparar
 * PageView/Lead no navegador, deduplicado com a Conversions API server-side
 * via `eventID` (o mesmo event_id que o submit retorna).
 */

interface PixelWindow extends Window {
  fbq?: FbqStub
  _fbq?: FbqStub
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
}

interface FbqStub {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[]
  loaded: boolean
  version: string
  push: unknown
}

function getWin(): PixelWindow | null {
  return typeof window === "undefined" ? null : (window as PixelWindow)
}

let metaInitedId: string | null = null

/** Carrega o Meta Pixel (fbevents.js) e inicializa o pixel informado. */
export function loadMetaPixel(pixelId: string): void {
  const w = getWin()
  if (!w || !pixelId) return

  if (!w.fbq) {
    /* eslint-disable prefer-rest-params, prefer-spread */
    const stub = function (this: unknown) {
      // Snippet padrao do Meta: enfileira ate o fbevents.js carregar.
      if (stub.callMethod) {
        stub.callMethod.apply(stub, arguments as unknown as unknown[])
      } else {
        stub.queue.push(arguments)
      }
    } as FbqStub
    /* eslint-enable prefer-rest-params, prefer-spread */
    stub.queue = []
    stub.loaded = true
    stub.version = "2.0"
    stub.push = stub
    w.fbq = stub
    if (!w._fbq) w._fbq = stub

    const s = document.createElement("script")
    s.async = true
    s.src = "https://connect.facebook.net/en_US/fbevents.js"
    document.head.appendChild(s)
  }

  if (metaInitedId !== pixelId) {
    w.fbq("init", pixelId)
    metaInitedId = pixelId
  }
}

/**
 * Dispara um evento do Meta Pixel. `eventId` deduplica com o server-side.
 * `custom` usa trackCustom (para eventos custom como "Lead qualificado").
 */
export function fireMetaEvent(
  eventName: string,
  opts?: { eventId?: string | null; custom?: boolean; params?: Record<string, unknown> },
): void {
  const w = getWin()
  if (!w?.fbq) return
  const method = opts?.custom ? "trackCustom" : "track"
  const params = opts?.params ?? {}
  if (opts?.eventId) {
    w.fbq(method, eventName, params, { eventID: opts.eventId })
  } else {
    w.fbq(method, eventName, params)
  }
}

let gtagInitedId: string | null = null

/** Carrega o gtag.js e configura o ID (ex. AW-XXXXXXXX). */
export function loadGtag(measurementId: string): void {
  const w = getWin()
  if (!w || !measurementId) return

  if (!w.gtag) {
    const s = document.createElement("script")
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    document.head.appendChild(s)

    w.dataLayer = w.dataLayer || []
    /* eslint-disable prefer-rest-params */
    const gtag = function () {
      ;(w.dataLayer as unknown[]).push(arguments)
    }
    /* eslint-enable prefer-rest-params */
    w.gtag = gtag as (...args: unknown[]) => void
    w.gtag("js", new Date())
  }

  if (gtagInitedId !== measurementId) {
    w.gtag("config", measurementId)
    gtagInitedId = measurementId
  }
}

/** Dispara uma conversao do Google Ads via gtag. `sendTo` = "AW-XXXX/label". */
export function fireGtagConversion(sendTo: string): void {
  const w = getWin()
  if (!w?.gtag || !sendTo) return
  w.gtag("event", "conversion", { send_to: sendTo })
}

/** Le um cookie pelo nome (client-only). */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"))
  return match ? decodeURIComponent(match[1]) : null
}

/** Grava um cookie (best-effort). Falha silenciosa: o valor ainda vai no submit. */
function setCookie(name: string, value: string, days = 90): void {
  if (typeof document === "undefined") return
  try {
    const maxAge = days * 24 * 60 * 60
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
  } catch {
    /* contexto sem cookie — ok, o valor ainda é enviado no POST */
  }
}

/**
 * Deriva o _fbc a partir do fbclid quando o cookie ainda nao existe.
 * Formato do Meta: fb.1.<timestamp_ms>.<fbclid>.
 */
export function deriveFbc(fbclid: string | null | undefined): string | null {
  if (!fbclid) return null
  return `fb.1.${Date.now()}.${fbclid}`
}

/**
 * Garante um `_fbp`. O cookie normalmente é setado pelo fbevents.js; quando
 * ele é bloqueado (ad-blocker) o cookie nunca existe e o Meta reclama que o
 * fbp não é enviado. Aqui geramos no formato do Meta (`fb.1.<ts>.<rand>`),
 * persistimos e retornamos — melhora a correspondência (~+16%).
 */
export function ensureFbp(): string {
  const existing = getCookie("_fbp")
  if (existing) return existing
  const fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`
  setCookie("_fbp", fbp)
  return fbp
}

/**
 * Garante um `_fbc`. Usa o cookie se existir; senão deriva do `fbclid` e
 * persiste (sobrevive à navegação). Retorna null quando não há fbclid nem
 * cookie (tráfego orgânico/direto — fbc legitimamente ausente).
 */
export function ensureFbc(fbclid: string | null | undefined): string | null {
  const existing = getCookie("_fbc")
  if (existing) return existing
  const derived = deriveFbc(fbclid)
  if (derived) setCookie("_fbc", derived)
  return derived
}
