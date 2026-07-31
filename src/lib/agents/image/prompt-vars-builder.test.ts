import { describe, it, expect } from "vitest"

import { buildImagePromptVars } from "./prompt-vars-builder"

// Direção fotográfica por variante (migration 20261060). É o briefing do
// fotógrafo — o que o agente decidia sozinho a partir de nicho e
// posicionamento passa a ser contexto de apoio.
describe("PHOTO_DIRECTION", () => {
  const base = {
    brand: null,
    briefing: null,
    topProducts: [],
    storeRaw: {},
    blockPurpose: "hero",
  }
  const blueprint = {
    blocks: [{ type: "hero", variant_id: "v-1" }],
  } as never

  it("resolve pela variante que o Montador casou ao bloco", () => {
    const vars = buildImagePromptVars({
      ...base,
      blueprint,
      blockPosition: 1,
      photoDirectionByVariant: { "v-1": "Still em fundo neutro, luz suave." },
    })
    expect(vars.PHOTO_DIRECTION).toBe("Still em fundo neutro, luz suave.")
  })

  it("variante sem direção escrita deixa a var vazia", () => {
    const vars = buildImagePromptVars({
      ...base,
      blueprint,
      blockPosition: 1,
      photoDirectionByVariant: { "outra-variante": "texto" },
    })
    expect(vars.PHOTO_DIRECTION).toBe("")
  })

  // Blueprint legado (sem variant_id) e fallback global não têm variante —
  // o prompt tem de ficar idêntico ao de antes.
  it("sem mapa e sem variant_id, a var é vazia", () => {
    expect(
      buildImagePromptVars({ ...base, blueprint, blockPosition: 1 })
        .PHOTO_DIRECTION,
    ).toBe("")
    expect(
      buildImagePromptVars({
        ...base,
        blueprint: { blocks: [{ type: "hero" }] } as never,
        blockPosition: 1,
        photoDirectionByVariant: { "v-1": "texto" },
      }).PHOTO_DIRECTION,
    ).toBe("")
  })
})

// A foto precisa FUNDIR com a seção onde entra. Sem a cor do fundo o modelo
// escolhia um cinza qualquer e aparecia uma emenda no meio do email — foi o
// que aconteceu na Luxe Lift, bloco bege e foto cinza-azulada.
describe("BG_COLOR", () => {
  const base = {
    briefing: null,
    topProducts: [],
    storeRaw: {},
    blockPurpose: "hero",
  }

  it("usa o mesmo bg que a cadeia de formatação aplica no documento", () => {
    const vars = buildImagePromptVars({
      ...base,
      brand: {
        colors_primary: [{ hex: "#FAF5F3", name: "Areia", role: "Fundo" }],
        colors_secondary: [],
      } as never,
    })
    expect(vars.BG_COLOR).toBe("#FAF5F3")
  })

  it("marca sem cores cai no default, nunca em vazio", () => {
    const vars = buildImagePromptVars({ ...base, brand: null })
    expect(vars.BG_COLOR).toMatch(/^#[0-9A-F]{6}$/i)
  })

  // O guard de luminância do deriveColorRoles: fundo escuro viraria faixa
  // preta no email, então a paleta escura resolve para claro.
  it("paleta escura não vira fundo escuro", () => {
    const vars = buildImagePromptVars({
      ...base,
      brand: {
        colors_primary: [{ hex: "#111111", name: "Preto", role: "Fundo" }],
        colors_secondary: [],
      } as never,
    })
    expect(vars.BG_COLOR).not.toBe("#111111")
  })
})
