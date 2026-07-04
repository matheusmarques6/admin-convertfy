/**
 * Agrupamento de lojas por idioma para as tasks "Subir e-mails - <idioma>"
 * (slugs impl_subir_ptbr / impl_subir_en / impl_subir_outras, seed em
 * campaign-design-bootstrap.service.ts).
 *
 * O rail do modal mostra TODAS as lojas agrupadas; a task só define qual
 * grupo abre focado/expandido.
 */

import { normalizeText } from "./detect"

export type TaskLangGroup = "ptbr" | "en" | "outras"

export const LANG_GROUP_LABEL: Record<TaskLangGroup, string> = {
  ptbr: "Português (Brasil)",
  en: "Inglês",
  outras: "Outras línguas",
}

/** Ordem de exibição dos grupos no rail (antes de focar o grupo da task). */
export const LANG_GROUP_ORDER: TaskLangGroup[] = ["ptbr", "en", "outras"]

/**
 * Grupo de idioma de uma loja a partir de `client_stores.language`
 * (ex.: "pt-BR", "pt", "en-US", "es"). Null/vazio cai em "outras".
 */
export function storeLangGroup(language: string | null | undefined): TaskLangGroup {
  const lang = normalizeText(language ?? "").trim()
  if (lang.startsWith("pt")) return "ptbr"
  if (lang.startsWith("en")) return "en"
  return "outras"
}

/**
 * Grupo de idioma da TASK "Subir e-mails". Slug do seed primeiro
 * (impl_subir_ptbr/en/outras); fallback pelo título (colunas com
 * checklist_template customizado podem não ter o slug do seed).
 */
export function taskLangGroup(t: {
  slug?: string | null
  name?: string | null
}): TaskLangGroup {
  const slug = normalizeText(t.slug ?? "")
  if (slug.includes("ptbr")) return "ptbr"
  if (slug.endsWith("_en") || slug.includes("_en_")) return "en"
  if (slug.includes("outras")) return "outras"

  const name = normalizeText(t.name ?? "")
  if (name.includes("portugues") || name.includes("brasil")) return "ptbr"
  if (name.includes("ingles")) return "en"
  return "outras"
}
