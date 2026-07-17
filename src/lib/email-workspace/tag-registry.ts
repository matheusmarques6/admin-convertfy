/**
 * tag-registry — vocabulário CANÔNICO e FECHADO de placeholders `{{TAG}}`
 * dos HTML references (biblioteca `email_component_variants` e
 * `store_email_references`).
 *
 * Fonte única da verdade da correlação TAG → bloco técnico → campo de copy →
 * orçamento de caracteres. Espelha `docs/email-reference-tags.md` (v1.1) e os
 * guarda-corpos de `copy-spec.ts` — o teste `tag-registry.test.ts` garante que
 * nenhum orçamento viola os ABSOLUTE_BOUNDS.
 *
 * Tags indexadas (`PRODUCT_1_NAME`, `USP_2_TITLE`) são normalizadas com `_N`
 * (`PRODUCT_N_NAME`) para lookup — use `lookupTag()`.
 *
 * Funções puras (sem deps de server/client) — testáveis e reusáveis.
 */

/** O que a tag representa no template. */
export type TagKind =
  // Texto gerado pelo agente de copy — entra no copy_spec do bloco.
  | "copy"
  // Slot de imagem gerada/real — liga needs_image do bloco.
  | "image"
  // href — preenchido com URL real (produto, CTA, social). Nunca copy.
  | "url"
  // Dado da loja/produto/sistema (nome, preço, logo, alt, ícone, ano).
  | "data"

export interface TagSpec {
  /** Seção da nomenclatura (HERO, BODY, OFFER...). META = tag de documento. */
  section: string
  /**
   * block_type técnico do blueprint (um dos 19 de ALLOWED_BLOCK_TYPES).
   * null para tags de documento (EMAIL_TITLE, PREHEADER...) que não formam
   * bloco.
   */
  blockType: string | null
  /** Chave no copy_spec/content quando kind='copy' (headline, body, cta...). */
  copyKey: string | null
  kind: TagKind
  /** Orçamento de caracteres (só kind='copy'). */
  min?: number
  max?: number
}

// Helper compacto p/ declarar entradas.
const copy = (
  section: string,
  blockType: string,
  copyKey: string,
  min: number,
  max: number,
): TagSpec => ({ section, blockType, copyKey, kind: "copy", min, max })
const img = (section: string, blockType: string): TagSpec => ({
  section,
  blockType,
  copyKey: null,
  kind: "image",
})
const url = (section: string, blockType: string | null): TagSpec => ({
  section,
  blockType,
  copyKey: null,
  kind: "url",
})
const data = (section: string, blockType: string | null): TagSpec => ({
  section,
  blockType,
  copyKey: null,
  kind: "data",
})

/**
 * Registry canônico. Chaves com índices normalizados: todo `_<dígitos>` vira
 * `_N` (ex.: `PRODUCT_1_THUMB_2` → `PRODUCT_N_THUMB_N`).
 */
export const TAG_REGISTRY: Record<string, TagSpec> = {
  // ── Meta (documento — não formam bloco) ──────────────────────────
  EMAIL_TITLE: data("META", null),
  PREHEADER: data("META", null),
  BRAND_NAME: data("META", null),
  YEAR: data("META", null),
  WEBSITE_URL: url("META", null),

  // ── Header ───────────────────────────────────────────────────────
  LOGO: data("HEADER", "header"),
  LOGO_URL: data("HEADER", "header"),
  HEADER_LINK_N_LABEL: data("HEADER", "header"),
  HEADER_LINK_N_URL: url("HEADER", "header"),

  // ── Hero ─────────────────────────────────────────────────────────
  HERO_EYEBROW: copy("HERO", "hero", "eyebrow", 8, 24),
  HERO_HEADLINE: copy("HERO", "hero", "headline", 18, 40),
  HERO_HEADLINE_LINE_N: copy("HERO", "hero", "headline", 12, 24),
  HERO_SUBHEAD: copy("HERO", "hero", "subhead", 30, 90),
  HERO_BODY: copy("HERO", "hero", "body", 120, 210),
  HERO_CTA_LABEL: copy("HERO", "hero", "cta", 8, 16),
  HERO_CTA_N_LABEL: copy("HERO", "hero", "cta", 8, 16),
  HERO_CTA_URL: url("HERO", "hero"),
  HERO_CTA_N_URL: url("HERO", "hero"),
  HERO_IMAGE: img("HERO", "hero"),
  HERO_IMAGE_ALT: data("HERO", "hero"),

  // ── Seção de texto ───────────────────────────────────────────────
  BODY_TITLE: copy("BODY", "text", "title", 20, 50),
  BODY_SUBHEAD: copy("BODY", "text", "subhead", 30, 90),
  BODY_TEXT: copy("BODY", "text", "body", 120, 280),
  BODY_TEXT_N: copy("BODY", "text", "body", 80, 220),
  BODY_QUOTE_LINE_N: copy("BODY", "text", "quote", 15, 60),
  BODY_CTA_LABEL: copy("BODY", "text", "cta", 8, 20),
  BODY_CTA_URL: url("BODY", "text"),
  BODY_IMAGE: img("BODY", "text"),
  BODY_IMAGE_N: img("BODY", "text"),
  BODY_IMAGE_ALT: data("BODY", "text"),
  BODY_BG_IMAGE: data("BODY", "text"),

  // ── Oferta / Cupom ───────────────────────────────────────────────
  OFFER_EYEBROW: copy("OFFER", "coupon", "eyebrow", 6, 24),
  OFFER_HEADLINE: copy("OFFER", "coupon", "headline", 15, 40),
  OFFER_BODY: copy("OFFER", "coupon", "body", 60, 140),
  OFFER_VALUE: copy("OFFER", "coupon", "value", 4, 16),
  COUPON_CODE: copy("OFFER", "coupon", "code", 4, 15),
  COUPON_HINT: copy("OFFER", "coupon", "hint", 20, 90),
  OFFER_CTA_LABEL: copy("OFFER", "coupon", "cta", 8, 20),
  OFFER_CTA_URL: url("OFFER", "coupon"),

  // ── Produtos ─────────────────────────────────────────────────────
  PRODUCTS_TITLE: copy("PRODUCTS", "products", "heading", 15, 40),
  PRODUCTS_SUBHEAD: copy("PRODUCTS", "products", "subtitle", 20, 80),
  PRODUCTS_CTA_LABEL: copy("PRODUCTS", "products", "cta", 8, 20),
  PRODUCTS_CTA_URL: url("PRODUCTS", "products"),
  PRODUCTS_IMAGE: img("PRODUCTS", "products"),
  PRODUCTS_IMAGE_ALT: data("PRODUCTS", "products"),
  PRODUCTS_BG_IMAGE: data("PRODUCTS", "products"),
  PRODUCT_CTA_LABEL: copy("PRODUCTS", "products", "cta", 6, 16),
  PRODUCT_N_NAME: data("PRODUCTS", "products"),
  PRODUCT_N_PRICE: data("PRODUCTS", "products"),
  PRODUCT_N_COMPARE_PRICE: data("PRODUCTS", "products"),
  PRODUCT_N_REVIEWS_COUNT: data("PRODUCTS", "products"),
  PRODUCT_N_DESC: copy("PRODUCTS", "products", "desc", 40, 90),
  PRODUCT_N_DESC_N: copy("PRODUCTS", "products", "desc", 40, 90),
  PRODUCT_N_SUBHEAD: copy("PRODUCTS", "products", "subtitle", 10, 40),
  PRODUCT_N_USP_N: copy("PRODUCTS", "products", "usp", 8, 35),
  PRODUCT_N_CTA_LABEL: copy("PRODUCTS", "products", "cta", 6, 16),
  PRODUCT_N_URL: url("PRODUCTS", "products"),
  PRODUCT_N_IMAGE: img("PRODUCTS", "products"),
  PRODUCT_N_IMAGE_ALT: data("PRODUCTS", "products"),
  PRODUCT_N_THUMB_N: img("PRODUCTS", "products"),

  // ── USPs / Benefícios / Passos ───────────────────────────────────
  USP_HEADLINE: copy("USP", "features", "headline", 15, 40),
  USP_N_TITLE: copy("USP", "features", "title", 12, 30),
  USP_N_SUBHEAD: copy("USP", "features", "subtitle", 10, 60),
  USP_N_TEXT: copy("USP", "features", "text", 60, 120),
  USP_N_ICON: data("USP", "features"),
  USP_ICON: data("USP", "features"),
  USP_N_IMAGE: img("USP", "features"),
  USP_N_IMAGE_ALT: data("USP", "features"),
  STEP_N_TITLE: copy("USP", "features", "title", 8, 30),
  STEP_N_TEXT: copy("USP", "features", "text", 40, 100),
  STEP_N_IMAGE: img("USP", "features"),
  STEP_N_NUMBER: data("USP", "features"),

  // ── Reviews / Prova social ───────────────────────────────────────
  REVIEWS_TITLE: copy("REVIEWS", "testimonials", "title", 15, 40),
  REVIEWS_TEXT: copy("REVIEWS", "testimonials", "intro", 40, 140),
  REVIEWS_CTA_LABEL: copy("REVIEWS", "testimonials", "cta", 8, 20),
  REVIEWS_CTA_URL: url("REVIEWS", "testimonials"),
  REVIEWS_IMAGE: img("REVIEWS", "testimonials"),
  REVIEWS_IMAGE_ALT: data("REVIEWS", "testimonials"),
  REVIEW_N_TEXT: copy("REVIEWS", "testimonials", "text", 55, 85),
  REVIEW_N_NAME: copy("REVIEWS", "testimonials", "author", 5, 30),
  REVIEW_N_META: copy("REVIEWS", "testimonials", "meta", 5, 40),
  REVIEW_VERIFIED_LABEL: copy("REVIEWS", "testimonials", "label", 8, 25),
  REVIEW_N_RATING: data("REVIEWS", "testimonials"),
  REVIEW_N_IMAGE: data("REVIEWS", "testimonials"),
  REVIEW_N_INITIAL: data("REVIEWS", "testimonials"),
  REVIEW_N_PHOTOS: data("REVIEWS", "testimonials"),
  REVIEW_N_URL: url("REVIEWS", "testimonials"),
  BADGE_N_TEXT: copy("REVIEWS", "testimonials", "label", 8, 30),
  BADGE_N_ICON: data("REVIEWS", "testimonials"),

  // ── Urgência / Countdown ─────────────────────────────────────────
  URGENCY_HEADLINE: copy("URGENCY", "urgency", "headline", 20, 45),
  URGENCY_TEXT: copy("URGENCY", "urgency", "text", 60, 140),
  COUNTDOWN_DD: data("URGENCY", "urgency"),
  COUNTDOWN_HH: data("URGENCY", "urgency"),
  COUNTDOWN_MM: data("URGENCY", "urgency"),
  COUNTDOWN_SS: data("URGENCY", "urgency"),
  COUNTDOWN_DD_LABEL: copy("URGENCY", "urgency", "label", 4, 10),
  COUNTDOWN_HH_LABEL: copy("URGENCY", "urgency", "label", 4, 10),
  COUNTDOWN_MM_LABEL: copy("URGENCY", "urgency", "label", 4, 10),
  COUNTDOWN_SS_LABEL: copy("URGENCY", "urgency", "label", 4, 10),

  // ── CTA de fechamento / genérico ─────────────────────────────────
  FINAL_CTA_HEADLINE: copy("CTA", "cta", "headline", 20, 45),
  FINAL_CTA_TEXT: copy("CTA", "cta", "text", 40, 120),
  FINAL_CTA_LABEL: copy("CTA", "cta", "cta", 8, 20),
  FINAL_CTA_URL: url("CTA", "cta"),
  CTA_LABEL: copy("CTA", "cta", "cta", 8, 20),
  CTA_URL: url("CTA", "cta"),

  // ── Footer ───────────────────────────────────────────────────────
  FOOTER_TAGLINE: copy("FOOTER", "footer", "tagline", 10, 90),
  FOOTER_TEXT: copy("FOOTER", "footer", "text", 40, 200),
  FOOTER_ADDRESS: data("FOOTER", "footer"),
  FOOTER_LINK_N_LABEL: data("FOOTER", "footer"),
  FOOTER_LINK_N_URL: url("FOOTER", "footer"),
  INSTAGRAM_URL: url("FOOTER", "footer"),
  FACEBOOK_URL: url("FOOTER", "footer"),
  TIKTOK_URL: url("FOOTER", "footer"),
  PINTEREST_URL: url("FOOTER", "footer"),
  YOUTUBE_URL: url("FOOTER", "footer"),
  INSTAGRAM_ICON: data("FOOTER", "footer"),
  FACEBOOK_ICON: data("FOOTER", "footer"),
  TIKTOK_ICON: data("FOOTER", "footer"),
  PINTEREST_ICON: data("FOOTER", "footer"),
  YOUTUBE_ICON: data("FOOTER", "footer"),
  UNSUBSCRIBE_LABEL: data("FOOTER", "footer"),
  UNSUBSCRIBE_URL: url("FOOTER", "footer"),
  PREFERENCES_LABEL: data("FOOTER", "footer"),
  PREFERENCES_URL: url("FOOTER", "footer"),
}

/** Normaliza índices numéricos: `PRODUCT_1_THUMB_2` → `PRODUCT_N_THUMB_N`. */
export function normalizeTagName(tag: string): string {
  return tag.replace(/_\d+/g, "_N")
}

/**
 * Busca a spec de uma tag (aceita indexada ou normalizada).
 * null = tag fora do vocabulário canônico.
 */
export function lookupTag(tag: string): TagSpec | null {
  return TAG_REGISTRY[tag] ?? TAG_REGISTRY[normalizeTagName(tag)] ?? null
}
