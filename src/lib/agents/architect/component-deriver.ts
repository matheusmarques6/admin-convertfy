/**
 * Deriver determinístico do Component Assembler (Epic AE).
 *
 * Pré-filtra variantes de componente (`email_component_variants`) por
 * afinidade com o email/loja ANTES da escolha final pelo LLM, usando as
 * dimensões objectives/tones/density (as antigas niche/positioning/mood
 * foram substituídas — ver migration 20261003).
 *
 * Puro (zero dependência de DB).
 */

import type {
  ComponentDensity,
  EmailComponentVariant,
} from "@/types/email-generation"
import {
  flowTypeToObjective,
  deriveToneKeys,
  type ComponentObjective,
  type ComponentTone,
} from "@/lib/agents/shared/component-dimensions"

export interface ComponentMatchContext {
  objective: ComponentObjective | null
  tones: ComponentTone[]
  density?: ComponentDensity | null
}

/** Monta o contexto de matching a partir do flow e dos campos crus do briefing. */
export function buildMatchContext(input: {
  flow_type?: string | null
  tom_voz?: string | null
  tone_hint?: string | null
  density?: ComponentDensity | null
}): ComponentMatchContext {
  return {
    objective: flowTypeToObjective(input.flow_type),
    tones: deriveToneKeys(input.tom_voz, input.tone_hint),
    density: input.density ?? null,
  }
}

// ── Scoring + pré-filtro ───────────────────────────────────────────

// Pesos (maior = mais decisivo). Wildcards (campo vazio na variante)
// pontuam baixo: servem de fallback sem ofuscar matches específicos.
const W_OBJECTIVE = 3
const W_OBJECTIVE_WILDCARD = 0.5
const W_TONE = 2
const W_TONE_WILDCARD = 0.25
const W_DENSITY = 1

export function scoreVariant(
  variant: EmailComponentVariant,
  ctx: ComponentMatchContext,
): number {
  let s = 0

  // Objetivo do email (derivado do flow_type)
  const objectives = variant.objectives ?? []
  if (objectives.length === 0) {
    s += W_OBJECTIVE_WILDCARD
  } else if (ctx.objective && objectives.includes(ctx.objective)) {
    s += W_OBJECTIVE
  }

  // Tons (interseção com tom de voz da marca + tone_hint do outline)
  const tones = variant.tones ?? []
  if (tones.length === 0) {
    s += W_TONE_WILDCARD
  } else {
    const overlap = ctx.tones.filter((t) => tones.includes(t)).length
    s += overlap * W_TONE
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
