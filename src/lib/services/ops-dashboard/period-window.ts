/**
 * Janela de datas do Dashboard Operacional.
 *
 * O contrato das rotas é `?period=&start=&end=`: presets viram janelas
 * relativas a hoje; `custom` EXIGE start/end (sem eles cai no default de
 * 30d — mesmo comportamento defensivo do normalizePeriodLabel). A janela
 * "anterior" tem o MESMO comprimento e termina no dia imediatamente
 * antes do início da atual — é a base do "vs período anterior" real
 * (que o dashboard antigo prometia e nunca calculava).
 */

export interface DateWindow {
  /** YYYY-MM-DD inclusivo */
  from: string
  /** YYYY-MM-DD inclusivo */
  to: string
  days: number
}

const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

const DAY_MS = 86_400_000

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function resolveWindow(
  period: string | null | undefined,
  start?: string | null,
  end?: string | null,
  now: Date = new Date(),
): DateWindow {
  const p = (period || "30d").toLowerCase()

  if (p === "custom" && start && end) {
    const s = parseISODate(start)
    const e = parseISODate(end)
    if (s && e && s.getTime() <= e.getTime()) {
      const days = Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1
      return { from: toISODate(s), to: toISODate(e), days }
    }
  }

  const alias: Record<string, string> = { today: "1d", yesterday: "1d", "1y": "12m" }
  const days = PERIOD_DAYS[alias[p] || p] ?? 30
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to.getTime() - (days - 1) * DAY_MS)
  return { from: toISODate(from), to: toISODate(to), days }
}

/** Janela imediatamente anterior, com o mesmo comprimento. */
export function previousWindow(win: DateWindow): DateWindow {
  const from = parseISODate(win.from)!
  const prevTo = new Date(from.getTime() - DAY_MS)
  const prevFrom = new Date(prevTo.getTime() - (win.days - 1) * DAY_MS)
  return { from: toISODate(prevFrom), to: toISODate(prevTo), days: win.days }
}

/**
 * Delta percentual atual vs anterior. null quando não dá pra comparar
 * (base zero/ausente) — o front mostra "—" em vez de um +100% mentiroso.
 */
export function computeDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}
