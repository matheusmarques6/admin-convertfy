/**
 * Categorias de negócio da biblioteca de componentes (Epic AE).
 *
 * A biblioteca (email_component_variants) é organizada por SEÇÃO de email,
 * não pelos 19 block_types técnicos. O blueprint continua gerando os 19
 * tipos; o assembler traduz cada bloco para a seção via blockTypeToCategory
 * ao buscar candidatos. Fonte única — UI, API, CHECK do banco e assembler
 * referenciam estas chaves.
 */

export interface ComponentCategory {
  key: string
  label: string
}

export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  { key: "header", label: "Header / Navegação" },
  { key: "hero", label: "Hero" },
  { key: "body", label: "Value Proposition / Body" },
  { key: "products", label: "Produtos / Grade" },
  { key: "reviews", label: "Reviews / Prova Social" },
  { key: "cta", label: "CTA" },
  { key: "offer", label: "Oferta / Promo / Desconto" },
  { key: "footer", label: "Footer" },
]

export const COMPONENT_CATEGORY_KEYS: string[] = COMPONENT_CATEGORIES.map(
  (c) => c.key,
)

// Mapa block_type do blueprint (19 técnicos) → seção da biblioteca (8).
// divider/spacer são estruturais (sem componente curado): ausentes = ignorados,
// e o assembler pula o bloco (o agente HTML cuida do espaçamento).
const BLOCKTYPE_TO_CATEGORY: Record<string, string> = {
  header: "header",
  hero: "hero",
  image: "hero",
  text: "body",
  headline: "body",
  features: "body",
  comparison: "body",
  story: "body",
  letter: "body",
  products: "products",
  testimonials: "reviews",
  social_proof: "reviews",
  cta: "cta",
  coupon: "offer",
  urgency: "offer",
  footer: "footer",
  social: "footer",
}

/** Traduz um block_type do blueprint para a seção de componente, ou null. */
export function blockTypeToCategory(blockType: string): string | null {
  return BLOCKTYPE_TO_CATEGORY[blockType] ?? null
}
