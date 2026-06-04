/**
 * Shot archetype resolution para o image agent master prompt v2.
 *
 * Mapeia (flowType, emailNumber, blockType, blockLabel, blueprintPurpose,
 * mode) para um dos 8 archetypes que o System Prompt v2 entende. O prompt
 * tem fallback interno ("INFER deterministically if empty"), mas resolver
 * aqui garante consistência entre preview (resolve-block-prompt) e batch
 * (phase2-runner) e permite logar o source pra observabilidade.
 *
 * Regras:
 *   - Welcome E1..E6 espelha o mapeamento curado da v1 (E5 fachada loja,
 *     E4 aspiracional, E3 prova de uso, E2 still produto, E1/E6 contextual).
 *   - Fora de welcome, heurística por label/purpose (palavras-chave) +
 *     blockType + mode + flowType com defaults razoáveis.
 *   - Fallback final: `hero_contextual`.
 */

export type ShotArchetype =
  | "packshot_hero"
  | "hero_contextual"
  | "lifestyle_action"
  | "demonstration"
  | "problem_pain"
  | "worn_editorial"
  | "aspirational_intimate"
  | "brand_establishing"

export interface ShotArchetypeInput {
  blockType?: string | null
  blockLabel?: string | null
  blueprintPurpose?: string | null
  mode?: "product_ref" | "text2img" | null
  emailNumber?: number | null
  flowType?: string | null
}

const WELCOME_ARCHETYPE_BY_EMAIL: Record<number, ShotArchetype> = {
  1: "hero_contextual",
  2: "packshot_hero",
  3: "demonstration",
  4: "aspirational_intimate",
  5: "brand_establishing",
  6: "hero_contextual",
}

const RE_LIFESTYLE = /uso|in[- ]use|action|como usar|usando|hands?[- ]on/i
const RE_DEMO = /antes.*depois|benef[ií]cio|prova|demo|funcionamento|resultado/i
const RE_PAIN = /dor|problema|pain|frustra|sem o produto/i

export function deriveShotArchetype(input: ShotArchetypeInput): ShotArchetype {
  const {
    blockType,
    blockLabel,
    blueprintPurpose,
    mode,
    emailNumber,
    flowType,
  } = input

  if (flowType === "welcome" && emailNumber != null) {
    const fromMatrix = WELCOME_ARCHETYPE_BY_EMAIL[emailNumber]
    if (fromMatrix) return fromMatrix
  }

  const labelText = `${blockLabel ?? ""} ${blueprintPurpose ?? ""}`

  if (RE_LIFESTYLE.test(labelText)) return "lifestyle_action"
  if (RE_DEMO.test(labelText)) return "demonstration"
  if (RE_PAIN.test(labelText) && mode === "text2img") return "problem_pain"

  if (blockType === "hero") {
    if (mode === "product_ref") return "packshot_hero"
    if (mode === "text2img") return "hero_contextual"
  }

  if (flowType === "browse_abandonment" || flowType === "win_back") {
    return "aspirational_intimate"
  }
  if (flowType === "abandoned_cart") {
    return "hero_contextual"
  }

  return "hero_contextual"
}
