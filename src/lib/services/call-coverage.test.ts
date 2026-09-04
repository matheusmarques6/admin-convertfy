import { describe, expect, it } from "vitest"
import {
  computeCallCoverage,
  defaultReferenceMonths,
  isMonthKey,
  monthLabel,
  monthOf,
  monthOfDay,
  monthOptionsFor,
  monthRange,
  monthsCoveredByCall,
  previousMonth,
} from "./call-coverage"

describe("helpers de mês", () => {
  it("valida e rotula", () => {
    expect(isMonthKey("2026-08")).toBe(true)
    expect(isMonthKey("2026-13")).toBe(false)
    expect(isMonthKey("2026-8")).toBe(false)
    expect(isMonthKey(null)).toBe(false)
    expect(monthLabel("2026-08")).toBe("ago/26")
    expect(monthLabel("2026-01")).toBe("jan/26")
  })

  it("mês de uma data usa o fuso de São Paulo", () => {
    // 01/09 00:30 UTC = 31/08 21:30 em SP → agosto, não setembro
    expect(monthOf("2026-09-01T00:30:00Z")).toBe("2026-08")
    expect(monthOf("2026-09-01T12:00:00Z")).toBe("2026-09")
    expect(monthOf("data ruim")).toBeNull()
  })

  it("mês anterior atravessa o ano", () => {
    expect(previousMonth("2026-01")).toBe("2025-12")
    expect(previousMonth("2026-09")).toBe("2026-08")
  })

  it("intervalo inclusivo, vazio quando invertido", () => {
    expect(monthRange("2026-07", "2026-10")).toEqual([
      "2026-07", "2026-08", "2026-09", "2026-10",
    ])
    expect(monthRange("2025-12", "2026-02")).toEqual(["2025-12", "2026-01", "2026-02"])
    expect(monthRange("2026-10", "2026-07")).toEqual([])
    expect(monthRange("2026-05", "2026-05")).toEqual(["2026-05"])
  })
})

describe("monthsCoveredByCall", () => {
  it("usa os meses declarados quando existem", () => {
    expect(
      monthsCoveredByCall({
        conducted_at: "2026-09-03T12:00:00Z",
        reference_months: ["2026-07", "2026-08"],
      }),
    ).toEqual(["2026-07", "2026-08"])
  })

  it("sem declaração, assume o mês ANTERIOR à call", () => {
    expect(monthsCoveredByCall({ conducted_at: "2026-09-03T12:00:00Z" })).toEqual([
      "2026-08",
    ])
  })

  it("ignora mês inválido e deduplica", () => {
    expect(
      monthsCoveredByCall({
        conducted_at: "2026-09-03T12:00:00Z",
        reference_months: ["2026-08", "2026-08", "lixo", "2026-13"],
      }),
    ).toEqual(["2026-08"])
  })
})

describe("computeCallCoverage", () => {
  const now = new Date("2026-09-04T12:00:00Z") // mês corrente: set/26

  it("aponta o mês que ficou sem alinhamento", () => {
    const r = computeCallCoverage({
      calls: [
        { conducted_at: "2026-08-05T12:00:00Z", reference_months: ["2026-07"] },
        { conducted_at: "2026-06-05T12:00:00Z", reference_months: ["2026-05"] },
      ],
      contractStart: "2026-05-10T00:00:00Z",
      now,
    })
    expect(r.window).toEqual({ from: "2026-05", to: "2026-08" })
    expect(r.covered).toEqual(["2026-07", "2026-05"])
    // jun e ago ficaram sem call
    expect(r.missing).toEqual(["2026-08", "2026-06"])
  })

  it("mês corrente nunca conta como atraso", () => {
    const r = computeCallCoverage({
      calls: [{ conducted_at: "2026-09-02T12:00:00Z", reference_months: ["2026-08"] }],
      contractStart: "2026-08-01T00:00:00Z",
      now,
    })
    expect(r.window).toEqual({ from: "2026-08", to: "2026-08" })
    expect(r.missing).toEqual([])
  })

  it("uma call pode cobrir dois meses de uma vez", () => {
    const r = computeCallCoverage({
      calls: [
        { conducted_at: "2026-09-01T12:00:00Z", reference_months: ["2026-07", "2026-08"] },
      ],
      contractStart: "2026-07-01T00:00:00Z",
      now,
    })
    expect(r.missing).toEqual([])
    expect(r.covered).toEqual(["2026-08", "2026-07"])
  })

  it("janela não começa antes do contrato", () => {
    const r = computeCallCoverage({
      calls: [],
      contractStart: "2026-08-15T00:00:00Z",
      now,
    })
    expect(r.window).toEqual({ from: "2026-08", to: "2026-08" })
    expect(r.missing).toEqual(["2026-08"])
  })

  it("sem contrato, limita a janela a maxMonths", () => {
    const r = computeCallCoverage({ calls: [], now, maxMonths: 3 })
    expect(r.window).toEqual({ from: "2026-06", to: "2026-08" })
    expect(r.missing).toEqual(["2026-08", "2026-07", "2026-06"])
  })

  it("contrato que começa no mês corrente não gera atraso", () => {
    const r = computeCallCoverage({
      calls: [],
      contractStart: "2026-09-01T00:00:00Z",
      now,
    })
    expect(r.window).toBeNull()
    expect(r.missing).toEqual([])
  })

  it("call sem reference_months entra pelo mês anterior", () => {
    const r = computeCallCoverage({
      calls: [{ conducted_at: "2026-09-03T12:00:00Z" }],
      contractStart: "2026-08-01T00:00:00Z",
      now,
    })
    expect(r.covered).toEqual(["2026-08"])
    expect(r.missing).toEqual([])
  })
})

describe("seletor de meses", () => {
  it("lista o mês da call e os anteriores", () => {
    expect(monthOptionsFor("2026-09-03T12:00:00Z", 4)).toEqual([
      "2026-09", "2026-08", "2026-07", "2026-06",
    ])
  })

  it("atravessa o ano para trás", () => {
    expect(monthOptionsFor("2026-02-10T12:00:00Z", 3)).toEqual([
      "2026-02", "2026-01", "2025-12",
    ])
  })

  it("pré-seleção é o mês anterior à call", () => {
    expect(defaultReferenceMonths("2026-09-03T12:00:00Z")).toEqual(["2026-08"])
    expect(defaultReferenceMonths("2026-01-15T12:00:00Z")).toEqual(["2025-12"])
    expect(defaultReferenceMonths("data ruim")).toEqual([])
  })
})

describe("monthOfDay (DATE sem hora)", () => {
  it("lê o mês literal, sem deslocar por fuso", () => {
    // o bug que isso previne: 2026-08-01 virando julho e criando
    // atraso fantasma no primeiro mês do contrato
    expect(monthOfDay("2026-08-01")).toBe("2026-08")
    expect(monthOfDay("2026-08-01T00:00:00Z")).toBe("2026-08")
    expect(monthOfDay("2026-01-31")).toBe("2026-01")
    expect(monthOfDay("nada")).toBeNull()
  })
})
