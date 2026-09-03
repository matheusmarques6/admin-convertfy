import { describe, it, expect } from "vitest"
import { pickProductForField, productIndexForField } from "./product-for-field"

const P = [{ name: "EnergySave" }, { name: "CarScan" }, { name: "FuelSaver" }]

describe("productIndexForField", () => {
  it("lê o índice do painel/produto no key", () => {
    expect(productIndexForField("panel_2_main_photo")).toBe(2)
    expect(productIndexForField("product_3_image")).toBe(3)
    expect(productIndexForField("produto_1_thumb_a")).toBe(1)
    expect(productIndexForField("card_12_photo")).toBe(12)
  })
  it("sem índice → null (hero, reviews, body)", () => {
    expect(productIndexForField("hero_lifestyle_consumo")).toBeNull()
    expect(productIndexForField("review_1_avatar")).toBeNull()
    expect(productIndexForField("main_image_rounded")).toBeNull()
    expect(productIndexForField(null)).toBeNull()
  })
})

describe("pickProductForField", () => {
  it("painel N → produto N", () => {
    expect(pickProductForField(P, "panel_2_main_photo")).toEqual({ product: P[1], index: 2 })
    expect(pickProductForField(P, "panel_1_thumb_b")).toEqual({ product: P[0], index: 1 })
  })
  it("sem índice ou índice além da lista → produto 1", () => {
    expect(pickProductForField(P, "hero_lifestyle")).toEqual({ product: P[0], index: 1 })
    expect(pickProductForField(P, "panel_7_main")).toEqual({ product: P[0], index: 1 })
  })
  it("sem produtos → null", () => {
    expect(pickProductForField([], "panel_2_main")).toEqual({ product: null, index: 0 })
  })
})
