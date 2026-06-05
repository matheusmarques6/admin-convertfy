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

// Tuple non-empty derivado de STORE_LANGUAGE_OPTIONS — usado pelo
// z.enum() no PATCH `/api/admin/stores/[id]` e por qualquer validacao
// que precise da lista canonica. Fonte unica: mexeu em
// STORE_LANGUAGE_OPTIONS, este export atualiza junto.
export const STORE_LANGUAGE_CODES = STORE_LANGUAGE_OPTIONS.map((o) => o.value) as [
  StoreLanguageCode,
  ...StoreLanguageCode[],
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

/**
 * Resultado da resolução de idioma:
 *   - `code`: valor a persistir em `client_stores.language` e enviar no webhook
 *     como `store.language`. Pode ser código ISO (`nb`) OU texto livre
 *     normalizado (`norueguês`) quando o usuário digitou idioma não-canônico.
 *   - `label`: texto amigável pra exibir/prompt — sempre retorna algo.
 *   - `source`: de onde o valor veio (debug/telemetria).
 */
export interface ResolvedStoreLanguage {
  code: string
  label: string
  source: "form_other" | "form_main" | "store_fallback" | "default"
}

const FREE_TEXT_REGEX = /^[a-zà-ÿ\s-]+$/

function cleanFreeText(input: unknown): string | null {
  if (typeof input !== "string") return null
  const cleaned = input.trim().toLowerCase()
  if (
    cleaned.length >= 2 &&
    cleaned.length <= 32 &&
    FREE_TEXT_REGEX.test(cleaned)
  ) {
    return cleaned
  }
  return null
}

/**
 * Resolve o idioma efetivo de uma loja combinando múltiplas fontes em
 * ordem de prioridade:
 *
 *   1. `form_responses.store_language === "Outro"` → usa
 *      `form_responses.store_language_other` (campo de texto livre).
 *      Tenta alias (ex: "norueguês" → "nb"); senão salva texto cru.
 *   2. `form_responses.store_language` quando é label canônico ou alias
 *      conhecido (ex: "Português (Brasil)" → "pt-BR").
 *   3. `storeLanguageFallback` (geralmente `client_stores.language`) —
 *      usado quando form_responses não tem nada útil.
 *   4. Default `"pt-BR"` se nada bate.
 *
 * Reusado por `confirmBriefing` (sync ao salvar briefing) e
 * `dispatchEmailCopyWebhook` (resolve na hora do dispatch, garante que
 * `store.language` no payload pro n8n reflete o que o cliente escolheu).
 */
export function resolveStoreLanguage(
  formResponses: Record<string, unknown> | null | undefined,
  storeLanguageFallback?: string | null,
): ResolvedStoreLanguage {
  const formMain = formResponses?.store_language
  const formOther = formResponses?.store_language_other

  // 1. Caminho "Outro" + texto livre
  if (
    typeof formMain === "string" &&
    formMain.trim() === OTHER_LANGUAGE_LABEL
  ) {
    const otherCode = languageLabelToCode(formOther)
    if (otherCode) {
      return {
        code: otherCode,
        label: languageCodeToLabel(otherCode) ?? otherCode,
        source: "form_other",
      }
    }
    const cleaned = cleanFreeText(formOther)
    if (cleaned) {
      return {
        code: cleaned,
        label: typeof formOther === "string" ? formOther.trim() : cleaned,
        source: "form_other",
      }
    }
  }

  // 2. store_language com label canônico ou alias
  const mainCode = languageLabelToCode(formMain)
  if (mainCode) {
    return {
      code: mainCode,
      label: languageCodeToLabel(mainCode) ?? mainCode,
      source: "form_main",
    }
  }
  const cleanedMain = cleanFreeText(formMain)
  if (cleanedMain && cleanedMain !== OTHER_LANGUAGE_LABEL.toLowerCase()) {
    return {
      code: cleanedMain,
      label: typeof formMain === "string" ? formMain.trim() : cleanedMain,
      source: "form_main",
    }
  }

  // 3. Fallback pro valor existente no DB (client_stores.language)
  if (typeof storeLanguageFallback === "string" && storeLanguageFallback.trim()) {
    const fallbackTrim = storeLanguageFallback.trim()
    const fallbackCode = languageLabelToCode(fallbackTrim) ?? fallbackTrim
    return {
      code: fallbackCode,
      label: languageCodeToLabel(fallbackCode) ?? fallbackCode,
      source: "store_fallback",
    }
  }

  // 4. Default pt-BR
  return {
    code: "pt-BR",
    label: "Português (Brasil)",
    source: "default",
  }
}
