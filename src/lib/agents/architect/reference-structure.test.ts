import { describe, expect, it } from "vitest"

import {
  extractStructureFromReference,
  skeletonToPromptJson,
} from "./reference-structure"

const CANONICAL_HTML = `<!DOCTYPE html>
<html><head><title>{{EMAIL_TITLE}}</title></head><body>
<div style="display:none">{{PREHEADER}}</div>
<table>
  <tr><td>{{LOGO}}</td></tr>
  <tr><td background="x">
    <span>{{HERO_EYEBROW}}</span>
    <h1>{{HERO_HEADLINE}}</h1>
    <p>{{HERO_BODY}}</p>
    <a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a>
    <img src="{{HERO_IMAGE}}" alt="{{HERO_IMAGE_ALT}}">
  </td></tr>
  <tr><td>
    <h2>{{USP_1_TITLE}}</h2><p>{{USP_1_TEXT}}</p>
    <h2>{{USP_2_TITLE}}</h2><p>{{USP_2_TEXT}}</p>
  </td></tr>
  <tr><td>
    <h2>{{OFFER_HEADLINE}}</h2>
    <span>{{COUPON_CODE}}</span><small>{{COUPON_HINT}}</small>
    <a href="{{OFFER_CTA_URL}}">{{OFFER_CTA_LABEL}}</a>
  </td></tr>
  <tr><td>
    <p>{{FOOTER_TAGLINE}}</p>
    <a href="{{FOOTER_LINK_1_URL}}">{{FOOTER_LINK_1_LABEL}}</a>
    <a href="{{UNSUBSCRIBE_URL}}">{{UNSUBSCRIBE_LABEL}}</a>
  </td></tr>
</table>
</body></html>`

describe("extractStructureFromReference", () => {
  it("segmenta blocos por seção, na ordem do documento", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)
    expect(s).not.toBeNull()
    expect(s!.blocks.map((b) => b.type)).toEqual([
      "header",
      "hero",
      "features",
      "coupon",
      "footer",
    ])
  })

  it("needs_image só onde há tag de imagem", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)!
    const byType = Object.fromEntries(s.blocks.map((b) => [b.type, b]))
    expect(byType.hero.needs_image).toBe(true)
    expect(byType.features.needs_image).toBe(false)
    expect(byType.coupon.needs_image).toBe(false)
  })

  it("image_aspect vem da tag de imagem via registry (hero → 4:5)", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)!
    const byType = Object.fromEntries(s.blocks.map((b) => [b.type, b]))
    expect(byType.hero.image_aspect).toBe("4:5")
    expect(byType.features.image_aspect).toBeNull()
    expect(byType.coupon.image_aspect).toBeNull()
  })

  it("copy_spec vem do registry com dedup por copyKey", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)!
    const hero = s.blocks.find((b) => b.type === "hero")!
    const keys = hero.copy_spec.map((f) => f.key)
    expect(keys).toEqual(["eyebrow", "headline", "body", "cta"])
    expect(hero.copy_spec.find((f) => f.key === "eyebrow")?.max_chars).toBe(24)

    // USP_1_TITLE e USP_2_TITLE → um só spec "title"
    const usp = s.blocks.find((b) => b.type === "features")!
    expect(usp.copy_spec.map((f) => f.key)).toEqual(["title", "text"])
  })

  it("tags META não formam bloco; tags de url/data não geram copy_spec", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)!
    expect(s.blocks.some((b) => b.section === "META")).toBe(false)
    const footer = s.blocks.find((b) => b.type === "footer")!
    expect(footer.copy_spec.map((f) => f.key)).toEqual(["tagline"])
  })

  it("HTML legado (tags fora do vocabulário) → null", () => {
    const legacy = `<html><body>
      <h1>{{HEADLINE}}</h1><p>{{BODY_1}}</p>
      <a href="{{CTA_LINK}}">{{CTA_TEXT}}</a>
      <p>{{FOOTER_STUFF}}</p><span>{{RANDOM_TAG}}</span>
    </body></html>`
    expect(extractStructureFromReference(legacy)).toBeNull()
  })

  it("HTML sem tag nenhuma → null", () => {
    expect(extractStructureFromReference("<html><body>oi</body></html>")).toBeNull()
    expect(extractStructureFromReference("")).toBeNull()
  })

  it("unknownTags registra drift sem derrubar a extração", () => {
    const html = CANONICAL_HTML.replace(
      "{{USP_1_TITLE}}",
      "{{TAG_INVENTADA}}",
    )
    const s = extractStructureFromReference(html)
    expect(s).not.toBeNull()
    expect(s!.unknownTags).toEqual(["TAG_INVENTADA"])
  })

  it("aceita tags com espaços internos ({{ TAG }})", () => {
    const html = CANONICAL_HTML.replace(
      "{{HERO_HEADLINE}}",
      "{{ HERO_HEADLINE }}",
    )
    const s = extractStructureFromReference(html)!
    const hero = s.blocks.find((b) => b.type === "hero")!
    expect(hero.copy_spec.some((f) => f.key === "headline")).toBe(true)
  })

  it("seções alternadas geram blocos separados (A-B-A = 3 blocos)", () => {
    const html = `<html><body>
      <p>{{BODY_TITLE}}</p><p>{{BODY_TEXT}}</p>
      <img src="{{PRODUCT_1_IMAGE}}"><span>{{PRODUCT_1_NAME}}</span><span>{{PRODUCTS_TITLE}}</span>
      <p>{{BODY_2_TITLE}}</p>
    </body></html>`
    // BODY_2_TITLE não existe (vira BODY_N_TITLE → null)… usar BODY_TEXT_2:
    const html2 = html.replace("{{BODY_2_TITLE}}", "{{BODY_TEXT_2}}")
    const s = extractStructureFromReference(html2)!
    expect(s.blocks.map((b) => b.type)).toEqual(["text", "products", "text"])
  })
})

describe("extractStructureFromReference — schemaTags (épico Taguedor)", () => {
  const schemaTags = new Map<string, "copy" | "image">([
    ["TESTIMONIAL_1_QUOTE_BODY", "copy"],
    ["SECTION_BADGE_IMAGE", "image"],
  ])

  it("tag schema-backed entra nas tags do bloco em que aparece", () => {
    const html = CANONICAL_HTML.replace(
      "<p>{{HERO_BODY}}</p>",
      "<p>{{HERO_BODY}}</p><q>{{TESTIMONIAL_1_QUOTE_BODY}}</q>",
    )
    const s = extractStructureFromReference(html, { schemaTags })!
    const hero = s.blocks.find((b) => b.type === "hero")!
    expect(hero.tags).toContain("TESTIMONIAL_1_QUOTE_BODY")
    // Reconhecida (não é drift) e não muda a segmentação/copy_spec.
    expect(s.unknownTags).not.toContain("TESTIMONIAL_1_QUOTE_BODY")
    expect(s.knownTags).toContain("TESTIMONIAL_1_QUOTE_BODY")
    expect(hero.copy_spec.map((f) => f.key)).toEqual([
      "eyebrow",
      "headline",
      "body",
      "cta",
    ])
  })

  it("schema tag de imagem NÃO liga needs_image (papel do T8)", () => {
    // Dentro do run de features (schema tags colam no run ATUAL — antes da
    // primeira tag canônica da seção elas pertencem ao run anterior).
    const html = CANONICAL_HTML.replace(
      "<h2>{{USP_1_TITLE}}</h2>",
      "<h2>{{USP_1_TITLE}}</h2><img src=\"{{SECTION_BADGE_IMAGE}}\">",
    )
    const s = extractStructureFromReference(html, { schemaTags })!
    const usp = s.blocks.find((b) => b.type === "features")!
    expect(usp.tags).toContain("SECTION_BADGE_IMAGE")
    expect(usp.needs_image).toBe(false)
  })

  it("conta como conhecida no threshold (não derruba pra legado)", () => {
    // 4 canônicas + 3 schema-backed: sem opts a razão conhecidas/total
    // (4/7 < 0.7) derruba; com schemaTags passa.
    const html = `<html><body>
      <h1>{{HERO_HEADLINE}}</h1><p>{{HERO_BODY}}</p>
      <a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a>
      <q>{{DEPOIMENTO_1}}</q><q>{{DEPOIMENTO_2}}</q><q>{{DEPOIMENTO_3}}</q>
    </body></html>`
    const tags = new Map<string, "copy" | "image">([
      ["DEPOIMENTO_1", "copy"],
      ["DEPOIMENTO_2", "copy"],
      ["DEPOIMENTO_3", "copy"],
    ])
    expect(extractStructureFromReference(html)).toBeNull()
    const s = extractStructureFromReference(html, { schemaTags: tags })
    expect(s).not.toBeNull()
    expect(s!.blocks[0].tags).toEqual(
      expect.arrayContaining(["DEPOIMENTO_1", "DEPOIMENTO_2", "DEPOIMENTO_3"]),
    )
  })

  it("schema tag antes do primeiro bloco cola no primeiro bloco criado", () => {
    const html = CANONICAL_HTML.replace(
      "<tr><td>{{LOGO}}</td></tr>",
      "<span>{{TESTIMONIAL_1_QUOTE_BODY}}</span><tr><td>{{LOGO}}</td></tr>",
    )
    const s = extractStructureFromReference(html, { schemaTags })!
    expect(s.blocks[0].tags[0]).toBe("TESTIMONIAL_1_QUOTE_BODY")
    expect(s.blocks[0].type).toBe("header")
  })

  it("sem opts, schema tag segue como unknown (comportamento atual)", () => {
    const html = CANONICAL_HTML.replace(
      "<p>{{HERO_BODY}}</p>",
      "<p>{{HERO_BODY}}</p><q>{{TESTIMONIAL_1_QUOTE_BODY}}</q>",
    )
    const s = extractStructureFromReference(html)!
    expect(s.unknownTags).toContain("TESTIMONIAL_1_QUOTE_BODY")
    const hero = s.blocks.find((b) => b.type === "hero")!
    expect(hero.tags).not.toContain("TESTIMONIAL_1_QUOTE_BODY")
  })
})

describe("skeletonToPromptJson", () => {
  it("serializa índice, type e tags normalizadas dedupadas", () => {
    const s = extractStructureFromReference(CANONICAL_HTML)!
    const parsed = JSON.parse(skeletonToPromptJson(s)) as Array<{
      index: number
      type: string
      tags: string[]
    }>
    expect(parsed[1].type).toBe("hero")
    expect(parsed[1].index).toBe(1)
    const usp = parsed.find((b) => b.type === "features")!
    // USP_1_TITLE/USP_2_TITLE normalizadas e dedupadas → USP_N_TITLE
    expect(usp.tags).toEqual(["USP_N_TITLE", "USP_N_TEXT"])
  })
})
