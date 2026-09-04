/**
 * De qual LOJA é esta reunião? (puro, testável)
 *
 * O webhook do Fathom não sabe nada do nosso cadastro — ele entrega
 * participantes e título. Duas evidências resolvem quase tudo:
 *
 *  1. DOMÍNIO do convidado externo × domínio da loja (store_url).
 *     É a mais forte: quem entra na call pelo email @lojax.com é da
 *     Loja X. Domínios de email genéricos (gmail, hotmail…) são
 *     ignorados — casariam com qualquer coisa.
 *  2. NOME da loja no título da reunião ("Alinhamento — Loja X").
 *     Só vale para nome com 4+ caracteres, para "Vip" não casar com
 *     meia carteira.
 *
 * Empate (duas lojas com a mesma evidência) devolve `null`: chutar a
 * loja errada grava a call no cliente errado, o que é pior do que
 * pedir para o operador colar o link na loja certa.
 */

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "proton.me",
  "protonmail.com",
])

export interface StoreForMatch {
  id: string
  store_name: string
  store_url: string | null
}

export interface MeetingForMatch {
  title: string | null
  participants: Array<{ email: string | null; is_external: boolean }>
}

export type MatchReason = "domain" | "title"

export interface StoreMatch {
  store_id: string
  reason: MatchReason
  evidence: string
}

/** Domínio "nu" de uma URL ou email (sem www, minúsculo). */
export function baseDomain(value: string | null | undefined): string | null {
  if (!value) return null
  let host = value.trim().toLowerCase()
  if (!host) return null
  if (host.includes("@")) host = host.slice(host.lastIndexOf("@") + 1)
  host = host.replace(/^https?:\/\//, "").replace(/^www\./, "")
  host = host.split("/")[0].split("?")[0].split(":")[0]
  return host || null
}

function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function matchStoreForMeeting(
  meeting: MeetingForMatch,
  stores: StoreForMatch[],
): StoreMatch | null {
  // ── 1. Domínio do convidado externo ──────────────────────────────
  const externalDomains = new Set(
    meeting.participants
      .filter((p) => p.is_external)
      .map((p) => baseDomain(p.email))
      .filter((d): d is string => d !== null && !GENERIC_EMAIL_DOMAINS.has(d)),
  )
  if (externalDomains.size > 0) {
    const hits = stores.filter((s) => {
      const storeDomain = baseDomain(s.store_url)
      return storeDomain !== null && externalDomains.has(storeDomain)
    })
    if (hits.length === 1) {
      return {
        store_id: hits[0].id,
        reason: "domain",
        evidence: baseDomain(hits[0].store_url) ?? "",
      }
    }
    if (hits.length > 1) return null // ambíguo — não chuta
  }

  // ── 2. Nome da loja no título ────────────────────────────────────
  const title = normalizeName(meeting.title ?? "")
  if (title) {
    const hits = stores.filter((s) => {
      const name = normalizeName(s.store_name)
      return name.length >= 4 && title.includes(name)
    })
    if (hits.length === 1) {
      return { store_id: hits[0].id, reason: "title", evidence: hits[0].store_name }
    }
    // Empate: o nome mais longo vence só se for estritamente maior
    if (hits.length > 1) {
      const sorted = [...hits].sort(
        (a, b) => normalizeName(b.store_name).length - normalizeName(a.store_name).length,
      )
      const [first, second] = sorted
      if (
        normalizeName(first.store_name).length >
        normalizeName(second.store_name).length
      ) {
        return { store_id: first.id, reason: "title", evidence: first.store_name }
      }
      return null
    }
  }

  return null
}
