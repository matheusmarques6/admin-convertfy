import { describe, it, expect } from "vitest"
import {
  toggleSort,
  defaultDirectionFor,
  sortDeals,
  resolveSelection,
  toggleSelectAll,
  pruneSelection,
  headerCheckboxState,
  type TableDeal,
} from "./deals-table-utils"

const NOW = Date.parse("2026-07-31T12:00:00.000Z")

const deal = (over: Partial<TableDeal> & { id: string }): TableDeal => ({
  title: "Deal",
  value: 0,
  stage_id: "s1",
  last_stage_changed_at: "2026-07-31T12:00:00.000Z",
  ...over,
})

const stageOrder = new Map([
  ["s1", 1],
  ["s2", 2],
  ["s3", 3],
])
const ctx = { stageOrder, now: NOW }

describe("toggleSort", () => {
  it("coluna nova comeca na direcao natural dela", () => {
    // Valor e data: mais alto/recente primeiro. Texto: A→Z.
    expect(toggleSort({ column: "title", direction: "asc" }, "value")).toEqual({
      column: "value",
      direction: "desc",
    })
    expect(toggleSort({ column: "value", direction: "desc" }, "title")).toEqual({
      column: "title",
      direction: "asc",
    })
  })

  it("mesma coluna inverte a direcao", () => {
    expect(toggleSort({ column: "value", direction: "desc" }, "value")).toEqual({
      column: "value",
      direction: "asc",
    })
  })

  it("defaultDirectionFor cobre as colunas desc-first", () => {
    expect(defaultDirectionFor("value")).toBe("desc")
    expect(defaultDirectionFor("created_at")).toBe("desc")
    expect(defaultDirectionFor("idle_days")).toBe("desc")
    expect(defaultDirectionFor("owner")).toBe("asc")
  })
})

describe("sortDeals", () => {
  it("nao muta a lista original", () => {
    const list = [deal({ id: "b", value: 1 }), deal({ id: "a", value: 2 })]
    const copy = [...list]
    sortDeals(list, { column: "value", direction: "asc" }, ctx)
    expect(list).toEqual(copy)
  })

  it("ordena por valor nas duas direcoes", () => {
    const list = [
      deal({ id: "a", value: 100 }),
      deal({ id: "b", value: 300 }),
      deal({ id: "c", value: 200 }),
    ]
    expect(
      sortDeals(list, { column: "value", direction: "desc" }, ctx).map((d) => d.id),
    ).toEqual(["b", "c", "a"])
    expect(
      sortDeals(list, { column: "value", direction: "asc" }, ctx).map((d) => d.id),
    ).toEqual(["a", "c", "b"])
  })

  it("manda nulos pro fim mesmo invertendo a direcao", () => {
    const list = [
      deal({ id: "a", value: null }),
      deal({ id: "b", value: 50 }),
      deal({ id: "c", value: 10 }),
    ]
    expect(
      sortDeals(list, { column: "value", direction: "desc" }, ctx).map((d) => d.id),
    ).toEqual(["b", "c", "a"])
    expect(
      sortDeals(list, { column: "value", direction: "asc" }, ctx).map((d) => d.id),
    ).toEqual(["c", "b", "a"])
  })

  it("ordena etapa pela posicao no funil, nao pelo nome", () => {
    const list = [
      deal({ id: "a", stage_id: "s3" }),
      deal({ id: "b", stage_id: "s1" }),
      deal({ id: "c", stage_id: "s2" }),
    ]
    expect(
      sortDeals(list, { column: "stage", direction: "asc" }, ctx).map((d) => d.id),
    ).toEqual(["b", "c", "a"])
  })

  it("ordena por dias parado", () => {
    const list = [
      deal({ id: "novo", last_stage_changed_at: "2026-07-31T00:00:00.000Z" }),
      deal({ id: "velho", last_stage_changed_at: "2026-07-01T00:00:00.000Z" }),
      deal({ id: "medio", last_stage_changed_at: "2026-07-20T00:00:00.000Z" }),
    ]
    expect(
      sortDeals(list, { column: "idle_days", direction: "desc" }, ctx).map((d) => d.id),
    ).toEqual(["velho", "medio", "novo"])
  })

  it("proxima acao: atrasado antes de futuro, sem acao por ultimo", () => {
    const list = [
      deal({ id: "sem" }),
      deal({ id: "futuro", next_step: { label: "x", when: "amanha", tone: "info" } }),
      deal({ id: "atrasado", next_step: { label: "y", when: "ha 3d", tone: "neg" } }),
    ]
    expect(
      sortDeals(list, { column: "next_step", direction: "asc" }, ctx).map((d) => d.id),
    ).toEqual(["atrasado", "futuro", "sem"])
  })

  it("ordena texto ignorando acento e caixa", () => {
    const list = [
      deal({ id: "1", title: "Ótica Silva" }),
      deal({ id: "2", title: "acme" }),
      deal({ id: "3", title: "Zebra" }),
    ]
    expect(
      sortDeals(list, { column: "title", direction: "asc" }, ctx).map((d) => d.title),
    ).toEqual(["acme", "Ótica Silva", "Zebra"])
  })

  it("empate desempata por id — ordem estavel entre renders", () => {
    const list = [
      deal({ id: "zzz", value: 100 }),
      deal({ id: "aaa", value: 100 }),
      deal({ id: "mmm", value: 100 }),
    ]
    const first = sortDeals(list, { column: "value", direction: "desc" }, ctx)
    const second = sortDeals([...list].reverse(), { column: "value", direction: "desc" }, ctx)
    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id))
    expect(first.map((d) => d.id)).toEqual(["aaa", "mmm", "zzz"])
  })
})

describe("resolveSelection", () => {
  const visibleIds = ["a", "b", "c", "d", "e"]

  it("clique simples marca e desmarca", () => {
    const r1 = resolveSelection({
      selected: new Set(),
      visibleIds,
      clickedId: "b",
      shiftKey: false,
      anchorId: null,
    })
    expect([...r1.selected]).toEqual(["b"])
    expect(r1.anchorId).toBe("b")

    const r2 = resolveSelection({
      selected: r1.selected,
      visibleIds,
      clickedId: "b",
      shiftKey: false,
      anchorId: r1.anchorId,
    })
    expect(r2.selected.size).toBe(0)
  })

  it("shift+click seleciona o intervalo pra baixo", () => {
    const r = resolveSelection({
      selected: new Set(["b"]),
      visibleIds,
      clickedId: "d",
      shiftKey: true,
      anchorId: "b",
    })
    expect([...r.selected].sort()).toEqual(["b", "c", "d"])
  })

  it("shift+click funciona de baixo pra cima", () => {
    const r = resolveSelection({
      selected: new Set(["d"]),
      visibleIds,
      clickedId: "b",
      shiftKey: true,
      anchorId: "d",
    })
    expect([...r.selected].sort()).toEqual(["b", "c", "d"])
  })

  it("shift preserva selecao anterior e mantem a ancora", () => {
    const r = resolveSelection({
      selected: new Set(["a", "c"]),
      visibleIds,
      clickedId: "e",
      shiftKey: true,
      anchorId: "c",
    })
    expect([...r.selected].sort()).toEqual(["a", "c", "d", "e"])
    expect(r.anchorId).toBe("c")
  })

  it("shift sem ancora cai no comportamento de clique simples", () => {
    const r = resolveSelection({
      selected: new Set(),
      visibleIds,
      clickedId: "c",
      shiftKey: true,
      anchorId: null,
    })
    expect([...r.selected]).toEqual(["c"])
  })
})

describe("toggleSelectAll", () => {
  it("marca tudo quando nem tudo esta marcado", () => {
    expect([...toggleSelectAll(new Set(["a"]), ["a", "b", "c"])].sort()).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("desmarca tudo quando tudo ja esta marcado", () => {
    expect(toggleSelectAll(new Set(["a", "b"]), ["a", "b"]).size).toBe(0)
  })

  it("preserva selecionados fora da lista visivel", () => {
    const r = toggleSelectAll(new Set(["oculto", "a"]), ["a", "b"])
    expect(r.has("oculto")).toBe(true)
    expect(r.has("b")).toBe(true)
  })
})

describe("pruneSelection", () => {
  it("descarta o que saiu do filtro — evita acao em massa no deal errado", () => {
    const r = pruneSelection(new Set(["a", "b", "c"]), ["a", "c"])
    expect([...r].sort()).toEqual(["a", "c"])
  })

  it("devolve a mesma referencia quando nada muda (evita render extra)", () => {
    const sel = new Set(["a", "b"])
    expect(pruneSelection(sel, ["a", "b", "c"])).toBe(sel)
  })

  it("selecao vazia passa direto", () => {
    const empty = new Set<string>()
    expect(pruneSelection(empty, ["a"])).toBe(empty)
  })
})

describe("headerCheckboxState", () => {
  it("reflete nenhum / alguns / todos", () => {
    expect(headerCheckboxState(new Set(), ["a", "b"])).toBe("none")
    expect(headerCheckboxState(new Set(["a"]), ["a", "b"])).toBe("some")
    expect(headerCheckboxState(new Set(["a", "b"]), ["a", "b"])).toBe("all")
  })

  it("lista vazia nao fica marcada", () => {
    expect(headerCheckboxState(new Set(["x"]), [])).toBe("none")
  })
})
