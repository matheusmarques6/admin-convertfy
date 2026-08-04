import { describe, it, expect } from "vitest"
import { csvCell, toCsv, csvNumber, csvDate, CSV_BOM } from "./crm-csv"

describe("csvCell", () => {
  it("escapa separador, aspas e quebra de linha", () => {
    expect(csvCell("a;b")).toBe('"a;b"')
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"')
  })

  it("neutraliza injecao de formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)")
    expect(csvCell("+5511999")).toBe("'+5511999")
    expect(csvCell("@cmd")).toBe("'@cmd")
  })

  it("nulo vira vazio, texto simples passa direto", () => {
    expect(csvCell(null)).toBe("")
    expect(csvCell("Plano Pro")).toBe("Plano Pro")
  })
})

describe("toCsv", () => {
  it("monta header + linhas com BOM e CRLF", () => {
    const out = toCsv(["Nome", "Valor"], [["Acme", 100]])
    expect(out.startsWith(CSV_BOM)).toBe(true)
    expect(out).toContain("Nome;Valor\r\nAcme;100")
  })
})

describe("csvNumber / csvDate", () => {
  it("numero usa virgula decimal", () => {
    expect(csvNumber(1234.56)).toBe("1234,56")
    expect(csvNumber(null)).toBe("")
  })

  it("data ISO vira dd/mm/aaaa", () => {
    expect(csvDate("2026-08-04T12:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(csvDate(null)).toBe("")
  })
})
