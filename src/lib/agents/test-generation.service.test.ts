import { describe, it, expect, vi } from "vitest"

// Isola o I/O: o módulo importa createAdminClient na cadeia (dispatch/generate).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { blockHasCopy } from "./test-generation.service"

describe("blockHasCopy (detecção de copy no bloco)", () => {
  it("true quando content é objeto com pelo menos uma chave", () => {
    expect(blockHasCopy({ headline: "Olá" })).toBe(true)
    expect(blockHasCopy({ a: 1, b: 2 })).toBe(true)
  })

  it("false para vazio / null / undefined / array / primitivos", () => {
    expect(blockHasCopy({})).toBe(false)
    expect(blockHasCopy(null)).toBe(false)
    expect(blockHasCopy(undefined)).toBe(false)
    expect(blockHasCopy([])).toBe(false)
    expect(blockHasCopy(["x"])).toBe(false)
    expect(blockHasCopy("texto")).toBe(false)
    expect(blockHasCopy(42)).toBe(false)
  })
})
