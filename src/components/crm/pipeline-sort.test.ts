import { describe, expect, it } from "vitest"
import { EMPTY_FILTERS, applyFiltersAndSort, ordenacaoInicial } from "./pipeline-filters-bar"

const deal = (id: string, position: number | null) => ({
  id,
  title: id,
  value: null,
  status: "open",
  last_stage_changed_at: null,
  source: null,
  tags: null,
  position,
})

describe("position_asc", () => {
  it("segue a ordem da lista: position crescente, sem position no fim", () => {
    const r = applyFiltersAndSort(
      [deal("c", 30), deal("a", 10), deal("z", null), deal("b", 20)],
      EMPTY_FILTERS,
      "position_asc",
    )
    expect(r.map((d) => d.id)).toEqual(["a", "b", "c", "z"])
  })

  it("empate desempata por id — a ordem é estável entre renders", () => {
    const entrada = [deal("b", 10), deal("a", 10)]
    expect(applyFiltersAndSort(entrada, EMPTY_FILTERS, "position_asc").map((d) => d.id)).toEqual(["a", "b"])
    expect(
      applyFiltersAndSort([...entrada].reverse(), EMPTY_FILTERS, "position_asc").map((d) => d.id),
    ).toEqual(["a", "b"])
  })
})

describe("ordenacaoInicial", () => {
  it("lê o default_sort da pipeline quando é um valor conhecido", () => {
    expect(ordenacaoInicial("position_asc")).toBe("position_asc")
    expect(ordenacaoInicial("created_asc")).toBe("created_asc")
  })

  it("qualquer outra coisa cai no comportamento de sempre", () => {
    // Coluna nova em banco antigo (undefined), NULL, texto errado: nada
    // disso pode mudar a ordem de uma pipeline que não pediu.
    expect(ordenacaoInicial(undefined)).toBe("moved_desc")
    expect(ordenacaoInicial(null)).toBe("moved_desc")
    expect(ordenacaoInicial("table:value:desc")).toBe("moved_desc")
    expect(ordenacaoInicial(42)).toBe("moved_desc")
  })
})
