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

// Labels em PORTUGUÊS (a equipe opera em PT). O `value` (código ISO) é o que
// vai pro banco/n8n e NUNCA muda. Os nomes nativos antigos ("Polski", "日本語"…)
// já salvos em lojas existentes seguem resolvendo via LANGUAGE_ALIASES abaixo.
export const STORE_LANGUAGE_OPTIONS: { value: StoreLanguageCode; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "de", label: "Alemão" },
  { value: "fr", label: "Francês" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Holandês" },
  { value: "nb", label: "Norueguês" },
  { value: "sv", label: "Sueco" },
  { value: "da", label: "Dinamarquês" },
  { value: "fi", label: "Finlandês" },
  { value: "pl", label: "Polonês" },
  { value: "ja", label: "Japonês" },
  { value: "zh", label: "Chinês" },
  { value: "ko", label: "Coreano" },
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
  // inglês (label nativo antigo: "English"; "en-US" gravado pelo wizard do
  // portal antes da normalização — lojas antigas ainda carregam esse valor)
  "inglês": "en",
  "ingles": "en",
  "english": "en",
  "en-us": "en",
  "en-gb": "en",
  // espanhol (label nativo antigo: "Español")
  "espanhol": "es",
  "spanish": "es",
  "español": "es",
  // alemão (label nativo antigo: "Deutsch")
  "alemão": "de",
  "alemao": "de",
  "german": "de",
  "deutsch": "de",
  // francês (label nativo antigo: "Français")
  "francês": "fr",
  "frances": "fr",
  "french": "fr",
  "français": "fr",
  // italiano
  "italian": "it",
  // holandês (label nativo antigo: "Nederlands")
  "holandês": "nl",
  "holandes": "nl",
  "dutch": "nl",
  "nederlands": "nl",
  // norueguês (label nativo antigo: "Norsk")
  "norueguês": "nb",
  "noruegues": "nb",
  "norwegian": "nb",
  "norsk": "nb",
  "no": "nb",
  // sueco (label nativo antigo: "Svenska")
  "sueco": "sv",
  "swedish": "sv",
  "svenska": "sv",
  // dinamarquês (label nativo antigo: "Dansk")
  "dinamarquês": "da",
  "dinamarques": "da",
  "danish": "da",
  "dansk": "da",
  // finlandês (label nativo antigo: "Suomi")
  "finlandês": "fi",
  "finlandes": "fi",
  "finnish": "fi",
  "suomi": "fi",
  // polonês (label nativo antigo: "Polski")
  "polonês": "pl",
  "polones": "pl",
  "polish": "pl",
  "polski": "pl",
  // japonês (label nativo antigo: "日本語")
  "japonês": "ja",
  "japones": "ja",
  "japanese": "ja",
  "日本語": "ja",
  // chinês (label nativo antigo: "中文")
  "chinês": "zh",
  "chines": "zh",
  "chinese": "zh",
  "mandarim": "zh",
  "中文": "zh",
  // coreano (label nativo antigo: "한국어")
  "coreano": "ko",
  "korean": "ko",
  "한국어": "ko",
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
 * Tolerante a alias: valores não-canônicos já gravados no banco (ex.: "en-US"
 * do wizard antigo do portal) resolvem pro label do código canônico em vez de
 * cair no "Sem idioma". Retorna `null` quando não casa com nenhuma língua
 * suportada — o caller decide o fallback (ex.: exibir o próprio código cru).
 */
export function languageCodeToLabel(code: unknown): string | null {
  if (typeof code !== "string") return null
  const normalized = code.trim().toLowerCase()
  if (!normalized) return null
  const match = STORE_LANGUAGE_OPTIONS.find(
    (o) => o.value.toLowerCase() === normalized,
  )
  if (match) return match.label
  const alias = LANGUAGE_ALIASES[normalized]
  if (alias) {
    return STORE_LANGUAGE_OPTIONS.find((o) => o.value === alias)?.label ?? null
  }
  return null
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
  source: "store" | "form_other" | "form_main" | "default"
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
 * Resolve o idioma efetivo de uma loja em ordem de prioridade:
 *
 *   1. `storeLanguageFallback` (coluna `client_stores.language`) quando setada:
 *      é o campo que o admin edita na tela e PRECISA vencer o formulário.
 *      source `store`.
 *   2. `form_responses.store_language === "Outro"` → usa
 *      `form_responses.store_language_other` (campo de texto livre).
 *      Tenta alias (ex: "norueguês" → "nb"); senão salva texto cru.
 *   3. `form_responses.store_language` quando é label canônico ou alias
 *      conhecido (ex: "Português (Brasil)" → "pt-BR").
 *   4. Default `"pt-BR"` se nada bate.
 *
 * IMPORTANTE: a coluna nasce com DEFAULT 'pt-BR'. Para lojas novas que
 * escolheram outro idioma no formulário não ficarem presas em pt-BR, o
 * `dispatchEmailCopyWebhook` e o `confirmBriefing` fazem um upgrade
 * form→coluna enquanto a coluna ainda está no default. Esses dois chamam
 * esta função SEM `storeLanguageFallback` (resolução form-only) justamente
 * pra ler a escolha do formulário.
 */
export function resolveStoreLanguage(
  formResponses: Record<string, unknown> | null | undefined,
  storeLanguageFallback?: string | null,
): ResolvedStoreLanguage {
  const formMain = formResponses?.store_language
  const formOther = formResponses?.store_language_other

  // 1. Coluna client_stores.language vence — é o que o admin edita na tela.
  if (typeof storeLanguageFallback === "string" && storeLanguageFallback.trim()) {
    const storeTrim = storeLanguageFallback.trim()
    const storeCode = languageLabelToCode(storeTrim) ?? storeTrim
    return {
      code: storeCode,
      label: languageCodeToLabel(storeCode) ?? storeCode,
      source: "store",
    }
  }

  // 2. Caminho "Outro" + texto livre
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

  // 3. store_language com label canônico ou alias
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

  // 4. Default pt-BR
  return {
    code: "pt-BR",
    label: "Português (Brasil)",
    source: "default",
  }
}
