/**
 * Testes do matching conservador nome→loja + agrupamento de idioma.
 * Regra de ouro: ambíguo NUNCA chuta.
 */

import { describe, it, expect } from "vitest"
import { matchNamesToStores, normalizeKey, type StoreRef } from "./store-match"
import { storeLangGroup, taskLangGroup } from "./lang"

const stores: StoreRef[] = [
  { store_id: "s1", store_name: "Clube Rock" },
  { store_id: "s2", store_name: "Loja Água Viva" },
  { store_id: "s3", store_name: "Rock USA" },
]

describe("normalizeKey", () => {
  it("minúsculas, sem acento, só alfanumérico", () => {
    expect(normalizeKey("Loja Água-Viva!")).toBe("lojaaguaviva")
    expect(normalizeKey("  Clube ROCK ")).toBe("cluberock")
  })
})

describe("matchNamesToStores", () => {
  it("casa por igualdade normalizada", () => {
    const r = matchNamesToStores(["clube-rock", "LOJA AGUA VIVA"], stores)
    expect(r.matched).toHaveLength(2)
    expect(r.matched[0].store.store_id).toBe("s1")
    expect(r.matched[1].store.store_id).toBe("s2")
    expect(r.ambiguous).toHaveLength(0)
    expect(r.unmatchedStores.map((s) => s.store_id)).toEqual(["s3"])
  })

  it("casa por substring única (nome de arquivo com sufixo)", () => {
    const r = matchNamesToStores(["clube rock - final v2"], stores)
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].store.store_id).toBe("s1")
  })

  it("substring com múltiplos candidatos vira ambíguo, nunca chuta", () => {
    // "rock" é substring de "cluberock" E "rockusa".
    const r = matchNamesToStores(["rock"], stores)
    expect(r.matched).toHaveLength(0)
    expect(r.ambiguous).toHaveLength(1)
    expect(r.ambiguous[0].candidates.map((c) => c.store_id).sort()).toEqual([
      "s1",
      "s3",
    ])
  })

  it("lojas com nome duplicado viram ambíguo mesmo no match exato", () => {
    const dup: StoreRef[] = [
      { store_id: "a", store_name: "Rock BR" },
      { store_id: "b", store_name: "Rock  BR" },
    ]
    const r = matchNamesToStores(["rock br"], dup)
    expect(r.matched).toHaveLength(0)
    expect(r.ambiguous).toHaveLength(1)
  })

  it("nomes sem match e lojas sem imagem ficam nas sobras", () => {
    const r = matchNamesToStores(["banner-generico"], stores)
    expect(r.matched).toHaveLength(0)
    expect(r.unmatchedNames).toEqual(["banner-generico"])
    expect(r.unmatchedStores).toHaveLength(3)
  })

  it("loja já tomada por match exato não é reusada em substring", () => {
    const r = matchNamesToStores(["clube rock", "clube rock final"], stores)
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].name).toBe("clube rock")
    expect(r.unmatchedNames).toEqual(["clube rock final"])
  })
})

describe("storeLangGroup", () => {
  it("pt* → ptbr, en* → en, resto → outras", () => {
    expect(storeLangGroup("pt-BR")).toBe("ptbr")
    expect(storeLangGroup("PT")).toBe("ptbr")
    expect(storeLangGroup("en-US")).toBe("en")
    expect(storeLangGroup("es")).toBe("outras")
    expect(storeLangGroup(null)).toBe("outras")
  })
})

describe("taskLangGroup", () => {
  it("resolve pelo slug do seed", () => {
    expect(taskLangGroup({ slug: "impl_subir_ptbr" })).toBe("ptbr")
    expect(taskLangGroup({ slug: "impl_subir_en" })).toBe("en")
    expect(taskLangGroup({ slug: "impl_subir_outras" })).toBe("outras")
  })

  it("fallback pelo título quando não há slug", () => {
    expect(
      taskLangGroup({ slug: null, name: "Subir e-mails - Português (Brasil)" }),
    ).toBe("ptbr")
    expect(taskLangGroup({ slug: null, name: "Subir e-mails - Inglês" })).toBe("en")
    expect(
      taskLangGroup({ slug: null, name: "Subir e-mails - Outras línguas" }),
    ).toBe("outras")
  })
})
