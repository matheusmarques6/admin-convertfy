/**
 * Origens de negócio/lead — fonte única do vocabulário.
 *
 * Vivia dentro do NewDealDialog; virou módulo quando a origem passou a
 * ser EDITÁVEL no drawer (pedido: "o lead veio do Luan e não do Carlos"
 * — trocar a fonte e o indicador depois de criado). Client-safe.
 */

export interface DealSourceType {
  value: string
  label: string
  icon: string
}

// Tipos padronizados pra metrificação. 'indicacao' destrava o campo
// 'Quem indicou' — base do relatório "Top indicadores".
export const DEAL_SOURCE_TYPES: DealSourceType[] = [
  { value: "indicacao", label: "Indicação", icon: "🤝" },
  { value: "meta_ads", label: "Meta Ads", icon: "📘" },
  { value: "google_ads", label: "Google Ads", icon: "🔎" },
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "site", label: "Site / Inbound", icon: "🌐" },
  { value: "evento", label: "Evento", icon: "🎤" },
  { value: "outbound", label: "Outbound", icon: "📞" },
  { value: "parceiro", label: "Parceiro", icon: "🤝" },
  { value: "outro", label: "Outro", icon: "✨" },
]

/**
 * Label de exibição: valor canônico ganha o rótulo bonito; "form:slug"
 * vira "Formulário · slug"; qualquer outro texto (origens antigas
 * digitadas livres) aparece como está — histórico nunca quebra.
 */
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—"
  if (source.startsWith("form:")) return `Formulário · ${source.slice("form:".length)}`
  const known = DEAL_SOURCE_TYPES.find((s) => s.value === source)
  return known?.label ?? source
}

/**
 * Opções pro select de edição: as canônicas + o valor atual quando ele
 * não está na lista (origem legada/livre não pode sumir do select — o
 * usuário precisa VER o que está salvo pra decidir trocar).
 */
export function sourceSelectOptions(
  current: string | null | undefined,
): Array<{ value: string; label: string }> {
  const options = DEAL_SOURCE_TYPES.map((s) => ({ value: s.value, label: s.label }))
  if (current && !DEAL_SOURCE_TYPES.some((s) => s.value === current)) {
    options.unshift({ value: current, label: sourceLabel(current) })
  }
  // Sem origem: a opção vazia evita o select "fingir" que a primeira
  // da lista está selecionada.
  if (!current) options.unshift({ value: "", label: "—" })
  return options
}
