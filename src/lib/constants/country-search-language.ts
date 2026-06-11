/**
 * Mapa país → idioma usado pra BUSCAR trends nesse mercado.
 *
 * IMPORTANTE: este idioma é diferente de `client_stores.language`
 * (que é o idioma do email). Aqui é o idioma das queries que o agente
 * usa pra capturar tendências culturais/sociais locais — sem isso,
 * "trends Deutschland" sai em inglês e perde sinal real do mercado.
 *
 * Cobre os 16 países canônicos do onboarding (lib/constants/onboarding.COUNTRIES).
 */

export interface CountrySearchLocale {
  /** BCP-47 simplificado: pt, en, de, fr, it, es, ja */
  code: string
  /** Nome do idioma em inglês — vai literal no system prompt */
  name: string
  /** Queries-template em idioma local pra hint do prompt */
  hints: string[]
}

export const COUNTRY_SEARCH_LOCALE: Record<string, CountrySearchLocale> = {
  BR: {
    code: "pt",
    name: "Portuguese (Brazilian)",
    hints: [
      "tendências consumo Brasil",
      "viral TikTok Brasil",
      "eventos culturais brasileiros",
      "o que está em alta",
    ],
  },
  PT: {
    code: "pt",
    name: "Portuguese (European)",
    hints: [
      "tendências Portugal",
      "viral TikTok Portugal",
      "cultura popular portuguesa",
    ],
  },
  US: {
    code: "en",
    name: "English (US)",
    hints: [
      "trending products this week",
      "viral TikTok USA",
      "cultural events United States",
      "US retail trends",
    ],
  },
  GB: {
    code: "en",
    name: "English (UK)",
    hints: [
      "UK trending",
      "viral content Britain",
      "UK cultural events",
      "British retail trends",
    ],
  },
  // Back-compat com seed inicial (commemorative_dates usa 'UK')
  UK: {
    code: "en",
    name: "English (UK)",
    hints: ["UK trending", "viral content Britain", "UK cultural events"],
  },
  DE: {
    code: "de",
    name: "German",
    hints: [
      "Trends Deutschland",
      "virale Inhalte Deutschland",
      "Verbraucher Einzelhandel",
      "was ist im Trend",
    ],
  },
  FR: {
    code: "fr",
    name: "French",
    hints: [
      "tendances France",
      "viral TikTok France",
      "événements culturels",
      "qu'est-ce qui est tendance",
    ],
  },
  IT: {
    code: "it",
    name: "Italian",
    hints: [
      "tendenze Italia",
      "virali TikTok Italia",
      "eventi culturali italiani",
    ],
  },
  ES: {
    code: "es",
    name: "Spanish (Spain)",
    hints: [
      "tendencias España",
      "viral TikTok España",
      "eventos culturales españoles",
    ],
  },
  MX: {
    code: "es",
    name: "Spanish (Mexico)",
    hints: ["tendencias México", "viral TikTok México", "qué está de moda"],
  },
  AR: {
    code: "es",
    name: "Spanish (Argentina)",
    hints: ["tendencias Argentina", "viral TikTok Argentina"],
  },
  CO: {
    code: "es",
    name: "Spanish (Colombia)",
    hints: ["tendencias Colombia", "viral TikTok Colombia"],
  },
  CL: {
    code: "es",
    name: "Spanish (Chile)",
    hints: ["tendencias Chile", "viral TikTok Chile"],
  },
  CA: {
    code: "en",
    name: "English (Canada)",
    hints: ["Canadian trends", "viral TikTok Canada"],
  },
  AU: {
    code: "en",
    name: "English (Australia)",
    hints: ["Australian trends", "viral TikTok Australia"],
  },
  JP: {
    code: "ja",
    name: "Japanese",
    hints: ["日本 トレンド", "バイラル TikTok 日本", "話題のニュース"],
  },
}

const FALLBACK_LOCALE: CountrySearchLocale = {
  code: "en",
  name: "English",
  hints: ["global trends", "viral content"],
}

export function getSearchLocale(country: string | null | undefined): CountrySearchLocale {
  const code = (country || "").toUpperCase()
  return COUNTRY_SEARCH_LOCALE[code] ?? FALLBACK_LOCALE
}
