import { describe, it, expect } from "vitest"

import {
  locateHeroRegion,
  spliceHero,
  extractHeroBySentinels,
  stripSentinels,
  heroUnchanged,
  respliceHero,
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "./hero-locator"

const block = (inner: string) =>
  `<table role="presentation"><tr><td>${inner}</td></tr></table>`

const doc = (body: string) =>
  `<!DOCTYPE html><html><body><div>${body}</div></body></html>`

const headerBlock = block("{{LOGO}}")
const heroBlock = block(
  `<img src="{{HERO_IMAGE}}" alt="{{HERO_IMAGE_ALT}}">{{HERO_HEADLINE}} {{HERO_CTA_LABEL}}`,
)
const ctaBlock = block("{{CTA_LABEL}} {{CTA_URL}}")

describe("locateHeroRegion — modo marker", () => {
  it("acha a região pelo par cfy:block da hero", () => {
    const html = doc(
      `${headerBlock}\n<!-- cfy:block:1:hero:start -->\n${heroBlock}\n<!-- cfy:block:1:hero:end -->\n${ctaBlock}`,
    )
    const region = locateHeroRegion(html)
    expect(region?.mode).toBe("marker")
    const slice = html.slice(region!.start, region!.end)
    expect(slice).toContain("{{HERO_IMAGE}}")
    expect(slice).not.toContain("{{CTA_LABEL}}")
    expect(slice).not.toContain("{{LOGO}}")
  })

  it("dois blocos hero marcados → ambíguo → cai no modo tag", () => {
    const html = doc(
      [
        "<!-- cfy:block:0:hero:start -->",
        heroBlock,
        "<!-- cfy:block:0:hero:end -->",
        "<!-- cfy:block:1:hero:start -->",
        block("{{HERO_SUBHEAD}}"),
        "<!-- cfy:block:1:hero:end -->",
      ].join("\n"),
    )
    const region = locateHeroRegion(html)
    // Modo marker desiste; o tag-locator pode ou não resolver — só não pode
    // devolver uma região "marker" parcial.
    expect(region?.mode).not.toBe("marker")
  })
})

describe("locateHeroRegion — modo tag (legado)", () => {
  it("recorta a tabela da hero entre header e cta", () => {
    const html = doc(`${headerBlock}${heroBlock}${ctaBlock}`)
    const region = locateHeroRegion(html)
    expect(region?.mode).toBe("tag")
    const slice = html.slice(region!.start, region!.end)
    expect(slice).toContain("{{HERO_HEADLINE}}")
    expect(slice).toContain("{{HERO_IMAGE}}")
    expect(slice).not.toContain("{{LOGO}}")
    expect(slice).not.toContain("{{CTA_LABEL}}")
    expect(slice.startsWith("<table")).toBe(true)
    expect(slice.endsWith("</table>")).toBe(true)
  })

  it("hero em tabelas irmãs (imagem + texto) — consome os siblings", () => {
    const imgTable = block(`<img src="{{HERO_IMAGE}}">`)
    const textTable = block("{{HERO_HEADLINE}} {{HERO_BODY}}")
    const html = doc(`${headerBlock}${imgTable}\n<!-- gap -->\n${textTable}${ctaBlock}`)
    const region = locateHeroRegion(html)
    expect(region?.mode).toBe("tag")
    const slice = html.slice(region!.start, region!.end)
    expect(slice).toContain("{{HERO_IMAGE}}")
    expect(slice).toContain("{{HERO_BODY}}")
    expect(slice).not.toContain("{{CTA_LABEL}}")
  })

  it("hero na MESMA tabela dos outros blocos (não recortável) → null", () => {
    const shared = block(`{{LOGO}} {{HERO_HEADLINE}} {{CTA_LABEL}}`)
    const html = doc(shared)
    expect(locateHeroRegion(html)).toBeNull()
  })

  it("sem tags de hero → null", () => {
    const html = doc(`${headerBlock}${ctaBlock}`)
    expect(locateHeroRegion(html)).toBeNull()
  })
})

describe("splice + sentinelas", () => {
  const html = doc(`${headerBlock}${heroBlock}${ctaBlock}`)
  const region = locateHeroRegion(html)!
  const fragment = block(`<img src="https://cdn/x.png">Nova hero`)
  const spliced = spliceHero(html, region, fragment)

  it("spliceHero injeta o fragmento entre sentinelas e preserva o resto", () => {
    expect(spliced).toContain(HERO_SENTINEL_START)
    expect(spliced).toContain(HERO_SENTINEL_END)
    expect(spliced).toContain("Nova hero")
    expect(spliced).not.toContain("{{HERO_HEADLINE}}")
    expect(spliced).toContain("{{LOGO}}")
    expect(spliced).toContain("{{CTA_LABEL}}")
  })

  it("extractHeroBySentinels devolve o inner exato", () => {
    const found = extractHeroBySentinels(spliced)
    expect(found?.inner.trim()).toBe(fragment)
  })

  it("stripSentinels remove só as sentinelas", () => {
    const stripped = stripSentinels(spliced)
    expect(stripped).not.toContain("cfy:hero")
    expect(stripped).toContain("Nova hero")
  })

  it("heroUnchanged detecta alteração e respliceHero restaura", () => {
    const tampered = spliced.replace("Nova hero", "Hero adulterada")
    expect(heroUnchanged(spliced, tampered)).toBe(false)
    expect(heroUnchanged(spliced, spliced)).toBe(true)
    const restored = respliceHero(tampered, spliced)
    expect(restored).not.toBeNull()
    expect(heroUnchanged(spliced, restored!)).toBe(true)
  })

  it("respliceHero → null quando as sentinelas sumiram", () => {
    const lost = spliced.replaceAll(HERO_SENTINEL_START, "")
    expect(respliceHero(lost, spliced)).toBeNull()
  })
})

// CM-5 (achado no CM-2): a validação de `foreign` só enxerga blocos COM tag
// canônica. Sem isso, um footer sem tags deixava o candidato mais externo —
// a tabela container — passar, e o splice apagava o resto do email.
describe("locateHeroRegion — guard de região desproporcional", () => {
  const container = (inner: string) =>
    `<html><body><table role="presentation"><tr><td>${inner}</td></tr></table></body></html>`

  it("não engole vizinho sem tag canônica", () => {
    const html = container(
      `<table><tr><td>{{HERO_HEADLINE}}</td></tr></table>` +
        `<table><tr><td>texto de rodape sem tag nenhuma, bem longo para pesar no documento e representar o resto do email que nao pode ser engolido pela regiao da hero</td></tr></table>`,
    )
    const region = locateHeroRegion(html)
    expect(region).not.toBeNull()
    const inside = html.slice(region!.start, region!.end)
    expect(inside).toContain("{{HERO_HEADLINE}}")
    expect(inside).not.toContain("rodape")
  })

  it("marcador tem precedência e não sofre o guard", () => {
    const html = container(
      `<!-- cfy:block:0:hero:start --><table><tr><td>{{HERO_HEADLINE}}</td></tr></table><!-- cfy:block:0:hero:end -->`,
    )
    const region = locateHeroRegion(html)
    expect(region?.mode).toBe("marker")
  })
})
