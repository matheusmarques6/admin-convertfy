import { describe, expect, it } from "vitest"

import { contrastRatio } from "./color-roles"
import { CONTRASTE_MINIMO, tintaDoOrnamento } from "./separador-tinta"

const PAPEIS = {
  button_bg: "#034326",
  button_text: "#FFFFFF",
  bg: "#FFFFFF",
  text: "#1F1F1F",
  surface: "#F2F2F2",
  accent: "#07A55D",
}

describe("tintaDoOrnamento", () => {
  it("o caso MEDIDO: #E3E3E3 sobre branco não desenha nada", () => {
    // Achado renderizando as oito formas no Chromium: com esta tinta o
    // filete, o traço, os pontos e o losango somem da tela. 1,28:1.
    expect(contrastRatio("#E3E3E3", "#FFFFFF")).toBeLessThan(CONTRASTE_MINIMO)
    const r = tintaDoOrnamento("#FFFFFF", "#E3E3E3", PAPEIS)
    expect(r.trocada).toBe(true)
    expect(r.tinta).toBe("#07A55D")
    expect(r.motivo).toMatch(/1\.2\d:1/)
  })

  it("tinta com contraste passa intacta", () => {
    const r = tintaDoOrnamento("#FFFFFF", "#034326", PAPEIS)
    expect(r).toEqual({ tinta: "#034326", trocada: false, motivo: null })
  })

  it("a cascata prefere o acento, e o texto é o último", () => {
    // Um filete na cor do texto serve SEMPRE, e por isso é o último: fosse
    // o primeiro, nenhuma peça usaria o acento.
    const semAcento = { ...PAPEIS, accent: undefined }
    expect(tintaDoOrnamento("#FFFFFF", null, semAcento).tinta).toBe("#034326")
    const soTexto = { ...PAPEIS, accent: undefined, button_bg: "#FEFEFE" }
    expect(tintaDoOrnamento("#FFFFFF", null, soTexto).tinta).toBe("#1F1F1F")
  })

  it("nenhum papel serve → sem tinta, e a separação não entra", () => {
    const branco = { ...PAPEIS, accent: "#FEFEFE", button_bg: "#FDFDFD", text: "#FCFCFC" }
    const r = tintaDoOrnamento("#FFFFFF", "#F8F8F8", branco)
    expect(r.tinta).toBeNull()
    expect(r.motivo).toMatch(/nenhum papel da paleta alcança/)
  })

  it("faixa sem fundo não tem contraste medível", () => {
    const r = tintaDoOrnamento(null, "#034326", PAPEIS)
    expect(r.tinta).toBeNull()
    expect(r.motivo).toMatch(/não declara fundo/)
  })

  it("sobre fundo ESCURO a cascata também acha tinta", () => {
    // Escrevi este teste esperando `null` e ele veio `#07A55D`: o acento
    // da Innova Bay é claro e serve sobre o verde escuro. A lição não foi o
    // teste — foi que `button_text` e `bg` faltavam na cascata, e numa
    // marca de acento ESCURO a faixa escura ficaria sem ornamento possível.
    expect(tintaDoOrnamento("#034326", "#034326", PAPEIS).tinta).toBe("#07A55D")

    const acentoEscuro = { ...PAPEIS, accent: "#0A2E1C", button_bg: "#062B18" }
    const r = tintaDoOrnamento("#034326", "#034326", acentoEscuro)
    expect(r.tinta).toBe("#FFFFFF")
    expect(r.trocada).toBe(true)
  })

  it("sem papéis nenhuns, só a tinta pedida decide", () => {
    expect(tintaDoOrnamento("#FFFFFF", "#1F1F1F", null).tinta).toBe("#1F1F1F")
    expect(tintaDoOrnamento("#FFFFFF", "#E3E3E3", null).tinta).toBeNull()
  })
})
