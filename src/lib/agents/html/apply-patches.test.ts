import { describe, it, expect } from "vitest"

import { parseOps, applyOps, OpsParseError } from "./apply-patches"
import { HERO_SENTINEL_START, HERO_SENTINEL_END } from "./hero-locator"

describe("parseOps", () => {
  it("aceita o objeto com fences e tags com chaves", () => {
    const raw = '```json\n{"ops":[{"action":"img","tag":"{{BODY_IMAGE}}","url":"https://cdn/a.png","alt":"foto"}]}\n```'
    expect(parseOps(raw)).toEqual([
      { action: "img", tag: "BODY_IMAGE", url: "https://cdn/a.png", alt: "foto" },
    ])
  })

  it("lança OpsParseError em JSON inválido / sem ops / action desconhecida", () => {
    expect(() => parseOps("nada")).toThrow(OpsParseError)
    expect(() => parseOps('{"x":1}')).toThrow(OpsParseError)
    expect(() => parseOps('{"ops":[{"action":"zzz"}]}')).toThrow(OpsParseError)
    expect(() => parseOps('{"ops":[{"action":"img","tag":"A"}]}')).toThrow(
      OpsParseError,
    )
  })
})

const hero = `${HERO_SENTINEL_START}<table><tr><td><img src="https://cdn/hero.png">Hero {{HERO_BADGE}}</td></tr></table>${HERO_SENTINEL_END}`
const body = `<table><tr><td><img src="{{BODY_IMAGE}}" alt="{{BODY_IMAGE_ALT}}"></td></tr><tr><td>{{BODY_TEXT}}</td></tr></table>`
const doc = `<!DOCTYPE html><html><body>${hero}${body}<p style="color:#111111">CTA</p></body></html>`

describe("applyOps", () => {
  it("img: troca o token pela URL (e o _ALT quando vem alt)", () => {
    const res = applyOps(
      doc,
      [{ action: "img", tag: "BODY_IMAGE", url: "https://cdn/b.png", alt: "vitrine" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain('src="https://cdn/b.png"')
    expect(res.html).toContain('alt="vitrine"')
    expect(res.html).not.toContain("{{BODY_IMAGE}}")
  })

  it("img: tag inexistente → skipped tag_not_found", () => {
    const res = applyOps(
      doc,
      [{ action: "img", tag: "PRODUCTS_IMAGE", url: "https://cdn/p.png" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("tag_not_found")
  })

  it("remove_slot: remove a <tr> envolvente balanceada", () => {
    const res = applyOps(doc, [{ action: "remove_slot", tag: "BODY_IMAGE" }], {
      allowHero: false,
    })
    expect(res.applied).toBe(1)
    expect(res.html).not.toContain("{{BODY_IMAGE}}")
    expect(res.html).toContain("{{BODY_TEXT}}")
  })

  it("remove_slot: <tr> com OUTRO token de imagem → row_not_removable", () => {
    const shared = `<table><tr><td><img src="{{PRODUCT_1_IMAGE}}"><img src="{{PRODUCT_2_IMAGE}}"></td></tr></table>`
    const res = applyOps(
      `<html><body>${shared}</body></html>`,
      [{ action: "remove_slot", tag: "PRODUCT_1_IMAGE" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("row_not_removable")
    expect(res.html).toContain("{{PRODUCT_2_IMAGE}}")
  })

  it("replace: find único aplica; ambíguo pula", () => {
    const ok = applyOps(
      doc,
      [{ action: "replace", find: 'style="color:#111111"', replace: 'style="color:#BB0000"' }],
      { allowHero: false },
    )
    expect(ok.applied).toBe(1)
    expect(ok.html).toContain("#BB0000")

    const ambiguous = applyOps(
      doc,
      [{ action: "replace", find: "<table>", replace: "<table X>" }],
      { allowHero: false },
    )
    expect(ambiguous.applied).toBe(0)
    expect(ambiguous.skipped[0].reason).toBe("find_ambiguous")
  })

  it("hero protegida: op dentro das sentinelas é rejeitada com allowHero=false", () => {
    const res = applyOps(
      doc,
      [{ action: "replace", find: "https://cdn/hero.png", replace: "https://cdn/x.png" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("hero_protected")
  })

  it("allowHero=true (color_format) pode tocar a hero", () => {
    const res = applyOps(
      doc,
      [{ action: "replace", find: "https://cdn/hero.png", replace: "https://cdn/x.png" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("https://cdn/x.png")
  })

  it("ops em sequência reavaliam o documento atual", () => {
    const res = applyOps(
      doc,
      [
        { action: "img", tag: "BODY_IMAGE", url: "https://cdn/b.png" },
        { action: "replace", find: 'src="https://cdn/b.png"', replace: 'src="https://cdn/b.png" width="600"' },
      ],
      { allowHero: false },
    )
    expect(res.applied).toBe(2)
    expect(res.html).toContain('width="600"')
  })
})
