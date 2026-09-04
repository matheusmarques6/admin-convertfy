/**
 * Classificação de cobranças (puro, client-safe).
 *
 * Uma cobrança tem TIPO (mensalidade/assinatura, comissão ou avulsa),
 * pode se referir a um ou mais MESES (comissão de julho vence em
 * agosto) e pertence a uma LOJA. Até a migration 20261113 tudo isso
 * vivia em texto livre na descrição — este módulo é o parser dessa
 * convenção (para sugerir a classificação a partir do que o time já
 * escreve) e o gerador da descrição padrão no caminho inverso.
 *
 * Formato canônico do mês: "YYYY-MM" (o mesmo das calls de
 * alinhamento — `call-coverage.ts`).
 */

import { MONTH_LABELS, isMonthKey, monthRange, type MonthKey } from "./call-coverage"

export type ChargeType = "subscription" | "commission" | "other"

export const CHARGE_TYPES: ChargeType[] = ["subscription", "commission", "other"]

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  subscription: "Assinatura",
  commission: "Comissão",
  other: "Avulsa",
}

export function isChargeType(v: unknown): v is ChargeType {
  return typeof v === "string" && (CHARGE_TYPES as string[]).includes(v)
}

const MONTH_NAMES: Array<{ re: RegExp; month: number }> = [
  { re: /\bjaneiro\b/, month: 1 },
  { re: /\bfevereiro\b/, month: 2 },
  { re: /\bmar[cç]o\b/, month: 3 },
  { re: /\babril\b/, month: 4 },
  { re: /\bmaio\b/, month: 5 },
  { re: /\bjunho\b/, month: 6 },
  { re: /\bjulho\b/, month: 7 },
  { re: /\bagosto\b/, month: 8 },
  { re: /\bsetembro\b/, month: 9 },
  { re: /\boutubro\b/, month: 10 },
  { re: /\bnovembro\b/, month: 11 },
  { re: /\bdezembro\b/, month: 12 },
]

// Abreviações só valem quando nenhum nome completo apareceu — e as
// que são palavra comum ("mar", "set", "out") ficam de fora: "set" em
// "setup" e "out" em inglês dariam mês fantasma.
const MONTH_ABBR: Array<{ re: RegExp; month: number }> = [
  { re: /\bjan\b/, month: 1 },
  { re: /\bfev\b/, month: 2 },
  { re: /\babr\b/, month: 4 },
  { re: /\bmai\b/, month: 5 },
  { re: /\bjun\b/, month: 6 },
  { re: /\bjul\b/, month: 7 },
  { re: /\bago\b/, month: 8 },
  { re: /\bnov\b/, month: 11 },
  { re: /\bdez\b/, month: 12 },
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // "Julho/Agosto" → "julho agosto"; "abril-junho" idem
    .replace(/[/\-–—]/g, " ")
}

/**
 * Tipo pela descrição, na convenção do time: qualquer menção a
 * "comissão" é comissão; "mensalidade"/"assinatura"/"plano" é
 * assinatura; cobrança ligada a uma assinatura é assinatura mesmo sem
 * dizer. O resto é avulsa.
 */
export function inferChargeType(
  description: string | null | undefined,
  opts: { hasSubscription?: boolean } = {},
): ChargeType {
  const d = normalize(description ?? "")
  if (/comiss/.test(d)) return "commission"
  if (opts.hasSubscription) return "subscription"
  if (/mensalidade|assinatura|\bplano\b/.test(d)) return "subscription"
  return "other"
}

function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`
}

/**
 * Meses citados na descrição, resolvidos para YYYY-MM.
 *
 * Ano: o do vencimento, recuando um ano quando o mês citado é
 * POSTERIOR ao do vencimento (comissão de dezembro vence em janeiro).
 * Ano explícito ("julho de 2026", "07/2026") vence a inferência.
 * Intervalos "abril a junho" / "abril até junho" são expandidos.
 * Sem mês citado → [] (quem chama decide o que assumir).
 */
export function inferReferenceMonths(
  description: string | null | undefined,
  dueDate: string | Date,
): MonthKey[] {
  const raw = description ?? ""
  if (!raw.trim()) return []
  const due = typeof dueDate === "string" ? new Date(`${dueDate.slice(0, 10)}T12:00:00`) : dueDate
  if (Number.isNaN(due.getTime())) return []
  const dueYear = due.getFullYear()
  const dueMonth = due.getMonth() + 1

  const d = normalize(raw)
  const explicitYear = /\b(20\d{2})\b/.exec(d)?.[1]
  const yearFor = (m: number) =>
    explicitYear ? Number(explicitYear) : m > dueMonth ? dueYear - 1 : dueYear

  // Posição de cada menção (pra reconhecer "X a Y").
  const hits: Array<{ index: number; month: number }> = []
  for (const { re, month } of MONTH_NAMES) {
    const m = re.exec(d)
    if (m) hits.push({ index: m.index, month })
  }
  if (hits.length === 0) {
    for (const { re, month } of MONTH_ABBR) {
      const m = re.exec(d)
      if (m) hits.push({ index: m.index, month })
    }
  }
  // "07/2026" / "2026-07" numéricos
  for (const m of d.matchAll(/\b(0[1-9]|1[0-2])\s+(20\d{2})\b/g)) {
    hits.push({ index: m.index ?? 0, month: Number(m[1]) })
  }
  if (hits.length === 0) return []

  hits.sort((a, b) => a.index - b.index)
  const out = new Set<MonthKey>()
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]
    const next = hits[i + 1]
    const between = next ? d.slice(h.index, next.index).replace(/\s+/g, " ").trim() : ""
    // "abril a junho" / "abril até junho" — o que fica entre as duas
    // menções termina em " a" / " ate" (acento já removido).
    if (next && /\s(a|ate)$/.test(between)) {
      const from = monthKey(yearFor(h.month), h.month)
      let to = monthKey(yearFor(next.month), next.month)
      if (to < from) to = monthKey(yearFor(next.month) + 1, next.month)
      for (const k of monthRange(from, to)) out.add(k)
      i++ // o "to" já entrou
      continue
    }
    out.add(monthKey(yearFor(h.month), h.month))
  }
  return [...out].filter(isMonthKey).sort()
}

/** "2026-07" → "jul/26"; consecutivos viram "abr–jun/26"; soltos "abr, jun/26". */
export function monthsLabel(months: string[] | null | undefined): string {
  const keys = [...new Set((months ?? []).filter(isMonthKey))].sort()
  if (keys.length === 0) return ""
  const short = (k: MonthKey) => MONTH_LABELS[Number(k.slice(5, 7)) - 1]
  const yy = (k: MonthKey) => k.slice(2, 4)
  if (keys.length === 1) return `${short(keys[0])}/${yy(keys[0])}`
  const first = keys[0]
  const last = keys[keys.length - 1]
  const consecutive = monthRange(first, last).length === keys.length
  if (consecutive && yy(first) === yy(last)) return `${short(first)}–${short(last)}/${yy(last)}`
  if (consecutive) return `${short(first)}/${yy(first)}–${short(last)}/${yy(last)}`
  // Soltos no mesmo ano: "abr, jun/26"; anos diferentes: cada um com ano.
  if (keys.every((k) => yy(k) === yy(first))) {
    return `${keys.map(short).join(", ")}/${yy(first)}`
  }
  return keys.map((k) => `${short(k)}/${yy(k)}`).join(", ")
}

/**
 * Descrição padrão da cobrança quando o usuário não escreve uma —
 * a mesma convenção que o parser lê de volta.
 */
export function describeCharge(input: {
  type: ChargeType
  months?: string[] | null
  storeName?: string | null
  clientName?: string | null
}): string {
  const months = monthsLabel(input.months)
  const who = input.storeName?.trim() || input.clientName?.trim() || ""
  const suffix = who ? ` — ${who}` : ""
  if (input.type === "commission") {
    return `Comissão${months ? ` de ${months}` : ""}${suffix}`
  }
  if (input.type === "subscription") {
    return `Mensalidade${months ? ` ${months}` : ""}${suffix}`
  }
  return `Fatura${suffix}`
}
