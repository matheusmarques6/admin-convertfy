/**
 * Detecta se uma task é a "Corte modelo" da etapa de implementação do
 * design de campanha (abre o modal de mapear cortes).
 *
 * Fonte estável: slug do checklist item — o seed em
 * campaign-design-bootstrap.service.ts cria a task com slug
 * "impl_corte_modelo". Fallback: título contendo "corte" (colunas com
 * checklist_template customizado no banco podem não ter o slug do seed).
 */

/** lowercase + remo\u00e7\u00e3o de acentos \u2014 base do matching por nome (store-match). */
export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

export function isCutMappingTask(t: {
  source_type?: string | null
  slug?: string | null
  name?: string | null
}): boolean {
  if (t.source_type !== "campaign_suggestion") return false
  if (t.slug && normalizeText(t.slug).includes("corte")) return true
  return normalizeText(t.name ?? "").includes("corte")
}
