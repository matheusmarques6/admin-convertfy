import type { BriefingData } from "@/types/onboarding"
import type { BriefingContent } from "@/types/onboarding-pipeline"

/**
 * When n8n sends raw text instead of structured JSON, the briefing is stored
 * in `raw_text`. These helpers detect and extract that case.
 */
export function isRawTextBriefing(data: BriefingData): boolean {
  return typeof data.raw_text === "string"
}

export function getRawText(data: BriefingData): string {
  return data.raw_text || ""
}

/**
 * Renders a single value in a human-readable way. Objects/arrays are
 * stringified compactly; primitives are coerced to string.
 */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Renders a `Record<string, unknown>` section ("## Title" + "Key: value"
 * lines). Returns an empty array when the record has no keys, so the caller
 * can omit the section entirely.
 */
function renderRecordSection(title: string, record: Record<string, unknown> | undefined | null): string[] {
  if (!record || typeof record !== "object") return []
  const entries = Object.entries(record).filter(([, v]) => {
    const rendered = renderValue(v)
    return rendered.trim() !== ""
  })
  if (entries.length === 0) return []

  const lines: string[] = [`## ${title}`]
  for (const [key, value] of entries) {
    lines.push(`${key}: ${renderValue(value)}`)
  }
  return lines
}

/**
 * Converts structured BriefingData into a complete human-readable text covering
 * ALL sections (including `resumo_performance` and `analise_anuncios`). Empty
 * lines/sections are omitted. Style: "## Section" headers + "Label: value" lines.
 */
export function briefingToFullText(data: BriefingData): string {
  const blocks: string[] = []

  // Dados da Loja
  if (data.dados_loja) {
    const d = data.dados_loja
    const lines: string[] = []
    if (d.nome) lines.push(`Nome: ${d.nome}`)
    if (d.url) lines.push(`URL: ${d.url}`)
    if (d.plataforma) lines.push(`Plataforma: ${d.plataforma}`)
    if (d.nicho) lines.push(`Nicho: ${d.nicho}`)
    if (d.pais) lines.push(`País: ${d.pais}`)
    if (d.idioma) lines.push(`Idioma: ${d.idioma}`)
    if (d.frete_gratis) lines.push(`Frete: ${d.frete_gratis}`)
    if (lines.length) blocks.push(["## Dados da Loja", ...lines].join("\n"))
  }

  // Código Colaborador
  if (data.codigo_colaborador?.shopify_code) {
    blocks.push(["## Código Colaborador", `Shopify Code: ${data.codigo_colaborador.shopify_code}`].join("\n"))
  }

  // Materiais de Identidade
  if (data.materiais_identidade) {
    const m = data.materiais_identidade
    const lines: string[] = []
    if (m.logo_url) lines.push(`Logo: ${m.logo_url}`)
    if (m.design_direction) lines.push(`Direção Visual: ${m.design_direction}`)
    if (m.design_file_url) lines.push(`Referência Visual: ${m.design_file_url}`)
    if (m.brand_manual_url) lines.push(`Manual da Marca: ${m.brand_manual_url}`)
    if (lines.length) blocks.push(["## Materiais de Identidade", ...lines].join("\n"))
  }

  // Foco das Campanhas
  if (data.foco_campanhas) {
    const lines: string[] = []
    if (data.foco_campanhas.abordagem) lines.push(`Abordagem: ${data.foco_campanhas.abordagem}`)
    if (data.foco_campanhas.descricao) lines.push(data.foco_campanhas.descricao)
    if (lines.length) blocks.push(["## Foco das Campanhas", ...lines].join("\n"))
  }

  // Público-Alvo
  if (data.publico) {
    const lines: string[] = []
    if (data.publico.target_audience) lines.push(`Público: ${data.publico.target_audience}`)
    if (data.publico.price_sensitivity) lines.push(`Sensibilidade: ${data.publico.price_sensitivity}`)
    if (data.publico.perfil) lines.push(data.publico.perfil)
    if (lines.length) blocks.push(["## Público-Alvo", ...lines].join("\n"))
  }

  // Perfil da Marca
  if (data.perfil_marca) {
    const lines: string[] = []
    if (data.perfil_marca.tipo) lines.push(`Tipo: ${data.perfil_marca.tipo}`)
    if (data.perfil_marca.descricao) lines.push(data.perfil_marca.descricao)
    if (lines.length) blocks.push(["## Perfil da Marca", ...lines].join("\n"))
  }

  // Detalhes Adicionais
  if (data.detalhes_adicionais) {
    const lines: string[] = []
    if (data.detalhes_adicionais.notas) lines.push(`Notas: ${data.detalhes_adicionais.notas}`)
    if (data.detalhes_adicionais.conceito_frete) lines.push(`Conceito Frete: ${data.detalhes_adicionais.conceito_frete}`)
    if (lines.length) blocks.push(["## Detalhes Adicionais", ...lines].join("\n"))
  }

  // Resumo de Performance (Record<string, unknown>)
  const resumoLines = renderRecordSection("Resumo de Performance", data.resumo_performance)
  if (resumoLines.length) blocks.push(resumoLines.join("\n"))

  // Análise de Anúncios (Record<string, unknown>)
  const anunciosLines = renderRecordSection("Análise de Anúncios", data.analise_anuncios)
  if (anunciosLines.length) blocks.push(anunciosLines.join("\n"))

  return blocks.join("\n\n")
}

/**
 * Converte o BriefingContent CONFIRMADO pelo cliente (onboardings.briefing —
 * a versão revisada na tela "revise e confirme") no mesmo documento textual de
 * seções "## Título" usado na aba Configurações. Campos vazios são omitidos;
 * se tudo estiver vazio retorna "".
 */
export function briefingContentToFullText(b: BriefingContent): string {
  const blocks: string[] = []

  const aboutBrand = str(b.about_brand)
  if (aboutBrand) blocks.push(["## Sobre a marca", aboutBrand].join("\n"))

  const audience = str(b.audience)
  if (audience) blocks.push(["## Público-alvo", audience].join("\n"))

  const languageTone = str(b.language_tone)
  if (languageTone) blocks.push(["## Tom de voz e idioma", languageTone].join("\n"))

  // Identidade visual: paleta / fontes / referências (cada um opcional).
  {
    const lines: string[] = []
    const palette = str(b.visual_identity?.palette)
    const fonts = str(b.visual_identity?.fonts)
    const references = str(b.visual_identity?.references)
    if (palette) lines.push(`Paleta: ${palette}`)
    if (fonts) lines.push(`Fontes: ${fonts}`)
    if (references) lines.push(`Referências: ${references}`)
    if (lines.length) blocks.push(["## Identidade visual", ...lines].join("\n"))
  }

  const offers = str(b.offers_and_differentials)
  if (offers) blocks.push(["## Ofertas e diferenciais", offers].join("\n"))

  const additions = str(b.client_additions)
  if (additions) blocks.push(["## Observações do cliente", additions].join("\n"))

  return blocks.join("\n\n")
}

/**
 * Campos do documento "Pesquisa & Diagnóstico" (tabela client_stores). Cópia
 * estrutural de PesquisaData (src/components/stores/v2/pesquisa/pesquisa-section.tsx)
 * — mantida aqui para não acoplar este módulo server-safe ao componente "use client".
 */
export interface PesquisaFields {
  // 01 · Perfil da Marca
  brand_thesis?: string | null
  brand_about?: string | null
  brand_pillars?: { number?: string; label?: string; text?: string }[] | null
  brand_presence?: string | null
  // 02 · Sobre a loja
  store_story?: string | null
  store_milestones?: { year?: string; event?: string }[] | null
  // 03 · Cliente Ideal
  icp_persona?: { name?: string; age?: string; city?: string; monogram?: string } | null
  icp_demographics?: {
    age_range?: string
    income?: string
    education?: string
    occupation?: string
    religion?: string
  } | null
  icp_day_in_life?: string | null
  icp_motivations?: string[] | null
  icp_frictions?: string[] | null
  /** Projeção do catálogo de objeções (set/2026) — `[{objection, treatment}]`. */
  icp_objections?: { objection?: string | null; treatment?: string | null }[] | null
  // 04 · Tom de Comunicação
  tone_description?: string | null
  tone_do?: string[] | null
  tone_dont?: string[] | null
  tone_use_words?: string[] | null
  tone_avoid_words?: string[] | null
  // 05 · Review dos Anúncios
  ads_score?: number | null
  ads_summary?: string | null
  ads_sub_scores?: {
    strategy: number
    creatives: number
    targeting: number
    diversification: number
    tracking: number
  } | null
  ads_strengths?: { what?: string; body?: string }[] | null
  ads_opportunities?: { what?: string; body?: string }[] | null
  ads_risks?: { what?: string; body?: string }[] | null
  ads_reviewed_at?: string | null
}

/**
 * Score geral = média das 5 sub-notas (0-10 cada). O ads_score do banco vem em
 * escala incompatível do webhook n8n — usado só como fallback quando não há
 * sub_scores. Resultado clampado em 0-10.
 *
 * Réplica de computeAdsScore em
 * src/components/stores/v2/pesquisa/pesquisa-section.tsx:125-144 — mantida em
 * sincronia para o texto bater com o gauge da aba Content.
 */
function computeAdsScore(
  subScores: PesquisaFields["ads_sub_scores"],
  fallback: number,
): number {
  if (!subScores) return Math.max(0, Math.min(10, Number(fallback) || 0))
  const values = [
    subScores.strategy,
    subScores.creatives,
    subScores.targeting,
    subScores.diversification,
    subScores.tracking,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (values.length === 0) {
    return Math.max(0, Math.min(10, Number(fallback) || 0))
  }
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  return Math.max(0, Math.min(10, avg))
}

/** Coage a um texto não-vazio, ou retorna "". */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/** Filtra um array de strings para itens não-vazios. */
function cleanList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr.map((v) => str(v)).filter((v) => v !== "")
}

/** Opções de recorte do dossiê. */
export interface PesquisaTextOptions {
  /**
   * Inclui "## 05 · Review dos Anúncios". Default `true`.
   *
   * O Curador de componentes pede `false`: a auditoria de mídia paga é o
   * MAIOR pedaço do dossiê (5.538 de 13.823 chars na Innova Bay) e não diz
   * nada sobre qual variante serve ao email — disputava espaço com marca,
   * objeções e vocabulário dentro do mesmo bloco.
   */
  incluirAds?: boolean
}

/**
 * Converte os campos "Pesquisa & Diagnóstico" (client_stores) no mesmo
 * documento textual de 5 seções exibido na aba Content. Campos/seções vazios
 * são omitidos; se tudo estiver vazio retorna "" (preserva o empty state).
 */
export function pesquisaToFullText(
  store: PesquisaFields,
  opts?: PesquisaTextOptions,
): string {
  const blocks: string[] = []

  // ── 01 · Perfil da Marca ──────────────────────────────────────────────
  {
    const lines: string[] = []
    const thesis = str(store.brand_thesis)
    const about = str(store.brand_about)
    const presence = str(store.brand_presence)
    if (thesis) lines.push(`"${thesis}"`)
    if (about) lines.push(about)
    if (presence) lines.push(presence)
    const pillars = (store.brand_pillars ?? [])
      .slice(0, 3)
      .map((p) => {
        const num = str(p?.number)
        const label = str(p?.label)
        const text = str(p?.text)
        if (!label && !text) return ""
        const head = [num, label].filter(Boolean).join(" ")
        return head && text ? `- ${head}: ${text}` : `- ${head || text}`
      })
      .filter(Boolean)
    if (pillars.length) lines.push("Pilares:", ...pillars)
    if (lines.length) blocks.push(["## 01 · Perfil da Marca", ...lines].join("\n"))
  }

  // ── 02 · Sobre a loja ─────────────────────────────────────────────────
  {
    const lines: string[] = []
    const story = str(store.store_story)
    if (story) lines.push(story)
    const milestones = (store.store_milestones ?? [])
      .map((m) => {
        const year = str(m?.year)
        const event = str(m?.event)
        if (!year && !event) return ""
        return year && event ? `- ${year}: ${event}` : `- ${year || event}`
      })
      .filter(Boolean)
    if (milestones.length) lines.push("Marcos da operação:", ...milestones)
    if (lines.length) blocks.push(["## 02 · Sobre a loja", ...lines].join("\n"))
  }

  // ── 03 · Cliente Ideal ────────────────────────────────────────────────
  {
    const lines: string[] = []
    const persona = store.icp_persona
    if (persona) {
      const name = str(persona.name)
      const age = str(persona.age)
      const city = str(persona.city)
      const detail = [age, city].filter(Boolean).join(" · ")
      if (name && detail) lines.push(`Persona: ${name} — ${detail}`)
      else if (name || detail) lines.push(`Persona: ${name || detail}`)
    }
    const demo = store.icp_demographics
    if (demo) {
      if (str(demo.age_range)) lines.push(`Faixa etária: ${str(demo.age_range)}`)
      if (str(demo.income)) lines.push(`Renda familiar: ${str(demo.income)}`)
      if (str(demo.education)) lines.push(`Educação: ${str(demo.education)}`)
      if (str(demo.occupation)) lines.push(`Profissão típica: ${str(demo.occupation)}`)
      if (str(demo.religion)) lines.push(`Religião: ${str(demo.religion)}`)
    }
    const dayInLife = str(store.icp_day_in_life)
    if (dayInLife) lines.push("Um dia na vida:", dayInLife)
    const motivations = cleanList(store.icp_motivations)
    if (motivations.length) lines.push("O que ela quer:", ...motivations.map((m) => `- ${m}`))
    const frictions = cleanList(store.icp_frictions)
    if (frictions.length) lines.push("O que a faz hesitar:", ...frictions.map((f) => `- ${f}`))
    // Objeção ≠ dor: é o que trava o checkout DEPOIS de a pessoa querer o
    // produto. Ficava fora do dossiê (set/2026) — e o Estruturador, que só
    // recebe este texto, inferia a "objeção dominante" da prosa acima.
    const objections = (Array.isArray(store.icp_objections) ? store.icp_objections : [])
      .map((o) => {
        const objecao = str(o?.objection)
        if (!objecao) return ""
        const tratamento = str(o?.treatment)
        return tratamento ? `- ${objecao} — tratamento: ${tratamento}` : `- ${objecao}`
      })
      .filter(Boolean)
    if (objections.length) {
      lines.push("O que trava o checkout (objeções — já quer o produto e hesita):", ...objections)
    }
    if (lines.length) blocks.push(["## 03 · Cliente Ideal", ...lines].join("\n"))
  }

  // ── 04 · Tom de Comunicação ───────────────────────────────────────────
  {
    const lines: string[] = []
    const description = str(store.tone_description)
    if (description) lines.push(description)
    const toneDo = cleanList(store.tone_do).slice(0, 4)
    if (toneDo.length) lines.push("Como falamos:", ...toneDo.map((d) => `- ${d}`))
    const toneDont = cleanList(store.tone_dont).slice(0, 4)
    if (toneDont.length) lines.push("Como nunca falamos:", ...toneDont.map((d) => `- ${d}`))
    const useWords = cleanList(store.tone_use_words)
    if (useWords.length) lines.push(`Vocabulário · Usar: ${useWords.join(", ")}`)
    const avoidWords = cleanList(store.tone_avoid_words)
    if (avoidWords.length) lines.push(`Vocabulário · Evitar: ${avoidWords.join(", ")}`)
    if (lines.length) blocks.push(["## 04 · Tom de Comunicação", ...lines].join("\n"))
  }

  // ── 05 · Review dos Anúncios ──────────────────────────────────────────
  if (opts?.incluirAds !== false) {
    const lines: string[] = []
    const hasScore = store.ads_score != null || !!store.ads_sub_scores
    if (hasScore) {
      const score = computeAdsScore(store.ads_sub_scores, store.ads_score ?? 0)
      lines.push(`Score geral: ${score.toFixed(1)}/10`)
    }
    const summary = str(store.ads_summary)
    if (summary) lines.push(summary)
    const sub = store.ads_sub_scores
    if (sub) {
      const subLine = (label: string, value: number): string | null => {
        const v = Number(value)
        if (!Number.isFinite(v)) return null
        return `${label}: ${Math.max(0, Math.min(10, v)).toFixed(1)}/10`
      }
      const subLines = [
        subLine("Estratégia", sub.strategy),
        subLine("Criativos", sub.creatives),
        subLine("Segmentação", sub.targeting),
        subLine("Diversificação", sub.diversification),
        subLine("Tracking & dados", sub.tracking),
      ].filter((l): l is string => l !== null)
      if (subLines.length) lines.push("Sub-notas:", ...subLines)
    }
    const reviewBlock = (
      title: string,
      items: { what?: string; body?: string }[] | null | undefined,
    ): void => {
      const rendered = (items ?? [])
        .map((it) => {
          const what = str(it?.what)
          const body = str(it?.body)
          if (!what && !body) return ""
          return what && body ? `- ${what}: ${body}` : `- ${what || body}`
        })
        .filter(Boolean)
      if (rendered.length) lines.push(`${title}:`, ...rendered)
    }
    reviewBlock("Pontos fortes", store.ads_strengths)
    reviewBlock("Oportunidades", store.ads_opportunities)
    reviewBlock("Riscos a monitorar", store.ads_risks)
    const reviewedAt = str(store.ads_reviewed_at)
    if (reviewedAt) {
      const d = new Date(reviewedAt)
      if (!Number.isNaN(d.getTime())) {
        lines.push(`Última análise: ${d.toLocaleDateString("pt-BR")}`)
      }
    }
    if (lines.length) blocks.push(["## 05 · Review dos Anúncios", ...lines].join("\n"))
  }

  return blocks.join("\n\n")
}
