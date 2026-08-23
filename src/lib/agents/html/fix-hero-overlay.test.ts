import { describe, it, expect } from "vitest"
import { fixHeroOverlayText, sameAsset } from "./fix-hero-overlay"

const DARK = "#1F1F1F"
const FOTO = "https://cdn/hero.png"

/** Hero real da Luxe Lift: foto de fundo + textos brancos + botão sólido. */
const HERO = [
  `<table><tr><td style="background-image:url('${FOTO}');background-size:598px 1150px;">`,
  '<table><tr><td style="font-size:50px;color:#FFFFFF;">Welcome to</td></tr>',
  '<tr><td style="font-size:22px;color:#FFFFFF;">Support and comfort.</td></tr>',
  '<tr><td style="background:#3D2820;"><a style="color:#FFFFFF;">SHOP NOW</a></td></tr>',
  "</table></td></tr></table>",
].join("\n")

describe("sameAsset", () => {
  it("ignora a assinatura do storage", () => {
    expect(
      sameAsset(
        "https://s.co/object/sign/a/b.png?token=AAA",
        "https://s.co/object/sign/a/b.png?token=BBB",
      ),
    ).toBe(true)
  })

  it("arquivos diferentes não casam", () => {
    expect(sameAsset("https://s.co/a.png", "https://s.co/b.png")).toBe(false)
    expect(sameAsset("", "https://s.co/a.png")).toBe(false)
  })
})

describe("fixHeroOverlayText", () => {
  it("escurece o texto que pousa na FOTO", () => {
    const r = fixHeroOverlayText(HERO, FOTO, DARK)
    expect(r.fixed).toBe(2)
    expect(r.html).toContain(`font-size:50px;color:${DARK}`)
    expect(r.html).toContain(`font-size:22px;color:${DARK}`)
  })

  it("casa mesmo com a assinatura diferente da persistida", () => {
    const r = fixHeroOverlayText(HERO, `${FOTO}?token=OUTRO`, DARK)
    expect(r.fixed).toBe(2)
  })

  it("NÃO toca no botão com fundo sólido próprio dentro da hero", () => {
    // #3D2820 + branco está em 11:1 — escurecer o rótulo criaria o defeito
    // oposto, texto escuro sobre botão escuro.
    const r = fixHeroOverlayText(HERO, FOTO, DARK)
    expect(r.html).toContain('style="background:#3D2820;"><a style="color:#FFFFFF;">')
  })

  it("texto que já é escuro fica como está", () => {
    const html =
      `<table><tr><td style="background-image:url(${FOTO});">` +
      '<span style="color:#1A1A1A;">escuro</span></td></tr></table>'
    const r = fixHeroOverlayText(html, FOTO, DARK)
    expect(r.fixed).toBe(0)
    expect(r.html).toBe(html)
  })

  it("corrige só a banda ALVO quando o bloco tem várias (review 7)", () => {
    // Três bandas no MESMO bloco, luminâncias diferentes: só a clara foi
    // medida acima do corte.
    const banda = (url: string, texto: string) =>
      `<table><tr><td style="background-image:url('${url}');">` +
      `<span style="color:#FFFFFF;">${texto}</span></td></tr></table>`
    const doc = [
      banda("https://cdn/b1.png", "clara"),
      banda("https://cdn/b2.png", "escura"),
      banda("https://cdn/b3.png", "escura tambem"),
    ].join("\n")
    const r = fixHeroOverlayText(doc, "https://cdn/b1.png", DARK)
    expect(r.fixed).toBe(1)
    expect(r.html).toContain(`<span style="color:${DARK};">clara</span>`)
    expect(r.html).toContain('<span style="color:#FFFFFF;">escura</span>')
    expect(r.html).toContain('<span style="color:#FFFFFF;">escura tambem</span>')
  })

  it("URL ausente do documento não altera nada", () => {
    const r = fixHeroOverlayText(HERO, "https://cdn/inexistente.png", DARK)
    expect(r.fixed).toBe(0)
    expect(r.html).toBe(HERO)
  })

  it("URL vazia não altera nada", () => {
    expect(fixHeroOverlayText(HERO, "", DARK).fixed).toBe(0)
  })

  it("texto sobre fundo sólido fora de foto não é alvo", () => {
    const html =
      '<table><tr><td style="background:#3D2820;">' +
      '<span style="color:#FFFFFF;">ok</span></td></tr></table>'
    const r = fixHeroOverlayText(html, FOTO, DARK)
    expect(r.fixed).toBe(0)
  })
})
