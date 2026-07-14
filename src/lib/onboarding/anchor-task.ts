/**
 * Seleção da "task âncora" de uma coluna do onboarding.
 *
 * Os deliverables de uma coluna são pré-instanciados numa ÚNICA task —
 * a âncora (`metadata.is_column_anchor === true`, `item_position: 0`;
 * ver onboarding-pipeline.service.ts). O GET /api/onboardings/[id] traz
 * as tasks aninhadas SEM `ORDER BY`, então `tasks[0]` do PostgREST NÃO
 * é garantidamente a âncora — pegar a primeira "crua" faz a aba de
 * deliverables ler a task errada (campos vazios) e o designer cair no
 * POST (criar), que exige admin → 403 e o arquivo "some" da tela.
 *
 * Este helper escolhe a âncora de forma determinística. Puro e testável.
 */

interface TaskWithAnchorMeta {
  id: string
  metadata?: Record<string, unknown> | null
  created_at?: string
}

function itemPosition(meta: Record<string, unknown> | null | undefined): number {
  const p = meta?.item_position
  return typeof p === "number" ? p : Number.POSITIVE_INFINITY
}

/**
 * Retorna a task âncora da lista (onde vivem os deliverables), ou null se
 * a lista estiver vazia. Ordem de preferência:
 *  1. task com `metadata.is_column_anchor === true`
 *  2. menor `metadata.item_position` (desempate por created_at)
 *  3. primeira task da lista (fallback defensivo)
 */
export function pickAnchorTask<T extends TaskWithAnchorMeta>(tasks: T[]): T | null {
  if (!tasks.length) return null

  const flagged = tasks.find((t) => t.metadata?.is_column_anchor === true)
  if (flagged) return flagged

  return [...tasks].sort((a, b) => {
    const ap = itemPosition(a.metadata)
    const bp = itemPosition(b.metadata)
    if (ap !== bp) return ap - bp
    return (a.created_at ?? "").localeCompare(b.created_at ?? "")
  })[0]
}
