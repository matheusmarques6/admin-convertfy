/**
 * Helper niche-adaptive: mapeia o enum de `tom_voz` (BriefingMarca)
 * para uma string de 3 palavras descrevendo o mood visual.
 *
 * Usado para preencher a variável {MOOD} no prompt de imagem.
 * Story AE-10. Puro (zero dependência de DB).
 */

const MOOD_MAP = {
  formal: "elegant, refined, premium",
  casual: "relaxed, friendly, approachable",
  afetivo: "warm, intimate, soft",
  divertido: "playful, vibrant, energetic",
} as const

const DEFAULT_MOOD = "clean, modern, balanced"

export type MoodKey = keyof typeof MOOD_MAP

export function mapTomVozToMood(tomVoz: string | null | undefined): string {
  if (!tomVoz) return DEFAULT_MOOD
  const key = tomVoz.trim().toLowerCase() as MoodKey
  return MOOD_MAP[key] ?? DEFAULT_MOOD
}
