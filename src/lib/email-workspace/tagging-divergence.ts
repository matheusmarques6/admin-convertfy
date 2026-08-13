/**
 * Por que um placeholder esperado não está no HTML tagueado.
 *
 * A tela do Taguedor cobra do schema: todo campo tem que morar em
 * `{{MAIÚSCULA_DA_KEY}}` dentro da proposta. Quando falta, o aviso dizia
 * sempre a mesma coisa — "o schema mudou depois do taguedor ou a edição
 * removeu a tag" — e mandava re-rodar.
 *
 * Nas duas causas mais comuns esse conselho é errado e caro. Na variante
 * `hero` de arte-única (13/08) os SETE campos de texto voltaram `not_found`:
 * a arte é uma imagem só, não existe elemento de headline, subhead, cupom ou
 * botão para receber tag nenhuma. Re-rodar devolve `not_found` de novo, para
 * sempre — mas o aviso mandou procurar uma mudança de schema que nunca houve.
 *
 * O relatório do agente (`tagging_meta.fields[]`) já sabia a diferença. Este
 * módulo só a lê: cada causa tem um conserto próprio, e nenhuma delas é
 * "re-rode e torça".
 *
 * Puro, client-safe.
 */

import type { TaggingFieldReport } from "@/types/email-generation"

export type DivergenceCause =
  /** O agente olhou e não achou onde ancorar: o HTML não tem o elemento. */
  | "sem_ancora"
  /** O slot existe mas carrega outra tag — é retagueamento, não remontagem. */
  | "tag_divergente"
  /** O campo nem estava no schema quando o agente rodou. */
  | "schema_novo"
  /** O relatório afirma ter ancorado e o placeholder não está lá. */
  | "prometida"

export interface DivergenceGroup {
  cause: DivergenceCause
  placeholders: string[]
}

const CAUSE_ORDER: DivergenceCause[] = [
  "sem_ancora",
  "tag_divergente",
  "schema_novo",
  "prometida",
]

function causeFor(anchoredBy: TaggingFieldReport["anchored_by"] | undefined): DivergenceCause {
  // Sem entrada no relatório = o campo não existia no schema naquele run.
  if (anchoredBy === undefined) return "schema_novo"
  if (anchoredBy === "not_found") return "sem_ancora"
  if (anchoredBy === "existing_tag") return "tag_divergente"
  // exact | fuzzy | inference | renamed: prometeu âncora e não entregou.
  return "prometida"
}

/**
 * Agrupa os placeholders ausentes pela causa que o relatório aponta.
 *
 * Um mesmo run pode misturar causas (campo novo no schema + arte sem
 * elemento), então devolve uma lista, não um veredito único — cada grupo
 * pede um conserto diferente. Ordem estável (CAUSE_ORDER), da causa mais
 * estrutural para a mais suspeita, para o aviso não dançar entre renders.
 */
export function groupDivergence(
  missing: ReadonlyArray<{ key: string; placeholder: string }>,
  report: ReadonlyArray<TaggingFieldReport> | null | undefined,
): DivergenceGroup[] {
  const byKey = new Map((report ?? []).map((r) => [r.key, r.anchored_by]))
  const buckets = new Map<DivergenceCause, string[]>()
  for (const m of missing) {
    const cause = causeFor(byKey.get(m.key))
    const list = buckets.get(cause) ?? []
    list.push(`{{${m.placeholder}}}`)
    buckets.set(cause, list)
  }
  return CAUSE_ORDER.filter((c) => buckets.has(c)).map((cause) => ({
    cause,
    placeholders: buckets.get(cause)!,
  }))
}

/** O que aconteceu e o que fazer, por causa. */
export const CAUSE_TEXT: Record<
  DivergenceCause,
  { what: string; fix: string }
> = {
  sem_ancora: {
    what:
      "o agente não achou onde ancorar — o HTML da variante não tem o elemento que esses campos descrevem",
    fix: "re-rodar não muda nada: veja o preview e, se a arte não carrega esse conteúdo, ou cole um HTML que carregue ou acerte o schema para o que a arte é",
  },
  tag_divergente: {
    what: "o slot existe, mas carrega uma tag de outro nome",
    fix: "renomeie pelo painel Schema × HTML — é retagueamento, não remontagem",
  },
  schema_novo: {
    what: "esses campos entraram no schema depois que o agente rodou",
    fix: "re-rode o taguedor",
  },
  prometida: {
    what: "o relatório afirma ter ancorado, mas o placeholder não está na proposta",
    fix: "confira na revisão — uma edição manual pode ter removido a tag",
  },
}
