/**
 * Checklist de compliance da legenda (Instagram + padrão editorial da casa).
 * Cada regra devolve o TRECHO que reprovou, para a UI destacar.
 */

export interface RegraCompliance {
  id: string
  label: string
  ok: boolean
  /** Trecho encontrado que reprova (null quando ok ou quando é ausência). */
  trecho: string | null
  /** A IA consegue corrigir sozinha (substituição segura)? */
  corrigivel: boolean
}

export const LIMITE_LEGENDA = 2200
export const ALVO_PALAVRAS: [number, number] = [150, 180]

const ENGAGEMENT_BAIT = /curte e compartilha|curta e compartilhe|marque \d+ amigos|marca \d+ amigos/i
const PROMESSA = /garantid[oa]s?|garantia de|lucro certo|renda garantida/i
const DESVALORIZA = /\bbarat[oa]s?\b|\bde graça\b|\bgratuit[oa]\b/i
const TRAVESSAO = /—|–/
const CTA_RE = /\bcoment[ae]\b|\bcomentário\b|\blink na bio\b|\bsalv[ae]\b|\bme manda\b|\bdirect\b/i

function acha(re: RegExp, texto: string): string | null {
  const m = re.exec(texto)
  return m ? m[0] : null
}

export function avaliarCompliance(legenda: string): RegraCompliance[] {
  const t = legenda ?? ""
  const bait = acha(ENGAGEMENT_BAIT, t)
  const promessa = acha(PROMESSA, t)
  const desv = acha(DESVALORIZA, t)
  const trav = acha(TRAVESSAO, t)
  const temCta = CTA_RE.test(t)
  return [
    { id: "bait", label: "Sem engagement bait explícito", ok: !bait, trecho: bait, corrigivel: true },
    { id: "promessa", label: "Sem promessa de resultado financeiro", ok: !promessa, trecho: promessa, corrigivel: true },
    { id: "desvaloriza", label: "Sem posicionamento que desvalorize a agência", ok: !desv, trecho: desv, corrigivel: true },
    { id: "travessao", label: "Sem travessão no texto", ok: !trav, trecho: trav, corrigivel: true },
    { id: "cta", label: "CTA presente e claro", ok: temCta, trecho: null, corrigivel: false },
    { id: "tamanho", label: "Dentro de 2.200 caracteres", ok: t.length <= LIMITE_LEGENDA, trecho: t.length > LIMITE_LEGENDA ? `${t.length} caracteres` : null, corrigivel: true },
  ]
}

/**
 * Correção determinística e segura (sem chamar modelo): troca travessão por
 * vírgula, ameniza promessas e retira bait. Quem precisa de reescrita de
 * verdade (CTA ausente) vai para a IA.
 */
export function corrigirLegendaLocal(legenda: string): string {
  let t = legenda
  t = t.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ")
  t = t.replace(/garantid[oa]s?/gi, "consistente").replace(/garantia de/gi, "expectativa de")
  t = t.replace(/lucro certo/gi, "resultado consistente").replace(/renda garantida/gi, "receita recorrente")
  t = t.replace(/curte e compartilha[.!]?/gi, "").replace(/curta e compartilhe[.!]?/gi, "")
  t = t.replace(/marqu?[ea] \d+ amigos[.!]?/gi, "")
  t = t.replace(/\bbarat[oa]s?\b/gi, "acessível")
  if (t.length > LIMITE_LEGENDA) t = t.slice(0, LIMITE_LEGENDA - 1).replace(/\s+\S*$/, "") + "…"
  return t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

/** Índices [início, fim) de um trecho na legenda, para o destaque. */
export function localizarTrecho(legenda: string, trecho: string | null): [number, number] | null {
  if (!trecho) return null
  const i = legenda.indexOf(trecho)
  if (i < 0) {
    const j = legenda.toLowerCase().indexOf(trecho.toLowerCase())
    return j < 0 ? null : [j, j + trecho.length]
  }
  return [i, i + trecho.length]
}
