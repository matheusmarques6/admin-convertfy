import type { BriefingData } from "@/types/onboarding"

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
