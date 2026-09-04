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

// ── Blocos nomeados do Curador (27/08) ──────────────────────────────────
//
// Objeções, vocabulário e produtos JÁ viajavam até o Curador — enterrados.
// As objeções eram cinco linhas sob "O que a faz hesitar" dentro de
// "## 03 · Cliente Ideal"; o vocabulário, duas linhas dentro de "## 04 ·
// Tom de Comunicação"; tudo isso dentro de um `<perfil_marca>` de 13.823
// chars que ainda carregava 5.538 de auditoria de mídia paga. Os produtos
// chegavam só como nomes, sem link, porque a consulta pedia só o título.
//
// Nomear cada coisa no prompt é o que transforma dado presente em critério
// usado. As funções abaixo montam esses blocos — sem deduzir nada e
// declarando ausência, que são as duas regras deste módulo.

/** Item de `client_stores.icp_objections` (projeção do catálogo, set/2026). */
export interface ObjecaoDaLoja {
  objection?: string | null
  treatment?: string | null
}

/**
 * Objeções do cliente ideal (`client_stores.icp_objections`) para
 * `<objecoes>`. É o que a variante escolhida precisa ter anatomia para
 * responder — prova social, FAQ, garantia, comparativo.
 *
 * Lia `icp_frictions` até set/2026 — e friction é DOR (o incômodo de antes
 * de querer o produto), não objeção (o que trava o checkout depois de
 * querer). As objeções existiam a uma coluna de distância, em 35 lojas,
 * sem nenhum agente lê-las; a dor é quase idêntica entre lojas, e por isso
 * o 1º eixo de ranking do Curador não separava nada. O tratamento vai na
 * mesma linha: é ele que diz qual anatomia responde.
 */
export function resolveObjecoes(
  pesquisa: { icp_objections?: ObjecaoDaLoja[] | null } | null | undefined,
): string {
  const itens = Array.isArray(pesquisa?.icp_objections) ? pesquisa.icp_objections : []
  const linhas = itens
    .map((o) => {
      const objecao = str(o?.objection)
      if (!objecao) return ""
      const tratamento = str(o?.treatment)
      return tratamento ? `- ${objecao} — tratamento: ${tratamento}` : `- ${objecao}`
    })
    .filter(Boolean)
  return linhas.length > 0
    ? linhas.join("\n")
    : "(não cadastradas — não presuma objeção)"
}

/**
 * Vocabulário literal da marca (`tone_use_words` / `tone_avoid_words`) para
 * `<vocabulario>`.
 *
 * LITERAL: nada é reordenado, truncado ou traduzido. A lista de "evitar" é
 * uma proibição — cortá-la em N palavras deixaria passar exatamente a que
 * ficou de fora, e o Curador não teria como saber que a lista foi cortada.
 */
export function resolveVocabulario(
  pesquisa: {
    tone_use_words?: string[] | null
    tone_avoid_words?: string[] | null
  } | null | undefined,
): string {
  const usar = (pesquisa?.tone_use_words ?? []).map(str).filter(Boolean)
  const evitar = (pesquisa?.tone_avoid_words ?? []).map(str).filter(Boolean)
  const linhas: string[] = []
  if (usar.length) linhas.push(`Usar: ${usar.join(", ")}`)
  if (evitar.length) linhas.push(`Evitar: ${evitar.join(", ")}`)
  return linhas.length > 0 ? linhas.join("\n") : "(não cadastrado)"
}

/**
 * Bloco `<top_products>`: nome, preço e LINK de cada produto.
 *
 * O link é o que faltava — e é ele que fecha a regra de viabilidade: slot
 * de produto sem produto para apontar é variante inviável, não é variante
 * "com campo vazio". Preço e link ausentes são omitidos por produto (em vez
 * de virarem "—" ou "undefined", que o modelo leria como valor).
 */
export function renderTopProducts(
  produtos: ReadonlyArray<{
    name: string
    price?: number | string | null
    url?: string | null
  }> | null | undefined,
): string {
  const linhas = (produtos ?? [])
    .map((p) => {
      const nome = str(p?.name)
      if (!nome) return ""
      const preco = str(p?.price)
      const url = str(p?.url)
      return [nome, preco, url].filter(Boolean).join(" — ")
    })
    .filter(Boolean)
    .map((linha, i) => `${i + 1}. ${linha}`)
  return linhas.length > 0 ? linhas.join("\n") : "(sem produtos cadastrados)"
}
