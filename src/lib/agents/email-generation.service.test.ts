/**
 * Tests for buildImagePromptVars — focus on the niche-adaptive extension
 * introduced in story AE-10.
 *
 * Coverage:
 *  - Backwards compatibility: chamada com so os 5 params legados retorna
 *    as 19 vars antigas + 12 novas com fallbacks dos helpers (sem quebra)
 *  - IDIOMA respeita client_stores.language (regressao fix AE-10 review)
 *  - PRODUTO_HEROI: precedence storeOverrides > blueprint.hint > topProducts[0]
 *  - Helpers integrados (mood, cenario, neutro, logo style) com input real
 */

import { describe, it, expect } from "vitest"
import { buildImagePromptVars } from "./email-generation.service"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type { EmailBlueprint, StoreImageOverrides } from "@/types/email-generation"

function makeBrand(overrides: Partial<StoreBrandIdentity> = {}): StoreBrandIdentity {
  return {
    id: "brand-1",
    store_id: "store-1",
    version: 1,
    colors_primary: [{ hex: "#163A26", name: "Verde escuro", role: "Principal" }],
    colors_secondary: [{ hex: "#FFFFFF", name: "Branco", role: "Acento" }],
    font_heading: "Inter",
    font_body: "Inter",
    voice: [],
    logo_main_png: null,
    logo_main_svg: null,
    trust_icons: [],
    top_products: [],
    ...overrides,
  } as StoreBrandIdentity
}

function makeBriefing(marca: Record<string, unknown> = {}): StoreBriefing {
  return {
    id: "brief-1",
    store_id: "store-1",
    version: 1,
    marca: {
      nicho: "acessorios automotivos premium",
      persona: "homem 30-50 dono de carro",
      diferencial: "qualidade premium",
      slogan: "Estilo no seu carro",
      tom_voz: "formal",
      posicionamento: "premium",
      ...marca,
    },
    briefing: {},
  } as unknown as StoreBriefing
}

function makeProduct(name: string, rank = 1): TopProduct {
  return {
    name,
    price: 199,
    image_url: `https://example.com/${rank}.jpg`,
    rank,
  } as TopProduct
}

const BASE_INPUT = {
  brand: makeBrand(),
  briefing: makeBriefing(),
  topProducts: [makeProduct("Capa de banco couro preto")],
  storeRaw: { store_name: "L'HOMBRE", language: "es-ES", currency: "EUR" },
  blockPurpose: "hero",
}

describe("buildImagePromptVars — backwards compatibility", () => {
  it("returns 19 legacy vars when called without new params", () => {
    const vars = buildImagePromptVars(BASE_INPUT)
    // legacy
    expect(vars.brand_name).toBe("L'HOMBRE")
    expect(vars.nicho).toBe("acessorios automotivos premium")
    expect(vars.tom_voz).toBe("formal")
    expect(vars.posicionamento).toBe("premium")
    expect(vars.primary_colors).toBe("#163A26")
    expect(vars.product_1_name).toBe("Capa de banco couro preto")
    expect(vars.block_purpose).toBe("hero")
  })

  it("returns 12 niche-adaptive UPPERCASE vars even without blueprint/overrides", () => {
    const vars = buildImagePromptVars(BASE_INPUT)
    expect(vars.MARCA).toBe("L'HOMBRE")
    expect(vars.NICHO).toBe("acessorios automotivos premium")
    expect(vars.PUBLICO).toBe("homem 30-50 dono de carro")
    expect(vars.PALETA_1).toBe("#163A26")
    expect(vars.PALETA_2).toBe("#FFFFFF")
    // helpers derivados
    expect(vars.MOOD).toBe("elegant, refined, premium") // formal
    expect(vars.CENARIO).toContain("interior de carro") // nicho automotivo
    expect(vars.CENARIO).toContain("sofisticado") // suffix premium
    expect(vars.LOGO_STYLE).toBe("modern wordmark") // sans Inter
  })
})

describe("buildImagePromptVars — IMAGE_BRIEF + blueprint_purpose", () => {
  const blueprintWithBrief: EmailBlueprint = {
    id: "bp1",
    flow_type: "welcome",
    email_number: 1,
    objective: "Boas-vindas",
    messaging: "Aspiracional",
    subject_hint: null,
    blocks: [{ type: "hero", label: "Hero", purpose: "Banner com produto" }],
    tone_override: null,
    updated_at: "",
    updated_by: null,
    image_brief: "Foto editorial do produto em uso, luz natural",
  }

  it("expõe IMAGE_BRIEF a partir de blueprint.image_brief", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprintWithBrief,
      blockType: "hero",
    })
    expect(vars.IMAGE_BRIEF).toBe("Foto editorial do produto em uso, luz natural")
  })

  it("IMAGE_BRIEF vazio quando o blueprint não tem brief", () => {
    expect(buildImagePromptVars(BASE_INPUT).IMAGE_BRIEF).toBe("")
  })

  it("blueprint_purpose lê o `purpose` do bloco (não o antigo `hint`)", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprintWithBrief,
      blockType: "hero",
    })
    expect(vars.blueprint_purpose).toBe("Banner com produto")
  })
})

describe("buildImagePromptVars — IMAGE_BRIEF por bloco (blockPosition)", () => {
  const blueprintPerBlock: EmailBlueprint = {
    id: "bp2",
    flow_type: "welcome",
    email_number: 1,
    objective: "Boas-vindas",
    messaging: "Aspiracional",
    subject_hint: null,
    blocks: [
      { type: "hero", label: "Hero", purpose: "Banner" },
      {
        type: "products",
        label: "Produtos",
        purpose: "Carrossel",
        image_brief: "Flat lay dos 3 produtos sobre mármore",
      },
    ],
    tone_override: null,
    updated_at: "",
    updated_by: null,
    image_brief: "Fallback nível-email",
  }

  it("usa o image_brief DO bloco quando blockPosition aponta pra ele", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprintPerBlock,
      blockType: "products",
      blockPosition: 2,
    })
    expect(vars.IMAGE_BRIEF).toBe("Flat lay dos 3 produtos sobre mármore")
  })

  it("cai no fallback nível-email quando o bloco não tem image_brief", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprintPerBlock,
      blockType: "hero",
      blockPosition: 1,
    })
    expect(vars.IMAGE_BRIEF).toBe("Fallback nível-email")
  })
})

describe("buildImagePromptVars — IDIOMA respects store language", () => {
  it("uses storeRaw.language when present", () => {
    const vars = buildImagePromptVars(BASE_INPUT)
    expect(vars.IDIOMA).toBe("es-ES")
  })

  it("falls back to pt-BR when language missing", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      storeRaw: { store_name: "Sem idioma" },
    })
    expect(vars.IDIOMA).toBe("pt-BR")
  })

  it("uses storeRaw.currency when present, falls back to BRL", () => {
    expect(buildImagePromptVars(BASE_INPUT).MOEDA).toBe("EUR")
    expect(
      buildImagePromptVars({ ...BASE_INPUT, storeRaw: { store_name: "X" } }).MOEDA,
    ).toBe("BRL")
  })
})

describe("buildImagePromptVars — PRODUTO_HEROI precedence", () => {
  it("uses topProducts[0].name when no override/hint", () => {
    const vars = buildImagePromptVars(BASE_INPUT)
    expect(vars.PRODUTO_HEROI).toBe("Capa de banco couro preto")
  })

  it("uses blueprint.image_produto_heroi_hint over topProducts", () => {
    const blueprint: Partial<EmailBlueprint> = {
      image_produto_heroi_hint: "Capa esportiva vermelha",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprint as EmailBlueprint,
    })
    expect(vars.PRODUTO_HEROI).toBe("Capa esportiva vermelha")
  })

  it("uses storeOverrides.produto_heroi_override over blueprint hint and topProducts", () => {
    const blueprint: Partial<EmailBlueprint> = {
      image_produto_heroi_hint: "Hint do blueprint",
    }
    const overrides: Partial<StoreImageOverrides> = {
      produto_heroi_override: "Override da loja",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprint as EmailBlueprint,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.PRODUTO_HEROI).toBe("Override da loja")
  })

  it("falls back to empty string when no source available", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      topProducts: [],
    })
    expect(vars.PRODUTO_HEROI).toBe("")
  })

  it("treats whitespace-only override as missing (falls to blueprint hint)", () => {
    const blueprint: Partial<EmailBlueprint> = {
      image_produto_heroi_hint: "Hint usado",
    }
    const overrides: Partial<StoreImageOverrides> = {
      produto_heroi_override: "   ",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      blueprint: blueprint as EmailBlueprint,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.PRODUTO_HEROI).toBe("Hint usado")
  })
})

describe("buildImagePromptVars — helper overrides", () => {
  it("uses mood_override over derived mood", () => {
    const overrides: Partial<StoreImageOverrides> = {
      mood_override: "bold, daring, futuristic",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.MOOD).toBe("bold, daring, futuristic")
  })

  it("uses cenario_override over derived scene", () => {
    const overrides: Partial<StoreImageOverrides> = {
      cenario_override: "deserto ao por do sol",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.CENARIO).toBe("deserto ao por do sol")
  })

  it("uses neutro_override over heuristic", () => {
    const overrides: Partial<StoreImageOverrides> = {
      neutro_override: "#222222",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.NEUTRO).toBe("#222222")
  })

  it("uses logo_style_override over font-based derivation", () => {
    const overrides: Partial<StoreImageOverrides> = {
      logo_style_override: "art deco lettering",
    }
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      storeOverrides: overrides as StoreImageOverrides,
    })
    expect(vars.LOGO_STYLE).toBe("art deco lettering")
  })
})

describe("buildImagePromptVars — INSTRUCAO_ADICIONAL (AE-11 hook pra AE-16)", () => {
  it("repassa o valor quando fornecido", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      instrucaoAdicional: "Foco no detalhe da costura",
    })
    expect(vars.INSTRUCAO_ADICIONAL).toBe("Foco no detalhe da costura")
  })

  it("default vazio quando ausente (template usa {{#if}} para omitir bloco)", () => {
    const vars = buildImagePromptVars(BASE_INPUT)
    expect(vars.INSTRUCAO_ADICIONAL).toBe("")
  })

  it("trim de whitespace excedente", () => {
    const vars = buildImagePromptVars({
      ...BASE_INPUT,
      instrucaoAdicional: "   foco extra   ",
    })
    expect(vars.INSTRUCAO_ADICIONAL).toBe("foco extra")
  })
})
