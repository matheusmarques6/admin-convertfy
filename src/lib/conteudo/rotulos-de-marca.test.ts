import { describe, expect, it } from "vitest"
import { camposDeMarca, handleComArroba, seloDeVerificado } from "./rotulos-de-marca"
import { FAMILIAS } from "./familias"
import type { FamiliaVisual } from "./types"

const traco = (f: FamiliaVisual) => FAMILIAS[f].traco

describe("camposDeMarca", () => {
  it("no cartão de perfil o primeiro campo é o @ e o segundo é o nome exibido", () => {
    const c = camposDeMarca(traco("post"))
    expect(c.map((x) => x.campo)).toEqual(["brandName2", "brandName"])
    expect(c.find((x) => x.campo === "brandName")?.rotulo).toBe("@ (arroba)")
    expect(c.find((x) => x.campo === "brandName")?.arroba).toBe(true)
  })

  it("o copyright fica FORA do cartão de perfil — a identidade não tem rodapé para desenhá-lo", () => {
    for (const f of ["post", "post-largo"] as const) {
      expect(camposDeMarca(traco(f)).some((x) => x.campo === "copyright")).toBe(false)
    }
  })

  it("nas famílias com rodapé os três campos aparecem", () => {
    for (const f of ["padrao", "editorial", "alternado", "manchete"] as const) {
      expect(camposDeMarca(traco(f)).map((x) => x.campo).sort()).toEqual(["brandName", "brandName2", "copyright"])
    }
  })

  it("todo campo oferecido tem rótulo e o rótulo nunca é o nome interno", () => {
    for (const f of Object.keys(FAMILIAS) as FamiliaVisual[]) {
      for (const c of camposDeMarca(traco(f))) {
        expect(c.rotulo.trim().length).toBeGreaterThan(2)
        expect(c.rotulo).not.toBe(c.campo)
      }
    }
  })
})

describe("seloDeVerificado", () => {
  it("é desenhado no cartão de perfil e nas famílias com assinatura no slide", () => {
    expect(seloDeVerificado(traco("post")).desenha).toBe(true)
    expect(seloDeVerificado(traco("padrao")).desenha).toBe(true)
  })

  it("na Manchete não é desenhado, e a tela recebe o motivo em vez de um controle mudo", () => {
    const s = seloDeVerificado(traco("manchete"))
    expect(s.desenha).toBe(false)
    expect(s.onde).toMatch(/assinatura/i)
  })

  it("toda família devolve uma frase — nunca string vazia", () => {
    for (const f of Object.keys(FAMILIAS) as FamiliaVisual[]) {
      expect(seloDeVerificado(traco(f)).onde.trim().length).toBeGreaterThan(5)
    }
  })
})

describe("handleComArroba", () => {
  it("põe a arroba que falta e não duplica a que existe", () => {
    expect(handleComArroba("wellcopymax")).toBe("@wellcopymax")
    expect(handleComArroba("@wellcopymax")).toBe("@wellcopymax")
    expect(handleComArroba("  convertfy ")).toBe("@convertfy")
  })

  it("apagar o texto esvazia o campo — uma arroba sozinha ficaria presa no slide", () => {
    expect(handleComArroba("")).toBe("")
    expect(handleComArroba("@")).toBe("")
    expect(handleComArroba("   ")).toBe("")
  })

  it("é idempotente", () => {
    const v = handleComArroba(handleComArroba("bruno.nardon"))
    expect(v).toBe("@bruno.nardon")
  })
})
