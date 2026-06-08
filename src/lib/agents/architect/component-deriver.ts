/**
 * Deriver determinístico do Component Assembler (Epic AE).
 *
 * Pré-filtra variantes de componente (`email_component_variants`) por
 * afinidade com a loja/marca ANTES da escolha final pelo LLM. Espelha o
 * padrão dos derivers do agente de imagem (cenario-derivation/mood-mapping).
 *
 * Puro (zero dependência de DB).
 */

import type {
  ComponentDensity,
  EmailComponentVariant,
} from "@/types/email-generation"
import { deriveNicheKey, type NicheKey } from "@/lib/agents/shared/niche-keys"

export type PositioningKey = "popular" | "medio" | "premium"

// Mood: alinhado ao enum de `tom_voz` do briefing (image/mood-mapping.ts).
export const MOOD_KEYS = ["formal", "casual", "afetivo", "divertido"] as const
export type MoodKeyName = (typeof MOOD_KEYS)[number]

export interface ComponentMatchContext {
  nicheKey: NicheKey | null
  positioning: PositioningKey | null
  moodKeys: MoodKeyName[]
  density?: ComponentDensity | null
}

// ── Normalizadores (valor cru do briefing → chave canônica) ────────

export function derivePositioning(
  posicionamento: string | null | undefined,
): PositioningKey | null {
  const p = (posicionamento ?? "").trim().toLowerCase()
  if (!p) return null
  if (p.includes("premium") || p.includes("luxo") || p.includes("alto")) {
    return "premium"
  }
  if (p.includes("popular") || p.includes("aces") || p.includes("baixo")) {
    return "popular"
  }
  if (p.includes("medio") || p.includes("médio") || p.includes("interm")) {
    return "medio"
  }
  return null
}

export function deriveMoodKeys(
  tomVoz: string | null | undefined,
): MoodKeyName[] {
  const t = (tomVoz ?? "").trim().toLowerCase()
  if (!t) return []
  const hit = MOOD_KEYS.find((k) => t.includes(k))
  return hit ? [hit] : []
}

/** Monta o contexto de matching a partir dos campos crus do briefing. */
export function buildMatchContext(input: {
  nicho?: string | null
  posicionamento?: string | null
  tom_voz?: string | null
  density?: ComponentDensity | null
}): ComponentMatchContext {
  return {
    nicheKey: deriveNicheKey(input.nicho),
    positioning: derivePositioning(input.posicionamento),
    moodKeys: deriveMoodKeys(input.tom_voz),
    density: input.density ?? null,
  }
}

// ── Scoring + pré-filtro ───────────────────────────────────────────

// Pesos (maior = mais decisivo). Wildcards (campo vazio na variante)
// pontuam baixo: servem de fallback sem ofuscar matches específicos.
const W_NICHE = 3
const W_NICHE_WILDCARD = 0.5
const W_POSITIONING = 2
const W_POSITIONING_WILDCARD = 0.5
const W_MOOD = 1
const W_MOOD_WILDCARD = 0.25
const W_DENSITY = 1

export function scoreVariant(
  variant: EmailComponentVariant,
  ctx: ComponentMatchContext,
): number {
  let s = 0

  // Nicho
  if (variant.niche_affinity.length === 0) {
    s += W_NICHE_WILDCARD
  } else if (ctx.nicheKey && variant.niche_affinity.includes(ctx.nicheKey)) {
    s += W_NICHE
  }

  // Posicionamento
  if (variant.positioning.length === 0) {
    s += W_POSITIONING_WILDCARD
  } else if (ctx.positioning && variant.positioning.includes(ctx.positioning)) {
    s += W_POSITIONING
  }

  // Mood (interseção)
  if (variant.mood.length === 0) {
    s += W_MOOD_WILDCARD
  } else {
    const overlap = ctx.moodKeys.filter((m) => variant.mood.includes(m)).length
    s += overlap * W_MOOD
  }

  // Densidade (desempate)
  if (ctx.density && variant.density === ctx.density) s += W_DENSITY

  return s
}

export const DEFAULT_TOP_K = 5

/**
 * Retorna os finalistas de um pool (já filtrado por block_type + is_active),
 * ordenados por score desc, cortados em top-K. Empates desempatados por
 * `version` desc e depois `name` asc — determinístico.
 */
export function prefilterCandidates(
  variants: EmailComponentVariant[],
  ctx: ComponentMatchContext,
  topK: number = DEFAULT_TOP_K,
): EmailComponentVariant[] {
  return [...variants]
    .map((v) => ({ v, score: scoreVariant(v, ctx) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.v.version !== a.v.version) return b.v.version - a.v.version
      return a.v.name.localeCompare(b.v.name)
    })
    .slice(0, Math.max(1, topK))
    .map((x) => x.v)
}
