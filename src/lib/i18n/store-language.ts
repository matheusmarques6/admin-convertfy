/**
 * Idioma da loja — opções e conversão label ↔ código canônico.
 *
 * Módulo leve, sem dependências, importável tanto no client (opções do
 * formulário de onboarding) quanto no server (sincronização com
 * `client_stores.language`). Mantido separado de `lib/translations/tracking.ts`
 * para não puxar o arquivo grande de traduções para o bundle do formulário.
 *
 * A lista canônica cobre os 15 idiomas mais comuns dos ICPs do projeto
 * (EU + JP/CN/KR). Idiomas fora da lista são suportados via "Outro" +
 * texto livre: `confirmBriefing` (onboarding-pipeline.service.ts) faz
 * fallback pra string crua quando `languageLabelToCode` retorna null —
 * o agente Copy é LLM-based e entende qualquer rótulo.
 */

export type StoreLanguageCode =
  | "pt-BR"
  | "en"
  | "es"
  | "de"
  | "fr"
  | "it"
  | "nl"
  | "nb"
  | "sv"
  | "da"
  | "fi"
  | "pl"
  | "ja"
  | "zh"
  | "ko"

export const STORE_LANGUAGE_OPTIONS: { value: StoreLanguageCode; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "nb", label: "Norsk" },
  { value: "sv", label: "Svenska" },
  { value: "da", label: "Dansk" },
  { value: "fi", label: "Suomi" },
  { value: "pl", label: "Polski" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
]

/**
 * Aliases comuns em português + inglês pra cobrir labels não-canônicos
 * que aparecem em formulários ("norueguês" → "nb"). Reduz fallback livre
 * pros casos óbvios — só sobra `null` pra idiomas realmente exóticos.
 */
const LANGUAGE_ALIASES: Record<string, StoreLanguageCode> = {
  // português
  "português": "pt-BR",
  "portugues": "pt-BR",
  "portuguese": "pt-BR",
  "brasileiro": "pt-BR",
  "br": "pt-BR",
  // inglês
  "inglês": "en",
  "ingles": "en",
  "english": "en",
  // espanhol
  "espanhol": "es",
  "spanish": "es",
  // alemão
  "alemão": "de",
  "alemao": "de",
  "german": "de",
  // francês
  "francês": "fr",
  "frances": "fr",
  "french": "fr",
  // italiano
  "italian": "it",
  // holandês
  "holandês": "nl",
  "holandes": "nl",
  "dutch": "nl",
  // norueguês
  "norueguês": "nb",
  "noruegues": "nb",
  "norwegian": "nb",
  "no": "nb",
  // sueco
  "sueco": "sv",
  "swedish": "sv",
  // dinamarquês
  "dinamarquês": "da",
  "dinamarques": "da",
  "danish": "da",
  // finlandês
  "finlandês": "fi",
  "finlandes": "fi",
  "finnish": "fi",
  // polonês
  "polonês": "pl",
  "polones": "pl",
  "polish": "pl",
  // japonês
  "japonês": "ja",
  "japones": "ja",
  "japanese": "ja",
  // chinês
  "chinês": "zh",
  "chines": "zh",
  "chinese": "zh",
  "mandarim": "zh",
  // coreano
  "coreano": "ko",
  "korean": "ko",
}

/** Última opção do select — abre campo de texto livre para idiomas fora da lista. */
export const OTHER_LANGUAGE_LABEL = "Outro"

/**
 * Converte o label escolhido no formulário para o código canônico.
 * Retorna `null` quando não casa com nenhuma língua suportada nem aliases
 * (inclui "Outro" / texto livre desconhecido). Quando retorna null,
 * `confirmBriefing` faz fallback salvando o texto cru.
 */
export function languageLabelToCode(label: unknown): StoreLanguageCode | null {
  if (typeof label !== "string") return null
  const normalized = label.trim().toLowerCase()
  if (!normalized) return null

  // 1. Tenta match exato com value ou label das opções canônicas
  const direct = STORE_LANGUAGE_OPTIONS.find(
    (o) => o.label.toLowerCase() === normalized || o.value.toLowerCase() === normalized,
  )
  if (direct) return direct.value

  // 2. Tenta alias (norueguês → nb, francês → fr, etc.)
  if (normalized in LANGUAGE_ALIASES) return LANGUAGE_ALIASES[normalized]

  return null
}

/**
 * Converte o código canônico (`client_stores.language`) para o label amigável.
 * Retorna `null` quando não casa com nenhuma língua suportada — o caller decide
 * o fallback (ex.: exibir o próprio código cru).
 */
export function languageCodeToLabel(code: unknown): string | null {
  if (typeof code !== "string") return null
  const normalized = code.trim().toLowerCase()
  if (!normalized) return null
  const match = STORE_LANGUAGE_OPTIONS.find(
    (o) => o.value.toLowerCase() === normalized,
  )
  return match ? match.label : null
}
