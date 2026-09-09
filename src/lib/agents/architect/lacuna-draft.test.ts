import { describe, it, expect } from "vitest"

import { agregarLacunas, buildLacunaDraft, normalizarDetalhe, type RunParaLacuna } from "./lacuna-draft"

const run = (id: string, dia: string, violations: RunParaLacuna["violations"], sem: RunParaLacuna["posicoesSemVariante"] = []): RunParaLacuna => ({
  id,
  createdAt: `2026-09-${dia}T10:00:00Z`,
  storeName: `Loja ${id}`,
  violations,
  posicoesSemVariante: sem,
})

// As proibições vêm em prosa da LOJA e mudam a cada catálogo; o que a
// biblioteca carrega é o que está depois do ×. Sem essa normalização a
// mesma lacuna nunca chegaria a 3.
describe("normalizarDetalhe", () => {
  it("proibição fica só com o requisito depois do ×", () => {
    expect(normalizarDetalhe("proibicao_violada", '"Não usar claim de incentivo até confirmar" × exige cupom-ativo')).toBe("exige cupom-ativo")
    expect(normalizarDetalhe("proibicao_violada", '"Não inventar código" × exige cupom-ativo')).toBe("exige cupom-ativo")
  })
  it("acento, caixa e aspas não separam baldes", () => {
    expect(normalizarDetalhe("aliviador_ausente", "Nenhuma posição realiza o aliviador pedido (reputacao_da_loja)")).toBe(
      "nenhuma posicao realiza o aliviador pedido (reputacao_da_loja)",
    )
  })
})

describe("agregarLacunas", () => {
  const ausente = { tipo: "aliviador_ausente", detalhe: "nenhuma posição realiza o aliviador pedido (reputacao_da_loja)", block_index: -1, variant_id: "" }

  it("só propõe a partir do mínimo, com contagem por RUN e exemplos", () => {
    const runs = [
      run("a", "01", [ausente]),
      run("b", "03", [ausente, ausente]), // repetida dentro da run conta 1
      run("c", "05", [ausente]),
      run("d", "05", [{ tipo: "convivencia", detalhe: "exige-hero-ou-contexto-acima" }]), // não é lacuna
    ]
    const r = agregarLacunas(runs, { minimo: 3 })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tipo: "aliviador_ausente", ocorrencias: 3, primeiraVez: "2026-09-01T10:00:00Z", ultimaVez: "2026-09-05T10:00:00Z" })
    expect(r[0].exemplos.map((e) => e.runId)).toEqual(["a", "b", "c"])
    expect(agregarLacunas(runs.slice(0, 2), { minimo: 3 })).toEqual([])
  })

  it("proibições de lojas diferentes com o mesmo requisito caem no mesmo balde", () => {
    const runs = ["01", "02", "03"].map((d, i) =>
      run(`p${i}`, d, [{ tipo: "proibicao_violada", detalhe: `"Proibição da loja ${i}" × exige cupom-ativo`, block_index: 0, variant_id: "v" }]),
    )
    const r = agregarLacunas(runs)
    expect(r).toHaveLength(1)
    expect(r[0].chave).toBe("proibicao_violada:exige cupom-ativo")
  })

  it("posição sem variante vira lacuna da seção", () => {
    const runs = ["01", "02", "03"].map((d, i) => run(`s${i}`, d, [], [{ section: "reviews", block_index: 3 }]))
    const r = agregarLacunas(runs)
    expect(r[0]).toMatchObject({ tipo: "posicao_sem_variante", secao: "reviews", ocorrencias: 3 })
  })
})

describe("buildLacunaDraft", () => {
  it("frontmatter aberta/biblioteca, caminho em componentes/lacunas e determinístico", () => {
    const [agg] = agregarLacunas(["01", "02", "03"].map((d, i) => run(`x${i}`, d, [{ tipo: "aliviador_ausente", detalhe: "nenhuma posição realiza o aliviador pedido (reputacao_da_loja)" }])))
    const a = buildLacunaDraft(agg, "2026-09-09T12:00:00Z")
    const b = buildLacunaDraft(agg, "2026-09-09T12:00:00Z")
    expect(a).toEqual(b)
    expect(a.path).toBe(`componentes/lacunas/${a.slug}.md`)
    expect(a.slug).toContain("reputacao-da-loja")
    expect(a.markdown).toContain("status: aberta")
    expect(a.markdown).toContain("sobre: biblioteca")
    expect(a.markdown).toContain("ocorrencias: 3")
    expect(a.markdown).toContain("Loja x0")
    expect(a.markdown).toContain("status: retratada")
  })
})
