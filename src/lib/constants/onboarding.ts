/**
 * Shared onboarding constants used by:
 * - Public onboarding form (/cliente/onboarding)
 * - Portal onboarding wizard (/portal/onboarding/wizard)
 * - Zod schema validation (public-onboarding.schema.ts)
 *
 * Single source of truth for platform, country, language, and shipping options.
 */

// ── Platforms ──

export const PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "tray", label: "Tray" },
  { value: "vtex", label: "VTEX" },
  { value: "dupla_estrutura", label: "Dupla Estrutura" },
  { value: "other", label: "Outra" },
] as const

/** Union type of valid platform values */
export type PlatformValue = (typeof PLATFORMS)[number]["value"]

/** Tuple of platform values for Zod enum */
export const PLATFORM_VALUES = PLATFORMS.map((p) => p.value) as unknown as [
  PlatformValue,
  ...PlatformValue[],
]

// ── Countries ──

export const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "US", label: "Estados Unidos" },
  { value: "PT", label: "Portugal" },
  { value: "ES", label: "Espanha" },
  { value: "MX", label: "Mexico" },
  { value: "AR", label: "Argentina" },
  { value: "CO", label: "Colombia" },
  { value: "CL", label: "Chile" },
  { value: "DE", label: "Alemanha" },
  { value: "FR", label: "Franca" },
  { value: "IT", label: "Italia" },
  { value: "GB", label: "Reino Unido" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "JP", label: "Japao" },
  { value: "OTHER", label: "Outro" },
] as const

/** Union type of valid country values */
export type CountryValue = (typeof COUNTRIES)[number]["value"]

/** Tuple of country values for Zod enum */
export const COUNTRY_VALUES = COUNTRIES.map((c) => c.value) as unknown as [
  CountryValue,
  ...CountryValue[],
]

// ── Languages ──

export const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
  { value: "other", label: "Outro" },
] as const

/** Union type of valid language values */
export type LanguageValue = (typeof LANGUAGES)[number]["value"]

/** Tuple of language values for Zod enum */
export const LANGUAGE_VALUES = LANGUAGES.map((l) => l.value) as unknown as [
  LanguageValue,
  ...LanguageValue[],
]

// ── Shipping Types ──

export const SHIPPING_TYPES = [
  { value: "all", label: "Frete gratis total" },
  { value: "conditional", label: "Frete gratis condicional" },
  { value: "none", label: "Sem frete gratis" },
] as const

/** Union type of valid shipping type values */
export type ShippingTypeValue = (typeof SHIPPING_TYPES)[number]["value"]

/** Tuple of shipping type values for Zod enum */
export const SHIPPING_TYPE_VALUES = SHIPPING_TYPES.map((s) => s.value) as unknown as [
  ShippingTypeValue,
  ...ShippingTypeValue[],
]

// ── Price Sensitivities ──

export const PRICE_SENSITIVITIES = [
  { value: "price", label: "Preco" },
  { value: "balanced", label: "Equilibrado" },
  { value: "quality", label: "Qualidade" },
] as const

/** Union type of valid price sensitivity values */
export type PriceSensitivityValue = (typeof PRICE_SENSITIVITIES)[number]["value"]

/** Tuple of price sensitivity values for Zod enum */
export const PRICE_SENSITIVITY_VALUES = PRICE_SENSITIVITIES.map((p) => p.value) as unknown as [
  PriceSensitivityValue,
  ...PriceSensitivityValue[],
]

// ── Shopify Admin API Scopes ──
// These must match the scopes in src/app/api/integrations/shopify/authorize/route.ts

export const SHOPIFY_SCOPES = [
  { scope: "read_products", label: "Produtos" },
  { scope: "read_orders", label: "Pedidos" },
  { scope: "read_customers", label: "Clientes" },
  { scope: "read_inventory", label: "Inventario" },
  { scope: "read_analytics", label: "Analytics" },
] as const
