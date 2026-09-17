/**
 * Régua de CLAIMS de oferta — o que a copy e o HTML final não podem
 * afirmar quando a decisão do e-mail diz que não há incentivo, e o que não
 * podem trocar quando há (percentual e código diferentes do decidido).
 *
 * Quatro idiomas da carteira (pt, en, pl, da). As regexes casam a OFERTA
 * com a sua âncora na mesma janela ("10% off", "kod rabatowy", "spar 20%")
 * — "10%" solto é atributo ("10% mais leve") e passa; "10% de desconto" é
 * oferta. Errar para o lado de acusar atributo ensina o operador a ignorar
 * o aviso; errar para o lado de deixar passar oferta é o batch 6249aef2.
 *
 * Puro. Usado por `copy.ts` (campos do n8n), `html-final.ts` (texto
 * visível por bloco) e pelo subject (Passo 10).
 */

export type TipoDeClaim = "percentual" | "cupom" | "codigo" | "oferta" | "frete_gratis" | "urgencia"

export interface Claim {
  tipo: TipoDeClaim
  trecho: string
  /** Percentual numérico quando `tipo === "percentual"`. */
  percentual?: number
  /** Código promocional literal quando `tipo === "codigo"`. */
  codigo?: string
}

// ── Padrões por família (os 4 idiomas juntos; a âncora decide) ─────────

const PERCENTUAL_RE =
  /\b(\d{1,3})\s?%\s?(?:off|de desconto|desconto|discount|taniej|zniżki|zniżka|rabat|rabatu|i rabat)\b|\b(?:save|spar|economize|poupe|zaoszczędź|oszczędź)\s+(?:up to\s+|até\s+|do\s+|op til\s+)?(\d{1,3})\s?%/i
const CUPOM_RE =
  /\b(?:cupom|coupon|kupon|rabatkode|kod rabatowy|kod zniżkowy|promo code|discount code|c[oó]digo (?:de desconto|promocional))\b/i
/** Código literal: "use code WELCOME10", "kod: LATO20", "código BEMVINDO10". */
const CODIGO_RE =
  /\b(?:use (?:the )?code|with code|code|c[oó]digo|cupom|coupon|kod|rabatkode|koden)\s*[:\-]?\s*([A-Z][A-Z0-9_-]{2,}\d[A-Z0-9_-]*|[A-Z0-9]{4,}(?=\b))\b/g
const OFERTA_RE =
  /\b(?:oferta especial|special offer|promo[cç][aã]o|promocja|tilbud|desconto exclusivo|exclusive discount|limited[- ]time offer|oferta (?:por tempo )?limitada|zniżka|rabat)\b/i
const FRETE_RE =
  /\b(?:frete gr[aá]tis|free shipping|darmowa (?:dostawa|wysyłka)|gratis fragt|fri fragt)\b/i
const URGENCIA_RE =
  /\b(?:offer ends(?: soon)?|ends (?:tonight|today|soon)|last chance|only today|hurry|termina (?:hoje|em breve)|acaba (?:hoje|logo)|[uú]ltima chance|s[oó] hoje|corra|ostatnia szansa|tylko dzi[sś]|kończy się|sidste chance|kun i dag|skynd dig)\b/i

/** Parte de uma lista `proibido` que nomeia urgência (pt/en). */
const PROIBE_URGENCIA_RE = /urg[eê]nc|countdown|ends soon|prazo artificial|last chance/i

export function detectarClaims(texto: string): Claim[] {
  const t = texto ?? ""
  if (!t.trim()) return []
  const out: Claim[] = []
  for (const m of t.matchAll(new RegExp(PERCENTUAL_RE.source, "gi"))) {
    const n = Number(m[1] ?? m[2])
    if (Number.isFinite(n) && n > 0 && n <= 100) out.push({ tipo: "percentual", trecho: m[0], percentual: n })
  }
  for (const m of t.matchAll(new RegExp(CODIGO_RE.source, "g"))) {
    out.push({ tipo: "codigo", trecho: m[0], codigo: m[1].toUpperCase() })
  }
  if (CUPOM_RE.test(t)) out.push({ tipo: "cupom", trecho: t.match(CUPOM_RE)![0] })
  if (OFERTA_RE.test(t)) out.push({ tipo: "oferta", trecho: t.match(OFERTA_RE)![0] })
  if (FRETE_RE.test(t)) out.push({ tipo: "frete_gratis", trecho: t.match(FRETE_RE)![0] })
  if (URGENCIA_RE.test(t)) out.push({ tipo: "urgencia", trecho: t.match(URGENCIA_RE)![0] })
  return out
}

export interface IncentivoParaClaims {
  existe: boolean
  codigo: string | null
  valor: string | null
}

export interface ViolacaoDeClaim {
  tipo:
    | "oferta_sem_incentivo"
    | "percentual_diverge"
    | "codigo_diverge"
    | "urgencia_artificial"
  severidade: "high" | "medium"
  trecho: string
  esperado: string
}

/** O percentual cadastrado em `incentivo.valor` ("10%", "10 % off"), se houver. */
export function percentualDoValor(valor: string | null | undefined): number | null {
  const m = (valor ?? "").match(/(\d{1,3})\s?%/)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Avalia um TEXTO contra a decisão de incentivo e a lista de proibições.
 * `frete_gratis` fica fora do "sem incentivo": frete grátis é política de
 * envio, não cupom — só entra quando a lista `proibido` o nomeia (e aí é
 * responsabilidade do Seletor, não desta régua).
 */
export function avaliarClaims(
  texto: string,
  incentivo: IncentivoParaClaims,
  proibido: readonly string[] = [],
): ViolacaoDeClaim[] {
  const claims = detectarClaims(texto)
  if (claims.length === 0) return []
  const out: ViolacaoDeClaim[] = []
  const proibeUrgencia = proibido.some((p) => PROIBE_URGENCIA_RE.test(p))
  const esperadoPct = percentualDoValor(incentivo.valor)
  const esperadoCodigo = incentivo.codigo?.trim().toUpperCase() || null

  for (const c of claims) {
    if (c.tipo === "urgencia") {
      if (proibeUrgencia) {
        out.push({ tipo: "urgencia_artificial", severidade: "medium", trecho: c.trecho, esperado: "a decisão proíbe urgência artificial neste toque" })
      }
      continue
    }
    if (c.tipo === "frete_gratis") continue
    if (!incentivo.existe) {
      out.push({ tipo: "oferta_sem_incentivo", severidade: "high", trecho: c.trecho, esperado: "sem incentivo neste toque (decisão do e-mail)" })
      continue
    }
    if (c.tipo === "percentual" && esperadoPct != null && c.percentual !== esperadoPct) {
      out.push({ tipo: "percentual_diverge", severidade: "high", trecho: c.trecho, esperado: `${esperadoPct}% (incentivo.valor)` })
    }
    if (c.tipo === "codigo" && esperadoCodigo && c.codigo !== esperadoCodigo) {
      out.push({ tipo: "codigo_diverge", severidade: "high", trecho: c.trecho, esperado: `${esperadoCodigo} (incentivo.codigo)` })
    }
  }
  // Dedupe por (tipo, trecho): o mesmo "10% off" citado duas vezes é uma violação.
  const vistos = new Set<string>()
  return out.filter((v) => {
    const k = `${v.tipo}|${v.trecho.toLowerCase()}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}
