import { describe, expect, it } from "vitest"

import type { EmailBlueprint } from "@/types/email-generation"

import { buildImageMap } from "./build-vars"

// buildImageMap é puro (blocks + blueprint → entradas) — testável sem DB.
// Regressões cobertas (laudo Luxe Lift welcome#1, 20/jul):
//   - aspecto ACHATADO pro global (products 4:3 chegava como 4:5)
//   - overlay de hero aplicado a todo bloco
//   - avatares de testimonial (items[].avatar_url) invisíveis pro HTML agent
//   - ausência de tag/block_type → agente adivinhava o slot

function makeBlueprint(): EmailBlueprint {
  return {
    image_aspect: "4:5",
    image_overlay_reserve_bottom: true,
    blocks: [
      { type: "header", label: "Logo", tags: ["LOGO"] },
      {
        type: "hero",
        label: "Hero",
        needs_image: true,
        image_aspect: "4:5",
        tags: ["HERO_HEADLINE", "HERO_IMAGE", "HERO_IMAGE_ALT"],
      },
      {
        type: "products",
        label: "Produto em destaque",
        needs_image: true,
        image_aspect: "4:3",
        tags: ["PRODUCTS_TITLE", "PRODUCTS_IMAGE"],
      },
      {
        type: "testimonials",
        label: "Prova social",
        needs_image: true,
        image_aspect: "4:3",
        tags: ["REVIEWS_TITLE", "REVIEWS_IMAGE"],
      },
    ],
  } as unknown as EmailBlueprint
}

const block = (
  position: number,
  block_type: string,
  content: Record<string, unknown> | null,
) => ({ id: `blk-${position}`, position, block_type, label: block_type, content })

describe("buildImageMap", () => {
  it("usa o aspecto POR BLOCO (não o global) e carrega tag + block_type", () => {
    const entries = buildImageMap(
      [
        block(2, "hero", { image_url: "https://img/hero.png" }),
        block(3, "products", { image_url: "https://img/prod.png" }),
      ],
      makeBlueprint(),
    )
    expect(entries).toHaveLength(2)
    const hero = entries.find((e) => e.block_type === "hero")!
    const prod = entries.find((e) => e.block_type === "products")!
    expect(hero.aspect_ratio).toBe("4:5")
    expect(hero.tag).toBe("HERO_IMAGE")
    // Antes do fix: products chegava como 4:5 (global) e ganhava overlay.
    expect(prod.aspect_ratio).toBe("4:3")
    expect(prod.tag).toBe("PRODUCTS_IMAGE")
  })

  it("overlay needs_html_overlay SÓ no hero; demais blocos são burned", () => {
    const entries = buildImageMap(
      [
        block(2, "hero", { image_url: "https://img/hero.png" }),
        block(3, "products", { image_url: "https://img/prod.png" }),
      ],
      makeBlueprint(),
    )
    expect(entries.find((e) => e.block_type === "hero")!.overlay).toBe(
      "needs_html_overlay",
    )
    expect(entries.find((e) => e.block_type === "products")!.overlay).toBe(
      "burned",
    )
  })

  it("emite entradas para avatares de testimonial (items[].avatar_url)", () => {
    const entries = buildImageMap(
      [
        block(4, "testimonials", {
          items: [
            { author: "Ana", avatar_url: "https://img/a1.png" },
            { author: "Bia" }, // sem avatar → sem entrada
            { author: "Cris", avatar_url: "https://img/a3.png" },
          ],
        }),
      ],
      makeBlueprint(),
    )
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: "IMG_4_AVATAR_1",
      tag: "REVIEW_1_IMAGE",
      aspect_ratio: "1:1",
      render_width_px: 96,
      overlay: "burned",
    })
    expect(entries[1].id).toBe("IMG_4_AVATAR_3")
    expect(entries[1].tag).toBe("REVIEW_3_IMAGE")
  })

  it("bloco com image_url E avatares emite ambas as entradas", () => {
    const entries = buildImageMap(
      [
        block(4, "testimonials", {
          image_url: "https://img/reviews-banner.png",
          items: [{ avatar_url: "https://img/a1.png" }],
        }),
      ],
      makeBlueprint(),
    )
    expect(entries.map((e) => e.id)).toEqual(["IMG_4", "IMG_4_AVATAR_1"])
  })

  it("render_width_px: full-width 600 por default, 120 para features", () => {
    const entries = buildImageMap(
      [
        block(2, "hero", { image_url: "https://img/hero.png" }),
        block(9, "features", { image_url: "https://img/icon.png" }),
      ],
      makeBlueprint(),
    )
    expect(entries.find((e) => e.block_type === "hero")!.render_width_px).toBe(600)
    expect(entries.find((e) => e.block_type === "features")!.render_width_px).toBe(120)
  })

  it("sem blueprint: aspecto global default 4:5, tag null, hero com overlay", () => {
    const entries = buildImageMap(
      [block(1, "hero", { image_url: "https://img/x.png" })],
      null,
    )
    expect(entries[0]).toMatchObject({
      id: "IMG_1",
      tag: null,
      aspect_ratio: "4:5",
      overlay: "needs_html_overlay",
    })
  })

  it("bloco sem image_url e sem items não gera entrada", () => {
    const entries = buildImageMap(
      [block(5, "coupon", { code: "BEMVINDA10" }), block(6, "text", null)],
      makeBlueprint(),
    )
    expect(entries).toHaveLength(0)
  })
})
