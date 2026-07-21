/**
 * Dimensões de matching da biblioteca de componentes (Epic AE).
 *
 * Fonte única de objectives/tones/density/field-types — UI, API, deriver e
 * prompts referenciam estas listas (espelha o papel de component-categories).
 *
 * Os valores canônicos são os rótulos PT da maquete (armazenados como estão
 * no banco em `email_component_variants.objectives/tones`).
 */

/** Objetivos de email compatíveis com uma variante. */
export const COMPONENT_OBJECTIVES = [
  "Promoção",
  "Lançamento",
  "Boas-vindas",
  "Carrinho abandonado",
  "Restock / Volta ao estoque",
  "Newsletter",
  "Pós-compra",
  "Win-back",
  "Upsell",
] as const
export type ComponentObjective = (typeof COMPONENT_OBJECTIVES)[number]

/** Tons compatíveis com uma variante. */
export const COMPONENT_TONES = [
  "Urgente",
  "Aspiracional",
  "Educacional",
  "Descontraído",
  "Premium",
  "Amigável",
] as const
export type ComponentTone = (typeof COMPONENT_TONES)[number]

/** Rótulos PT da densidade (valores EN permanecem no banco/CHECK). */
export const DENSITY_LABELS_PT: Record<string, string> = {
  minimal: "baixa",
  balanced: "média",
  rich: "alta",
}

/** Tipos de campo do output_schema (slug no banco, rótulo PT na UI). */
export const FIELD_TYPES = [
  "text_short",
  "text_long",
  "number",
  "url",
  "image",
  "boolean",
] as const
export type ComponentFieldType = (typeof FIELD_TYPES)[number]

export const FIELD_TYPE_LABELS_PT: Record<ComponentFieldType, string> = {
  text_short: "Texto curto",
  text_long: "Texto longo",
  number: "Número",
  url: "URL",
  image: "Imagem",
  boolean: "Booleano",
}

/**
 * Deriva o objetivo canônico a partir do flow_type do email.
 * `custom` (e desconhecidos) → null (sem objetivo — variantes wildcard).
 */
export function flowTypeToObjective(
  flowType: string | null | undefined,
): ComponentObjective | null {
  switch ((flowType ?? "").trim()) {
    case "welcome":
      return "Boas-vindas"
    case "abandoned_cart":
    case "site_abandoned":
    case "browse_abandonment":
      return "Carrinho abandonado"
    case "upsell":
      return "Upsell"
    case "win_back":
      return "Win-back"
    case "post_purchase":
    case "shipping_stages":
      return "Pós-compra"
    default:
      return null
  }
}

// Keywords (lowercase, sem acento não é necessário — os textos do briefing
// vêm em PT com acento) → tom canônico. Ordem não importa: acumula todos.
const TONE_KEYWORDS: Array<[RegExp, ComponentTone]> = [
  [/urgen/i, "Urgente"],
  [/aspir|inspir|sofist/i, "Aspiracional"],
  [/educa|informat/i, "Educacional"],
  [/descontra|divertid|casual|leve/i, "Descontraído"],
  [/premium|luxo|formal|elegan/i, "Premium"],
  [/amig|acolhedor|afetiv|próxim|proxim/i, "Amigável"],
]

/**
 * Deriva os tons canônicos a partir do tom de voz da marca (briefing) e do
 * tone_hint do outline. Retorna lista sem duplicatas (pode ser vazia).
 */
export function deriveToneKeys(
  tomVoz: string | null | undefined,
  toneHint?: string | null,
): ComponentTone[] {
  const text = [tomVoz ?? "", toneHint ?? ""].join(" ").trim()
  if (!text) return []
  const out: ComponentTone[] = []
  for (const [re, tone] of TONE_KEYWORDS) {
    if (re.test(text) && !out.includes(tone)) out.push(tone)
  }
  return out
}
