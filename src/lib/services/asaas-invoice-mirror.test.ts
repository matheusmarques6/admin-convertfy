import { describe, expect, it } from "vitest"
import { buildInvoiceRowFromPayment, type PaymentLike } from "./asaas-invoice-mirror"

const base: PaymentLike = {
  id: "pay_1",
  customer: "cus_1",
  value: 3000,
  dueDate: "2026-08-31",
  status: "PENDING",
  description: "Plano Mensal",
}

describe("buildInvoiceRowFromPayment", () => {
  it("mapeia status e data de pagamento (clientPaymentDate como fallback)", () => {
    expect(buildInvoiceRowFromPayment({ ...base, status: "RECEIVED_IN_CASH", clientPaymentDate: "2026-09-01" }, "c1")).toMatchObject({
      asaas_id: "pay_1",
      client_id: "c1",
      amount: 3000,
      due_date: "2026-08-31",
      payment_date: "2026-09-01",
      status: "paid",
      description: "Plano Mensal",
    })
    expect(buildInvoiceRowFromPayment({ ...base, status: "OVERDUE" }, "c1")).toMatchObject({ status: "overdue", payment_date: null })
  })

  it("sem descrição, gera uma com o id do payment", () => {
    expect(buildInvoiceRowFromPayment({ ...base, description: undefined }, "c1").description).toBe("Assinatura Asaas #pay_1")
  })

  it("pagamento nascido de assinatura guarda o sub_ e classifica como assinatura só sem classificação manual", () => {
    const sub = { ...base, subscription: "sub_9" }
    expect(buildInvoiceRowFromPayment(sub, "c1")).toMatchObject({ asaas_subscription_id: "sub_9", charge_type: "subscription" })
    expect(buildInvoiceRowFromPayment(sub, "c1", "other")).toMatchObject({ charge_type: "subscription" })
    // Comissão marcada à mão sobrevive ao sync
    const manual = buildInvoiceRowFromPayment(sub, "c1", "commission")
    expect(manual.asaas_subscription_id).toBe("sub_9")
    expect(manual).not.toHaveProperty("charge_type")
    // Sem assinatura, não toca em charge_type
    expect(buildInvoiceRowFromPayment(base, "c1")).not.toHaveProperty("asaas_subscription_id")
  })
})
