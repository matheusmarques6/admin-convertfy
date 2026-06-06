/**
 * block-copy-fields — extrai os campos de COPY (texto) de um bloco de email,
 * type-aware, para a view "Copy do email" (texto formatado pro designer).
 *
 * Por que existe: a view de copy antes lia uma lista FIXA de chaves
 * (headline/body/cta_text/code/hint/products), então blocos dos tipos novos
 * (cta→`text`, features→`items[]`, testimonials→`items[]`, social_proof→
 * `number/label/rating`, header→`tagline`, comparison→`rows[]`, letter→...)
 * saíam vazios e eram ocultados. Aqui cobrimos os 18 tipos, espelhando o que
 * `render-html.ts` renderiza e os schemas de `@/types/email-workspace`.
 *
 * Função pura (sem deps de server/client) — testável e reusável.
 */

import type {
  EmailBlock,
  HeroBlockContent,
  TextBlockContent,
  CouponBlockContent,
  ProductsBlockContent,
  FooterBlockContent,
  ImageBlockContent,
  CtaBlockContent,
  HeaderBlockContent,
  HeadlineBlockContent,
  FeaturesBlockContent,
  SocialProofBlockContent,
  TestimonialsBlockContent,
  UrgencyBlockContent,
  ComparisonBlockContent,
  StoryBlockContent,
  LetterBlockContent,
} from "@/types/email-workspace"

export interface BlockCopyField {
  key: string
  label: string
  value: string
}

/** Coage a string trimada não-vazia, ou "". */
function s(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : ""
}

/** Estrela visual a partir de uma nota 0-5 (ex: 4 → "★★★★☆"). */
function stars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)))
  return "★".repeat(r) + "☆".repeat(5 - r)
}

/**
 * Retorna os campos de copy legíveis de um bloco, na ordem de exibição.
 * Tipos sem copy (image/divider/spacer) retornam [].
 */
export function blockCopyFields(block: EmailBlock): BlockCopyField[] {
  const content = (block.content ?? {}) as Record<string, unknown>
  const out: BlockCopyField[] = []
  const push = (key: string, label: string, value: string) => {
    if (value) out.push({ key, label, value })
  }

  switch (block.block_type) {
    case "hero": {
      const c = content as HeroBlockContent
      push("eyebrow", "Eyebrow", s(c.eyebrow))
      push("headline", "Headline", s(c.headline))
      push("body", "Body", s(c.body))
      push("cta_text", "CTA", s(c.cta_text))
      break
    }
    case "headline": {
      const c = content as HeadlineBlockContent
      push("eyebrow", "Eyebrow", s(c.eyebrow))
      push("headline", "Headline", s(c.headline))
      break
    }
    case "text":
    case "urgency": {
      const c = content as TextBlockContent & UrgencyBlockContent
      push("headline", "Headline", s(c.headline))
      push("body", "Body", s(c.body))
      break
    }
    case "story": {
      const c = content as StoryBlockContent
      push("headline", "Headline", s(c.headline))
      push("body", "Body", s(c.body))
      push("cta_text", "CTA", s(c.cta_text))
      break
    }
    case "coupon": {
      const c = content as CouponBlockContent
      push("code", "Cupom", s(c.code))
      push("hint", "Validade", s(c.hint))
      push("cta_text", "CTA", s(c.cta_text))
      break
    }
    case "cta": {
      const c = content as unknown as CtaBlockContent
      push("text", "CTA", s(c.text))
      break
    }
    case "header": {
      const c = content as HeaderBlockContent
      push("tagline", "Tagline", s(c.tagline))
      break
    }
    case "products": {
      const c = content as ProductsBlockContent
      push("title", "Título", s(c.title))
      const products = Array.isArray(c.products) ? c.products : []
      if (products.length > 0) {
        const txt = products
          .map(
            (p, i) =>
              `${i + 1}. ${s(p.name)} (${p.price ?? ""})${
                s(p.cta_text) ? ` — ${s(p.cta_text)}` : ""
              }`,
          )
          .join("\n")
        push("products", "Produtos", txt)
      }
      break
    }
    case "features": {
      const c = content as FeaturesBlockContent
      const items = Array.isArray(c.items) ? c.items : []
      if (items.length > 0) {
        const txt = items
          .map((it) => `${s(it.icon)} ${s(it.label)}`.trim())
          .filter(Boolean)
          .join("\n")
        push("items", "Features", txt)
      }
      break
    }
    case "social_proof": {
      const c = content as SocialProofBlockContent
      push("number", "Número", s(c.number))
      push("label", "Label", s(c.label))
      if (typeof c.rating === "number" && c.rating > 0) {
        push("rating", "Avaliação", `${stars(c.rating)} (${c.rating})`)
      }
      push("body", "Body", s(c.body))
      break
    }
    case "testimonials": {
      const c = content as TestimonialsBlockContent
      push("headline", "Headline", s(c.headline))
      const items = Array.isArray(c.items) ? c.items : []
      items.forEach((it, i) => {
        const ratingTxt =
          typeof it.rating === "number" && it.rating > 0
            ? ` (${stars(it.rating)})`
            : ""
        const val = `"${s(it.quote)}" — ${s(it.author)}${ratingTxt}`.trim()
        if (s(it.quote) || s(it.author)) {
          push(`testimonial_${i}`, `Depoimento ${i + 1}`, val)
        }
      })
      break
    }
    case "comparison": {
      const c = content as ComparisonBlockContent
      push("headline", "Headline", s(c.headline))
      const rows = Array.isArray(c.rows) ? c.rows : []
      if (rows.length > 0) {
        const us = s(c.us_label) || "Nós"
        const them = s(c.them_label) || "Outros"
        const txt = rows
          .map((r) => `${s(r.label)}: ${us}=${s(r.us)} | ${them}=${s(r.them)}`)
          .join("\n")
        push("rows", "Comparação", txt)
      }
      break
    }
    case "letter": {
      const c = content as LetterBlockContent
      push("greeting", "Saudação", s(c.greeting))
      push("body", "Body", s(c.body))
      push("signoff", "Despedida", s(c.signoff))
      push("author", "Assinatura", s(c.author))
      break
    }
    case "footer": {
      const c = content as FooterBlockContent & { body?: string }
      // n8n às vezes entrega o rodapé como texto livre em `body`.
      push("body", "Body", s(c.body))
      push("copyright", "Copyright", s(c.copyright))
      const columns = Array.isArray(c.columns) ? c.columns : []
      const links = columns
        .flatMap((col) => (Array.isArray(col.links) ? col.links : []))
        .map((l) => s(l.label))
        .filter(Boolean)
      if (links.length > 0) push("links", "Links", links.join(" · "))
      break
    }
    case "image": {
      const c = content as unknown as ImageBlockContent
      push("image_alt", "Alt", s(c.image_alt))
      break
    }
    // divider / spacer: sem copy
    default:
      break
  }

  return out
}
