import { describe, it, expect } from "vitest"
import {
  SEM_ORIENTACAO,
  aplicaveis,
  montarBlocoOrientacoes,
  rotuloEscopo,
  type Orientacao,
} from "./orientacoes"

const geral: Orientacao = {
  escopo: "global",
  texto: "Depoimento nunca fecha o email.",
}
const doFlow: Orientacao = {
  escopo: "flow",
  flow_type: "welcome",
  texto: "Nunca abra com desconto.",
}
const doEmail: Orientacao = {
  escopo: "email",
  flow_type: "welcome",
  email_number: 1,
  texto: "Sempre entregue o cupom no hero.",
}

describe("montarBlocoOrientacoes", () => {
  // A mais específica por último: é onde o modelo dá mais peso quando duas
  // se contradizem, e é a que o COO escreveu sabendo mais sobre o caso.
  it("ordena da mais ampla para a mais específica", () => {
    const bloco = montarBlocoOrientacoes([doEmail, geral, doFlow])
    const posGeral = bloco.indexOf("Depoimento nunca fecha")
    const posFlow = bloco.indexOf("Nunca abra com desconto")
    const posEmail = bloco.indexOf("Sempre entregue o cupom")
    expect(posGeral).toBeGreaterThanOrEqual(0)
    expect(posGeral).toBeLessThan(posFlow)
    expect(posFlow).toBeLessThan(posEmail)
  })

  it("cada orientação vem com o alcance escrito", () => {
    const bloco = montarBlocoOrientacoes([doEmail])
    expect(bloco).toContain("[Todo welcome #1, em qualquer loja]")
  })

  // Preencher os três é opcional — era o pedido.
  it("só uma preenchida → só ela no bloco", () => {
    const bloco = montarBlocoOrientacoes([doFlow])
    expect(bloco).toContain("Nunca abra com desconto")
    expect(bloco).not.toContain("cupom no hero")
  })

  it("texto vazio ou só espaços não entra", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "global", texto: "   " },
      doFlow,
    ])
    expect(bloco).not.toContain("[Toda geração")
    expect(bloco).toContain("Nunca abra com desconto")
  })

  it("nenhuma → texto de vazio (o prompt não muda de forma)", () => {
    expect(montarBlocoOrientacoes([])).toBe(SEM_ORIENTACAO)
    expect(montarBlocoOrientacoes([{ escopo: "flow", texto: "" }])).toBe(
      SEM_ORIENTACAO,
    )
  })

  // O bloco vive dentro de <orientacao_do_coo>: texto do COO com `<` não
  // pode fechar a tag por acidente. O conteúdo entra cru (é o que o modelo
  // deve ler), então o teste fixa que nada é reescrito às escondidas.
  it("preserva o texto do COO literalmente", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "global", texto: "Use < 3 blocos & nada de </p> solto" },
    ])
    expect(bloco).toContain("Use < 3 blocos & nada de </p> solto")
  })

  it("escopo repetido não duplica o bloco", () => {
    const bloco = montarBlocoOrientacoes([
      doFlow,
      { escopo: "flow", flow_type: "welcome", texto: "outra coisa" },
    ])
    expect(bloco.match(/\[Todo email do flow welcome\]/g)).toHaveLength(1)
  })
})

describe("aplicaveis", () => {
  const todas = [
    geral,
    doFlow,
    doEmail,
    { escopo: "flow", flow_type: "winback", texto: "x" } as Orientacao,
    {
      escopo: "email",
      flow_type: "welcome",
      email_number: 3,
      texto: "y",
    } as Orientacao,
  ]

  it("global sempre entra; flow e email só quando batem", () => {
    const r = aplicaveis(todas, "welcome", 1)
    expect(r).toEqual([geral, doFlow, doEmail])
  })

  it("email de outro número não traz a orientação do #1", () => {
    const r = aplicaveis(todas, "welcome", 2)
    expect(r).toEqual([geral, doFlow])
  })

  it("flow sem orientação própria fica só com a global", () => {
    const r = aplicaveis(todas, "upsell", 1)
    expect(r).toEqual([geral])
  })
})

describe("rotuloEscopo", () => {
  it("descreve o alcance de cada escopo", () => {
    expect(rotuloEscopo("global")).toBe("Toda geração, qualquer flow")
    expect(rotuloEscopo("flow", "welcome")).toBe("Todo email do flow welcome")
    expect(rotuloEscopo("email", "welcome", 1)).toBe(
      "Todo welcome #1, em qualquer loja",
    )
  })
})
