/**
 * Testes do serviço de overrides do relatório mensal.
 * Edições manuais aplicadas NA LEITURA sobre o snapshot cristalizado.
 */

import { describe, it, expect } from "vitest"
import {
  applyKpisOverrides,
  mergeKpisOverrides,
} from "./report-overrides.service"
import type { ReportSnapshot, ReportKpisOverrides } from "@/types/monthly-report"

function makeSnapshot(overrides?: Partial<ReportSnapshot>): ReportSnapshot {
  return {
    account: { currency: "BRL", platform: "omnisend" },
    kpis: {
      receita_total: 1_000_000,
      receita_atribuida: 250_000,
      atribuicao_pct: 0.25,
      receita_campanhas: 50_000,
      receita_flows: 200_000,
      pedidos_loja: 5_000,
      pedidos_atribuidos: 1_500,
      ticket_medio: 200,
      ticket_medio_atribuido: 166.67,
      novos_clientes: 800,
      envios: 500_000,
      total_leads: 40_000,
      open_rate: 22.5,
      click_rate: 1.8,
      total_campaigns: 10,
      total_flows: 12,
    },
    email: {
      delivered: 500_000,
      open_rate: 22.5,
      click_rate: 1.8,
      ctor: 8,
      bounce_rate: 0.9,
      unsub_rate: 0.3,
    },
    campaigns: [
      { id: "c1", name: "Campanha A", delivered: 30_000, revenue: 8_000, revenue_estimated: true },
      { id: "c2", name: "Campanha B", delivered: 20_000, revenue: 5_000 },
    ],
    flows: [{ id: "f1", name: "Welcome", delivered: 10_000, revenue: 40_000 }],
    insights: { resumo: "texto editorial" },
    ...overrides,
  }
}

describe("applyKpisOverrides", () => {
  it("overrides vazio/null → mesma referência (fast-path), sem paths", () => {
    const snap = makeSnapshot()
    expect(applyKpisOverrides(snap, null).snapshot).toBe(snap)
    expect(applyKpisOverrides(snap, {}).snapshot).toBe(snap)
    expect(applyKpisOverrides(snap, { kpis: {} }).snapshot).toBe(snap)
    expect(applyKpisOverrides(snap, null).overriddenPaths).toEqual([])
  })

  it("aplica KPI flat sem mutar o snapshot original", () => {
    const snap = makeSnapshot()
    const { snapshot: out, overriddenPaths } = applyKpisOverrides(snap, {
      kpis: { novos_clientes: 950 },
    })
    expect(out.kpis?.novos_clientes).toBe(950)
    expect(snap.kpis?.novos_clientes).toBe(800) // original intacto
    expect(overriddenPaths).toEqual(["kpis.novos_clientes"])
  })

  it("recalcula derivados não editados: receita_atribuida → atribuicao_pct e ticket_medio_atribuido", () => {
    const { snapshot: out, overriddenPaths } = applyKpisOverrides(makeSnapshot(), {
      kpis: { receita_atribuida: 300_000 },
    })
    expect(out.kpis?.atribuicao_pct).toBeCloseTo(0.3, 6)
    expect(out.kpis?.ticket_medio_atribuido).toBeCloseTo(300_000 / 1_500, 2)
    // derivados recalculados NÃO entram em overriddenPaths
    expect(overriddenPaths).toEqual(["kpis.receita_atribuida"])
  })

  it("override explícito de derivado vence o recálculo", () => {
    const { snapshot: out } = applyKpisOverrides(makeSnapshot(), {
      kpis: { receita_atribuida: 300_000, atribuicao_pct: 0.5 },
    })
    expect(out.kpis?.atribuicao_pct).toBe(0.5)
  })

  it("divisor zero não produz Infinity/NaN", () => {
    const { snapshot: out } = applyKpisOverrides(makeSnapshot(), {
      kpis: { pedidos_loja: 0, receita_total: 100 },
    })
    expect(out.kpis?.pedidos_loja).toBe(0)
    // ticket_medio mantém o valor anterior (não recalculável com divisor 0)
    expect(Number.isFinite(out.kpis?.ticket_medio ?? 0)).toBe(true)
  })

  it("editar pedidos_loja recalcula ticket_medio", () => {
    const { snapshot: out } = applyKpisOverrides(makeSnapshot(), {
      kpis: { pedidos_loja: 4_000 },
    })
    expect(out.kpis?.ticket_medio).toBeCloseTo(1_000_000 / 4_000, 2)
  })

  it("aplica email sub-objeto", () => {
    const { snapshot: out, overriddenPaths } = applyKpisOverrides(makeSnapshot(), {
      email: { open_rate: 25, bounce_rate: 1.2 },
    })
    expect(out.email?.open_rate).toBe(25)
    expect(out.email?.bounce_rate).toBe(1.2)
    expect(overriddenPaths).toEqual(
      expect.arrayContaining(["email.open_rate", "email.bounce_rate"]),
    )
  })

  it("snapshot antigo sem kpis/email não quebra (cria objetos)", () => {
    const old: ReportSnapshot = { month_label: "Junho 2026" }
    const { snapshot: out } = applyKpisOverrides(old, {
      kpis: { receita_total: 500 },
      email: { open_rate: 20 },
    })
    expect(out.kpis?.receita_total).toBe(500)
    expect(out.email?.open_rate).toBe(20)
  })

  it("rows por id: aplica revenue+name na linha certa e limpa flag estimated", () => {
    const { snapshot: out, overriddenPaths } = applyKpisOverrides(makeSnapshot(), {
      campaigns: { c1: { revenue: 12_000, name: "Campanha A (ajustada)" } },
      flows: { f1: { revenue: 45_000 } },
    })
    const c1 = out.campaigns?.find((r) => r.id === "c1")
    expect(c1?.revenue).toBe(12_000)
    expect(c1?.name).toBe("Campanha A (ajustada)")
    expect(c1?.revenue_estimated).toBe(false) // valor manual não é estimativa
    expect(out.campaigns?.find((r) => r.id === "c2")?.revenue).toBe(5_000)
    expect(out.flows?.[0].revenue).toBe(45_000)
    expect(overriddenPaths).toEqual(
      expect.arrayContaining(["campaigns.c1.revenue", "campaigns.c1.name", "flows.f1.revenue"]),
    )
  })

  it("id inexistente (linha saiu do top-N) → skip silencioso, override dormant", () => {
    const { snapshot: out, overriddenPaths } = applyKpisOverrides(makeSnapshot(), {
      campaigns: { fantasma: { revenue: 999 } },
    })
    expect(out.campaigns).toHaveLength(2)
    expect(overriddenPaths).toEqual([])
  })

  it("editar linha NÃO recalcula receita_campanhas (totais independentes)", () => {
    const { snapshot: out } = applyKpisOverrides(makeSnapshot(), {
      campaigns: { c1: { revenue: 999_999 } },
    })
    expect(out.kpis?.receita_campanhas).toBe(50_000)
  })
})

describe("mergeKpisOverrides", () => {
  const prev: ReportKpisOverrides = {
    kpis: { receita_total: 1_100_000, novos_clientes: 900 },
    campaigns: { c1: { revenue: 12_000, name: "Ajustada" } },
  }

  it("preserva chaves anteriores e sobrescreve as novas", () => {
    const out = mergeKpisOverrides(prev, { kpis: { novos_clientes: 950 } })
    expect(out.kpis?.receita_total).toBe(1_100_000)
    expect(out.kpis?.novos_clientes).toBe(950)
    expect(out.campaigns?.c1.revenue).toBe(12_000)
  })

  it("null remove a folha (restaurar campo)", () => {
    const out = mergeKpisOverrides(prev, { kpis: { receita_total: null } })
    expect(out.kpis).toEqual({ novos_clientes: 900 })
  })

  it("sub-objeto esvaziado é removido", () => {
    const out = mergeKpisOverrides(
      { kpis: { receita_total: 5 } },
      { kpis: { receita_total: null } },
    )
    expect(out.kpis).toBeUndefined()
  })

  it("rows: merge por id, null remove campo, row vazia é limpa", () => {
    const out = mergeKpisOverrides(prev, {
      campaigns: {
        c1: { name: null }, // remove só o name, revenue fica
        c2: { revenue: 7_000 },
      },
    })
    expect(out.campaigns?.c1).toEqual({ revenue: 12_000 })
    expect(out.campaigns?.c2).toEqual({ revenue: 7_000 })

    const cleared = mergeKpisOverrides(out, {
      campaigns: { c1: { revenue: null }, c2: { revenue: null } },
    })
    expect(cleared.campaigns).toBeUndefined()
  })

  it("prev null/undefined funciona", () => {
    const out = mergeKpisOverrides(null, { email: { open_rate: 20 } })
    expect(out.email?.open_rate).toBe(20)
  })

  it("não muta o prev", () => {
    mergeKpisOverrides(prev, { kpis: { receita_total: null } })
    expect(prev.kpis?.receita_total).toBe(1_100_000)
  })
})

describe("moeda editável (currency)", () => {
  it("apply: troca account.currency e marca o path", () => {
    const { snapshot, overriddenPaths } = applyKpisOverrides(makeSnapshot(), {
      currency: "USD",
    })
    expect(snapshot.account?.currency).toBe("USD")
    expect(overriddenPaths).toContain("currency")
  })

  it("apply: snapshot sem account ganha account com a moeda", () => {
    const snap = makeSnapshot({ account: undefined })
    const { snapshot } = applyKpisOverrides(snap, { currency: "EUR" })
    expect(snapshot.account?.currency).toBe("EUR")
  })

  it("apply: sem override de moeda o snapshot fica intacto", () => {
    const { snapshot } = applyKpisOverrides(makeSnapshot(), {
      kpis: { receita_total: 5 },
    })
    expect(snapshot.account?.currency).toBe("BRL")
  })

  it("merge: seta, sobrescreve e null restaura (chave some)", () => {
    let o: ReportKpisOverrides = mergeKpisOverrides({}, { currency: "USD" })
    expect(o.currency).toBe("USD")
    o = mergeKpisOverrides(o, { currency: "EUR" })
    expect(o.currency).toBe("EUR")
    o = mergeKpisOverrides(o, { currency: null })
    expect("currency" in o).toBe(false)
  })

  it("merge: patch sem currency preserva a salva", () => {
    const o = mergeKpisOverrides({ currency: "USD" }, { kpis: { envios: 1 } })
    expect(o.currency).toBe("USD")
  })
})
