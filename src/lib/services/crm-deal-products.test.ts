import { describe, it, expect } from "vitest"
import {
  round2,
  normalizeQuantity,
  normalizeDiscount,
  lineTotal,
  dealTotals,
  resolveDealValue,
} from "./crm-deal-products"

describe("round2", () => {
  it("arredonda meio centavo pra cima", () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(10.994)).toBe(10.99)
  })
})

describe("normalizeQuantity", () => {
  it("quantidade invalida ou <= 0 vira 1", () => {
    expect(normalizeQuantity(0)).toBe(1)
    expect(normalizeQuantity(-3)).toBe(1)
    expect(normalizeQuantity(null)).toBe(1)
    expect(normalizeQuantity(NaN)).toBe(1)
  })

  it("aceita fracionario (ex: 1.5 h de consultoria)", () => {
    expect(normalizeQuantity(1.5)).toBe(1.5)
  })
})

describe("normalizeDiscount", () => {
  it("clampa em 0-100", () => {
    expect(normalizeDiscount(-10)).toBe(0)
    expect(normalizeDiscount(150)).toBe(100)
    expect(normalizeDiscount(12.5)).toBe(12.5)
    expect(normalizeDiscount(null)).toBe(0)
  })
})

describe("lineTotal", () => {
  it("qtd x preco sem desconto", () => {
    expect(lineTotal({ quantity: 2, unit_price: 497, discount_pct: 0 })).toBe(994)
  })

  it("aplica desconto percentual", () => {
    expect(lineTotal({ quantity: 1, unit_price: 1000, discount_pct: 15 })).toBe(850)
  })

  it("arredonda por linha (dizima do desconto)", () => {
    // 3 x 99.90 x (1 - 1/3 de desconto seria dizima) — usa 33.33%
    expect(lineTotal({ quantity: 3, unit_price: 99.9, discount_pct: 33.33 })).toBe(199.81)
  })

  it("100% de desconto zera a linha (bonus/cortesia)", () => {
    expect(lineTotal({ quantity: 5, unit_price: 200, discount_pct: 100 })).toBe(0)
  })
})

describe("dealTotals", () => {
  it("separa unico de recorrente e soma no total", () => {
    const t = dealTotals([
      { quantity: 1, unit_price: 2000, discount_pct: 0, billing_type: "one_time" },
      { quantity: 1, unit_price: 997, discount_pct: 0, billing_type: "recurring" },
      { quantity: 2, unit_price: 100, discount_pct: 50, billing_type: "recurring" },
    ])
    expect(t.oneTime).toBe(2000)
    expect(t.recurring).toBe(1097)
    expect(t.total).toBe(3097)
    expect(t.count).toBe(3)
  })

  it("billing ausente conta como unico", () => {
    const t = dealTotals([{ quantity: 1, unit_price: 500, discount_pct: 0 }])
    expect(t.oneTime).toBe(500)
    expect(t.recurring).toBe(0)
  })

  it("lista vazia zera tudo", () => {
    expect(dealTotals([])).toEqual({ oneTime: 0, recurring: 0, total: 0, count: 0 })
  })

  it("soma de centavos nao acumula erro de float", () => {
    const t = dealTotals(
      Array.from({ length: 10 }, () => ({
        quantity: 1,
        unit_price: 0.1,
        discount_pct: 0,
      })),
    )
    expect(t.total).toBe(1)
  })
})

describe("resolveDealValue", () => {
  it("com itens, a soma vence o valor manual", () => {
    const items = [{ quantity: 1, unit_price: 997, discount_pct: 0 }]
    expect(resolveDealValue(items, 5000)).toBe(997)
  })

  it("sem itens, o manual continua valendo", () => {
    expect(resolveDealValue([], 5000)).toBe(5000)
    expect(resolveDealValue([], null)).toBe(0)
  })
})
