import { describe, it, expect } from "vitest"
import {
  resolveNextOccurrence,
  normalizeCountry,
  clusterStores,
  expandStoreContexts,
  type CycleStoreContext,
  type StoreRow,
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

describe("expandStoreContexts (fan-out por país)", () => {
  const emptyRev = new Map<string, { d7: number; d30: number }>()
  const emptyBriefing = new Map<string, Record<string, unknown>>()

  it("loja com countries=['BR','US'] vira 2 contextos (BR e US)", () => {
    const rows: StoreRow[] = [
      { id: "s1", store_name: "Multi", countries: ["BR", "US"], country: "BR" },
    ]
    const ctx = expandStoreContexts(rows, emptyRev, emptyBriefing)
    expect(ctx).toHaveLength(2)
    expect(ctx.map((c) => c.country).sort()).toEqual(["BR", "US"])
    // todos compartilham o mesmo store_id
    expect(new Set(ctx.map((c) => c.store_id))).toEqual(new Set(["s1"]))
  })

  it("fallback para [country] quando countries vazio/null", () => {
    const rows: StoreRow[] = [
      { id: "s1", country: "PT", countries: null },
      { id: "s2", country: "US", countries: [] },
    ]
    const ctx = expandStoreContexts(rows, emptyRev, emptyBriefing)
    expect(ctx).toHaveLength(2)
    expect(ctx.find((c) => c.store_id === "s1")?.country).toBe("PT")
    expect(ctx.find((c) => c.store_id === "s2")?.country).toBe("US")
  })

  it("normaliza e deduplica países do fan-out", () => {
    const rows: StoreRow[] = [
      { id: "s1", country: "BR", countries: ["Brasil", "br", "Estados Unidos"] },
    ]
    const ctx = expandStoreContexts(rows, emptyRev, emptyBriefing)
    expect(ctx.map((c) => c.country).sort()).toEqual(["BR", "US"])
  })

  it("sem país algum cai no default BR", () => {
    const rows: StoreRow[] = [{ id: "s1", country: null, countries: null }]
    const ctx = expandStoreContexts(rows, emptyRev, emptyBriefing)
    expect(ctx).toHaveLength(1)
    expect(ctx[0].country).toBe("BR")
  })

  it("propaga receita/delta corretamente por contexto da mesma loja", () => {
    const rev = new Map([["s1", { d7: 3500, d30: 10000 }]])
    const rows: StoreRow[] = [{ id: "s1", country: "BR", countries: ["BR", "US"] }]
    const ctx = expandStoreContexts(rows, rev, emptyBriefing)
    for (const c of ctx) {
      expect(c.revenue_7d).toBe(3500)
      expect(c.revenue_30d).toBe(10000)
      // delta: 3500 vs weeklyAvg 10000/(30/7) ≈ 2333 → +50%
      expect(c.revenue_delta_pct).toBe(50)
    }
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
