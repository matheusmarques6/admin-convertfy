import { describe, expect, it } from "vitest"
import { comBranco, comPreto, matiz, paletaDeUmaCor, temperaturaDaCor, tintaSobre } from "./paleta"

describe("paleta a partir de uma cor", () => {
  it("clareia e escurece por mistura, com teto nos dois extremos", () => {
    expect(comBranco("#000000", 0)).toBe("#000000")
    expect(comBranco("#000000", 1)).toBe("#FFFFFF")
    expect(comPreto("#FFFFFF", 1)).toBe("#000000")
    expect(comBranco("#2C6BED", 0.2)).toBe("#5689F1")
    expect(comPreto("#2C6BED", 0.3)).toBe("#1F4BA6")
  })

  it("matiz: cinza puro não tem, e por isso é declarado frio", () => {
    expect(matiz("#808080")).toBeNull()
    expect(temperaturaDaCor("#808080")).toBe("cool")
    expect(Math.round(matiz("#FF0000") ?? -1)).toBe(0)
    expect(Math.round(matiz("#00FF00") ?? -1)).toBe(120)
  })

  it("a temperatura escolhe o off-white: laranja não pode cair em cinza azulado", () => {
    expect(paletaDeUmaCor("#E2650F").fundoClaro).toBe("#F6F3F0")
    expect(paletaDeUmaCor("#2C6BED").fundoClaro).toBe("#F0F2F5")
    expect(paletaDeUmaCor("#E2650F").temperatura).toBe("warm")
    expect(paletaDeUmaCor("#7B2CBF").temperatura).toBe("cool")
    // Magenta volta para o quente pelo outro lado da roda.
    expect(paletaDeUmaCor("#E8148C").temperatura).toBe("warm")
  })

  it("o gradiente é escura → primária → clara, no ângulo do formato", () => {
    const p = paletaDeUmaCor("#2C6BED")
    expect(p.gradiente).toEqual({ de: p.escura, meio: p.primaria, ate: p.clara, angulo: 165 })
  })

  it("a borda é o fundo claro um passo abaixo — nunca traço de caneta", () => {
    const p = paletaDeUmaCor("#2C6BED")
    expect(p.borda).toBe(comPreto(p.fundoClaro, 0.05))
    expect(p.borda).not.toBe(p.primaria)
  })

  it("cor inválida não quebra a tela: cai na cor da casa", () => {
    expect(paletaDeUmaCor("").primaria).toBe("#2C6BED")
    expect(paletaDeUmaCor("azul").primaria).toBe("#2C6BED")
    expect(paletaDeUmaCor("#abc").primaria).toBe("#2C6BED")
  })

  it("aceita a cor sem cerquilha e normaliza a caixa", () => {
    expect(paletaDeUmaCor("e2650f").primaria).toBe("#E2650F")
  })

  it("a tinta vem do fundo, nunca da primária", () => {
    const p = paletaDeUmaCor("#2C6BED")
    expect(tintaSobre(p.fundoClaro)).toBe("#0F0D0C")
    expect(tintaSobre(p.fundoEscuro)).toBe("#FFFFFF")
    expect(tintaSobre("gradiente")).toBe("#0F0D0C")
  })
})
