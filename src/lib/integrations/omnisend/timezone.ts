/**
 * Omnisend timezone helpers.
 *
 * Confirmado pelo suporte Omnisend (2026-05-18): `dateRange.from`/`to` sao
 * timestamps absolutos. O offset enviado e o que define o bucketing — ex:
 * `2026-04-01T00:00:00-03:00` cobre Apr 1 00:00 em America/Sao_Paulo. Pra
 * bater com o dashboard, precisamos enviar no fuso da brand.
 *
 * `to` e EXCLUSIVO — pra cobrir Apr 1..30 mandamos `to=2026-05-01T00:00:00-03:00`.
 *
 * ── O que mudou em 08/09/2026 ────────────────────────────────────────
 *
 * O offset era derivado da MOEDA (`offsetForCurrency`, um mapa
 * `BRL: "-03:00", EUR: "+01:00"…`). Três erros empilhados:
 *
 *  1. a moeda da loja estava errada em boa parte da base (default 'BRL'
 *     nunca sobrescrito), então o offset saía errado junto;
 *  2. EUR virava "+01:00" para a Europa inteira — Berlim e Lisboa não são
 *     o mesmo fuso;
 *  3. offsets FIXOS, sem horário de verão: em setembro Berlim está em
 *     +02:00 e Nova York em -04:00, e o corte da meia-noite saía uma hora
 *     deslocado — receita caindo no dia errado.
 *
 * Agora o offset vem do IANA da loja (`client_stores.timezone`, lido de
 * `GET /v5/brands/current`) e DA DATA, pelo próprio ICU do runtime. Sem
 * fuso conhecido a função mantém o comportamento antigo e QUEM CHAMA
 * informa que assumiu — não existe fuso "provavelmente certo".
 */

/** Fuso assumido quando a loja não tem `timezone` cadastrado. */
export const FUSO_PADRAO = "America/Sao_Paulo"

/**
 * Offset ISO 8601 real (`-03:00`, `+02:00`) do fuso NAQUELA data.
 *
 * PURA (depende só do ICU do runtime). Usa `timeZoneName: "longOffset"`,
 * que devolve "GMT-03:00"/"GMT+02:00" já com horário de verão resolvido
 * para a data — que é exatamente o que um mapa fixo não consegue fazer.
 *
 * Fuso inválido não lança: cai no padrão. Esta função roda dentro da
 * montagem do relatório, e derrubar o relatório inteiro porque uma loja
 * tem um IANA digitado errado seria pior que um offset aproximado.
 */
export function offsetForTimezone(timezone: string | null | undefined, when: Date | string): string {
  const tz = (timezone ?? "").trim() || FUSO_PADRAO
  const data = typeof when === "string" ? new Date(`${when.slice(0, 10)}T12:00:00Z`) : when
  if (Number.isNaN(data.getTime())) return offsetForTimezone(tz, new Date())
  try {
    const parte = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(data)
      .find((p) => p.type === "timeZoneName")?.value
    if (!parte) return "+00:00"
    // "GMT-03:00" → "-03:00"; "GMT" (UTC) → "+00:00"; "GMT+2" → "+02:00".
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(parte)
    if (!m) return "+00:00"
    const sinal = m[1]
    const horas = m[2].padStart(2, "0")
    const minutos = (m[3] ?? "00").padStart(2, "0")
    return `${sinal}${horas}:${minutos}`
  } catch {
    // IANA inválido — `Intl` lança RangeError.
    return tz === FUSO_PADRAO ? "-03:00" : offsetForTimezone(FUSO_PADRAO, data)
  }
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
 * O offset é resolvido POR PONTA: uma janela que atravessa a virada do
 * horário de verão tem offsets diferentes no início e no fim, e usar um
 * só faria a janela ganhar ou perder uma hora bem na fronteira do mês.
 */
export function omnisendDateRange(
  startDateStr: string,
  endDateStr: string,
  offsetOuFuso: string,
): { from: string; to: string } {
  const start = startDateStr.slice(0, 10)
  const endExclusive = addOneDay(endDateStr.slice(0, 10))
  // Aceita tanto um offset pronto ("-03:00", compatível com quem já
  // chamava assim) quanto um IANA ("Europe/Berlin").
  const ehOffset = /^[+-]\d{2}:\d{2}$/.test(offsetOuFuso)
  const offInicio = ehOffset ? offsetOuFuso : offsetForTimezone(offsetOuFuso, start)
  const offFim = ehOffset ? offsetOuFuso : offsetForTimezone(offsetOuFuso, endExclusive)
  return {
    from: `${start}T00:00:00${offInicio}`,
    to: `${endExclusive}T00:00:00${offFim}`,
  }
}

/**
 * O runtime reconhece este IANA?
 *
 * PURA. Usada antes de GRAVAR um fuso vindo da plataforma: guardar
 * "Europe/Berlim" no banco não quebra nada na hora, mas transforma todo
 * relatório daquela loja num offset assumido em silêncio.
 */
export function ehFusoValido(timezone: string | null | undefined): boolean {
  const tz = (timezone ?? "").trim()
  if (!tz) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Fuso a usar e se ele é conhecido. Quem monta o relatório precisa das
 * duas coisas: o valor para calcular e o fato de estar assumindo, para
 * poder DIZER isso em vez de apresentar um recorte como se fosse certo.
 */
export function fusoDaLoja(timezone: string | null | undefined): { tz: string; assumido: boolean } {
  const tz = (timezone ?? "").trim()
  return tz ? { tz, assumido: false } : { tz: FUSO_PADRAO, assumido: true }
}
