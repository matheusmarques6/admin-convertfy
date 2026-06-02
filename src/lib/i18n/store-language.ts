/**
 * Idioma da loja — opções e conversão label ↔ código canônico.
 *
 * Módulo leve, sem dependências, importável tanto no client (opções do
 * formulário de onboarding) quanto no server (sincronização com
 * `client_stores.language`). Mantido separado de `lib/translations/tracking.ts`
 * para não puxar o arquivo grande de traduções para o bundle do formulário.
 *
 * A lista canônica espelha `SUPPORTED_LANGUAGES` de `tracking.ts`.
 */

export type StoreLanguageCode = "pt-BR" | "en" | "de" | "it" | "es"

export const STORE_LANGUAGE_OPTIONS: { value: StoreLanguageCode; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
]

/** Última opção do select — abre campo de texto livre para idiomas fora da lista. */
export const OTHER_LANGUAGE_LABEL = "Outro"

/**
 * Converte o label escolhido no formulário para o código canônico.
 * Retorna `null` quando não casa com nenhuma língua suportada (inclui "Outro"),
 * caso em que `client_stores.language` não deve ser alterado.
 */
export function languageLabelToCode(label: unknown): StoreLanguageCode | null {
  if (typeof label !== "string") return null
  const normalized = label.trim().toLowerCase()
  if (!normalized) return null
  const match = STORE_LANGUAGE_OPTIONS.find(
    (o) => o.label.toLowerCase() === normalized || o.value.toLowerCase() === normalized,
  )
  return match ? match.value : null
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
