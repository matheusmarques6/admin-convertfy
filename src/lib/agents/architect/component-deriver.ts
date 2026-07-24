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

// ── Shuffle semeado (anti-viés de posição, reprodutível) ───────────
//
// O Curador (LLM) tem viés de posição: tende a escolher o 1º candidato da
// lista. Como o pré-filtro entrega os candidatos em ordem de score, o topo é
// SEMPRE a mesma variante → "escolhe sempre os mesmos emails". Embaralhamos a
// APRESENTAÇÃO com um PRNG semeado por (loja, flow, email, bloco): a ordem varia
// entre lojas E entre emails, mas o MESMO email regenera com a MESMA ordem
// (idempotente — não quebra o reuso de reference persistida). O fallback
// determinístico continua usando a ordem por score (não embaralhada).

/** Hash FNV-1a 32-bit de partes arbitrárias → seed estável. */
export function seedFrom(...parts: Array<string | number>): number {
  let h = 0x811c9dc5
  const str = parts.join(":")
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** PRNG determinístico mulberry32. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates semeado — retorna uma NOVA array embaralhada de forma
 * REPRODUTÍVEL para o mesmo seed (não muta a original).
 */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice()
  const rnd = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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
