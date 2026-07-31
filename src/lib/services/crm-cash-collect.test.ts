import { describe, it, expect } from "vitest"
import {
  groupPaidInvoices,
  resolveCashCollect,
  type PaidInvoice,
} from "./crm-cash-collect"

const inv = (
  client_id: string,
  amount: number,
  payment_date: string | null,
  source = "asaas",
): PaidInvoice => ({ client_id, amount, payment_date, source })

const deal = (over: Partial<Parameters<typeof resolveCashCollect>[0]> = {}) => ({
  client_id: "c1",
  cash_collected: null,
  won_at: "2026-07-10T12:00:00.000Z",
  created_at: "2026-07-01T12:00:00.000Z",
  ...over,
})

describe("groupPaidInvoices", () => {
  it("agrupa por cliente preservando todas as faturas", () => {
    const map = groupPaidInvoices([
      inv("c1", 100, "2026-07-11"),
      inv("c2", 50, "2026-07-11"),
      inv("c1", 200, "2026-07-12"),
    ])
    expect(map.get("c1")).toHaveLength(2)
    expect(map.get("c2")).toHaveLength(1)
  })
})

describe("resolveCashCollect", () => {
  it("soma pagamentos confirmados a partir do fechamento", () => {
    const map = groupPaidInvoices([
      inv("c1", 1000, "2026-07-11"),
      inv("c1", 500, "2026-07-20"),
    ])
    const r = resolveCashCollect(deal(), map)
    expect(r.auto).toBe(1500)
    expect(r.effective).toBe(1500)
    expect(r.source).toBe("asaas")
  })

  it("ignora pagamento anterior ao ganho (venda antiga do mesmo cliente)", () => {
    const map = groupPaidInvoices([
      inv("c1", 9999, "2026-06-01"), // ciclo anterior — nao conta
      inv("c1", 1000, "2026-07-11"),
    ])
    const r = resolveCashCollect(deal(), map)
    expect(r.auto).toBe(1000)
  })

  it("conta pagamento no proprio dia do ganho", () => {
    const map = groupPaidInvoices([inv("c1", 700, "2026-07-10")])
    expect(resolveCashCollect(deal(), map).auto).toBe(700)
  })

  it("override manual vence o derivado", () => {
    const map = groupPaidInvoices([inv("c1", 1000, "2026-07-11")])
    const r = resolveCashCollect(deal({ cash_collected: 250 }), map)
    expect(r.effective).toBe(250)
    expect(r.auto).toBe(1000)
    expect(r.manual).toBe(250)
  })

  it("manual zero e respeitado (nao cai no derivado)", () => {
    const map = groupPaidInvoices([inv("c1", 1000, "2026-07-11")])
    expect(resolveCashCollect(deal({ cash_collected: 0 }), map).effective).toBe(0)
  })

  it("venda sem cliente usa so o manual", () => {
    const map = groupPaidInvoices([inv("c1", 1000, "2026-07-11")])
    const semCliente = resolveCashCollect(
      deal({ client_id: null, cash_collected: 400 }),
      map,
    )
    expect(semCliente.effective).toBe(400)
    expect(semCliente.auto).toBe(0)
    expect(semCliente.source).toBeNull()
  })

  it("sem pagamento e sem manual devolve zero, nao null", () => {
    const r = resolveCashCollect(deal(), new Map())
    expect(r.effective).toBe(0)
    expect(r.source).toBeNull()
  })

  it("marca origem mista quando ha Asaas e lancamento manual", () => {
    const map = groupPaidInvoices([
      inv("c1", 600, "2026-07-11", "asaas"),
      inv("c1", 400, "2026-07-12", "local"),
    ])
    const r = resolveCashCollect(deal(), map)
    expect(r.auto).toBe(1000)
    expect(r.source).toBe("mixed")
  })

  it("identifica origem local quando so ha lancamento manual", () => {
    const map = groupPaidInvoices([inv("c1", 300, "2026-07-11", "local")])
    expect(resolveCashCollect(deal(), map).source).toBe("local")
  })

  it("ignora fatura paga sem data de pagamento", () => {
    const map = groupPaidInvoices([inv("c1", 800, null)])
    expect(resolveCashCollect(deal(), map).auto).toBe(0)
  })

  it("usa created_at quando o deal nao tem won_at", () => {
    const map = groupPaidInvoices([
      inv("c1", 100, "2026-06-15"), // antes da criacao
      inv("c1", 900, "2026-07-05"), // depois
    ])
    const r = resolveCashCollect(deal({ won_at: null }), map)
    expect(r.auto).toBe(900)
  })

  it("trata valor nulo de fatura como zero", () => {
    const map = groupPaidInvoices([
      { client_id: "c1", amount: null, payment_date: "2026-07-11", source: "asaas" },
      inv("c1", 100, "2026-07-11"),
    ])
    expect(resolveCashCollect(deal(), map).auto).toBe(100)
  })
})
