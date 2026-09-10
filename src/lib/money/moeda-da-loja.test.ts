import { describe, expect, it } from "vitest"
import { moedaDaLinha } from "./moeda-da-loja"

describe("moedaDaLinha", () => {
  it("o CADASTRO vence o cache, e a divergência é declarada", () => {
    // O caso real: a moeda da loja foi corrigida para USD e as linhas de
    // cache continuaram BRL — a tela convertia por 1 e ninguém sabia.
    expect(moedaDaLinha("USD", "BRL")).toEqual({
      moeda: "USD",
      divergente: true,
      moedaDoCache: "BRL",
    })
  })

  it("iguais não são divergência (nem com caixa/espaço diferentes)", () => {
    expect(moedaDaLinha("USD", "USD")).toEqual({ moeda: "USD", divergente: false })
    expect(moedaDaLinha(" usd ", "USD")).toEqual({ moeda: "USD", divergente: false })
  })

  it("sem cadastro, o cache vale — ele foi copiado de um cadastro que existia", () => {
    expect(moedaDaLinha(null, "GBP")).toEqual({ moeda: "GBP", divergente: false })
    expect(moedaDaLinha("", "GBP")).toEqual({ moeda: "GBP", divergente: false })
  })

  it("sem nada, BRL — o mesmo default do resto do código", () => {
    expect(moedaDaLinha(null, null)).toEqual({ moeda: "BRL", divergente: false })
  })

  it("cadastro sem cache não é divergência", () => {
    expect(moedaDaLinha("EUR", null)).toEqual({ moeda: "EUR", divergente: false })
  })
})
