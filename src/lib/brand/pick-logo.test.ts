import { describe, expect, it } from "vitest"

import { pickBrandLogo, type LogoFormat } from "./pick-logo"

// Marca "vazia" — todas as 8 colunas null. Testes preenchem so o que precisam.
const EMPTY = {
  logo_main_svg: null,
  logo_main_png: null,
  logo_alt_svg: null,
  logo_alt_png: null,
  logo_monogram_svg: null,
  logo_monogram_png: null,
  logo_reverse_svg: null,
  logo_reverse_png: null,
}

describe("pickBrandLogo", () => {
  it("null/undefined brand → null", () => {
    expect(pickBrandLogo(null)).toBeNull()
    expect(pickBrandLogo(undefined)).toBeNull()
  })

  it("todas as colunas vazias → null", () => {
    expect(pickBrandLogo(EMPTY)).toBeNull()
    expect(pickBrandLogo({})).toBeNull()
  })

  it("ordem: main vence alt/monogram/reverse quando todos preenchidos", () => {
    const brand = {
      logo_main_png: "main.png",
      logo_alt_png: "alt.png",
      logo_monogram_png: "mono.png",
      logo_reverse_png: "rev.png",
    }
    const p = pickBrandLogo(brand, "png")
    expect(p).toEqual({ url: "main.png", format: "png", variant: "main" })
  })

  it("ordem: main vazio → cai pro alt (proxima variante da cadeia)", () => {
    const brand = { ...EMPTY, logo_alt_png: "alt.png", logo_reverse_png: "rev.png" }
    const p = pickBrandLogo(brand, "png")
    expect(p).toEqual({ url: "alt.png", format: "png", variant: "alt" })
  })

  it("ordem: main+alt vazios → monogram; monogram vazio → reverse", () => {
    const soMono = { ...EMPTY, logo_monogram_svg: "mono.svg" }
    expect(pickBrandLogo(soMono, "png")).toEqual({
      url: "mono.svg",
      format: "svg",
      variant: "monogram",
    })
    const soRev = { ...EMPTY, logo_reverse_png: "rev.png" }
    expect(pickBrandLogo(soRev, "png")).toEqual({
      url: "rev.png",
      format: "png",
      variant: "reverse",
    })
  })

  it("prefer=png: retorna png quando presente na variante", () => {
    const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_main_png: "main.png" }
    expect(pickBrandLogo(brand, "png")).toEqual({
      url: "main.png",
      format: "png",
      variant: "main",
    })
  })

  it("prefer=png: cai pro svg quando so ha svg naquela variante", () => {
    const brand = { ...EMPTY, logo_main_svg: "main.svg" }
    expect(pickBrandLogo(brand, "png")).toEqual({
      url: "main.svg",
      format: "svg",
      variant: "main",
    })
  })

  it("prefer=svg: retorna svg quando presente", () => {
    const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_main_png: "main.png" }
    expect(pickBrandLogo(brand, "svg")).toEqual({
      url: "main.svg",
      format: "svg",
      variant: "main",
    })
  })

  it("prefer=svg: cai pro png quando so ha png", () => {
    const brand = { ...EMPTY, logo_main_png: "main.png" }
    expect(pickBrandLogo(brand, "svg")).toEqual({
      url: "main.png",
      format: "png",
      variant: "main",
    })
  })

  it("fallback de formato NAO pula variante: main-svg vence alt-png quando prefer=png", () => {
    // main so tem svg; alt tem png. prefer=png, mas main vem antes na cadeia:
    // o fallback de formato acontece DENTRO da variante, entao main-svg vence.
    const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_alt_png: "alt.png" }
    expect(pickBrandLogo(brand, "png")).toEqual({
      url: "main.svg",
      format: "svg",
      variant: "main",
    })
  })

  it("default prefer = png", () => {
    const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_main_png: "main.png" }
    // sem 2o argumento deve preferir png
    expect(pickBrandLogo(brand)?.format).toBe<LogoFormat>("png")
  })

  it("ignora strings vazias / so-espacos (trata como ausente)", () => {
    const brand = { ...EMPTY, logo_main_png: "   ", logo_main_svg: "", logo_alt_png: "alt.png" }
    expect(pickBrandLogo(brand, "png")).toEqual({
      url: "alt.png",
      format: "png",
      variant: "alt",
    })
  })

  it("trima a URL retornada", () => {
    const brand = { ...EMPTY, logo_main_png: "  main.png  " }
    expect(pickBrandLogo(brand, "png")?.url).toBe("main.png")
  })

  it("reporta variant+format corretos ao cair numa variante intermediaria (mixed formats)", () => {
    // main vazio; alt so tem svg (formato != prefer); monogram tem png.
    // prefer=png: alt vence (proxima variante nao-vazia), reportando o svg do
    // alt com format='svg' e variant='alt' (NAO pula pro png do monogram).
    const brand = {
      ...EMPTY,
      logo_alt_svg: "alt.svg",
      logo_monogram_png: "mono.png",
    }
    expect(pickBrandLogo(brand, "png")).toEqual({
      url: "alt.svg",
      format: "svg",
      variant: "alt",
    })
  })

  it("prefer=svg atravessando ate reverse: reporta variant='reverse' + format correto", () => {
    // Ninguem tem svg; so reverse tem png. prefer=svg cai pro png do reverse,
    // reportando variant='reverse' e format='png' (fim da cadeia).
    const brand = { ...EMPTY, logo_reverse_png: "rev.png" }
    expect(pickBrandLogo(brand, "svg")).toEqual({
      url: "rev.png",
      format: "png",
      variant: "reverse",
    })
  })

  describe("rasterOnly (agente de imagem: nunca SVG)", () => {
    it("pula o svg e pega o png de variante posterior", () => {
      // main so tem svg; alt tem png. rasterOnly pula o svg do main → alt.png.
      const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_alt_png: "alt.png" }
      expect(pickBrandLogo(brand, "png", { rasterOnly: true })).toEqual({
        url: "alt.png",
        format: "png",
        variant: "alt",
      })
    })

    it("so svg em todas as variantes → null (gera sem logo, sem erro)", () => {
      const brand = { ...EMPTY, logo_main_svg: "m.svg", logo_reverse_svg: "r.svg" }
      expect(pickBrandLogo(brand, "png", { rasterOnly: true })).toBeNull()
    })

    it("png presente → retorna png normalmente", () => {
      const brand = { ...EMPTY, logo_main_png: "main.png" }
      expect(pickBrandLogo(brand, "png", { rasterOnly: true })).toEqual({
        url: "main.png",
        format: "png",
        variant: "main",
      })
    })

    it("sem rasterOnly (default) mantem o fallback pro svg (nao-regressao)", () => {
      const brand = { ...EMPTY, logo_main_svg: "main.svg", logo_alt_png: "alt.png" }
      expect(pickBrandLogo(brand, "png")).toEqual({
        url: "main.svg",
        format: "svg",
        variant: "main",
      })
    })
  })
})
