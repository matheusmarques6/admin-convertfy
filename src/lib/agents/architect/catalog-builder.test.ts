import { describe, it, expect } from "vitest"

import type { EmailComponentVariant } from "@/types/email-generation"
import { buildCatalog, buildTypeIndex } from "./catalog-builder"

function v(
  id: string,
  blockType: string,
  name: string,
  extra: Partial<EmailComponentVariant> = {},
): EmailComponentVariant {
  return {
    id,
    block_type: blockType,
    name,
    html: "<tr><td>{{X}}</td></tr>",
    description: null,
    when_use: null,
    when_not_use: null,
    objectives: [],
    tones: [],
    density: null,
    product_slots: 0,
    copy_guidance: null,
    long_description: null,
    output_schema: [],
    ...extra,
  } as unknown as EmailComponentVariant
}

describe("buildCatalog", () => {
  it("agrupa por tipo e ordena por nome dentro de cada tipo", () => {
    const r = buildCatalog([
      v("3", "hero", "Zebra"),
      v("1", "body", "Alpha"),
      v("2", "hero", "Abacate"),
    ])
    expect(r.types).toEqual(["body", "hero"])
    expect(r.sections[0].section).toBe("body")
    expect(r.sections[1].variantes.map((x) => x.name)).toEqual([
      "Abacate",
      "Zebra",
    ])
    expect(r.total).toBe(3)
  })

  // O catálogo vai no system para ser cacheado, e cache é endereçado por
  // conteúdo: ordem instável entre lojas mataria o cache.
  it("é estável: mesma entrada em outra ordem gera o MESMO json", () => {
    const a = buildCatalog([v("1", "hero", "A"), v("2", "hero", "B"), v("3", "body", "C")])
    const b = buildCatalog([v("3", "body", "C"), v("2", "hero", "B"), v("1", "hero", "A")])
    expect(a.json).toBe(b.json)
  })

  it("carrega os metadados que o Curador usa para rankear", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        description: "hero com faixa",
        when_use: "quando a marca é premium",
        when_not_use: "quando não há imagem",
        objectives: ["Promoção"],
        tones: ["Premium"],
        density: "rich",
        product_slots: 3,
        copy_guidance: "headline curta",
        long_description: "usa VML no Outlook",
      }),
    ])
    const e = r.sections[0].variantes[0]
    expect(e).toEqual({
      variant_id: "1",
      name: "H",
      description: "hero com faixa",
      quando_usar: "quando a marca é premium",
      quando_nao_usar: "quando não há imagem",
      objectives: ["Promoção"],
      tones: ["Premium"],
      density: "rich",
      product_slots: 3,
      orientacao_copy: "headline curta",
      notas_implementacao: "usa VML no Outlook",
    })
  })

  // O schema é insumo exclusivo do Montador (CM-4): mandá-lo aqui dobraria o
  // prefixo sem melhorar o ranking.
  it("NÃO inclui output_schema nem html", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        output_schema: [{ key: "headline", label: "H", type: "text_short" }],
        html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
      } as Partial<EmailComponentVariant>),
    ])
    expect(r.json).not.toContain("output_schema")
    expect(r.json).not.toContain("campos_copy")
    expect(r.json).not.toContain("HERO_HEADLINE")
  })

  it("catálogo vazio → json de array vazio", () => {
    const r = buildCatalog([])
    expect(r.total).toBe(0)
    expect(r.types).toEqual([])
    expect(JSON.parse(r.json)).toEqual([])
  })

  it("texto ausente vira string vazia; só density admite null", () => {
    const r = buildCatalog([v("1", "hero", "H")])
    expect(r.json).not.toContain("undefined")
    const e = r.sections[0].variantes[0]
    expect(e.description).toBe("")
    expect(e.quando_usar).toBe("")
    expect(e.quando_nao_usar).toBe("")
    expect(e.orientacao_copy).toBe("")
    expect(e.notas_implementacao).toBe("")
    expect(e.objectives).toEqual([])
    expect(e.product_slots).toBe(0)
    // `density` é tri-estado no cadastro (minimal/balanced/rich ou não
    // definida) — null aqui é informação, não campo faltando.
    expect(e.density).toBeNull()
  })
})

describe("buildTypeIndex", () => {
  it("mapeia id → block_type", () => {
    const idx = buildTypeIndex([v("1", "hero", "A"), v("2", "footer", "B")])
    expect(idx.get("1")).toBe("hero")
    expect(idx.get("2")).toBe("footer")
    expect(idx.get("x")).toBeUndefined()
  })
})
