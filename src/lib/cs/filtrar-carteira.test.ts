import { describe, expect, it } from "vitest"
import { cardCasaBusca, filtrarCarteira, normalizarBusca } from "./filtrar-carteira"

const cards = [
  { store_name: "Boxer Shop", client_name: "JMJC NEGOCIOS DIGITAIS LTDA", csm_name: "Ryan" },
  { store_name: "Boxer Shop UK", client_name: "JMJC NEGOCIOS DIGITAIS LTDA", csm_name: "Ryan" },
  { store_name: "Cronos Alemã", client_name: "Leonardo Damelio Arauna", csm_name: null },
  { store_name: "RIVO COAST", client_name: "João Paulo Lima", csm_name: "Bruno" },
]

describe("normalizarBusca", () => {
  it("tira acento e caixa", () => {
    expect(normalizarBusca("  Cronos ALEMÃ ")).toBe("cronos alema")
    expect(normalizarBusca("João")).toBe("joao")
  })
})

describe("cardCasaBusca", () => {
  it("acha pelo nome da loja", () => {
    expect(cardCasaBusca(cards[0], "boxer")).toBe(true)
    expect(cardCasaBusca(cards[2], "boxer")).toBe(false)
  })

  it("acha pelo cliente e pelo CSM", () => {
    expect(cardCasaBusca(cards[0], "jmjc")).toBe(true)
    expect(cardCasaBusca(cards[3], "bruno")).toBe(true)
  })

  it("acha ignorando acento nos dois lados", () => {
    expect(cardCasaBusca(cards[2], "alema")).toBe(true)
    expect(cardCasaBusca(cards[2], "ALEMÃ")).toBe(true)
    expect(cardCasaBusca(cards[3], "joao")).toBe(true)
  })

  it("palavras podem vir de campos DIFERENTES e fora de ordem", () => {
    // "jmjc boxer" é busca natural para quem lê o card (cliente + loja).
    expect(cardCasaBusca(cards[1], "jmjc uk")).toBe(true)
    expect(cardCasaBusca(cards[1], "uk jmjc")).toBe(true)
  })

  it("toda palavra precisa casar — senão a busca vira 'qualquer coisa'", () => {
    expect(cardCasaBusca(cards[0], "boxer inexistente")).toBe(false)
  })

  it("termo vazio ou só espaço não filtra nada", () => {
    expect(cardCasaBusca(cards[0], "")).toBe(true)
    expect(cardCasaBusca(cards[0], "   ")).toBe(true)
  })

  it("campo nulo não quebra nem casa por acidente", () => {
    expect(cardCasaBusca({ store_name: null, client_name: null, csm_name: null }, "x")).toBe(false)
    expect(cardCasaBusca(cards[2], "ryan")).toBe(false)
  })
})

describe("filtrarCarteira", () => {
  it("filtra preservando a ordem", () => {
    const r = filtrarCarteira(cards, "boxer")
    expect(r.map((c) => c.store_name)).toEqual(["Boxer Shop", "Boxer Shop UK"])
  })

  it("sem termo devolve a lista inteira, e a MESMA referência", () => {
    // Evita re-render desnecessário do board a cada tecla apagada.
    expect(filtrarCarteira(cards, "")).toBe(cards)
    expect(filtrarCarteira(cards, "  ")).toBe(cards)
  })

  it("sem resultado devolve lista vazia, não a original", () => {
    expect(filtrarCarteira(cards, "zzz")).toEqual([])
  })
})
