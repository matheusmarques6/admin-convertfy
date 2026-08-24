/**
 * Contexto de loja para os agentes do Architect (módulo PURO, sem I/O).
 *
 * O Curador escolhe a composição do email a partir de `<store>` e
 * `<perfil_marca>`. Esses campos vinham de uma cascata que terminava nas
 * colunas LEGADAS de `client_stores` (`niche`, `posicionamento_preco`,
 * `persona`, `tom_de_voz`) — colunas que a Pesquisa & Diagnóstico não
 * preenche. Numa loja sem `store_briefings`, o resultado era:
 *
 *   nicho: ""            posicionamento: ""
 *   persona: [objeto]    perfil_marca: "{}"
 *
 * — e o Curador decidia praticamente no escuro, com a memória cross-store
 * como único sinal forte. Foi assim que a Innova Bay recebeu a MESMA
 * composição de cinco blocos que a Luxe Lift (ago/2026).
 *
 * A informação existe: mora em `brand_thesis`, `brand_about`,
 * `brand_pillars`, `store_story` e nos pilares `icp_*`/`tone_*`. Este
 * módulo faz a ponte, com duas regras:
 *
 *   1. NUNCA inventar. Nada aqui deduz "nicho" de texto livre por
 *      heurística — um palpite errado é pior que um campo vazio, porque o
 *      modelo trata os dois com a mesma confiança.
 *   2. Campo ausente é DECLARADO, não omitido. `"- nicho: "` é ruído que o
 *      modelo pula; `"- nicho: (não cadastrado — deduza de <perfil_marca>)"`
 *      redireciona para onde o dado realmente está.
 */

/** `client_stores.icp_persona` — JSONB, não string (o cast antigo mentia). */
export interface IcpPersona {
  name?: string | null
  age?: string | null
  city?: string | null
  monogram?: string | null
}

/** `client_stores.icp_demographics` — JSONB. */
export interface IcpDemographics {
  age_range?: string | null
  income?: string | null
  education?: string | null
  occupation?: string | null
}

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()

/** Marcador de campo ausente — legível pelo modelo, não um vazio mudo. */
export const MISSING_FIELD = "(não cadastrado — deduza de <perfil_marca>)"

/**
 * Persona como TEXTO. `icp_persona` é um objeto JSONB e o código antigo o
 * tratava com `as string`: um cast de TypeScript não converte nada em
 * runtime, então o objeto chegava ao renderer e virava `[object Object]`
 * (ou o JSON cru) dentro do prompt.
 *
 * Ordem: persona do briefing (texto curado) → ICP da pesquisa → coluna
 * legada. A primeira que tiver conteúdo vence.
 */
export function resolvePersonaText(input: {
  marcaPersona?: string | null
  icpPersona?: IcpPersona | null
  icpDemographics?: IcpDemographics | null
  personaColumn?: unknown
}): string {
  const fromBriefing = str(input.marcaPersona)
  if (fromBriefing) return fromBriefing

  const p = input.icpPersona
  const d = input.icpDemographics
  const parts: string[] = []

  if (p) {
    const name = str(p.name)
    const detail = [str(p.age), str(p.city)].filter(Boolean).join(" · ")
    if (name && detail) parts.push(`${name} — ${detail}`)
    else if (name || detail) parts.push(name || detail)
  }
  if (d) {
    if (str(d.age_range)) parts.push(`Faixa etária: ${str(d.age_range)}`)
    if (str(d.occupation)) parts.push(`Ocupação: ${str(d.occupation)}`)
    if (str(d.income)) parts.push(`Renda: ${str(d.income)}`)
    if (str(d.education)) parts.push(`Educação: ${str(d.education)}`)
  }
  if (parts.length > 0) return parts.join(" | ")

  // Coluna legada por último — e só se for mesmo texto. Um objeto aqui
  // repetiria o bug que este módulo existe para matar.
  const legacy = input.personaColumn
  return typeof legacy === "string" ? legacy.trim() : ""
}

/**
 * Valor do campo ou o marcador de ausência. Usado nos campos de `<store>`
 * que o Curador lê como critério de escolha.
 */
export function fieldOrMissing(value: string | null | undefined): string {
  const v = str(value)
  return v || MISSING_FIELD
}

/**
 * Perfil da marca para `<perfil_marca>`.
 *
 * O briefing curado (`store_briefings.marca`) vence quando existe. Sem ele,
 * entra a Pesquisa & Diagnóstico serializada — que é justamente o dossiê
 * completo (tese, sobre, pilares, história, ICP, tom). Antes esse fallback
 * não existia: `JSON.stringify({})` mandava o literal `"{}"` ao prompt
 * enquanto a pesquisa, já carregada na mesma função, era ignorada.
 */
export function resolveBrandProfile(input: {
  marca?: Record<string, unknown> | null
  pesquisa?: string | null
}): { text: string; source: "briefing" | "pesquisa" | "none" } {
  const marca = input.marca ?? {}
  const hasMarca = Object.values(marca).some((v) => str(v).length > 0)
  if (hasMarca) {
    return { text: JSON.stringify(marca), source: "briefing" }
  }

  const pesquisa = str(input.pesquisa)
  if (pesquisa) return { text: pesquisa, source: "pesquisa" }

  return { text: "(sem perfil de marca cadastrado)", source: "none" }
}

/** Campos de `<store>` que chegaram vazios — telemetria de cadastro. */
export function missingStoreFields(input: {
  nicho?: string | null
  posicionamento?: string | null
  persona?: string | null
  tomVoz?: string | null
}): string[] {
  return (
    [
      ["nicho", input.nicho],
      ["posicionamento", input.posicionamento],
      ["persona", input.persona],
      ["tom_voz", input.tomVoz],
    ] as const
  )
    .filter(([, v]) => !str(v))
    .map(([k]) => k)
}
