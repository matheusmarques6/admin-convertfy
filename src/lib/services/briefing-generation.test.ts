import { describe, it, expect } from "vitest"
import {
  buildPrompt,
  buildRawTemplate,
  type Ctx,
} from "./briefing-generation.service"

/** Ctx mínimo; cada teste sobrescreve research/locale/formResponses. */
function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    onboardingId: "onb-1",
    orgId: "org-1",
    formResponses: {},
    store: { store_name: "Loja X", store_url: "x.com", platform: "shopify" },
    research: {},
    locale: {
      niche: null,
      language: null,
      country: null,
      currency: null,
      free_shipping_type: null,
    },
    client: { name: "Cliente X" },
    ...overrides,
  }
}

describe("buildPrompt", () => {
  it("injeta a Pesquisa & Diagnóstico como bloco PRIMÁRIO quando preenchida", () => {
    const ctx = makeCtx({
      research: {
        brand_about: "Marca artesanal de velas de soja.",
        tone_description: "Acolhedor e direto.",
      },
      formResponses: { store_name: "Loja X" },
    })
    const { user } = buildPrompt(ctx)
    expect(user).toContain("FONTE PRIMÁRIA")
    expect(user).toContain("velas de soja")
    // Formulário continua presente, mas rotulado como fonte de lacunas.
    expect(user).toContain("preencher lacunas")
  })

  it("omite o bloco primário quando não há pesquisa (fallback ao formulário)", () => {
    const ctx = makeCtx({ formResponses: { vertical: "moda" } })
    const { user } = buildPrompt(ctx)
    expect(user).not.toContain("FONTE PRIMÁRIA")
    expect(user).toContain("DADOS DA LOJA")
  })

  it("passa moeda e país reais da loja (não assume BRL/Brasil)", () => {
    const ctx = makeCtx({
      locale: {
        niche: null,
        language: "pt-PT",
        country: "PT",
        currency: "EUR",
        free_shipping_type: null,
      },
    })
    const { user } = buildPrompt(ctx)
    expect(user).toContain("EUR")
    expect(user).toContain("PT")
  })
})

describe("buildRawTemplate", () => {
  it("usa a pesquisa como fonte primária dos textos quando preenchida", () => {
    const ctx = makeCtx({
      research: {
        brand_about: "Marca artesanal de velas de soja.",
        icp_persona: { name: "Marina" },
        icp_motivations: ["aroma natural", "presente afetivo"],
        tone_description: "Tom acolhedor e direto.",
      },
      locale: {
        niche: null,
        language: "pt-PT",
        country: "PT",
        currency: "EUR",
        free_shipping_type: null,
      },
      // Formulário com dados diferentes — não devem prevalecer sobre a pesquisa.
      formResponses: {
        primary_persona: "qualquer um",
        tone_of_voice: "formal",
      },
    })
    const b = buildRawTemplate(ctx)
    expect(b.about_brand).toContain("velas de soja")
    expect(b.audience).toContain("Marina")
    expect(b.audience).toContain("aroma natural")
    expect(b.language_tone).toContain("acolhedor")
    expect(b.language_tone).toContain("pt-PT")
    // Não vaza o dado do formulário concorrente.
    expect(b.audience).not.toContain("qualquer um")
  })

  it("cai no formulário quando a pesquisa está vazia", () => {
    const ctx = makeCtx({
      research: {},
      formResponses: {
        primary_persona: "mães de primeira viagem",
        main_motivator: "segurança",
        tone_of_voice: "carinhoso",
      },
    })
    const b = buildRawTemplate(ctx)
    expect(b.audience).toContain("mães de primeira viagem")
    expect(b.language_tone).toContain("carinhoso")
  })

  it("nunca inventa cores/fontes específicas na identidade visual", () => {
    const ctx = makeCtx({ formResponses: {} })
    const b = buildRawTemplate(ctx)
    expect(b.visual_identity.palette.toLowerCase()).toContain("a definir")
    expect(b.visual_identity.fonts.toLowerCase()).toContain("definir")
  })
})
