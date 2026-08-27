import { describe, it, expect } from "vitest"
import { mapTopProductRow, type TopProductRow } from "./top-products"

const row = (over: Partial<TopProductRow> = {}): TopProductRow => ({
  rank: 1,
  title: "EnergySave Pro™",
  price: 199,
  currency: "BRL",
  handle: "energysave-pro",
  external_id: "gid://123",
  image_url: "https://cdn/energysave.jpg",
  ...over,
})

describe("mapTopProductRow", () => {
  it("monta a URL do produto a partir do handle", () => {
    expect(mapTopProductRow(row(), "https://innovabay.site").url).toBe(
      "https://innovabay.site/products/energysave-pro",
    )
  })

  // A store_url cadastrada da Innova termina em "/" — a concatenação crua
  // gerava `https://innovabay.site//products/...`, link que já saía assim
  // na copy do n8n.
  it("barra final da loja não vira barra dupla", () => {
    expect(mapTopProductRow(row(), "https://innovabay.site/").url).toBe(
      "https://innovabay.site/products/energysave-pro",
    )
    expect(mapTopProductRow(row(), " https://innovabay.site// ").url).toBe(
      "https://innovabay.site/products/energysave-pro",
    )
  })

  // Sem handle ou sem loja não existe link possível: undefined é melhor que
  // uma URL montada pela metade, que o consumidor trataria como válida.
  it("sem handle ou sem store_url → sem link", () => {
    expect(mapTopProductRow(row({ handle: null }), "https://loja.com").url).toBeUndefined()
    expect(mapTopProductRow(row(), null).url).toBeUndefined()
    expect(mapTopProductRow(row(), "   ").url).toBeUndefined()
  })

  it("nulos viram o shape canônico sem 'null' vazando", () => {
    const p = mapTopProductRow(
      row({ price: null, image_url: null, external_id: null }),
      null,
    )
    expect(p).toEqual({
      id: undefined,
      name: "EnergySave Pro™",
      price: "",
      image_url: "",
      url: undefined,
    })
  })
})
