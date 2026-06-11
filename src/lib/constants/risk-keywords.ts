/**
 * Filtro determinístico de risco pra trends.
 *
 * Lista curta e auditável de palavras-chave em PT/EN/ES/DE/FR/IT que
 * sinalizam conteúdo sensível. Match case-insensitive em
 * `title + tag + campaign_angle`. Trends `high` entram no banco mas
 * aparecem com badge vermelho na UI — COO decide se aprova ou não.
 *
 * Mantida intencionalmente curta: o objetivo NÃO é censurar, é flagar
 * pra revisão humana antes de a IA da geração usar como input.
 */

interface RiskBuckets {
  high: Record<string, string[]>
  med: Record<string, string[]>
}

export const RISK_KEYWORDS: RiskBuckets = {
  high: {
    luto: [
      "luto nacional",
      "national mourning",
      "luto oficial",
      "deuil national",
      "lutto nazionale",
      "duelo nacional",
      "Staatstrauer",
      "morre famoso",
      "passes away",
      "fallecimiento",
    ],
    conflito: [
      "guerra",
      "war breaks out",
      "terrorism",
      "atentado",
      "ataque terrorista",
      "shooting",
      "tiroteio",
      "Anschlag",
      "attentat",
      "attentato",
    ],
    tragedia: [
      "tragédia",
      "tragedy",
      "tragedia",
      "Tragödie",
      "tragédie",
      "desastre",
      "disaster",
      "catástrofe",
      "catastrophe",
      "Katastrophe",
      "earthquake",
      "terremoto",
      "tsunami",
      "enchente devastadora",
    ],
    politica_quente: [
      "fraude eleitoral",
      "election fraud",
      "fraude électorale",
      "impeachment",
      "golpe de estado",
      "coup d'état",
      "Putsch",
      "colpo di stato",
    ],
    saude_publica: [
      "pandemic",
      "pandemia",
      "outbreak",
      "surto epidêmico",
      "epidemic outbreak",
      "Pandemie",
      "épidémie",
    ],
  },
  med: {
    polemica: [
      "polêmica",
      "controversy",
      "controversia",
      "Skandal",
      "controverse",
      "controversia",
      "boicote",
      "boycott",
      "boicot",
      "cancelamento",
      "canceled",
      "annulé",
    ],
    sensivel: [
      "polarização",
      "polarization",
      "racism debate",
      "debate racial",
      "violência",
      "violence",
      "violencia",
    ],
  },
}

export interface RiskEvaluation {
  flag: "low" | "med" | "high"
  reason: string | null
}

/**
 * Avalia o risco de um texto contra a lista. Retorna o primeiro match
 * (ordem high → med). `reason` traz `categoria:keyword` pra UI mostrar
 * em tooltip e auditoria saber qual palavra disparou.
 */
export function evaluateRisk(text: string | null | undefined): RiskEvaluation {
  if (!text) return { flag: "low", reason: null }
  const lc = text.toLowerCase()

  for (const [category, words] of Object.entries(RISK_KEYWORDS.high)) {
    for (const w of words) {
      if (lc.includes(w.toLowerCase())) return { flag: "high", reason: `${category}:${w}` }
    }
  }
  for (const [category, words] of Object.entries(RISK_KEYWORDS.med)) {
    for (const w of words) {
      if (lc.includes(w.toLowerCase())) return { flag: "med", reason: `${category}:${w}` }
    }
  }
  return { flag: "low", reason: null }
}
