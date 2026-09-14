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

  // Passo 11: a lacuna com DISPOSITIVO pedido vira proposta na primeira
  // ocorrência — o e-mail já reprovou por causa dela.
  it("lacuna de biblioteca (dispositivo pedido) propõe com UMA ocorrência, chaveada por flow e dispositivo", () => {
    const r = agregarLacunas([
      run("a", "10", [], [{ section: "products", block_index: 4, dispositivo_pedido: "products_grade_preco", flow_type: "welcome", motivo: "sem_candidata" }]),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tipo: "lacuna_biblioteca", chave: "lacuna_biblioteca:welcome:products_grade_preco", secao: "products", ocorrencias: 1 })
    expect(r[0].detalhe).toContain("products_grade_preco")
  })

  it("o mesmo dispositivo em duas lojas cai no mesmo balde", () => {
    const r = agregarLacunas([
      run("a", "10", [], [{ section: "body", dispositivo_pedido: "body_garantias", flow_type: "welcome" }]),
      run("b", "11", [], [{ section: "body", dispositivo_pedido: "body_garantias", flow_type: "welcome" }]),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].ocorrencias).toBe(2)
  })

  it("o limiar por tipo é sobrescrevível e não afeta os outros tipos", () => {
    const runs = [run("a", "10", [], [{ section: "reviews" }])]
    expect(agregarLacunas(runs)).toEqual([])
    expect(agregarLacunas(runs, { minimoPorTipo: { posicao_sem_variante: 1 } })).toHaveLength(1)
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

  it("rascunho da lacuna de biblioteca nomeia o dispositivo no slug e explica a reprovação", () => {
    const [agg] = agregarLacunas([
      run("a", "10", [], [{ section: "products", dispositivo_pedido: "products_grade_preco", flow_type: "welcome" }]),
    ])
    const d = buildLacunaDraft(agg, "2026-09-14T12:00:00Z")
    expect(d.slug).toBe("products-lacuna-biblioteca-welcome-products-grade-preco")
    expect(d.markdown).toContain("violacao: lacuna_biblioteca")
    expect(d.markdown).toContain("lacuna_biblioteca")
    expect(d.markdown).toContain("1 geração em 14 dias")
  })
})
