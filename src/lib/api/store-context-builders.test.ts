import { describe, it, expect } from "vitest"
import {
  buildAssetsVisuais,
  buildBrandBrain,
  formatIcpAsAudience,
  type StoreRow,
} from "./store-context-builders"

function store(partial: Partial<StoreRow>): StoreRow {
  return {
    id: "s1",
    store_name: null,
    store_url: null,
    platform: null,
    niche: null,
    country: null,
    language: null,
    plan: null,
    mrr_value: null,
    brand_thesis: null,
    brand_about: null,
    brand_pillars: null,
    brand_presence: null,
    store_story: null,
    store_milestones: null,
    icp_persona: null,
    icp_demographics: null,
    icp_day_in_life: null,
    icp_motivations: null,
    icp_frictions: null,
    tone_description: null,
    tone_do: null,
    tone_dont: null,
    tone_use_words: null,
    tone_avoid_words: null,
    cores: null,
    fontes: null,
    ...partial,
  }
}

describe("buildAssetsVisuais — contrato da fonte consumido pelo bloco", () => {
  it("REGRESSÃO: converte fontes {titulo, corpo} → {family, fallback}", () => {
    const result = buildAssetsVisuais(
      store({ fontes: { titulo: "Poppins", corpo: "Inter" } }),
      {},
    )
    expect(result.font).toEqual({ family: "Poppins", fallback: "Inter" })
  })

  it("paleta vem de cores[].hex", () => {
    const result = buildAssetsVisuais(
      store({
        cores: [
          { name: "primária", hex: "#1F1F1F" },
          { name: "destaque", hex: "#FF0000" },
        ],
      }),
      {},
    )
    expect(result.font).toBeNull()
    expect(result.palette).toEqual(["#1F1F1F", "#FF0000"])
  })

  it("fallback de paleta/fonte vem do visual_assets quando a loja não tem", () => {
    const result = buildAssetsVisuais(store({}), {
      palette: ["#000"],
      font: { family: "Arial", fallback: "sans" },
    })
    expect(result.palette).toEqual(["#000"])
    expect(result.font).toEqual({ family: "Arial", fallback: "sans" })
  })
})

describe("formatIcpAsAudience — audience derivada do ICP", () => {
  it("REGRESSÃO: monta audience a partir de persona + demographics", () => {
    const out = formatIcpAsAudience(
      { name: "Marina", age: "32", city: "SP" },
      { age_range: "25-34", income: "alta" },
    )
    expect(out).toBe("Marina, 32, SP. faixa 25-34 · renda alta")
  })

  it("retorna null sem dados", () => {
    expect(formatIcpAsAudience(null, null)).toBeNull()
  })
})

describe("buildBrandBrain — fonte curated × briefing", () => {
  it("REGRESSÃO: audience cai pro ICP quando não há briefing.audience", () => {
    const bb = buildBrandBrain(
      store({ icp_persona: { name: "Marina", age: "32" } }),
      {},
    )
    expect(bb.audience).toBe("Marina, 32")
    expect(bb.source).toBe("curated")
  })

  it("source = mixed quando há campos curated e de briefing", () => {
    const bb = buildBrandBrain(store({ brand_about: "Marca X" }), {
      language_tone: "informal",
    })
    expect(bb.source).toBe("mixed")
    expect(bb.about_brand).toBe("Marca X")
    expect(bb.language_tone).toBe("informal")
  })

  it("source = empty sem nenhum dado", () => {
    expect(buildBrandBrain(store({}), {}).source).toBe("empty")
  })
})
