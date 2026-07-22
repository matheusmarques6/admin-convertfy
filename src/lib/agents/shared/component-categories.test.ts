import { describe, it, expect } from "vitest"
import {
  blockTypeToCategory,
  COMPONENT_CATEGORY_KEYS,
  normalizeSuggestedBlocks,
} from "./component-categories"

describe("normalizeSuggestedBlocks", () => {
  it("mantém as chaves canônicas na ordem de seleção", () => {
    expect(normalizeSuggestedBlocks(["hero", "offer", "footer"])).toEqual([
      "hero",
      "offer",
      "footer",
    ])
  })

  it("traduz block_types técnicos para categoria (coupon → offer)", () => {
    expect(normalizeSuggestedBlocks(["coupon", "testimonials"])).toEqual([
      "offer",
      "reviews",
    ])
  })

  it("descarta valores fora do vocabulário e deduplica", () => {
    expect(
      normalizeSuggestedBlocks(["header", "banana", "Header", "HEADER"]),
    ).toEqual(["header"])
  })

  it("tolera entrada não-array / itens não-string", () => {
    expect(normalizeSuggestedBlocks(null)).toEqual([])
    expect(normalizeSuggestedBlocks([1, "hero", null])).toEqual(["hero"])
  })
})

describe("blockTypeToCategory", () => {
  it("mapeia tipos do blueprint para seções de negócio", () => {
    expect(blockTypeToCategory("testimonials")).toBe("reviews")
    expect(blockTypeToCategory("social_proof")).toBe("reviews")
    expect(blockTypeToCategory("coupon")).toBe("offer")
    expect(blockTypeToCategory("urgency")).toBe("offer")
    expect(blockTypeToCategory("hero")).toBe("hero")
    expect(blockTypeToCategory("image")).toBe("hero")
    expect(blockTypeToCategory("text")).toBe("body")
    expect(blockTypeToCategory("headline")).toBe("body")
    expect(blockTypeToCategory("social")).toBe("footer")
  })

  it("retorna null para estruturais ignorados e desconhecidos", () => {
    expect(blockTypeToCategory("divider")).toBeNull()
    expect(blockTypeToCategory("spacer")).toBeNull()
    expect(blockTypeToCategory("xpto")).toBeNull()
  })

  it("toda categoria de destino é uma das 8 chaves válidas", () => {
    for (const bt of [
      "header",
      "hero",
      "image",
      "text",
      "products",
      "testimonials",
      "cta",
      "coupon",
      "footer",
    ]) {
      const cat = blockTypeToCategory(bt)
      expect(cat).not.toBeNull()
      expect(COMPONENT_CATEGORY_KEYS).toContain(cat)
    }
  })
})
