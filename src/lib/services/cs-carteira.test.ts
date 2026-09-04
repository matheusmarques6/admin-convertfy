import { describe, expect, it } from "vitest"
import {
  callTone,
  comissaoFromInvoices,
  daysSince,
  mensalidadeFromInvoices,
  splitInvoicesForStore,
  subscriptionsForStore,
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

describe("splitInvoicesForStore", () => {
  const A = "store-a"
  const B = "store-b"
  const byStore = (store_id: string | null, charge_type = "subscription", sub?: string): InvoiceLite => ({
    ...inv("2026-08-05", "paid", "2026-08-05"),
    store_id,
    charge_type,
    subscription_id: sub ?? null,
  })

  it("store_id decide sozinho; comissão vai pro balde de comissão", () => {
    const r = splitInvoicesForStore({
      invoices: [byStore(A), byStore(B), byStore(A, "commission")],
      storeId: A,
      subscriptionStores: {},
      clientStoreCount: 2,
    })
    expect(r.mensalidade).toHaveLength(1)
    expect(r.comissao).toHaveLength(1)
    expect(r.unassigned).toBe(0)
    expect(r.scope).toBe("loja")
  })

  it("assinatura vinculada atribui — e exclui a loja que não está no vínculo", () => {
    const r = splitInvoicesForStore({
      invoices: [byStore(null, "subscription", "sub-1"), byStore(null, "subscription", "sub-2")],
      storeId: A,
      subscriptionStores: { "sub-1": [A, B], "sub-2": [B] },
      clientStoreCount: 2,
    })
    expect(r.mensalidade).toHaveLength(1)
    expect(r.unassigned).toBe(0)
  })

  it("cliente com uma loja só herda tudo (scope cliente); com várias, sem loja vira unassigned", () => {
    const one = splitInvoicesForStore({
      invoices: [byStore(null), byStore(null, "commission")],
      storeId: A,
      subscriptionStores: {},
      clientStoreCount: 1,
    })
    expect(one.mensalidade).toHaveLength(1)
    expect(one.comissao).toHaveLength(1)
    expect(one.scope).toBe("cliente")

    const multi = splitInvoicesForStore({
      invoices: [byStore(null), byStore(null, "commission"), byStore(A)],
      storeId: A,
      subscriptionStores: {},
      clientStoreCount: 2,
    })
    expect(multi.mensalidade).toHaveLength(1)
    expect(multi.unassigned).toBe(2)
    expect(multi.scope).toBe("loja")
  })

  it("linha antiga sem charge_type conta como mensalidade (comportamento anterior preservado)", () => {
    const r = splitInvoicesForStore({
      invoices: [inv("2026-08-05", "paid", "2026-08-05")],
      storeId: A,
      subscriptionStores: {},
      clientStoreCount: 1,
    })
    expect(r.mensalidade).toHaveLength(1)
    expect(r.comissao).toHaveLength(0)
  })
})

describe("subscriptionsForStore", () => {
  const subs = [
    { id: "s1", name: "Plano", value: 3500, cycle: "MONTHLY", status: "active" },
    { id: "s2", name: "Plano 2", value: 3500, cycle: "MONTHLY", status: "active" },
  ]
  it("vinculadas primeiro; sem vínculo, herda só quando o cliente tem uma loja", () => {
    expect(
      subscriptionsForStore({ subscriptions: subs, storeId: "a", subscriptionStores: { s2: ["a"] }, clientStoreCount: 2 }),
    ).toEqual({ list: [subs[1]], scope: "loja" })
    expect(
      subscriptionsForStore({ subscriptions: subs, storeId: "a", subscriptionStores: {}, clientStoreCount: 1 }).scope,
    ).toBe("cliente")
    expect(
      subscriptionsForStore({ subscriptions: subs, storeId: "a", subscriptionStores: {}, clientStoreCount: 2 }),
    ).toEqual({ list: [], scope: "none" })
    // vinculada a OUTRA loja não é herdada nem em cliente de uma loja
    expect(
      subscriptionsForStore({ subscriptions: subs, storeId: "a", subscriptionStores: { s1: ["b"], s2: ["b"] }, clientStoreCount: 1 }).list,
    ).toEqual([])
  })
})

describe("comissaoFromInvoices", () => {
  const com = (due: string, status: string, months: string[] | null, paid?: string): InvoiceLite => ({
    ...inv(due, status, paid, 1000),
    charge_type: "commission",
    reference_months: months,
  })

  it("grade mês a mês até o mês passado, 'não cobrada' é o furo", () => {
    // NOW = 26/08/2026 → grade termina em jul/26
    const r = comissaoFromInvoices(
      [com("2026-07-21", "paid", ["2026-04", "2026-05", "2026-06"], "2026-07-21"), com("2026-08-25", "pending", ["2026-07"])],
      NOW,
    )
    expect(r.status).toBe("atrasada") // pending vencida em 25/08
    expect(r.months.map((m) => [m.month, m.status])).toEqual([
      ["2026-07", "atrasada"],
      ["2026-06", "paga"],
      ["2026-05", "paga"],
      ["2026-04", "paga"],
    ])
    expect(r.history[0]).toMatchObject({ month: "jul/26", status: "atrasada", months: ["2026-07"], inferred: false })
    expect(r.history[1].month).toBe("abr–jun/26")
  })

  it("mês pulado aparece como 'não cobrada'; cancelada reemitida perde pro pending", () => {
    const r = comissaoFromInvoices(
      [
        com("2026-06-20", "paid", ["2026-05"], "2026-06-20"),
        com("2026-08-20", "cancelled", ["2026-07"]),
        com("2026-09-02", "pending", ["2026-07"]),
      ],
      NOW,
    )
    expect(r.months.map((m) => [m.month, m.status])).toEqual([
      ["2026-07", "em aberto"],
      ["2026-06", "não cobrada"],
      ["2026-05", "paga"],
    ])
    expect(r.status).toBe("pendente")
  })

  it("sem reference_months assume o mês anterior ao vencimento e marca inferred", () => {
    const r = comissaoFromInvoices([com("2026-09-13", "pending", null)], NOW)
    expect(r.history[0]).toMatchObject({ month: "ago/26", inferred: true })
    // mês citado à frente da janela entra na grade (não é "não cobrada")
    expect(r.months[0]).toMatchObject({ month: "2026-08", status: "em aberto" })
  })

  it("janela limitada a windowMonths quando o histórico é longo; vazio sem comissão", () => {
    const r = comissaoFromInvoices([com("2025-02-10", "paid", ["2025-01"], "2025-02-10")], NOW, { windowMonths: 3 })
    expect(r.months.map((m) => m.month)).toEqual(["2026-07", "2026-06", "2026-05"])
    expect(comissaoFromInvoices([], NOW).months).toEqual([])
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
