import { describe, expect, it } from "vitest"
import { decidirPerfilDaLoja, resumoDaDecisao, type PerfilAtualDaLoja } from "./platform-profile"

const AGORA = new Date("2026-09-08T12:00:00Z")

function loja(p: Partial<PerfilAtualDaLoja> = {}): PerfilAtualDaLoja {
  return { currency: "BRL", currency_source: null, timezone: null, timezone_source: null, ...p }
}

describe("decidirPerfilDaLoja", () => {
  it("corrige o caso real: loja polonesa cadastrada em EUR", () => {
    // Lena Warszawa (lenawarszawa.pl) estava em EUR porque PLN nem existia
    // na lista de moedas — o operador não tinha como acertar.
    const d = decidirPerfilDaLoja(
      loja({ currency: "EUR" }),
      { currency: "PLN", timezone: "Europe/Warsaw", fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.moeda.acao).toBe("grava")
    expect(d.patch.currency).toBe("PLN")
    expect(d.patch.timezone).toBe("Europe/Warsaw")
    expect(d.patch.currency_source).toBe("omnisend")
    expect(d.patch.currency_synced_at).toBe(AGORA.toISOString())
    expect(d.mudou).toBe(true)
  })

  it("moeda igual: carimba a procedência sem reescrever o valor", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "GBP" }),
      { currency: "GBP", timezone: "America/Sao_Paulo", fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.moeda.acao).toBe("igual")
    expect(d.patch.currency).toBeUndefined()
    expect(d.patch.currency_source).toBe("omnisend")
    // O fuso não existia, então esse SIM é uma mudança.
    expect(d.mudou).toBe(true)
    expect(d.patch.timezone).toBe("America/Sao_Paulo")
  })

  it("moeda fora da lista fechada não é gravada — o furo é na lista, não no banco", () => {
    // Gravar um código que o câmbio não converte troca um erro visível
    // por um invisível: valor estrangeiro somado como se fosse BRL.
    const d = decidirPerfilDaLoja(
      loja(),
      { currency: "XPT", timezone: null, fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.moeda.acao).toBe("desconhecida")
    expect(d.patch.currency).toBeUndefined()
    expect(d.patch.currency_source).toBeUndefined()
    expect(d.moeda.aviso).toContain("XPT")
    expect(d.mudou).toBe(false)
  })

  it("fuso que o runtime não reconhece não é gravado", () => {
    const d = decidirPerfilDaLoja(
      loja(),
      { currency: "BRL", timezone: "Europe/Berlim", fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.fuso.acao).toBe("invalido")
    expect(d.patch.timezone).toBeUndefined()
    expect(d.patch.timezone_source).toBeUndefined()
  })

  it("plataforma calada não apaga o que já existe", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "USD", timezone: "America/New_York" }),
      { currency: null, timezone: null, fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.moeda.acao).toBe("ausente")
    expect(d.fuso.acao).toBe("ausente")
    expect(d.patch).toEqual({})
    expect(d.mudou).toBe(false)
  })

  it("correção humana vence a plataforma, e a divergência é dita", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "USD", currency_source: "manual" }),
      { currency: "EUR", timezone: null, fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.moeda.acao).toBe("manual")
    expect(d.patch.currency).toBeUndefined()
    expect(d.moeda.aviso).toContain("EUR")
    expect(d.moeda.aviso).toContain("USD")
  })

  it("forcar passa por cima do manual (é o backfill explícito)", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "USD", currency_source: "manual", timezone: "UTC", timezone_source: "manual" }),
      { currency: "EUR", timezone: "Europe/Lisbon", fonte: "omnisend" },
      { forcar: true, agora: AGORA },
    )
    expect(d.patch.currency).toBe("EUR")
    expect(d.patch.timezone).toBe("Europe/Lisbon")
  })

  it("normaliza a caixa do código da moeda", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "BRL" }),
      { currency: "dkk", timezone: null, fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(d.patch.currency).toBe("DKK")
  })
})

describe("resumoDaDecisao", () => {
  it("diz o de/para numa linha", () => {
    const d = decidirPerfilDaLoja(
      loja({ currency: "EUR" }),
      { currency: "PLN", timezone: "Europe/Warsaw", fonte: "omnisend" },
      { agora: AGORA },
    )
    expect(resumoDaDecisao("Lena Warszawa", d)).toBe(
      "Lena Warszawa · moeda: EUR → PLN · fuso: — → Europe/Warsaw",
    )
  })
})
