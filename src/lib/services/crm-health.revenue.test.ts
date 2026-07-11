import { describe, expect, it } from "vitest"
import { computeRevenueScore, deriveRevenueMonths } from "./crm-health.service"

/**
 * Regressão do bug que achatou o health da carteira inteira em
 * "Atenção": a query de revenue usava colunas inexistentes e o
 * componente era SEMPRE neutro (50). Estes testes cobrem a derivação
 * nova (30d/90d → mês atual vs média mensal anterior) e as bandas do
 * score — juntas, elas garantem que lojas diferentes voltam a receber
 * scores diferentes.
 */

describe("deriveRevenueMonths", () => {
  it("mês atual = 30d; mês anterior = média dos 60 dias restantes do 90d", () => {
    const m = deriveRevenueMonths([
      { period_label: "30d", total_revenue: 3000 },
      { period_label: "90d", total_revenue: 9000 },
    ])
    expect(m.currentMonth).toBe(3000)
    expect(m.previousMonth).toBe(3000) // (9000-3000)/2
  })

  it("sem linha 90d → mês anterior 0 (score cai no ramo previousMonth=0)", () => {
    const m = deriveRevenueMonths([{ period_label: "30d", total_revenue: 5000 }])
    expect(m).toEqual({ currentMonth: 5000, previousMonth: 0 })
  })

  it("sem linha nenhuma → tudo 0 (neutro)", () => {
    expect(deriveRevenueMonths([])).toEqual({ currentMonth: 0, previousMonth: 0 })
  })

  it("90d menor que 30d (dado inconsistente/stale) → mês anterior clampa em 0", () => {
    const m = deriveRevenueMonths([
      { period_label: "30d", total_revenue: 8000 },
      { period_label: "90d", total_revenue: 5000 },
    ])
    expect(m.previousMonth).toBe(0)
  })

  it("ignora períodos alheios (7d/12m/custom não contaminam)", () => {
    const m = deriveRevenueMonths([
      { period_label: "7d", total_revenue: 999 },
      { period_label: "12m", total_revenue: 99999 },
      { period_label: "custom:2026-01-01:2026-01-31", total_revenue: 123 },
      { period_label: "30d", total_revenue: 1000 },
      { period_label: "90d", total_revenue: 4000 },
    ])
    expect(m.currentMonth).toBe(1000)
    expect(m.previousMonth).toBe(1500)
  })
})

describe("computeRevenueScore (bandas)", () => {
  it("sem dados → neutro 50", () => {
    expect(computeRevenueScore(0, 0)).toBe(50)
  })
  it("loja nova vendendo (sem mês anterior) → 80", () => {
    expect(computeRevenueScore(1000, 0)).toBe(80)
  })
  it("crescendo ≥20% → 90; estável → 70; caindo → 50/30/10", () => {
    expect(computeRevenueScore(1200, 1000)).toBe(90)
    expect(computeRevenueScore(1000, 1000)).toBe(70)
    expect(computeRevenueScore(850, 1000)).toBe(50)
    expect(computeRevenueScore(600, 1000)).toBe(30)
    expect(computeRevenueScore(100, 1000)).toBe(10)
  })
  it("lojas diferentes produzem scores diferentes (fim do achatamento)", () => {
    const growing = computeRevenueScore(1200, 1000)
    const shrinking = computeRevenueScore(400, 1000)
    expect(growing).not.toBe(shrinking)
  })
})
