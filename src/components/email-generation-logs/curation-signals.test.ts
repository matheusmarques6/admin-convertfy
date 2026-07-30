import { describe, it, expect } from "vitest"

import {
  curationSignals,
  hasCurationPressure,
  type CurationSignals,
} from "./curation-signals"

const keys = (c: CurationSignals | null | undefined) =>
  curationSignals(c).map((s) => s.key)

describe("curationSignals", () => {
  it("run limpo → nenhum selo", () => {
    expect(
      keys({
        skipped_blocks: 0,
        excluded_untagged: 0,
        rank_deviations: 0,
        rendered_stale: false,
      }),
    ).toEqual([])
  })

  it("seções puladas → selo âmbar com contagem", () => {
    const [s] = curationSignals({ skipped_blocks: 2 })
    expect(s.key).toBe("skipped")
    expect(s.tone).toBe("warn")
    expect(s.label).toBe("2 seções puladas")
  })

  it("singular e plural", () => {
    expect(curationSignals({ skipped_blocks: 1 })[0].label).toBe("1 seção pulada")
    expect(curationSignals({ rank_deviations: 1 })[0].label).toBe("1 desvio do ranking")
    expect(curationSignals({ rank_deviations: 3 })[0].label).toBe("3 desvios do ranking")
  })

  it("fora do pool → âmbar; desvios e renderizado velho → azul", () => {
    expect(curationSignals({ excluded_untagged: 5 })[0].tone).toBe("warn")
    expect(curationSignals({ rank_deviations: 2 })[0].tone).toBe("info")
    expect(curationSignals({ rendered_stale: true })[0].tone).toBe("info")
  })

  it("vários sinais no mesmo run", () => {
    expect(
      keys({
        skipped_blocks: 1,
        excluded_untagged: 2,
        rank_deviations: 1,
        rendered_stale: true,
      }),
    ).toEqual(["skipped", "untagged", "stale", "deviations"])
  })

  it("todo selo tem explicação", () => {
    for (const s of curationSignals({
      skipped_blocks: 1,
      excluded_untagged: 1,
      rank_deviations: 1,
      rendered_stale: true,
    })) {
      expect(s.title.length).toBeGreaterThan(20)
    }
  })

  // Runs gravados antes das stories não têm os campos, e o objeto pode vir
  // de qualquer jeito do banco. Selo ausente é degradação aceitável; erro
  // no console, não.
  describe("leitura defensiva", () => {
    it("undefined / null → nenhum selo", () => {
      expect(keys(undefined)).toEqual([])
      expect(keys(null)).toEqual([])
    })

    it("objeto vazio → nenhum selo", () => {
      expect(keys({})).toEqual([])
    })

    it("tipos errados são ignorados", () => {
      const lixo = {
        skipped_blocks: "2",
        excluded_untagged: null,
        rank_deviations: NaN,
        rendered_stale: "sim",
      } as unknown as CurationSignals
      expect(keys(lixo)).toEqual([])
    })

    it("números negativos ou zero não viram selo", () => {
      expect(keys({ skipped_blocks: -1, rank_deviations: 0 })).toEqual([])
    })

    it("valor primitivo no lugar do objeto → nenhum selo", () => {
      expect(keys("erro" as unknown as CurationSignals)).toEqual([])
      expect(keys(42 as unknown as CurationSignals)).toEqual([])
    })

    it("rendered_stale só dispara com true literal", () => {
      expect(keys({ rendered_stale: false })).toEqual([])
      expect(keys({ rendered_stale: null })).toEqual([])
      expect(keys({ rendered_stale: 1 as unknown as boolean })).toEqual([])
    })
  })
})

describe("hasCurationPressure", () => {
  it("true só com selo âmbar", () => {
    expect(hasCurationPressure({ skipped_blocks: 1 })).toBe(true)
    expect(hasCurationPressure({ excluded_untagged: 1 })).toBe(true)
  })

  it("selo azul sozinho não é pressão: o pipeline se ajustou", () => {
    expect(hasCurationPressure({ rank_deviations: 3 })).toBe(false)
    expect(hasCurationPressure({ rendered_stale: true })).toBe(false)
  })

  it("run limpo ou malformado → false", () => {
    expect(hasCurationPressure({})).toBe(false)
    expect(hasCurationPressure(null)).toBe(false)
    expect(hasCurationPressure(undefined)).toBe(false)
  })

  // O filtro da listagem e o selo da linha usam a MESMA função — não podem
  // divergir.
  it("é coerente com os selos exibidos", () => {
    const c = { skipped_blocks: 2, rank_deviations: 1 }
    expect(hasCurationPressure(c)).toBe(
      curationSignals(c).some((s) => s.tone === "warn"),
    )
  })
})
