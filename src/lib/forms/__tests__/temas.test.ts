import { describe, expect, it } from "vitest"
import { aplicarFormato, aplicarGradiente, aplicarTema, ehEscuro, formatoDoBotao, temaAtual, TEMAS } from "../temas"

describe("aplicarTema / temaAtual", () => {
  it("todo tema pronto é reconhecido depois de aplicado", () => {
    for (const t of TEMAS) {
      expect(temaAtual(aplicarTema({}, t.id))).toBe(t.id)
    }
  })

  it("aplicar escreve só o que o tema decide e preserva o resto", () => {
    const antes = { logoHeight: 40, headingSize: 32, bgGradient: { from: "#000", to: "#fff" } }
    const depois = aplicarTema(antes, "areia")
    expect(depois.logoHeight).toBe(40)
    expect(depois.headingSize).toBe(32)
    // o gradiente contradiz o fundo sólido do tema — sai
    expect(depois.bgGradient).toBeNull()
    expect(depois.mode).toBe("light")
    expect(depois.fontFamily).toBe("Georgia")
  })

  it("mexer na cor de destaque vira Personalizado; mexer no raio não", () => {
    const grafite = aplicarTema({}, "grafite")
    expect(temaAtual({ ...grafite, primaryColor: "#DC2626" })).toBeNull()
    expect(temaAtual({ ...grafite, buttonRadius: 999 })).toBe("grafite")
  })

  it("tema desconhecido não mexe em nada", () => {
    const t = { primaryColor: "#123456" }
    expect(aplicarTema(t, "nao-existe")).toBe(t)
  })

  it("modo sai da luminância do fundo", () => {
    expect(ehEscuro("#0B0F1A")).toBe(true)
    expect(ehEscuro("#F6F7FB")).toBe(false)
    expect(aplicarTema({}, "floresta").mode).toBe("dark")
    expect(aplicarTema({}, "papel").mode).toBe("light")
  })
})

describe("formato do botão", () => {
  it("3 / 9 / 999 são os três formatos; outro raio não marca nenhum", () => {
    expect(formatoDoBotao({ buttonRadius: 3 })).toBe("reto")
    expect(formatoDoBotao({ buttonRadius: 9 })).toBe("arredondado")
    expect(formatoDoBotao({ buttonRadius: 999 })).toBe("pill")
    expect(formatoDoBotao({ buttonRadius: 12 })).toBeNull()
    expect(formatoDoBotao({})).toBeNull()
  })
  it("o raio do botão cai no do tema quando não há próprio", () => {
    expect(formatoDoBotao({ borderRadius: 9 })).toBe("arredondado")
  })
  it("aplicar escreve botão e input juntos", () => {
    expect(aplicarFormato({}, "pill")).toEqual({ buttonRadius: 999, inputRadius: 14 })
    expect(aplicarFormato({}, "reto")).toEqual({ buttonRadius: 3, inputRadius: 3 })
  })
})

describe("aplicarGradiente", () => {
  it("guarda o ângulo que já estava e decide o modo pelas duas pontas", () => {
    const t = aplicarGradiente({ bgGradient: { from: "#fff", to: "#000", angle: 90 } }, ["#0B0F1A", "#1E2A5A"])
    expect(t.bgGradient).toEqual({ from: "#0B0F1A", to: "#1E2A5A", angle: 90 })
    expect(t.mode).toBe("dark")
    expect(aplicarGradiente({}, ["#F4EFE6", "#FBD9B5"]).mode).toBe("light")
  })
  it("trocar de modo solta a cor de texto explícita; manter o modo a preserva", () => {
    const areia = aplicarTema({}, "areia") // claro, texto marrom
    expect(aplicarGradiente(areia, ["#7C3AED", "#DB2777"]).textColor).toBeUndefined()
    expect(aplicarGradiente(areia, ["#F4EFE6", "#FBD9B5"]).textColor).toBe("#2B241B")
  })
})
