import { describe, it, expect } from "vitest"
import {
  normalizeAdName,
  adNameFromUtmContent,
  placementFromUtmContent,
  attributionKeysFromUtm,
  isMetaSource,
  creativeKey,
} from "./crm-ads-attribution"

describe("normalizeAdName", () => {
  it("baixa caixa, remove acento e colapsa espaço", () => {
    expect(normalizeAdName("  Criativo  PROMOÇÃO  Verão ")).toBe("criativo promocao verao")
  })

  it("converte + em espaço (URL-encoding do utm_content)", () => {
    expect(normalizeAdName("Criativo+Teste+A")).toBe("criativo teste a")
  })

  it("devolve string vazia para valores não-string", () => {
    expect(normalizeAdName(undefined)).toBe("")
    expect(normalizeAdName(null)).toBe("")
    expect(normalizeAdName(42)).toBe("")
  })
})

describe("adNameFromUtmContent", () => {
  it("separa o nome do anúncio do placement", () => {
    expect(adNameFromUtmContent("Criativo VSL 03 - facebook_feed")).toBe("criativo vsl 03")
  })

  it("aceita o formato com + do template da Meta", () => {
    expect(adNameFromUtmContent("Criativo+VSL+03+-+instagram_stories")).toBe("criativo vsl 03")
  })

  it("preserva hifens internos do nome usando o ultimo separador", () => {
    expect(adNameFromUtmContent("Black Friday - Oferta 50% - facebook_reels")).toBe(
      "black friday - oferta 50%",
    )
  })

  it("sem separador, o valor inteiro e o nome", () => {
    expect(adNameFromUtmContent("Criativo Unico")).toBe("criativo unico")
  })

  it("vazio quando nao ha content", () => {
    expect(adNameFromUtmContent(undefined)).toBe("")
  })
})

describe("placementFromUtmContent", () => {
  it("extrai o placement", () => {
    expect(placementFromUtmContent("Criativo VSL 03 - facebook_feed")).toBe("facebook_feed")
  })

  it("vazio quando nao ha separador", () => {
    expect(placementFromUtmContent("Criativo Unico")).toBe("")
  })
})

describe("attributionKeysFromUtm", () => {
  it("mapeia o padrao de UTM da casa", () => {
    const keys = attributionKeysFromUtm({
      source: "meta-ads",
      medium: "Conjunto Lookalike 1%",
      campaign: "Campanha Aquisição Julho",
      content: "Criativo VSL 03 - instagram_reels",
    })
    expect(keys).toEqual({
      source: "meta-ads",
      campaign: "campanha aquisicao julho",
      adset: "conjunto lookalike 1%",
      ad: "criativo vsl 03",
      placement: "instagram_reels",
    })
  })

  it("tolera utm ausente", () => {
    expect(attributionKeysFromUtm(null)).toEqual({
      source: "",
      campaign: "",
      adset: "",
      ad: "",
      placement: "",
    })
  })
})

describe("isMetaSource", () => {
  it("reconhece as grafias usadas na pratica", () => {
    for (const s of ["meta-ads", "Meta-Ads", "meta_ads", "meta", "facebook", "fb-ads"]) {
      expect(isMetaSource(s)).toBe(true)
    }
  })

  it("rejeita outras fontes", () => {
    for (const s of ["google-ads", "tiktok", "organic", "", undefined]) {
      expect(isMetaSource(s)).toBe(false)
    }
  })
})

describe("creativeKey", () => {
  it("prefere o anuncio, cai pro adset e depois pra campanha", () => {
    const base = { source: "meta-ads", placement: "" }
    expect(creativeKey({ ...base, ad: "criativo a", adset: "conj", campaign: "camp" })).toBe(
      "criativo a",
    )
    expect(creativeKey({ ...base, ad: "", adset: "conj", campaign: "camp" })).toBe("conj")
    expect(creativeKey({ ...base, ad: "", adset: "", campaign: "camp" })).toBe("camp")
    expect(creativeKey({ ...base, ad: "", adset: "", campaign: "" })).toBe("")
  })
})
