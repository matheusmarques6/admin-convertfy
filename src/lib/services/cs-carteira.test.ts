import { describe, expect, it } from "vitest"
import {
  callTone,
  daysSince,
  mensalidadeFromInvoices,
  monthLabel,
  nextCallLabel,
  pctTone,
  sinceLabel,
  type InvoiceLite,
} from "./cs-carteira"

// 26/08/2026 12:00 local — mesmo referencial dos mocks do design.
const NOW = new Date("2026-08-26T12:00:00").getTime()

const inv = (due: string, status: string, paid?: string, amount = 2800): InvoiceLite => ({
  due_date: due,
  payment_date: paid ?? null,
  status,
  amount,
})

describe("mensalidadeFromInvoices", () => {
  it("tudo pago → paga, histórico desc com 'paga em dd/mm'", () => {
    const r = mensalidadeFromInvoices(
      [inv("2026-07-05", "paid", "2026-07-04"), inv("2026-08-05", "paid", "2026-08-05")],
      NOW,
    )
    expect(r.status).toBe("paga")
    expect(r.history[0]).toMatchObject({ month: "ago/26", status: "paga", detail: "paga em 05/08" })
    expect(r.history[1].month).toBe("jul/26")
  })

  it("overdue explícito vence qualquer outro estado", () => {
    const r = mensalidadeFromInvoices(
      [inv("2026-08-05", "overdue"), inv("2026-09-05", "pending"), inv("2026-07-05", "paid", "2026-07-05")],
      NOW,
    )
    expect(r.status).toBe("atrasada")
    expect(r.history[0]).toMatchObject({ month: "set/26", status: "em aberto", detail: "vence 05/09" })
    expect(r.history[1]).toMatchObject({ month: "ago/26", status: "atrasada", detail: "venceu 05/08" })
  })

  it("pending com vencimento no passado conta como atrasada (Asaas às vezes não vira overdue)", () => {
    const r = mensalidadeFromInvoices([inv("2026-08-05", "pending")], NOW)
    expect(r.status).toBe("atrasada")
    expect(r.history[0].status).toBe("atrasada")
  })

  it("pending a vencer → pendente", () => {
    const r = mensalidadeFromInvoices(
      [inv("2026-09-05", "pending"), inv("2026-08-05", "paid", "2026-08-05")],
      NOW,
    )
    expect(r.status).toBe("pendente")
  })

  it("sem faturas → none; cancelada não muda o status agregado", () => {
    expect(mensalidadeFromInvoices([], NOW).status).toBe("none")
    const r = mensalidadeFromInvoices([inv("2026-08-05", "cancelled")], NOW)
    expect(r.status).toBe("none")
    expect(r.history[0].status).toBe("cancelada")
  })

  it("histórico corta em historyMax", () => {
    const many = ["2026-08-05", "2026-07-05", "2026-06-05", "2026-05-05", "2026-04-05"].map((d) =>
      inv(d, "paid", d),
    )
    expect(mensalidadeFromInvoices(many, NOW).history).toHaveLength(4)
  })
})

describe("régua de calls", () => {
  it("daysSince conta dias inteiros", () => {
    expect(daysSince("2026-08-20", NOW)).toBe(6)
    expect(daysSince(null, NOW)).toBeNull()
  })

  it("callTone: 25-29d âmbar+agendar, >=30d vermelho", () => {
    expect(callTone(10)).toEqual({ tone: "ok", agendar: false })
    expect(callTone(26)).toEqual({ tone: "warn", agendar: true })
    expect(callTone(30)).toEqual({ tone: "neg", agendar: false })
    expect(callTone(null)).toEqual({ tone: "ok", agendar: false })
  })
})

describe("labels", () => {
  it("monthLabel/sinceLabel em pt-BR curto", () => {
    expect(monthLabel("2025-03-15")).toBe("mar/25")
    expect(sinceLabel(null)).toBeNull()
  })

  it("nextCallLabel só para datas futuras, com dia da semana", () => {
    expect(nextCallLabel("2026-08-28", NOW)).toBe("sex 28/08")
    expect(nextCallLabel("2026-08-20", NOW)).toBeNull()
    expect(nextCallLabel(null, NOW)).toBeNull()
  })

  it("pctTone: verde >=15, âmbar abaixo, mut sem dado", () => {
    expect(pctTone(24.8)).toBe("pos")
    expect(pctTone(12.1)).toBe("warn")
    expect(pctTone(null)).toBe("mut")
  })
})
