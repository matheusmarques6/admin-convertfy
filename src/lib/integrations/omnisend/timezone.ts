/**
 * Omnisend timezone helpers.
 *
 * Confirmado pelo suporte Omnisend (2026-05-18): `dateRange.from`/`to` sao
 * timestamps absolutos. O offset enviado e o que define o bucketing — ex:
 * `2026-04-01T00:00:00-03:00` cobre Apr 1 00:00 em America/Sao_Paulo. Pra
 * bater com o dashboard, precisamos enviar no fuso da brand.
 *
 * `to` e EXCLUSIVO — pra cobrir Apr 1..30 mandamos `to=2026-05-01T00:00:00-03:00`.
 */

const CURRENCY_TO_OFFSET: Record<string, string> = {
  BRL: "-03:00",  // America/Sao_Paulo
  USD: "-05:00",  // America/New_York (default; sem DST trataria como EST)
  EUR: "+01:00",  // Europe/Lisbon / CET
  GBP: "+00:00",  // Europe/London
  MXN: "-06:00",  // America/Mexico_City
  ARS: "-03:00",  // America/Buenos_Aires
  COP: "-05:00",  // America/Bogota
  CLP: "-04:00",  // America/Santiago
  CAD: "-05:00",  // America/Toronto
  AUD: "+10:00",  // Australia/Sydney
}

/** Offset ISO 8601 (ex: "-03:00") a partir da currency da loja. Fallback BRT. */
export function offsetForCurrency(currency: string | null | undefined): string {
  if (!currency) return "-03:00"
  return CURRENCY_TO_OFFSET[currency.toUpperCase()] ?? "-03:00"
}

/** Soma um dia a uma string YYYY-MM-DD (usa Date.UTC pra evitar TZ drift). */
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/**
 * Constroi `{ from, to }` no formato esperado pelo Omnisend Reports/Statistics API:
 *   - from: midnight local do startDateStr no offset
 *   - to:   midnight local do dia SEGUINTE ao endDateStr (exclusivo)
 *
 * Ex: `omnisendDateRange("2026-04-01", "2026-04-30", "-03:00")` →
 *   `{ from: "2026-04-01T00:00:00-03:00", to: "2026-05-01T00:00:00-03:00" }`
 */
export function omnisendDateRange(
  startDateStr: string,
  endDateStr: string,
  offset: string,
): { from: string; to: string } {
  const start = startDateStr.slice(0, 10)
  const endExclusive = addOneDay(endDateStr.slice(0, 10))
  return {
    from: `${start}T00:00:00${offset}`,
    to: `${endExclusive}T00:00:00${offset}`,
  }
}
