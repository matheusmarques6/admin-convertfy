import { describe, expect, it } from "vitest"

import { corDoBotao, corDoLabelVazado } from "./cor-do-botao"

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

describe("corDoLabelVazado — o botão sem fundo próprio", () => {
  // Innova Bay, 17/09. Paleta verde: `#034326` é a cor da marca.
  const IB = {
    button_bg: "#034326",
    button_text: "#FFFFFF",
    bg: "#FFFFFF",
    text: "#1F1F1F",
    surface: "#F2F2F2",
    accent: "#07A55D",
  }

  it("o caso real: branco sobre o rodapé quase-branco é recusado", () => {
    // O agente pediu `#034326`/`#FFFFFF` para os seis links do menu do
    // rodapé; o fundo nunca entrou (vazado não tem onde pintar) e o label
    // entrou: 1,01:1, medido no Chromium. Aqui ele reprova.
    const c = corDoLabelVazado("#FDFDFD", IB, { texto: "#FFFFFF" })
    expect(c.ajustado).toBe(true)
    expect(c.texto).toBe("#1F1F1F")
    expect(c.contraste).toBeGreaterThan(4.5)
    expect(c.motivo).toContain("vazado")
  })

  it("label que já passa sobre a faixa é mantido", () => {
    const c = corDoLabelVazado("#FDFDFD", IB, { texto: "#000000" })
    expect(c).toMatchObject({ texto: "#000000", ajustado: false, motivo: null })
  })

  it("faixa escura: a tinta da peça não serve e o código desce a cascata", () => {
    const c = corDoLabelVazado("#034326", IB, { texto: "#1F1F1F" })
    expect(c.ajustado).toBe(true)
    expect(c.texto).toBe("#FFFFFF")
  })

  it("sem faixa conhecida não inventa contraste nem ajusta", () => {
    // Mesma razão pela qual `extrairCtas` devolve `contraste: null` no
    // vazado: afirmar um número sobre um fundo desconhecido é inventar.
    const c = corDoLabelVazado(null, IB, { texto: "#FFFFFF" })
    expect(c).toMatchObject({ texto: "#FFFFFF", ajustado: false, contraste: null })
  })

  it("nenhum papel legível sobre a faixa: mantém em vez de trocar por outro ilegível", () => {
    const cinza = { button_bg: "#7A7A7A", button_text: "#8A8A8A", bg: "#808080", text: "#888888" }
    const c = corDoLabelVazado("#808080", cinza, { texto: "#888888" })
    expect(c.ajustado).toBe(false)
    expect(c.motivo).toContain("nenhum papel")
  })
})
