import { describe, expect, it } from "vitest"

import { corDoBotao } from "./cor-do-botao"

// Hero Boxers: identidade preto-e-branco.
const PB = { button_bg: "#000000", button_text: "#FFFFFF", bg: "#FFFFFF", text: "#111111", surface: "#F2F2F2" }

describe("corDoBotao — o par é medido contra o fundo real", () => {
  // O caso do batch 6249aef2: botão branco pedido sobre faixa branca.
  it("branco sobre branco é recusado e vira o botão da marca", () => {
    const c = corDoBotao("#FFFFFF", PB, { fundo: "#FFFFFF", texto: "#000000" })
    expect(c).toMatchObject({ fundo: "#000000", texto: "#FFFFFF", ajustado: true })
    expect(c.motivo).toContain("AA")
  })

  it("pedido que passa e está na paleta é aceito como veio", () => {
    const c = corDoBotao("#FFFFFF", PB, { fundo: "#000000", texto: "#FFFFFF" })
    expect(c).toMatchObject({ fundo: "#000000", texto: "#FFFFFF", ajustado: false, motivo: null })
  })

  // C3: botão da marca numa faixa da própria cor inverte.
  it("faixa preta: o botão preto colapsa e o código inverte", () => {
    const c = corDoBotao("#000000", PB)
    expect(c).toMatchObject({ fundo: "#FFFFFF", texto: "#000000", ajustado: true })
    expect(c.motivo).toContain("invertido")
  })

  it("cor fora da paleta é recusada mesmo com contraste bom", () => {
    const c = corDoBotao("#FFFFFF", PB, { fundo: "#D00000", texto: "#FFFFFF" })
    expect(c.fundo).toBe("#000000")
    expect(c.ajustado).toBe(true)
  })

  it("sem pedido, define por código sem chamar de ajuste do agente", () => {
    const c = corDoBotao("#F2F2F2", PB)
    expect(c.fundo).toBe("#000000")
    expect(c.motivo).toContain("definida por código")
  })

  it("faixa desconhecida (foto) confere só o par label/fundo", () => {
    const c = corDoBotao(null, PB, { fundo: "#000000", texto: "#FFFFFF" })
    expect(c.ajustado).toBe(false)
  })

  it("paleta em que nenhum par passa mantém o botão da marca e diz o número", () => {
    const cinza = { button_bg: "#888888", button_text: "#999999", bg: "#8A8A8A", text: "#8C8C8C" }
    const c = corDoBotao("#888888", cinza)
    expect(c.fundo).toBe("#888888")
    expect(c.motivo).toContain("nenhum par")
  })
})
