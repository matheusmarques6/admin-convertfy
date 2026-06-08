/**
 * Vocabulário canônico de nichos para matching niche-adaptive.
 *
 * Fonte única compartilhada entre o agente de imagem
 * (`image/cenario-derivation.ts`) e o assembler de componentes
 * (`architect/component-deriver.ts`), evitando divergência de taxonomia.
 *
 * Puro (zero dependência de DB).
 */

// Chaves canônicas de nicho (substring match, case-insensitive).
// `gadgets`/`tech` e `fitness`/`esporte` são famílias semânticas próximas
// mantidas separadas para permitir curadoria fina dos componentes.
export const NICHE_KEYS = [
  "moda",
  "beleza",
  "automotivo",
  "pet",
  "gourmet",
  "decoracao",
  "tech",
  "gadgets",
  "saude",
  "suplementos",
  "infantil",
  "esporte",
  "fitness",
] as const

export type NicheKey = (typeof NICHE_KEYS)[number]

/**
 * Normaliza o nicho cru da marca para uma chave canônica via substring
 * match (ex.: "Acessórios Automotivos" → "automotivo"). Retorna null se
 * nenhuma chave casar.
 */
export function deriveNicheKey(
  nicho: string | null | undefined,
): NicheKey | null {
  const norm = (nicho ?? "").trim().toLowerCase()
  if (!norm) return null
  for (const key of NICHE_KEYS) {
    if (norm.includes(key)) return key
  }
  return null
}
