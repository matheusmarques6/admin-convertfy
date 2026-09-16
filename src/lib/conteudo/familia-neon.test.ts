import { describe, expect, it } from "vitest"
import { FAMILIAS, aplicarFamilia, fundoPadraoDaFamilia, ritmoDeFundos } from "./familias"
import { novoDocumento } from "./documento"
import { brilhoCor } from "./brand"
import { getTemplate } from "./templates"
import type { Documento } from "./types"

const N = FAMILIAS.neon

describe("identidade Neon", () => {
  it("é bloco preto, não alternância nem cartão de perfil", () => {
    expect(N.traco.respiroClaro).toBe(true)
    expect(N.traco.alternaFundo).toBe(false)
    expect(N.traco.cartaoPerfil).toBe(false)
    // O preto não é #000 e o claro não é #FFF: os dois chapam.
    expect(N.fundoEscuro).not.toBe("#000000")
    expect(N.fundoClaro).not.toBe("#FFFFFF")
  })

  it("o respiro é UM slide, no meio — o resto é preto", () => {
    const total = 6
    const fundos = Array.from({ length: total }, (_, i) => fundoPadraoDaFamilia("neon", "texto", i, total))
    expect(fundos.filter((f) => f === N.fundoClaro)).toHaveLength(1)
    expect(fundos[Math.floor(total / 2)]).toBe(N.fundoClaro)
    // Nem a capa nem o CTA abrem exceção: gradiente quebraria o bloco.
    expect(fundoPadraoDaFamilia("neon", "capa", 0, total)).toBe(N.fundoEscuro)
    expect(fundoPadraoDaFamilia("neon", "cta", total - 1, total)).toBe(N.fundoEscuro)
  })

  it("sem saber o total, a peça fica TODA escura em vez de adivinhar o meio", () => {
    expect(fundoPadraoDaFamilia("neon", "texto", 2)).toBe(N.fundoEscuro)
    // Peça curta também: com 3 slides não há meio que dê respiro.
    expect(fundoPadraoDaFamilia("neon", "texto", 1, 3)).toBe(N.fundoEscuro)
  })

  it("inserir um slide no meio REFAZ o ritmo — o respiro acompanha", () => {
    const base = aplicarFamilia(novoDocumento("x", "", "molde-neon"), "neon")
    const doc = ritmoDeFundos(base)
    const claros = (d: Documento) => d.frames.filter((f) => d.fundoPorFrame[f.frameId] === N.fundoClaro).map((f) => f.frameId)
    expect(claros(doc)).toHaveLength(1)
    const antes = claros(doc)[0]

    const extra = { ...doc.frames[1], frameId: "novo" }
    const maior = ritmoDeFundos({ ...doc, frames: [doc.frames[0], extra, ...doc.frames.slice(1)], fundoPorFrame: { ...doc.fundoPorFrame, novo: N.fundoEscuro } })
    expect(claros(maior)).toHaveLength(1)
    expect(claros(maior)[0]).not.toBe(antes)
  })

  it("fundo pintado à mão sobrevive ao recálculo do ritmo", () => {
    const doc = ritmoDeFundos(aplicarFamilia(novoDocumento("x", "", "molde-neon"), "neon"))
    const alvo = doc.frames[1].frameId
    const pintado = ritmoDeFundos({ ...doc, fundoPorFrame: { ...doc.fundoPorFrame, [alvo]: "#7C3AED" } })
    expect(pintado.fundoPorFrame[alvo]).toBe("#7C3AED")
  })

  it("ida e volta devolve o documento à família de origem", () => {
    const base: Documento = novoDocumento("x", "", "molde-turbo")
    const volta = aplicarFamilia(aplicarFamilia(base, "neon"), "padrao")
    expect(volta.fundoPorFrame).toEqual(base.fundoPorFrame)
    // A cor que SÓ a Neon declara (`apoio`) sai na volta: sobrevivendo, ela
    // pintaria o corpo dos slides claros da casa sem ninguém ter escolhido.
    expect(volta.cores).toEqual(base.cores)
    expect(volta.cores.apoio).toBeUndefined()
  })

  it("mas a cor posta À MÃO sobrevive à troca de identidade", () => {
    const base = aplicarFamilia(novoDocumento("x", "", "molde-neon"), "neon")
    const pintado: Documento = { ...base, cores: { ...base.cores, apoio: "#7C3AED" } }
    expect(aplicarFamilia(pintado, "padrao").cores.apoio).toBe("#7C3AED")
  })

  it("a foto acende e o fecho é caixa sólida", () => {
    expect(N.traco.brilhoImagem).toBeGreaterThan(0)
    expect(N.traco.cta).toBe("bloco")
    expect(N.traco.reguaSobCorpo).toBe(true)
    // Só a Neon: nas outras a foto é chapada e a régua seria enfeite.
    for (const [key, f] of Object.entries(FAMILIAS)) {
      if (key === "neon") continue
      expect(f.traco.brilhoImagem).toBe(0)
      expect(f.traco.reguaSobCorpo).toBe(false)
    }
  })

  it("o molde da Neon pressupõe a identidade e tem o respiro no meio", () => {
    const t = getTemplate("molde-neon")
    expect(t.familia).toBe("neon")
    const meio = t.frames[Math.floor(t.frames.length / 2)]
    expect(meio.label).toBe("Respiro")
    // O respiro é o único sem foto: é o slide de argumento.
    expect(meio.slotsImagem).toBe(0)
  })
})

describe("brilhoCor", () => {
  it("devolve a mesma cor com alfa", () => {
    expect(brilhoCor("#3B5BFD", 0.45)).toBe("rgba(59, 91, 253, 0.45)")
  })

  it("cor que não é hexadecimal volta INTEIRA — rgba(NaN) some do desenho sem erro", () => {
    expect(brilhoCor("var(--x)", 0.4)).toBe("var(--x)")
  })
})
