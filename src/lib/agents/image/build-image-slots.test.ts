import { describe, it, expect } from "vitest"
import { buildImageSlots } from "./build-image-slots"
import type { BlueprintBlockField } from "@/types/email-generation"

function f(p: Partial<BlueprintBlockField>): BlueprintBlockField {
  return {
    key: "x",
    label: "X",
    type: "text_short",
    max_len: 40,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    tag: null,
    source: "schema",
    ...p,
  }
}

describe("buildImageSlots", () => {
  it("bloco sem campo de imagem → string vazia", () => {
    expect(buildImageSlots([f({ key: "headline" })], {})).toBe("")
    expect(buildImageSlots(null, null)).toBe("")
  })

  it("hero: schema + formato por dims + slot_note + copy do grupo (prefixo hero)", () => {
    const fields = [
      f({ key: "hero_headline", type: "text_short" }),
      f({ key: "hero_body", type: "text_long" }),
      f({
        key: "hero_image",
        type: "image",
        tag: "HERO_IMAGE",
        image_spec: "pessoa aplicando o sérum",
        example: "close no rosto",
        image_width: 600,
        image_height: 700,
        slot_note: "luz natural difusa",
      }),
    ]
    const content = {
      hero_headline: "Bem-vinda ao seu glow",
      hero_body: "Sua rotina começa aqui.",
    }
    const out = buildImageSlots(fields, content)
    expect(out).toContain('<slot_imagem tag="HERO_IMAGE">')
    expect(out).toContain("campo: hero_image")
    expect(out).toContain("especificidade: pessoa aplicando o sérum")
    expect(out).toContain("exemplo: close no rosto")
    expect(out).toContain("formato: 600x700px · proporção 6:7")
    expect(out).toContain("comentario: luz natural difusa")
    expect(out).toContain("copy_do_grupo:")
    expect(out).toContain('- hero_headline: "Bem-vinda ao seu glow"')
    expect(out).toContain('- hero_body: "Sua rotina começa aqui."')
  })

  it("multi-imagem: cada slot pega só a copy do SEU grupo (product_1 vs product_2)", () => {
    const fields = [
      f({ key: "product_1_name", type: "text_short" }),
      f({ key: "product_1_cta", type: "text_short" }),
      f({ key: "product_1_image", type: "image", tag: "PRODUCT_1_IMAGE" }),
      f({ key: "product_2_name", type: "text_short" }),
      f({ key: "product_2_image", type: "image", tag: "PRODUCT_2_IMAGE" }),
    ]
    const content = {
      product_1_name: "Sérum",
      product_1_cta: "Comprar",
      product_2_name: "Creme",
    }
    const out = buildImageSlots(fields, content)
    const s1 = out.slice(out.indexOf("PRODUCT_1_IMAGE"), out.indexOf("PRODUCT_2_IMAGE"))
    const s2 = out.slice(out.indexOf("PRODUCT_2_IMAGE"))
    expect(s1).toContain('- product_1_name: "Sérum"')
    expect(s1).toContain('- product_1_cta: "Comprar"')
    expect(s1).not.toContain("product_2")
    expect(s2).toContain('- product_2_name: "Creme"')
    expect(s2).not.toContain("product_1")
  })

  it("especificidade cai no guidance quando image_spec vazio; formato usa image_aspect livre", () => {
    const out = buildImageSlots(
      [
        f({
          key: "bg_image",
          type: "image",
          tag: "BG_IMAGE",
          guidance: "textura suave",
          image_aspect: "16:9",
        }),
      ],
      {},
    )
    expect(out).toContain("especificidade: textura suave")
    expect(out).toContain("formato: proporção 16:9")
  })

  it("prefixo vazio (key 'image') → todos os campos de copy do bloco", () => {
    const fields = [
      f({ key: "headline", type: "text_short" }),
      f({ key: "image", type: "image", tag: "IMAGE" }),
    ]
    const out = buildImageSlots(fields, { headline: "Olá" })
    expect(out).toContain('- headline: "Olá"')
  })

  it("campos de copy vazios são omitidos; sem grupo não imprime copy_do_grupo", () => {
    const out = buildImageSlots(
      [
        f({ key: "hero_headline", type: "text_short" }),
        f({ key: "hero_image", type: "image", tag: "HERO_IMAGE" }),
      ],
      { hero_headline: "  " },
    )
    expect(out).not.toContain("copy_do_grupo:")
  })
})
