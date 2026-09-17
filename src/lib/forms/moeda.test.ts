import { describe, it, expect } from "vitest"
import {
  PISO_DE_QUALIFICACAO_BRL,
  REGIOES,
  TAXA_PARA_BRL,
  efeitoDoCorte,
  moedaDaRegiao,
  opcoesDeFaturamento,
  pisoDaResposta,
  qualificaPeloPiso,
  todasAsOpcoesDeFaturamento,
} from "./moeda"

describe("moeda da região", () => {
  it("cada região declarada resolve numa moeda", () => {
    for (const r of REGIOES) expect(moedaDaRegiao(r.value)).toBe(r.moeda)
  })

  it("compara sem acento e sem caixa — a resposta vem de uma lista digitada à mão", () => {
    expect(moedaDaRegiao("estados unidos")).toBe("USD")
    expect(moedaDaRegiao("  BRASIL ")).toBe("BRL")
    expect(moedaDaRegiao("Varios paises")).toBe("USD")
  })

  it("região desconhecida devolve null, NUNCA o real", () => {
    // Cair no BRL faria a loja americana receber faixas em real de novo —
    // exatamente o defeito que este módulo fecha.
    expect(moedaDaRegiao("Marte")).toBeNull()
    expect(moedaDaRegiao("")).toBeNull()
    expect(moedaDaRegiao(null)).toBeNull()
    expect(moedaDaRegiao(42)).toBeNull()
  })

  it("o rótulo também resolve — a tela mostra label, a resposta pode vir dele", () => {
    expect(moedaDaRegiao("LATAM (fora do Brasil)")).toBe("USD")
    expect(moedaDaRegiao("Vários países (worldwide)")).toBe("USD")
  })
})

describe("as escadas", () => {
  it("toda faixa carrega piso e moeda", () => {
    for (const m of ["BRL", "USD", "EUR"] as const) {
      for (const o of opcoesDeFaturamento(m)) {
        expect(typeof o.piso).toBe("number")
        expect(o.moeda).toBe(m)
      }
    }
  })

  it("o piso é crescente e o primeiro degrau é zero", () => {
    for (const m of ["BRL", "USD", "EUR"] as const) {
      const pisos = opcoesDeFaturamento(m).map((o) => o.piso!)
      expect(pisos[0]).toBe(0)
      for (let i = 1; i < pisos.length; i++) expect(pisos[i]).toBeGreaterThan(pisos[i - 1])
    }
  })

  it("o piso é a conversão pela taxa FIXA, não por cotação", () => {
    const usd = opcoesDeFaturamento("USD")
    const cinquenta = usd.find((o) => o.label.startsWith("US$50k"))!
    expect(cinquenta.piso).toBe(50_000 * TAXA_PARA_BRL.USD)
  })

  it("os rótulos são os números redondos de cada mercado", () => {
    expect(opcoesDeFaturamento("BRL").map((o) => o.label)).toEqual([
      "Até R$100k",
      "R$100k – R$200k",
      "R$200k – R$500k",
      "R$500k – R$1M",
      "R$1M – R$5M",
      "Acima de R$5M",
    ])
    expect(opcoesDeFaturamento("USD").map((o) => o.label)).toEqual([
      "Até US$20k",
      "US$20k – US$50k",
      "US$50k – US$100k",
      "US$100k – US$500k",
      "US$500k – US$1M",
      "US$1M – US$3M",
      "Acima de US$3M",
    ])
  })

  it("real e dólar têm número de degraus DIFERENTE, e isso é a intenção", () => {
    // Forçar o mesmo número de degraus criaria faixa que ninguém usa.
    expect(opcoesDeFaturamento("BRL")).toHaveLength(6)
    expect(opcoesDeFaturamento("USD")).toHaveLength(7)
  })
})

describe("piso da resposta", () => {
  it("lê o piso de uma resposta em qualquer moeda", () => {
    expect(pisoDaResposta("R$200k – R$500k")).toBe(200_000)
    expect(pisoDaResposta("US$50k – US$100k")).toBe(250_000)
    expect(pisoDaResposta("€50k – €100k")).toBe(300_000)
  })

  it("resposta fora da lista devolve null, nunca zero", () => {
    // Zero desqualificaria o lead por causa de um rótulo que mudou.
    expect(pisoDaResposta("R$ 200 mil a R$ 500 mil")).toBeNull()
    expect(pisoDaResposta("")).toBeNull()
    expect(pisoDaResposta(undefined)).toBeNull()
  })

  it("aceita a lista de opções do bloco quando ela é dada", () => {
    const opts = opcoesDeFaturamento("USD")
    expect(pisoDaResposta("Até US$20k", opts)).toBe(0)
  })

  it("todasAsOpcoes cobre as três moedas sem repetir rótulo", () => {
    const todas = todasAsOpcoesDeFaturamento()
    const rotulos = todas.map((o) => o.value)
    expect(new Set(rotulos).size).toBe(rotulos.length)
    expect(todas.some((o) => o.moeda === "EUR")).toBe(true)
  })
})

describe("qualificação por piso", () => {
  it("uma régua só vale para as três moedas", () => {
    expect(qualificaPeloPiso(pisoDaResposta("R$200k – R$500k"))).toBe(true)
    expect(qualificaPeloPiso(pisoDaResposta("US$50k – US$100k"))).toBe(true)
    expect(qualificaPeloPiso(pisoDaResposta("US$20k – US$50k"))).toBe(false)
  })

  it("a loja de US$50k deixa de ser recusada por causa da unidade", () => {
    // O caso que o módulo existe para consertar: US$50k ≈ R$250 mil, e
    // antes ela marcava "Até R$100 mil" e caía no final de recusa.
    const piso = pisoDaResposta("US$50k – US$100k")!
    expect(piso).toBeGreaterThan(PISO_DE_QUALIFICACAO_BRL)
  })

  it("piso desconhecido é null, que NÃO é false", () => {
    expect(qualificaPeloPiso(null)).toBeNull()
  })

  it("o mínimo é parâmetro — mudar o corte não exige mexer nas escadas", () => {
    expect(qualificaPeloPiso(100_000, 100_000)).toBe(true)
    expect(qualificaPeloPiso(100_000, 200_000)).toBe(false)
  })
})

describe("efeito do corte por moeda", () => {
  it("diz onde o corte cai em cada moeda, em vez de exigir a conta", () => {
    const efeito = efeitoDoCorte()
    const brl = efeito.find((e) => e.moeda === "BRL")!
    const usd = efeito.find((e) => e.moeda === "USD")!
    expect(brl.primeiraQueQualifica).toBe("R$200k – R$500k")
    expect(brl.ultimaQueNaoQualifica).toBe("R$100k – R$200k")
    expect(usd.primeiraQueQualifica).toBe("US$50k – US$100k")
    expect(usd.ultimaQueNaoQualifica).toBe("US$20k – US$50k")
  })

  it("corte mais alto move a linha, e a tela mostra para onde", () => {
    const usd = efeitoDoCorte(600_000).find((e) => e.moeda === "USD")!
    expect(usd.primeiraQueQualifica).toBe("US$500k – US$1M")
  })
})
