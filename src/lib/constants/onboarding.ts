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

/**
 * Países oferecidos no cadastro da loja (`client_stores.country`).
 *
 * ── Ampliada em 09/09/2026 ───────────────────────────────────────────
 *
 * Eram 15 países e faltavam justamente as praças em que a casa opera:
 * Lena Warszawa é `.pl`, Bryn Grill é dinamarquesa, Van Aldijk é `.nl`.
 * Sem a opção, essas lojas ficaram com o default 'BR' — e `country` é o
 * que alimenta o mapa país→fuso do sync (`COUNTRY_TIMEZONE`), então a
 * janela do relatório delas era cortada à meia-noite de São Paulo.
 *
 * `regiao` existe para o select agrupar: uma lista corrida de 50 itens
 * é pior de usar que a lista curta de antes.
 *
 * Os rótulos ganharam os acentos que faltavam ("Mexico" → "México",
 * "Japao" → "Japão"). Só o LABEL muda — o `value` é ISO 3166-1 alfa-2 e
 * é ele que está gravado no banco.
 */
export const COUNTRIES = [
  // América
  { value: "BR", label: "Brasil", regiao: "América" },
  { value: "US", label: "Estados Unidos", regiao: "América" },
  { value: "CA", label: "Canadá", regiao: "América" },
  { value: "MX", label: "México", regiao: "América" },
  { value: "AR", label: "Argentina", regiao: "América" },
  { value: "CL", label: "Chile", regiao: "América" },
  { value: "CO", label: "Colômbia", regiao: "América" },
  { value: "PE", label: "Peru", regiao: "América" },
  { value: "UY", label: "Uruguai", regiao: "América" },
  { value: "PY", label: "Paraguai", regiao: "América" },
  // Europa
  { value: "PT", label: "Portugal", regiao: "Europa" },
  { value: "ES", label: "Espanha", regiao: "Europa" },
  { value: "GB", label: "Reino Unido", regiao: "Europa" },
  { value: "IE", label: "Irlanda", regiao: "Europa" },
  { value: "FR", label: "França", regiao: "Europa" },
  { value: "DE", label: "Alemanha", regiao: "Europa" },
  { value: "IT", label: "Itália", regiao: "Europa" },
  { value: "NL", label: "Países Baixos", regiao: "Europa" },
  { value: "BE", label: "Bélgica", regiao: "Europa" },
  { value: "LU", label: "Luxemburgo", regiao: "Europa" },
  { value: "CH", label: "Suíça", regiao: "Europa" },
  { value: "AT", label: "Áustria", regiao: "Europa" },
  { value: "PL", label: "Polônia", regiao: "Europa" },
  { value: "CZ", label: "Tchéquia", regiao: "Europa" },
  { value: "SK", label: "Eslováquia", regiao: "Europa" },
  { value: "HU", label: "Hungria", regiao: "Europa" },
  { value: "RO", label: "Romênia", regiao: "Europa" },
  { value: "BG", label: "Bulgária", regiao: "Europa" },
  { value: "HR", label: "Croácia", regiao: "Europa" },
  { value: "GR", label: "Grécia", regiao: "Europa" },
  { value: "DK", label: "Dinamarca", regiao: "Europa" },
  { value: "SE", label: "Suécia", regiao: "Europa" },
  { value: "NO", label: "Noruega", regiao: "Europa" },
  { value: "FI", label: "Finlândia", regiao: "Europa" },
  { value: "IS", label: "Islândia", regiao: "Europa" },
  { value: "TR", label: "Turquia", regiao: "Europa" },
  // Ásia-Pacífico
  { value: "AU", label: "Austrália", regiao: "Ásia-Pacífico" },
  { value: "NZ", label: "Nova Zelândia", regiao: "Ásia-Pacífico" },
  { value: "JP", label: "Japão", regiao: "Ásia-Pacífico" },
  { value: "CN", label: "China", regiao: "Ásia-Pacífico" },
  { value: "HK", label: "Hong Kong", regiao: "Ásia-Pacífico" },
  { value: "SG", label: "Singapura", regiao: "Ásia-Pacífico" },
  { value: "KR", label: "Coreia do Sul", regiao: "Ásia-Pacífico" },
  { value: "IN", label: "Índia", regiao: "Ásia-Pacífico" },
  { value: "TH", label: "Tailândia", regiao: "Ásia-Pacífico" },
  // Oriente Médio e África
  { value: "AE", label: "Emirados Árabes Unidos", regiao: "Oriente Médio e África" },
  { value: "SA", label: "Arábia Saudita", regiao: "Oriente Médio e África" },
  { value: "IL", label: "Israel", regiao: "Oriente Médio e África" },
  { value: "ZA", label: "África do Sul", regiao: "Oriente Médio e África" },
  // Sempre por último: é a saída, não uma opção entre as outras.
  { value: "OTHER", label: "Outro", regiao: "Outro" },
] as const

/** Union type of valid country values */
export type CountryValue = (typeof COUNTRIES)[number]["value"]

/** Tuple of country values for Zod enum */
export const COUNTRY_VALUES = COUNTRIES.map((c) => c.value) as unknown as [
  CountryValue,
  ...CountryValue[],
]

/** Ordem em que as regiões aparecem no select — não é alfabética: as
 *  praças mais usadas primeiro. */
const ORDEM_DAS_REGIOES = [
  "América",
  "Europa",
  "Ásia-Pacífico",
  "Oriente Médio e África",
  "Outro",
] as const

/**
 * Países agrupados por região, para o `<SelectGroup>`.
 *
 * Deriva de COUNTRIES (não é uma segunda lista): país novo entra no
 * grupo sozinho, e não existe o modo de falha de adicionar num lugar e
 * esquecer do outro.
 */
export const COUNTRIES_BY_REGION = ORDEM_DAS_REGIOES.map((regiao) => ({
  regiao,
  paises: COUNTRIES.filter((c) => c.regiao === regiao),
})).filter((g) => g.paises.length > 0)


// ── País → fuso horário ──

/**
 * ISO-2 do país -> IANA. Mora AO LADO de COUNTRIES de propósito: quando
 * as duas listas viviam em arquivos diferentes, país novo entrava na
 * tela e não no mapa, e a loja caía no fuso padrão em silêncio. Um teste
 * cobra que todo país oferecido tenha fuso.
 *
 * Usado para alinhar a janela do sync ao painel do Omnisend, que agrega
 * em 00:00 do fuso da LOJA (não 00:00 UTC). Sem isso a fronteira captura
 * pedidos a mais/a menos (~1% do total). É FALLBACK: `client_stores.
 * timezone`, vindo da plataforma, tem precedência.
 */
export const COUNTRY_TIMEZONE: Record<string, string> = {
  BR: "America/Sao_Paulo",
  US: "America/New_York",
  CA: "America/Toronto",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  GB: "Europe/London",
  UK: "Europe/London",
  IE: "Europe/Dublin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  LU: "Europe/Luxembourg",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  // Acompanham a lista de países do cadastro (COUNTRIES): país que a
  // tela oferece e este mapa não conhece cairia no default São Paulo,
  // que é justamente o defeito que a ampliação existe para corrigir.
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  HR: "Europe/Zagreb",
  GR: "Europe/Athens",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  FI: "Europe/Helsinki",
  IS: "Atlantic/Reykjavik",
  TR: "Europe/Istanbul",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  JP: "Asia/Tokyo",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  SG: "Asia/Singapore",
  KR: "Asia/Seoul",
  IN: "Asia/Kolkata",
  TH: "Asia/Bangkok",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  ZA: "Africa/Johannesburg",
}

/** Nome do país, ou o próprio código quando ele não está na lista. */
export function countryLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return COUNTRIES.find((c) => c.value === value)?.label ?? value
}

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
