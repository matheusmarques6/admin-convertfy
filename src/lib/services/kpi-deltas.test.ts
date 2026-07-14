import { describe, expect, it } from "vitest"
import {
  computeIntersectionDelta,
  computeIntersectionRateDelta,
  computeIntersectionRatioDelta,
} from "./kpi-deltas"

const m = (entries: Array<[string, number]>) => new Map(entries)

describe("computeIntersectionDelta", () => {
  it("conjuntos idênticos → delta são da média diária", () => {
    // 30d: 3000 (100/dia) vs 90d: 9000 (100/dia) → 0%
    const r = computeIntersectionDelta(
      m([["a", 2000], ["b", 1000]]), 30,
      m([["a", 6000], ["b", 3000]]), 90,
    )
    expect(r.value).toBe(0)
    expect(r.coverage).toBe(1)
    expect(r.stores).toBe(2)
  })

  it("crescimento real aparece (30d/dia acima de 90d/dia)", () => {
    // 30d: 6000 (200/dia) vs 90d: 9000 (100/dia) → +100%
    const r = computeIntersectionDelta(m([["a", 6000]]), 30, m([["a", 9000]]), 90)
    expect(r.value).toBe(100)
  })

  it("REGRESSÃO +3763%: referência com poucas lojas NÃO infla o delta", () => {
    // Cenário real: 60 lojas na janela atual, só 5 na 90d.
    const current = new Map<string, number>()
    for (let i = 0; i < 60; i++) current.set(`s${i}`, 1000) // 60k total
    const ref = new Map<string, number>()
    for (let i = 0; i < 5; i++) ref.set(`s${i}`, 3000) // só 5 lojas na 90d
    const r = computeIntersectionDelta(current, 30, ref, 90)
    // Interseção cobre 5/60 = 8% da receita atual → delta null, nunca +3763%.
    expect(r.value).toBeNull()
    expect(r.coverage).toBeCloseTo(5 / 60, 5)
  })

  it("interseção suficiente mas parcial → delta calculado SÓ na interseção", () => {
    // 8 de 10 lojas em ambas as janelas (80% da receita atual).
    const current = m([
      ...Array.from({ length: 8 }, (_, i) => [`s${i}`, 1000] as [string, number]),
      ["novo1", 1000], ["novo2", 1000],
    ])
    const ref = m(Array.from({ length: 8 }, (_, i) => [`s${i}`, 3000] as [string, number]))
    const r = computeIntersectionDelta(current, 30, ref, 90)
    // Interseção: 8000/30 vs 24000/90 → 266.67 vs 266.67 → 0%
    expect(r.value).toBe(0)
    expect(r.coverage).toBeCloseTo(0.8, 5)
    expect(r.stores).toBe(8)
  })

  it("referência vazia ou zerada → null", () => {
    expect(computeIntersectionDelta(m([["a", 100]]), 30, m([]), 90).value).toBeNull()
    expect(computeIntersectionDelta(m([["a", 100]]), 30, m([["a", 0]]), 90).value).toBeNull()
  })

  it("janela atual vazia → null com coverage 0", () => {
    const r = computeIntersectionDelta(m([]), 30, m([["a", 100]]), 90)
    expect(r.value).toBeNull()
    expect(r.coverage).toBe(0)
  })
})

describe("computeIntersectionRateDelta", () => {
  it("médias sobre a interseção", () => {
    // taxas: atual média 20, ref média 16 → +25%
    const r = computeIntersectionRateDelta(
      m([["a", 30], ["b", 10]]),
      m([["a", 22], ["b", 10]]),
    )
    expect(r.value).toBe(25)
  })

  it("cobertura por contagem abaixo do piso → null", () => {
    const current = m([["a", 20], ["b", 20], ["c", 20], ["d", 20]])
    const ref = m([["a", 10]]) // 1/4 = 25% < 70%
    expect(computeIntersectionRateDelta(current, ref).value).toBeNull()
  })
})

describe("computeIntersectionRatioDelta", () => {
  it("razão de somas: pondera por faturamento, não média simples", () => {
    // atual: (30+70)/(300+700)=10%; ref: (20+40)/(300+700)=6% → +66.7%
    const r = computeIntersectionRatioDelta(
      m([["a", 30], ["b", 70]]),
      m([["a", 300], ["b", 700]]),
      m([["a", 20], ["b", 40]]),
      m([["a", 300], ["b", 700]]),
    )
    expect(r.value).toBe(66.7)
    expect(r.stores).toBe(2)
  })

  it("razões idênticas → 0%", () => {
    const r = computeIntersectionRatioDelta(
      m([["a", 100]]), m([["a", 500]]),
      m([["a", 200]]), m([["a", 1000]]),
    )
    expect(r.value).toBe(0)
  })

  it("cobertura do denominador abaixo do piso → null", () => {
    // interseção cobre só 'a' = 100/1000 = 10% do denominador atual
    const currentNum = m([["a", 20], ["b", 180]])
    const currentDen = m([["a", 100], ["b", 900]])
    const refNum = m([["a", 10]])
    const refDen = m([["a", 100]])
    expect(computeIntersectionRatioDelta(currentNum, currentDen, refNum, refDen).value).toBeNull()
  })

  it("referência zerada → null", () => {
    const r = computeIntersectionRatioDelta(
      m([["a", 50]]), m([["a", 500]]),
      m([["a", 0]]), m([["a", 500]]),
    )
    expect(r.value).toBeNull()
  })
})
