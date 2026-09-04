import { describe, expect, it } from "vitest"
import {
  describeCharge,
  inferChargeType,
  inferReferenceMonths,
  monthsLabel,
} from "./charge-description"

describe("inferChargeType", () => {
  it("qualquer 'comiss' é comissão, mesmo com acento e plural", () => {
    expect(inferChargeType("Cobrança referente à comissão do mês de Julho.")).toBe("commission")
    expect(inferChargeType("Comissões dos meses de Abril, Maio e Junho.")).toBe("commission")
  })

  it("mensalidade/assinatura/plano → assinatura; ligada a assinatura também", () => {
    expect(inferChargeType("Cobrança referente à mensalidade do mês de Julho")).toBe("subscription")
    expect(inferChargeType("Cobrança referente ao plano trimestral")).toBe("subscription")
    expect(inferChargeType("1ª mensalidade — Loja X")).toBe("subscription")
    expect(inferChargeType("Fatura - Vivazz Ltd", { hasSubscription: true })).toBe("subscription")
  })

  it("comissão vence a ligação com assinatura; o resto é avulsa", () => {
    expect(inferChargeType("Comissão Momi Jewel", { hasSubscription: true })).toBe("commission")
    expect(inferChargeType("Fatura - Vivazz Ltd")).toBe("other")
    expect(inferChargeType(null)).toBe("other")
  })
})

describe("inferReferenceMonths", () => {
  it("mês por extenso, ano do vencimento", () => {
    expect(inferReferenceMonths("Cobrança referente à comissão do mês de Julho.", "2026-08-25")).toEqual([
      "2026-07",
    ])
  })

  it("lista de meses e 'Julho/Agosto'", () => {
    expect(
      inferReferenceMonths("Comissões Azzurro dos meses de Abril, Maio e Junho.", "2026-07-21"),
    ).toEqual(["2026-04", "2026-05", "2026-06"])
    expect(inferReferenceMonths("Comissão mês de Julho/Agosto", "2026-09-02")).toEqual([
      "2026-07",
      "2026-08",
    ])
  })

  it("mês posterior ao vencimento recua um ano (comissão de dezembro vence em janeiro)", () => {
    expect(inferReferenceMonths("Comissão de Dezembro", "2027-01-10")).toEqual(["2026-12"])
  })

  it("ano explícito vence a inferência", () => {
    expect(inferReferenceMonths("Comissão de dezembro de 2025", "2026-08-01")).toEqual(["2025-12"])
  })

  it("intervalo 'abril a junho' expande", () => {
    expect(inferReferenceMonths("Comissão de abril a junho", "2026-07-15")).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ])
    expect(inferReferenceMonths("Comissão de novembro até janeiro", "2027-02-10")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ])
  })

  it("abreviações só sem nome completo; 'set'/'out'/'mar' nunca contam", () => {
    expect(inferReferenceMonths("Comissão jul/26", "2026-08-05")).toEqual(["2026-07"])
    expect(inferReferenceMonths("Setup da loja", "2026-08-05")).toEqual([])
    expect(inferReferenceMonths("Marca nova — out of stock", "2026-08-05")).toEqual([])
  })

  it("sem mês → vazio; descrição vazia → vazio", () => {
    expect(inferReferenceMonths("Fatura - Vivazz Ltd", "2026-08-05")).toEqual([])
    expect(inferReferenceMonths("", "2026-08-05")).toEqual([])
  })

  it("'sem o mês de Junho' ainda cita junho — o parser não entende negação (documentado)", () => {
    // O time revisa a sugestão na tela; o parser é ponto de partida.
    expect(
      inferReferenceMonths("Comissão do mês de Abril e Maio, sem o mês de Junho", "2026-08-12"),
    ).toEqual(["2026-04", "2026-05", "2026-06"])
  })
})

describe("monthsLabel", () => {
  it("um mês, consecutivos e soltos", () => {
    expect(monthsLabel(["2026-07"])).toBe("jul/26")
    expect(monthsLabel(["2026-06", "2026-04", "2026-05"])).toBe("abr–jun/26")
    expect(monthsLabel(["2026-04", "2026-06"])).toBe("abr, jun/26")
    expect(monthsLabel(["2026-12", "2027-01"])).toBe("dez/26–jan/27")
    expect(monthsLabel([])).toBe("")
    expect(monthsLabel(null)).toBe("")
  })
})

describe("describeCharge", () => {
  it("gera o texto que o parser lê de volta", () => {
    const text = describeCharge({ type: "commission", months: ["2026-07"], storeName: "Azzurro" })
    expect(text).toBe("Comissão de jul/26 — Azzurro")
    expect(inferChargeType(text)).toBe("commission")
    expect(inferReferenceMonths(text, "2026-08-20")).toEqual(["2026-07"])
  })

  it("assinatura e avulsa", () => {
    expect(describeCharge({ type: "subscription", months: ["2026-09"], clientName: "Ana" })).toBe(
      "Mensalidade set/26 — Ana",
    )
    expect(describeCharge({ type: "other", clientName: "Ana" })).toBe("Fatura — Ana")
    expect(describeCharge({ type: "other" })).toBe("Fatura")
  })
})
