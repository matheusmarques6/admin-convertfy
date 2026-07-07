/**
 * Orçamento distribuído de exports do Figma (Tier 1: GET /v1/images/:key
 * = 10 requests/min por token). Limite interno: 8/min com espaçamento de
 * ~7,5s entre chamadas — folga para o retry de 429 do client e para uso
 * manual do mesmo token.
 *
 * Guarda dupla no Upstash Redis (mesmos envs de src/lib/rate-limit.ts):
 * 1. GATE de espaçamento: `SET figma:images:gate NX PX 7500` — quem
 *    consegue tem exclusividade global por 7,5s. Isso SOZINHO garante
 *    ≤8 requests em QUALQUER janela deslizante de 60s, imune a burst de
 *    fronteira de janela e a runners concorrentes (ticks de cron
 *    sobrepostos, kicks fire-and-forget).
 * 2. CONTADOR por minuto (cinto e suspensório): INCR figma:images:{min}
 *    — se passar do orçamento (bug de clock/gate), dorme até a próxima
 *    janela.
 *
 * Fail-open quando Redis não está configurado (dev) ou está fora do ar —
 * mesma política de rate-limit.ts; nesse caso resta o pacing in-process
 * (suficiente num único dev server).
 */

import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaExportBudget")

export const FIGMA_EXPORT_BUDGET_PER_MIN = Number(
  process.env.FIGMA_EXPORT_BUDGET_PER_MIN ?? 8,
)
export const FIGMA_EXPORT_MIN_SPACING_MS = Number(
  process.env.FIGMA_EXPORT_MIN_SPACING_MS ?? 7_500,
)

// 75s de espera máxima: cobre o pior caso de janela cheia (60s) + folga —
// quem chega com a janela esgotada ainda pega slot na janela seguinte.
const DEFAULT_MAX_WAIT_MS = 75_000

const GATE_KEY = "figma:images:gate"
const WINDOW_PREFIX = "figma:images:win"

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

let warnedNoRedis = false

// Pacing in-process (fallback dev / Redis fora do ar): último slot concedido
// NESTA instância. Não protege multi-instância — é só pra não metralhar em dev.
let lastLocalSlotAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function jitterMs(): number {
  return 200 + Math.floor(Math.random() * 300) // 200–500ms
}

export interface AcquireResult {
  ok: boolean
  waitedMs: number
}

async function acquireLocalSlot(t0: number, maxWaitMs: number): Promise<AcquireResult> {
  const since = Date.now() - lastLocalSlotAt
  if (since < FIGMA_EXPORT_MIN_SPACING_MS) {
    const wait = FIGMA_EXPORT_MIN_SPACING_MS - since
    if (Date.now() + wait - t0 > maxWaitMs) return { ok: false, waitedMs: Date.now() - t0 }
    await sleep(wait)
  }
  lastLocalSlotAt = Date.now()
  return { ok: true, waitedMs: Date.now() - t0 }
}

/**
 * Bloqueia até conseguir um slot de export (/v1/images) ou estourar
 * `maxWaitMs`. Cada request HTTP ao /v1/images deve adquirir 1 slot ANTES
 * de sair — chamado pelo figmaFetch (client.ts), não chame direto.
 */
export async function acquireExportSlot(
  opts: { maxWaitMs?: number } = {},
): Promise<AcquireResult> {
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const t0 = Date.now()

  if (!redis) {
    if (!warnedNoRedis) {
      warnedNoRedis = true
      if (process.env.NODE_ENV === "production") {
        log.warn("redis_not_configured", {
          note: "orçamento de exports do Figma sem coordenação distribuída (fail-open)",
        })
      } else {
        log.info("redis_not_configured_dev", { note: "pacing in-process apenas" })
      }
    }
    return acquireLocalSlot(t0, maxWaitMs)
  }

  try {
    while (Date.now() - t0 <= maxWaitMs) {
      // 1. Gate de espaçamento: exclusividade global por 7,5s.
      const gate = await redis.set(GATE_KEY, "1", {
        nx: true,
        px: FIGMA_EXPORT_MIN_SPACING_MS,
      })
      if (gate === null) {
        const pttl = await redis.pttl(GATE_KEY)
        const wait = (pttl > 0 ? pttl : FIGMA_EXPORT_MIN_SPACING_MS) + jitterMs()
        await sleep(Math.min(wait, Math.max(0, maxWaitMs - (Date.now() - t0)) + 1))
        continue
      }

      // 2. Contador da janela do minuto (backstop): se o gate deixou passar
      // mais que o orçamento (clock skew, tuning agressivo), dorme até a
      // janela seguinte. O incremento "desperdiçado" fica na janela atual —
      // conservador (nunca libera a mais).
      const minute = Math.floor(Date.now() / 60_000)
      const windowKey = `${WINDOW_PREFIX}:${minute}`
      const count = await redis.incr(windowKey)
      if (count === 1) await redis.expire(windowKey, 90)
      if (count > FIGMA_EXPORT_BUDGET_PER_MIN) {
        const untilNextMinute = (minute + 1) * 60_000 - Date.now()
        log.warn("window_budget_exceeded", { count, minute })
        await sleep(untilNextMinute + jitterMs())
        continue
      }

      lastLocalSlotAt = Date.now()
      return { ok: true, waitedMs: Date.now() - t0 }
    }
    return { ok: false, waitedMs: Date.now() - t0 }
  } catch (err) {
    // Redis fora do ar: fail-open com pacing local — melhor exportar com
    // risco de 429 (o client trata) do que travar o import inteiro.
    log.warn("redis_error_fail_open", {
      error: err instanceof Error ? err.message : String(err),
    })
    return acquireLocalSlot(t0, maxWaitMs)
  }
}
