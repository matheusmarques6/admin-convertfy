import { describe, it, expect } from "vitest"
import { deriveCenario } from "./cenario-derivation"

describe("deriveCenario", () => {
  it("returns override when provided", () => {
    expect(
      deriveCenario({
        nicho: "moda",
        posicionamento: "premium",
        override: "ambiente customizado pelo cliente",
      }),
    ).toBe("ambiente customizado pelo cliente")
  })

  it("ignores empty/whitespace override and falls back to derivation", () => {
    expect(
      deriveCenario({ nicho: "moda", posicionamento: "medio", override: "  " }),
    ).toContain("rua urbana")
  })

  it("derives moda + premium with sofisticated suffix", () => {
    const c = deriveCenario({ nicho: "moda", posicionamento: "premium" })
    expect(c).toContain("rua urbana")
    expect(c).toContain("sofisticado")
  })

  it("derives beleza + popular with acessivel suffix", () => {
    const c = deriveCenario({ nicho: "beleza", posicionamento: "popular" })
    expect(c).toContain("spa")
    expect(c).toContain("acessivel")
  })

  it("derives pet + medio with no suffix", () => {
    const c = deriveCenario({ nicho: "pet", posicionamento: "medio" })
    expect(c).toContain("aconchegante")
    expect(c).not.toContain("sofisticado")
    expect(c).not.toContain("acessivel")
  })

  it("matches substring (acessorios automotivos → automotivo)", () => {
    const c = deriveCenario({
      nicho: "Acessorios Automotivos",
      posicionamento: "premium",
    })
    expect(c).toContain("garagem")
  })

  it("matches tech/gadgets", () => {
    expect(deriveCenario({ nicho: "tech", posicionamento: null })).toContain(
      "spotlight",
    )
    expect(deriveCenario({ nicho: "gadgets", posicionamento: null })).toContain(
      "spotlight",
    )
  })

  it("falls back to generic for unknown nicho", () => {
    expect(
      deriveCenario({ nicho: "loja-de-pedras-raras", posicionamento: "medio" }),
    ).toContain("clean e contemporaneo")
  })

  it("falls back to generic for null/undefined nicho", () => {
    expect(deriveCenario({ nicho: null, posicionamento: null })).toContain(
      "clean e contemporaneo",
    )
    expect(
      deriveCenario({ nicho: undefined, posicionamento: undefined }),
    ).toContain("clean e contemporaneo")
  })

  it("appends premium suffix even on fallback", () => {
    const c = deriveCenario({ nicho: null, posicionamento: "premium" })
    expect(c).toContain("clean e contemporaneo")
    expect(c).toContain("sofisticado")
  })
})
