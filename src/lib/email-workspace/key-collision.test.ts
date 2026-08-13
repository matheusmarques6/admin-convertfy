import { describe, it, expect } from "vitest"
import { classifyKeyCollision, suggestScopedKey } from "./key-collision"

const u = (id: string, name: string, block_type: string) => ({
  id,
  name,
  block_type,
})

describe("classifyKeyCollision", () => {
  // Caso REAL (Luxe Lift, 12/08): `section_headline` em variantes de
  // produtos, reviews e body. As três convivem no mesmo email, viram o mesmo
  // {{SECTION_HEADLINE}}, e o set_text escreveu a copy de produtos nas três.
  it("variante de outra seção conflita", () => {
    const r = classifyKeyCollision(
      "products",
      [
        u("1", "produtos 6", "products"),
        u("2", "review 3", "reviews"),
        u("3", "body 4", "body"),
      ],
      "1",
    )
    expect(r.severity).toBe("conflita")
    expect(r.outras_secoes.map((x) => x.name)).toEqual(["review 3", "body 4"])
    expect(r.mesma_secao).toEqual([])
  })

  // `hero_headline` está em 8 variantes e nunca vazou: só há uma hero por
  // email, então elas jamais convivem.
  it("só a mesma seção é reuso legítimo, não conflito", () => {
    const r = classifyKeyCollision(
      "hero",
      [
        u("1", "welcome - hero section 2", "hero"),
        u("2", "welcome - hero section 5", "hero"),
      ],
      "1",
    )
    expect(r.severity).toBe("mesma_secao")
    expect(r.mesma_secao.map((x) => x.name)).toEqual([
      "welcome - hero section 5",
    ])
  })

  it("a própria variante não conta como colisão", () => {
    const r = classifyKeyCollision("products", [u("1", "eu", "products")], "1")
    expect(r.severity).toBe("livre")
  })

  it("sem selfId (variante nova) compara só por seção", () => {
    const r = classifyKeyCollision("body", [u("9", "review 1", "reviews")])
    expect(r.severity).toBe("conflita")
  })

  it("lista vazia é livre", () => {
    expect(classifyKeyCollision("hero", []).severity).toBe("livre")
  })
})

describe("suggestScopedKey", () => {
  it("troca o prefixo genérico pela seção", () => {
    expect(suggestScopedKey("products", "section_headline")).toBe(
      "products_headline",
    )
    expect(suggestScopedKey("reviews", "section_cta_label")).toBe(
      "reviews_cta_label",
    )
  })

  it("key já escopada volta inalterada", () => {
    expect(suggestScopedKey("products", "products_headline")).toBe(
      "products_headline",
    )
  })

  it("key sem prefixo genérico ganha o da seção", () => {
    expect(suggestScopedKey("body", "urgency_text")).toBe("body_urgency_text")
  })

  it("entrada vazia não explode", () => {
    expect(suggestScopedKey("", "x")).toBe("x")
    expect(suggestScopedKey("products", "")).toBe("")
  })
})
