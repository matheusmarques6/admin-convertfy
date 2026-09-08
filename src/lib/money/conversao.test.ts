import { describe, expect, it } from "vitest"
import {
  descreverParcela,
  explicarConversao,
  formatarBRL,
  formatarBRLCompacto,
  formatarDiaISO,
  formatarMoeda,
  resumirComposicao,
} from "./conversao"

describe("formatarMoeda", () => {
  it("formata a moeda de origem", () => {
    expect(formatarMoeda(12400, "EUR")).toContain("12.400,00")
    expect(formatarMoeda(12400, "EUR")).toContain("€")
  })

  it("código desconhecido não derruba a tela", () => {
    // `Intl` lança RangeError em código inválido, e uma linha de tabela
    // não pode levar a página inteira junto.
    // \u00A0 é o espaço não separável que o Intl usa em pt-BR — o
    // fallback tem de usar o mesmo, senão a formatação muda conforme a
    // moeda ser conhecida.
    expect(formatarMoeda(1500, "XPT")).toBe("XPT\u00A01.500,00")
    expect(formatarMoeda(1500, null)).toBe("1.500,00")
  })
})

describe("formatarBRLCompacto", () => {
  it("encurta milhar e milhão", () => {
    expect(formatarBRLCompacto(348_000)).toBe("R$ 348 mil")
    expect(formatarBRLCompacto(1_240_000)).toBe("R$ 1,2 mi")
    expect(formatarBRLCompacto(842)).toBe("R$ 842")
  })
})

describe("formatarDiaISO", () => {
  it("converte sem passar por fuso", () => {
    // `new Date("2026-09-08")` é meia-noite UTC e volta 07/09 no Brasil —
    // a data da cotação apareceria um dia atrasada.
    expect(formatarDiaISO("2026-09-08")).toBe("08/09/2026")
    expect(formatarDiaISO("2026-01-01T00:00:00Z")).toBe("01/01/2026")
    expect(formatarDiaISO(null)).toBeNull()
  })
})

describe("explicarConversao", () => {
  it("mostra a conta que produziu o valor em real", () => {
    const linhas = explicarConversao({
      valorBRL: 73890.36,
      valorOriginal: 12400,
      moeda: "EUR",
      taxa: 5.9589,
      dataDaTaxa: "2026-09-08",
    })
    expect(linhas[0]).toContain("12.400,00")
    expect(linhas[0]).toContain("5,9589")
    expect(linhas[0]).toContain("73.890,36")
    expect(linhas[1]).toBe("Cotação de 08/09/2026: 1 EUR = 5,9589 BRL")
  })

  it("valor já em real não gera tooltip", () => {
    // Repetir na explicação o que já está na tela é ruído.
    expect(explicarConversao({ valorBRL: 1000, moeda: "BRL", valorOriginal: 1000 })).toEqual([])
    expect(explicarConversao({ valorBRL: 1000 })).toEqual([])
  })

  it("diz quando a cotação não é a do dia do faturamento", () => {
    const linhas = explicarConversao({
      valorBRL: 100,
      valorOriginal: 20,
      moeda: "USD",
      taxa: 5.1262,
      dataDaTaxa: "2026-09-08",
      taxaAproximada: true,
    })
    expect(linhas.some((l) => l.includes("aproximada"))).toBe(true)
  })

  it("valor NÃO convertido é declarado, não disfarçado", () => {
    // O pior caso: número em euro exibido com cifrão de real. Quem lê
    // precisa saber que aquilo não é real.
    const linhas = explicarConversao({ valorBRL: 12400, moeda: "EUR", naoConvertido: true })
    expect(linhas[0]).toContain("EUR")
    expect(linhas[0]).toContain("NÃO em real")
  })
})

describe("resumirComposicao", () => {
  const parcelas = [
    { moeda: "BRL", valorOriginal: 200000, valorBRL: 200000 },
    { moeda: "EUR", valorOriginal: 12400, valorBRL: 73890 },
    { moeda: "EUR", valorOriginal: 1000, valorBRL: 5959 },
    { moeda: "USD", valorOriginal: 3100, valorBRL: 15891 },
  ]

  it("agrupa por moeda e ordena pela fatia em real", () => {
    const r = resumirComposicao(parcelas)
    expect(r.porMoeda.map((m) => m.moeda)).toEqual(["BRL", "EUR", "USD"])
    // As duas parcelas em euro viram uma linha só.
    expect(r.porMoeda[1].valorOriginal).toBe(13400)
    expect(r.porMoeda[1].valorBRL).toBe(79849)
    expect(r.totalBRL).toBe(295740)
  })

  it("percentual soma ~100", () => {
    const r = resumirComposicao(parcelas)
    const soma = r.porMoeda.reduce((s, m) => s + m.percentual, 0)
    expect(Math.abs(soma - 100)).toBeLessThan(0.5)
  })

  it("total só em real não tem o que explicar", () => {
    const r = resumirComposicao([{ moeda: "BRL", valorOriginal: 10, valorBRL: 10 }])
    expect(r.soReal).toBe(true)
  })

  it("parcela não convertida contamina o total e isso aparece", () => {
    // Um total que contém euro não convertido está somando euro com real.
    const r = resumirComposicao([
      { moeda: "BRL", valorOriginal: 100, valorBRL: 100 },
      { moeda: "EUR", valorOriginal: 50, valorBRL: 50, naoConvertido: true },
    ])
    expect(r.temNaoConvertido).toBe(true)
    expect(r.porMoeda.find((m) => m.moeda === "EUR")?.naoConvertido).toBe(true)
  })

  it("ignora parcela zerada em vez de criar linha vazia", () => {
    const r = resumirComposicao([
      { moeda: "BRL", valorOriginal: 100, valorBRL: 100 },
      { moeda: "GBP", valorOriginal: 0, valorBRL: 0 },
    ])
    expect(r.porMoeda).toHaveLength(1)
  })
})

describe("descreverParcela", () => {
  it("real não vira 'convertido de real para real'", () => {
    const r = resumirComposicao([{ moeda: "BRL", valorOriginal: 100, valorBRL: 100 }])
    expect(descreverParcela(r.porMoeda[0])).toBe("R$\u00A0100,00 já em real (100%)")
  })

  it("estrangeira mostra origem → real", () => {
    const r = resumirComposicao([{ moeda: "USD", valorOriginal: 100, valorBRL: 512.62 }])
    const texto = descreverParcela(r.porMoeda[0])
    expect(texto).toContain("100,00")
    expect(texto).toContain("512,62")
  })
})

describe("formatarBRL", () => {
  it("com e sem centavos", () => {
    expect(formatarBRL(1234.5)).toContain("1.234,50")
    expect(formatarBRL(1234.5, { semCentavos: true })).toContain("1.235")
  })

  it("valor inválido vira traço em vez de NaN na tela", () => {
    expect(formatarBRL(Number.NaN)).toBe("—")
  })
})
