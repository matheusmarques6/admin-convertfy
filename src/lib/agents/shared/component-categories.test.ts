import { describe, it, expect } from "vitest"
import {
  blockTypeToCategory,
  COMPONENT_CATEGORY_KEYS,
} from "./component-categories"

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
