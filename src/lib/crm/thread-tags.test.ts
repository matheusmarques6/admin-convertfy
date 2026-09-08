import { describe, expect, it } from "vitest"
import { normalizeThreadTags, THREAD_TAGS_MAX_COUNT, tagCaseVariants } from "./thread-tags"

describe("normalizeThreadTags", () => {
  it("trim e descarta vazias", () => {
    expect(normalizeThreadTags(["  lead quente  ", "", "   ", "suporte"])).toEqual(["lead quente", "suporte"])
  })

  it("dedupe case-insensitive preservando a grafia da primeira", () => {
    expect(normalizeThreadTags(["VIP", "vip", "Vip", "outro"])).toEqual(["VIP", "outro"])
  })

  it("corta nomes acima de 60 chars", () => {
    const long = "a".repeat(80)
    expect(normalizeThreadTags([long])[0]).toHaveLength(60)
  })

  it("cap de 20 tags", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag-${i}`)
    expect(normalizeThreadTags(many)).toHaveLength(THREAD_TAGS_MAX_COUNT)
  })

  it("array vazio → vazio", () => {
    expect(normalizeThreadTags([])).toEqual([])
  })
})

describe("tagCaseVariants", () => {
  it("cobre as grafias que o filtro exato perdia", () => {
    expect(tagCaseVariants("teste").sort()).toEqual(["TESTE", "Teste", "teste"])
  })

  it("dedupe quando as variantes coincidem", () => {
    expect(tagCaseVariants("VIP")).toEqual(["VIP", "vip", "Vip"])
  })

  it("nome composto capitaliza só a primeira letra", () => {
    expect(tagCaseVariants("cliente novo")).toContain("Cliente novo")
  })

  it("tag vazia não vira filtro", () => {
    expect(tagCaseVariants("   ")).toEqual([])
    expect(tagCaseVariants("")).toEqual([])
  })

  it("aparas de espaço antes de variar", () => {
    expect(tagCaseVariants("  vip  ")).toContain("vip")
    expect(tagCaseVariants("  vip  ").every((v) => v === v.trim())).toBe(true)
  })
})
