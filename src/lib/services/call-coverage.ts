/**
 * Cobertura mensal das calls de alinhamento (puro, client-safe).
 *
 * Uma call de alinhamento fala de um período — normalmente o mês
 * anterior ("alinhamento de setembro" analisa agosto), às vezes de
 * dois quando um mês foi pulado. Guardar ESSE mês (e não só a data em
 * que a call aconteceu) é o que permite responder a pergunta que
 * importa: "ficou algum mês sem alinhamento/relatório?".
 *
 * Formato canônico do mês: "YYYY-MM" — ordenável como string, sem
 * ambiguidade de fuso (o mês não tem hora).
 */

export type MonthKey = string // "2026-08"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === "string" && MONTH_RE.test(v)
}

/** "2026-08" → "ago/26" (rótulo curto do padrão da casa). */
export function monthLabel(month: MonthKey): string {
  if (!isMonthKey(month)) return month
  const [y, m] = month.split("-")
  return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`
}

/**
 * Mês de um TIMESTAMP, no fuso de São Paulo (a casa opera em BRT):
 * call às 21h de 31/08 chega como 01/09T00:00Z e é de AGOSTO.
 */
export function monthOf(iso: string, tzOffsetHours = -3): MonthKey | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t + tzOffsetHours * 3_600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Mês de uma DATA de calendário (contract_start_date é DATE, sem
 * hora): lê o prefixo YYYY-MM literal. Converter fuso aqui jogaria
 * "2026-08-01" para julho e faria a janela começar um mês antes do
 * contrato — atraso fantasma no primeiro mês de todo cliente.
 */
export function monthOfDay(value: string): MonthKey | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(value.trim())
  return m ? `${m[1]}-${m[2]}` : null
}

/** Mês anterior a `month` ("2026-01" → "2025-12"). */
export function previousMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split("-").map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`
}

/** Sequência inclusiva de meses entre dois extremos (vazia se invertida). */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  if (!isMonthKey(from) || !isMonthKey(to) || from > to) return []
  const out: MonthKey[] = []
  let [y, m] = from.split("-").map(Number)
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    out.push(key)
    if (key === to) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * Opções do seletor "esta call foi referente a que mês?": o mês em que
 * a call aconteceu e os anteriores, mais recente primeiro. Inclui o mês
 * corrente de propósito — call de fechamento no fim do mês existe.
 */
export function monthOptionsFor(reference: string | Date, count = 6): MonthKey[] {
  const iso = typeof reference === "string" ? reference : reference.toISOString()
  const start = monthOf(iso) ?? monthOf(new Date().toISOString())
  if (!start) return []
  const out: MonthKey[] = [start]
  for (let i = 1; i < count; i++) out.push(previousMonth(out[out.length - 1]))
  return out
}

/** Pré-seleção do seletor: a convenção da casa — o mês ANTERIOR à call. */
export function defaultReferenceMonths(reference: string | Date): MonthKey[] {
  const iso = typeof reference === "string" ? reference : reference.toISOString()
  const m = monthOf(iso)
  return m ? [previousMonth(m)] : []
}

export interface CallForCoverage {
  conducted_at: string
  /** Meses que a call cobriu; vazio = deduz do mês anterior à call. */
  reference_months?: string[] | null
}

export interface CoverageResult {
  /** Meses com alinhamento registrado, mais novo primeiro. */
  covered: MonthKey[]
  /** Meses da janela SEM alinhamento — o que está em atraso. */
  missing: MonthKey[]
  /** Janela avaliada (do início do contrato ao mês passado). */
  window: { from: MonthKey; to: MonthKey } | null
}

/**
 * Meses cobertos por uma call. Sem `reference_months` explícito, a
 * convenção é: a call fala do mês ANTERIOR ao que ela aconteceu — é
 * como o time trabalha, e é o palpite que não inventa cobertura do mês
 * corrente (que ainda nem fechou).
 */
export function monthsCoveredByCall(call: CallForCoverage): MonthKey[] {
  const explicit = (call.reference_months ?? []).filter(isMonthKey)
  if (explicit.length > 0) return [...new Set(explicit)].sort()
  const m = monthOf(call.conducted_at)
  return m ? [previousMonth(m)] : []
}

/**
 * Cobertura da loja: quais meses tiveram alinhamento e quais faltam.
 *
 * A janela vai do mês de INÍCIO DO CONTRATO (ou dos últimos
 * `maxMonths` meses, o que for mais recente) até o MÊS PASSADO — o mês
 * corrente não conta como atraso porque ainda está acontecendo.
 */
export function computeCallCoverage(input: {
  calls: CallForCoverage[]
  contractStart?: string | null
  now?: Date
  maxMonths?: number
}): CoverageResult {
  const now = input.now ?? new Date()
  const maxMonths = input.maxMonths ?? 12
  const currentMonth = monthOf(now.toISOString())
  if (!currentMonth) return { covered: [], missing: [], window: null }

  // Até o mês PASSADO (o corrente ainda não fechou, não é atraso).
  const to = previousMonth(currentMonth)
  // Recua no máximo `maxMonths` meses...
  let from = to
  for (let i = 1; i < maxMonths; i++) from = previousMonth(from)
  // ...mas nunca antes do início do contrato.
  const contractMonth = input.contractStart ? monthOfDay(input.contractStart) : null
  if (contractMonth && contractMonth > from) from = contractMonth

  const covered = new Set<MonthKey>()
  for (const call of input.calls) {
    for (const m of monthsCoveredByCall(call)) covered.add(m)
  }

  const window = from <= to ? { from, to } : null
  const missing = window
    ? monthRange(from, to).filter((m) => !covered.has(m))
    : []

  return {
    covered: [...covered].sort().reverse(),
    missing: missing.sort().reverse(),
    window,
  }
}
