import { describe, it, expect } from "vitest"
import { postprocessTrends, dedupeTrends } from "./trends.service"
import { evaluateRisk } from "@/lib/constants/risk-keywords"
import { getSearchLocale } from "@/lib/constants/country-search-language"

describe("evaluateRisk", () => {
  it("flag high pra luto nacional", () => {
    expect(evaluateRisk("Luto nacional pelos atletas").flag).toBe("high")
  })

  it("flag high pra guerra", () => {
    expect(evaluateRisk("Conflito armado e guerra na fronteira").flag).toBe("high")
  })

  it("flag med pra polêmica", () => {
    expect(evaluateRisk("Polêmica do BBB · trend viral").flag).toBe("med")
  })

  it("flag low pra Copa do Mundo", () => {
    expect(evaluateRisk("Copa do Mundo Feminina · Brasil estreia").flag).toBe("low")
  })

  it("flag low pra string vazia ou null", () => {
    expect(evaluateRisk(null).flag).toBe("low")
    expect(evaluateRisk("").flag).toBe("low")
  })

  it("reason traz categoria:keyword", () => {
    const r = evaluateRisk("Trecho com atentado terrorista")
    expect(r.flag).toBe("high")
    expect(r.reason).toMatch(/^conflito:/)
  })
})

describe("getSearchLocale", () => {
  it("retorna idioma certo pra países com loja", () => {
    expect(getSearchLocale("BR").code).toBe("pt")
    expect(getSearchLocale("DE").code).toBe("de")
    expect(getSearchLocale("FR").code).toBe("fr")
    expect(getSearchLocale("JP").code).toBe("ja")
  })

  it("aceita lowercase", () => {
    expect(getSearchLocale("br").code).toBe("pt")
  })

  it("UK e GB resolvem pra English (UK) — back-compat", () => {
    expect(getSearchLocale("UK").name).toContain("UK")
    expect(getSearchLocale("GB").name).toContain("UK")
  })

  it("país desconhecido cai em English global", () => {
    expect(getSearchLocale("XX").code).toBe("en")
    expect(getSearchLocale(null).code).toBe("en")
  })
})

describe("postprocessTrends", () => {
  const baseAi = {
    title: "Coastal grandmother aesthetic",
    category: "viral" as const,
    source: "Vogue",
    delta_label: "+60%",
    tag: "moda · verão EU",
    niche: "moda",
    country: "UK",
    commercial_potential: 65,
    urgency: "month" as const,
    campaign_angle: "Curadoria de looks coastal com cupom de frete grátis",
    evidence: [],
  }

  it("preserva trend válida e marca fetched_via", () => {
    const out = postprocessTrends({
      trends: [baseAi],
      country: "UK",
      excludedDates: [],
      fetchedVia: "web_search",
    })
    expect(out).toHaveLength(1)
    expect(out[0].fetched_via).toBe("web_search")
    expect(out[0].risk_flag).toBe("low")
    expect(out[0].category).toBe("viral")
  })

  it("flag de risco propaga do title", () => {
    const risky = { ...baseAi, title: "Luto nacional pelos famosos" }
    const out = postprocessTrends({
      trends: [risky],
      country: "BR",
      excludedDates: [],
      fetchedVia: "web_search",
    })
    expect(out[0].risk_flag).toBe("high")
    expect(out[0].risk_reason).toMatch(/^luto:/)
  })

  it("descarta trend que duplica nome de data comercial (exact match)", () => {
    const dup = { ...baseAi, title: "Dia dos Namorados", country: "BR" }
    const out = postprocessTrends({
      trends: [dup],
      country: "BR",
      excludedDates: ["Dia dos Namorados", "Black Friday"],
      fetchedVia: "web_search",
    })
    expect(out).toHaveLength(0)
  })

  it("descarta com fuzzy match (Levenshtein <= 2 em strings >= 6 chars)", () => {
    const dup = { ...baseAi, title: "Dia das Maes", country: "BR" } // sem til
    const out = postprocessTrends({
      trends: [dup],
      country: "BR",
      excludedDates: ["Dia das Mães"],
      fetchedVia: "web_search",
    })
    expect(out).toHaveLength(0)
  })

  it("normaliza country pra uppercase", () => {
    const t = { ...baseAi, country: "br" }
    const out = postprocessTrends({
      trends: [t],
      country: "BR",
      excludedDates: [],
      fetchedVia: "web_search",
    })
    expect(out[0].country).toBe("BR")
  })

  it("usa country do cluster quando AI omite", () => {
    const t = { ...baseAi, country: undefined }
    const out = postprocessTrends({
      trends: [t as never],
      country: "DE",
      excludedDates: [],
      fetchedVia: "web_search",
    })
    expect(out[0].country).toBe("DE")
  })
})

describe("dedupeTrends", () => {
  const make = (title: string, country: string) =>
    ({
      title,
      source: null,
      delta_label: null,
      tag: null,
      niche: null,
      country,
      category: "viral" as const,
      commercial_potential: null,
      urgency: null,
      risk_flag: "low" as const,
      risk_reason: null,
      campaign_angle: null,
      fetched_via: "web_search" as const,
    })

  it("mantém só 1 por (title normalizado, country)", () => {
    const out = dedupeTrends([
      make("Clean girl aesthetic", "BR"),
      make("CLEAN GIRL aesthetic", "BR"), // diff casing
      make("Clean girl aesthetic", "UK"), // país diff = mantém
    ])
    expect(out).toHaveLength(2)
  })

  it("normaliza acentos no dedupe", () => {
    const out = dedupeTrends([
      make("Saúde", "BR"),
      make("Saude", "BR"),
    ])
    expect(out).toHaveLength(1)
  })

  it("preserva ordem dos primeiros", () => {
    const a = make("trend a", "BR")
    const b = make("trend b", "BR")
    const out = dedupeTrends([a, b, a])
    expect(out).toEqual([a, b])
  })
})
