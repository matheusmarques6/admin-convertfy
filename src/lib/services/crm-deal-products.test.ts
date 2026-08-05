import { describe, it, expect } from "vitest"
import {
  round2,
  normalizeQuantity,
  normalizeDiscount,
  lineTotal,
  dealTotals,
  resolveDealValue,
  parseBRNumber,
  formatCentsBRL,
  numberToCents,
  centsToNumber,
  normalizeInterval,
  intervalLabel,
  intervalSuffix,
  cyclesPerYear,
  recurringByInterval,
  annualizedTotal,
} from "./crm-deal-products"

describe("parseBRNumber", () => {
  it("ponto com grupo de 3 digitos e milhar BR — o bug do 10.000 virar 10", () => {
    expect(parseBRNumber("10.000")).toBe(10000)
    expect(parseBRNumber("1.234.567")).toBe(1234567)
    expect(parseBRNumber("1.000")).toBe(1000)
  })

  it("virgula e decimal, pontos viram milhar", () => {
    expect(parseBRNumber("10.000,50")).toBe(10000.5)
    expect(parseBRNumber("10,5")).toBe(10.5)
    expect(parseBRNumber("1.000.000,00")).toBe(1000000)
  })

  it("decimal tecnico continua funcionando", () => {
    expect(parseBRNumber("10.5")).toBe(10.5)
    expect(parseBRNumber("10000.50")).toBe(10000.5)
    expect(parseBRNumber("997")).toBe(997)
  })

  it("ignora R$, espacos e lixo", () => {
    expect(parseBRNumber("R$ 1.500,00")).toBe(1500)
    expect(parseBRNumber(" 2500 ")).toBe(2500)
  })

  it("vazio/invalido vira 0; numero passa direto", () => {
    expect(parseBRNumber("")).toBe(0)
    expect(parseBRNumber(null)).toBe(0)
    expect(parseBRNumber("abc")).toBe(0)
    expect(parseBRNumber(42.5)).toBe(42.5)
  })

  it("negativo preservado", () => {
    expect(parseBRNumber("-1.000")).toBe(-1000)
  })
})

describe("centavos <-> reais (mascara de preco)", () => {
  it("formata string de centavos em BRL", () => {
    expect(formatCentsBRL("1000000")).toBe("10.000,00")
    expect(formatCentsBRL("99750")).toBe("997,50")
    expect(formatCentsBRL("")).toBe("")
  })

  it("converte numero para centavos e volta", () => {
    expect(numberToCents(997.5)).toBe("99750")
    expect(numberToCents(0)).toBe("")
    expect(centsToNumber("99750")).toBe(997.5)
    expect(centsToNumber("")).toBe(0)
  })
})

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

describe("intervalos de recorrência", () => {
  it("normaliza valores do banco (NULL/lixo → mensal)", () => {
    expect(normalizeInterval(null)).toBe("monthly")
    expect(normalizeInterval(undefined)).toBe("monthly")
    expect(normalizeInterval("weekly")).toBe("monthly")
    expect(normalizeInterval("semiannual")).toBe("semiannual")
  })

  it("labels e sufixos por intervalo (o bug era '/mês' em tudo)", () => {
    expect(intervalLabel("semiannual")).toBe("Semestral")
    expect(intervalSuffix("monthly")).toBe("/mês")
    expect(intervalSuffix("quarterly")).toBe("/tri")
    expect(intervalSuffix("semiannual")).toBe("/sem")
    expect(intervalSuffix("yearly")).toBe("/ano")
    expect(intervalSuffix(null)).toBe("/mês")
  })

  it("ciclos por ano: mensal 12, tri 4, sem 2, anual 1", () => {
    expect(cyclesPerYear("monthly")).toBe(12)
    expect(cyclesPerYear("quarterly")).toBe(4)
    expect(cyclesPerYear("semiannual")).toBe(2)
    expect(cyclesPerYear("yearly")).toBe(1)
  })
})

describe("recurringByInterval", () => {
  it("agrupa recorrência por ciclo na ordem canônica, ignorando únicos", () => {
    const parts = recurringByInterval([
      { quantity: 1, unit_price: 500, discount_pct: 0, billing_type: "one_time" },
      { quantity: 1, unit_price: 18, discount_pct: 0, billing_type: "recurring", recurring_interval: "semiannual" },
      { quantity: 2, unit_price: 4, discount_pct: 0, billing_type: "recurring", recurring_interval: "monthly" },
      { quantity: 1, unit_price: 6, discount_pct: 0, billing_type: "recurring", recurring_interval: "monthly" },
    ])
    expect(parts).toEqual([
      { interval: "monthly", amount: 14 },
      { interval: "semiannual", amount: 18 },
    ])
  })

  it("sem intervalo definido cai em mensal", () => {
    const parts = recurringByInterval([
      { quantity: 1, unit_price: 100, discount_pct: 0, billing_type: "recurring" },
    ])
    expect(parts).toEqual([{ interval: "monthly", amount: 100 }])
  })
})

describe("annualizedTotal", () => {
  it("projeta 12m por ciclo real — o cenário do bug (semestral ×2, não ×12)", () => {
    const items = [
      { quantity: 1, unit_price: 1000, discount_pct: 0, billing_type: "one_time" },
      { quantity: 1, unit_price: 18, discount_pct: 0, billing_type: "recurring", recurring_interval: "semiannual" },
      { quantity: 1, unit_price: 10, discount_pct: 0, billing_type: "recurring", recurring_interval: "quarterly" },
      { quantity: 1, unit_price: 4, discount_pct: 0, billing_type: "recurring", recurring_interval: "monthly" },
    ]
    // 1000 + 18×2 + 10×4 + 4×12 = 1124
    expect(annualizedTotal(items)).toBe(1124)
  })

  it("recorrência sem intervalo = mensal ×12 (compatibilidade)", () => {
    expect(
      annualizedTotal([{ quantity: 1, unit_price: 50, discount_pct: 0, billing_type: "recurring" }]),
    ).toBe(600)
  })

  it("desconto entra antes da anualização", () => {
    expect(
      annualizedTotal([
        { quantity: 1, unit_price: 100, discount_pct: 50, billing_type: "recurring", recurring_interval: "yearly" },
      ]),
    ).toBe(50)
  })
})
