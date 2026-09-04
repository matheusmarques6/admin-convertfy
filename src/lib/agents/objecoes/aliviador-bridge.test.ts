import { describe, it, expect } from "vitest"
import { derivarAliviadorEProfundidade, eixoObjecaoEquivalente } from "./aliviador-bridge"

describe("eixoObjecaoEquivalente", () => {
  it("o par decide: psicológico + prova de terceiro cai em adesão social / qualidade", () => {
    expect(eixoObjecaoEquivalente("psicologico", "prova_de_terceiro")).toEqual(["adesao-social", "qualidade-eficacia"])
  })
  it("segurança + reputação da loja → confiança no canal", () => {
    expect(eixoObjecaoEquivalente("seguranca", "reputacao_da_loja")).toEqual(["confianca-no-canal"])
  })
  it("financeiro + comparação → preço-valor; adequação + dado → escolha-variedade", () => {
    expect(eixoObjecaoEquivalente("financeiro", "comparacao_de_categoria")).toEqual(["preco-valor"])
    expect(eixoObjecaoEquivalente("adequacao", "dado_de_adequacao")).toEqual(["escolha-variedade", "uso-aprendizado"])
  })
  it("sem interseção cai na união (nunca vazio para par válido); sem nada devolve vazio", () => {
    const r = eixoObjecaoEquivalente("social", "seguranca_de_pagamento")
    expect(r.length).toBeGreaterThan(0)
    expect(r[0]).toBe("confianca-no-canal")
    expect(eixoObjecaoEquivalente(null, null)).toEqual([])
    expect(eixoObjecaoEquivalente("tempo", null)).toEqual(["suporte-duvida", "disponibilidade-urgencia", "uso-aprendizado"])
  })
})

describe("derivarAliviadorEProfundidade", () => {
  it("frontmatter explícito vence a derivação", () => {
    const r = derivarAliviadorEProfundidade({
      block_type: "body",
      exige: ["tres-reviews-distintos"],
      aliviador: ["garantia_de_devolucao"],
      profundidade: "garantia",
    })
    expect(r).toEqual({ aliviador: ["garantia_de_devolucao"], profundidade: "garantia", fonte: "vault" })
  })
  it("reviews com três depoimentos → prova de terceiro, profundidade prova_de_terceiro", () => {
    const r = derivarAliviadorEProfundidade({ block_type: "reviews", exige: ["tres-reviews-distintos", "foto-do-depoente"], objecao: ["adesao-social"] })
    expect(r.aliviador).toEqual(["prova_de_terceiro"])
    expect(r.profundidade).toBe("prova_de_terceiro")
    expect(r.fonte).toBe("derivado")
  })
  it("body comparativo (quatro critérios) → comparação de categoria, mecanismo", () => {
    const r = derivarAliviadorEProfundidade({ block_type: "body", exige: ["quatro-criterios-objetivos"], objecao: ["confianca-no-canal", "preco-valor"] })
    expect(r.aliviador).toEqual(["comparacao_de_categoria"])
    expect(r.profundidade).toBe("mecanismo")
  })
  it("sem exige mapeável cai no eixo objecao; hero é afirmação; footer não alivia", () => {
    expect(derivarAliviadorEProfundidade({ block_type: "hero", exige: ["cupom-ativo"], objecao: ["preco-valor"] })).toEqual({
      aliviador: ["comparacao_de_categoria"],
      profundidade: "mecanismo",
      fonte: "derivado",
    })
    expect(derivarAliviadorEProfundidade({ block_type: "hero", objecao: [] })).toEqual({ aliviador: [], profundidade: "afirmacao", fonte: "derivado" })
    expect(derivarAliviadorEProfundidade({ block_type: "footer", objecao: [] }).profundidade).toBeNull()
  })
  it("valor explícito fora do vocabulário é ignorado (cai na derivação)", () => {
    const r = derivarAliviadorEProfundidade({ block_type: "reviews", aliviador: ["prova social"], profundidade: "funda" })
    expect(r.fonte).toBe("derivado")
    expect(r.aliviador).toEqual(["prova_de_terceiro"])
  })
})
