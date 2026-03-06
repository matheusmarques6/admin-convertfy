import { describe, it, expect } from "vitest"
import { centsToReais, reaisToCents } from "./currency"

describe("centsToReais", () => {
  it("converte centavos para reais corretamente", () => {
    expect(centsToReais(0)).toBe(0)
    expect(centsToReais(1)).toBe(0.01)
    expect(centsToReais(99)).toBe(0.99)
    expect(centsToReais(100)).toBe(1)
    expect(centsToReais(600000)).toBe(6000)
    expect(centsToReais(123456789)).toBe(1234567.89)
    expect(centsToReais(9999999999)).toBe(99999999.99)
  })
})

describe("reaisToCents", () => {
  it("converte reais para centavos corretamente", () => {
    expect(reaisToCents(0)).toBe(0)
    expect(reaisToCents(0.01)).toBe(1)
    expect(reaisToCents(0.99)).toBe(99)
    expect(reaisToCents(1)).toBe(100)
    expect(reaisToCents(6000)).toBe(600000)
    expect(reaisToCents(1234567.89)).toBe(123456789)
    expect(reaisToCents(99999999.99)).toBe(9999999999)
  })

  it("usa Math.round para evitar floating point issues", () => {
    // 19.99 * 100 = 1998.9999999999998 sem round
    expect(reaisToCents(19.99)).toBe(1999)
    // 0.1 + 0.2 = 0.30000000000000004
    expect(reaisToCents(0.1 + 0.2)).toBe(30)
  })

  it("round trip: reais -> cents -> reais", () => {
    const values = [0.01, 0.99, 1, 100, 6000, 19.99, 99999999.99]
    for (const v of values) {
      expect(centsToReais(reaisToCents(v))).toBeCloseTo(v, 2)
    }
  })
})
