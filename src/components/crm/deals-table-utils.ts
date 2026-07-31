/**
 * Lógica pura da visão de tabela do pipeline — ordenação por coluna e
 * seleção múltipla. Separada da UI porque é onde erro passa despercebido
 * (ordenação instável, shift+click invertido, seleção que sobrevive a
 * filtro e aplica ação em massa no deal errado).
 */

export type TableColumnKey =
  | "title"
  | "stage"
  | "value"
  | "owner"
  | "next_step"
  | "idle_days"
  | "created_at"
  | "expected_close_date"

export interface TableSort {
  column: TableColumnKey
  direction: "asc" | "desc"
}

export interface TableDeal {
  id: string
  title: string
  value: number | null
  stage_id: string
  owner?: { id: string; name: string } | null
  client?: { id: string; name: string } | null
  created_at?: string | null
  expected_close_date?: string | null
  last_stage_changed_at: string | null
  next_step?: { label: string; when: string; tone: string } | null
  activities_pending?: number | null
}

/** Colunas cuja ordenação natural é decrescente no primeiro clique. */
const DESC_FIRST: TableColumnKey[] = ["value", "created_at", "idle_days"]

export function defaultDirectionFor(column: TableColumnKey): "asc" | "desc" {
  return DESC_FIRST.includes(column) ? "desc" : "asc"
}

/**
 * Alterna a ordenação ao clicar num cabeçalho: coluna nova começa na
 * direção natural dela; a mesma coluna inverte.
 */
export function toggleSort(current: TableSort, column: TableColumnKey): TableSort {
  if (current.column !== column) {
    return { column, direction: defaultDirectionFor(column) }
  }
  return { column, direction: current.direction === "asc" ? "desc" : "asc" }
}

function idleDays(deal: TableDeal, now: number): number {
  const iso = deal.last_stage_changed_at
  if (!iso) return 0
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor((now - ms) / 86_400_000))
}

/** Nulos sempre no fim, independentemente da direção. */
function compareNullable(
  a: number | string | null,
  b: number | string | null,
  direction: "asc" | "desc",
): number {
  const aEmpty = a == null || a === ""
  const bEmpty = b == null || b === ""
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" })
  return direction === "asc" ? cmp : -cmp
}

export interface SortContext {
  /** stage_id → posição da etapa no funil (ordena por avanço real). */
  stageOrder: Map<string, number>
  now?: number
}

/**
 * Ordena sem mutar a lista recebida. Empate cai no id para a ordem ser
 * estável entre renders — sem isso as linhas dançam a cada refresh.
 */
export function sortDeals<T extends TableDeal>(
  deals: T[],
  sort: TableSort,
  ctx: SortContext,
): T[] {
  const now = ctx.now ?? Date.now()
  const dir = sort.direction

  return deals.slice().sort((a, b) => {
    let cmp = 0
    switch (sort.column) {
      case "title":
        cmp = compareNullable(a.title, b.title, dir)
        break
      case "value":
        cmp = compareNullable(a.value ?? null, b.value ?? null, dir)
        break
      case "owner":
        cmp = compareNullable(a.owner?.name ?? null, b.owner?.name ?? null, dir)
        break
      case "stage": {
        const av = ctx.stageOrder.get(a.stage_id) ?? Number.MAX_SAFE_INTEGER
        const bv = ctx.stageOrder.get(b.stage_id) ?? Number.MAX_SAFE_INTEGER
        cmp = compareNullable(av, bv, dir)
        break
      }
      case "idle_days":
        cmp = compareNullable(idleDays(a, now), idleDays(b, now), dir)
        break
      case "created_at":
        cmp = compareNullable(a.created_at ?? null, b.created_at ?? null, dir)
        break
      case "expected_close_date":
        cmp = compareNullable(
          a.expected_close_date ?? null,
          b.expected_close_date ?? null,
          dir,
        )
        break
      case "next_step": {
        // Sem próxima ação vai pro fim: é o que precisa de atenção, mas
        // ordenar por "quando" exige ter um quando.
        const rank = (d: TableDeal) => {
          if (!d.next_step) return 2
          return d.next_step.tone === "neg" || d.next_step.tone === "warn" ? 0 : 1
        }
        cmp = compareNullable(rank(a), rank(b), dir)
        break
      }
    }
    if (cmp !== 0) return cmp
    return a.id.localeCompare(b.id)
  })
}

/**
 * Seleção com suporte a shift+click (intervalo). `anchor` é a última
 * linha clicada sem shift.
 */
export function resolveSelection(params: {
  selected: Set<string>
  visibleIds: string[]
  clickedId: string
  shiftKey: boolean
  anchorId: string | null
}): { selected: Set<string>; anchorId: string | null } {
  const { selected, visibleIds, clickedId, shiftKey, anchorId } = params
  const next = new Set(selected)

  if (shiftKey && anchorId && anchorId !== clickedId) {
    const from = visibleIds.indexOf(anchorId)
    const to = visibleIds.indexOf(clickedId)
    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from]
      // Intervalo sempre ADICIONA — shift nunca desmarca sem querer
      for (let i = start; i <= end; i++) next.add(visibleIds[i])
      return { selected: next, anchorId }
    }
  }

  if (next.has(clickedId)) next.delete(clickedId)
  else next.add(clickedId)

  return { selected: next, anchorId: clickedId }
}

/** Marca/desmarca tudo que está visível, preservando o resto. */
export function toggleSelectAll(
  selected: Set<string>,
  visibleIds: string[],
): Set<string> {
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const next = new Set(selected)
  if (allVisibleSelected) {
    for (const id of visibleIds) next.delete(id)
  } else {
    for (const id of visibleIds) next.add(id)
  }
  return next
}

/**
 * Descarta da seleção o que sumiu da lista visível. Sem isso, filtrar
 * depois de selecionar aplicaria a ação em massa em deals fora da tela.
 */
export function pruneSelection(
  selected: Set<string>,
  visibleIds: string[],
): Set<string> {
  if (selected.size === 0) return selected
  const visible = new Set(visibleIds)
  const next = new Set<string>()
  for (const id of selected) if (visible.has(id)) next.add(id)
  return next.size === selected.size ? selected : next
}

export type HeaderCheckboxState = "none" | "some" | "all"

export function headerCheckboxState(
  selected: Set<string>,
  visibleIds: string[],
): HeaderCheckboxState {
  if (visibleIds.length === 0 || selected.size === 0) return "none"
  const count = visibleIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0)
  if (count === 0) return "none"
  return count === visibleIds.length ? "all" : "some"
}
