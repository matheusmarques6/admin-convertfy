import { describe, it, expect } from "vitest"
import {
  resolveNextOccurrence,
  normalizeCountry,
  clusterStores,
  type CycleStoreContext,
} from "./cycle-context.service"

function makeStore(overrides: Partial<CycleStoreContext> = {}): CycleStoreContext {
  return {
    store_id: crypto.randomUUID(),
    store_name: "Loja",
    country: "BR",
    language: "pt-BR",
    niche: null,
    health_score: 70,
    revenue_30d: 10000,
    revenue_7d: 2500,
    revenue_delta_pct: 0,
    currency: "BRL",
    tone: null,
    positioning: null,
    ...overrides,
  }
}

describe("resolveNextOccurrence", () => {
  const from = new Date("2026-06-10T12:00:00Z")

  it("resolve data recorrente futura no mesmo ano", () => {
    const d = resolveNextOccurrence("06-12", null, from)
    expect(d?.toISOString().slice(0, 10)).toBe("2026-06-12")
  })

  it("data de hoje conta como ocorrência válida", () => {
    const d = resolveNextOccurrence("06-10", null, from)
    expect(d?.toISOString().slice(0, 10)).toBe("2026-06-10")
  })

  it("data recorrente já passada rola pro próximo ano", () => {
    const d = resolveNextOccurrence("03-15", null, from)
    expect(d?.toISOString().slice(0, 10)).toBe("2027-03-15")
  })

  it("data com year fixo no passado retorna null", () => {
    expect(resolveNextOccurrence("03-15", 2026, from)).toBeNull()
  })

  it("data com year fixo no futuro resolve exata", () => {
    const d = resolveNextOccurrence("06-21", 2026, from)
    expect(d?.toISOString().slice(0, 10)).toBe("2026-06-21")
  })

  it("month_day inválido retorna null", () => {
    expect(resolveNextOccurrence("xx-yy", null, from)).toBeNull()
  })
})

describe("normalizeCountry", () => {
  it("mantém códigos ISO de 2 letras", () => {
    expect(normalizeCountry("BR")).toBe("BR")
    expect(normalizeCountry("us")).toBe("US")
    expect(normalizeCountry("PT")).toBe("PT")
  })

  it("mapeia nomes por extenso", () => {
    expect(normalizeCountry("Brasil")).toBe("BR")
    expect(normalizeCountry("Estados Unidos")).toBe("US")
    expect(normalizeCountry("Reino Unido")).toBe("UK")
    expect(normalizeCountry("GB")).toBe("UK")
  })

  it("null/vazio cai no default BR", () => {
    expect(normalizeCountry(null)).toBe("BR")
    expect(normalizeCountry("")).toBe("BR")
  })

  it("nome desconhecido cai no default BR", () => {
    expect(normalizeCountry("Atlantis")).toBe("BR")
  })
})

describe("clusterStores", () => {
  it("agrupa por país + primeiro termo do nicho", () => {
    const stores = [
      makeStore({ niche: "moda feminina", country: "BR" }),
      makeStore({ niche: "moda cristã", country: "BR" }),
      makeStore({ niche: "beleza", country: "BR" }),
      makeStore({ niche: "beleza", country: "BR" }),
    ]
    const clusters = clusterStores(stores)
    const keys = clusters.map((c) => c.key).sort()
    expect(keys).toEqual(["BR:beleza", "BR:moda"])
  })

  it("loja única de um nicho cai no cluster geral do país", () => {
    const stores = [
      makeStore({ niche: "autopeças", country: "BR" }),
      makeStore({ niche: "suplementos", country: "BR" }),
    ]
    const clusters = clusterStores(stores)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].key).toBe("BR:geral")
    expect(clusters[0].stores).toHaveLength(2)
  })

  it("países diferentes nunca se misturam", () => {
    const stores = [
      makeStore({ niche: "moda", country: "BR" }),
      makeStore({ niche: "moda", country: "UK" }),
    ]
    const clusters = clusterStores(stores)
    expect(clusters).toHaveLength(2)
    for (const c of clusters) {
      const countries = new Set(c.stores.map((s) => s.country))
      expect(countries.size).toBe(1)
    }
  })

  it("cluster grande é particionado em maxPerCluster", () => {
    const stores = Array.from({ length: 13 }, () => makeStore({ niche: "moda", country: "BR" }))
    const clusters = clusterStores(stores, 6)
    expect(clusters).toHaveLength(3)
    expect(clusters.map((c) => c.stores.length)).toEqual([6, 6, 1])
  })

  it("loja sem nicho vai pro cluster geral", () => {
    const stores = [
      makeStore({ niche: null, country: "BR" }),
      makeStore({ niche: undefined as unknown as null, country: "BR" }),
    ]
    const clusters = clusterStores(stores)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].key).toBe("BR:geral")
  })
})
