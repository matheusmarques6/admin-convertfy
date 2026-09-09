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

// 09/09: a cena decidida pelo Estruturador (requisitos.imagem) entra acima
// da direção da variante; o papel vira o purpose servido ao agente.
describe("INTENCAO_VISUAL e papel da posição", () => {
  const base = { brand: null, briefing: null, topProducts: [], storeRaw: {}, blockPurpose: "hero" }
  it("resolve pelo bloco do blueprint; ausente fica vazia; papel vence o purpose", () => {
    const blueprint = {
      blocks: [
        { type: "hero", variant_id: "v-1", purpose: "Apresenta\n\nForma (variante, subordinada ao papel): flat-lay", papel: "Apresenta a marca em corpo real", requisitos: { imagem: "uso real em corpo adulto, não estúdio" } },
        { type: "body", variant_id: "v-2", purpose: "Só o purpose" },
      ],
    } as never
    const hero = buildImagePromptVars({ ...base, blueprint, blockPosition: 1, photoDirectionByVariant: { "v-1": "flat-lay em ângulo alto" } })
    expect(hero.INTENCAO_VISUAL).toBe("uso real em corpo adulto, não estúdio")
    expect(hero.PHOTO_DIRECTION).toBe("flat-lay em ângulo alto")
    expect(hero.blueprint_purpose).toBe("Apresenta a marca em corpo real")
    const body = buildImagePromptVars({ ...base, blueprint, blockPosition: 2 })
    expect(body.INTENCAO_VISUAL).toBe("")
    expect(body.blueprint_purpose).toBe("Só o purpose")
  })
})

// ── A cor da referência não se chama "cor primária" (09/09) ────────────
//
// O cadastro da `body 3` descreve os selos com os hex da peça original e os
// nomeia com o papel da paleta. Como a direção é a fonte principal do
// prompt, os três selos saíram salmão/verde escuro/verde claro nas DUAS
// lojas geradas no dia — nenhuma com essas cores.
describe("tradução das cores do cadastro para as da marca", () => {
  const DIRECAO =
    "Paleta — três cores. Cor primária #2A4439 — título e fundo do selo 2. " +
    "Cor secundária #D88B71 — selo 1."
  const campos = [
    {
      key: "seal_1_image",
      type: "image",
      image_spec: "círculo chapado em #D88B71 (cor secundária) no canvas.",
    },
    {
      key: "seal_2_image",
      type: "image",
      image_spec: "círculo chapado em #2A4439 (cor primária); centro em #2A4439.",
    },
  ]
  const blueprint = {
    blocks: [{ type: "body", variant_id: "v-selos", fields: campos }],
  } as never
  const base = {
    briefing: null,
    topProducts: [],
    storeRaw: {},
    blockPurpose: "body",
    blueprint,
    blockPosition: 1,
    photoDirectionByVariant: { "v-selos": DIRECAO },
  }

  it("com paleta da loja: troca nas DUAS fontes (direção e slots)", () => {
    const vars = buildImagePromptVars({
      ...base,
      fieldKey: "seal_2_image",
      brand: {
        colors_primary: [{ hex: "#111111", name: "Preto" }],
        colors_secondary: [{ hex: "#E4572E", name: "Laranja" }],
      } as never,
    })
    expect(vars.PHOTO_DIRECTION).toContain("#111111")
    expect(vars.PHOTO_DIRECTION).not.toContain("#2A4439")
    expect(vars.IMAGE_SLOTS).toContain("#111111")
    expect(vars.IMAGE_SLOTS).not.toContain("#2A4439")
    expect(vars.CORES_TRADUZIDAS).toContain("#2A4439→#111111")
    expect(vars.CORES_DE_REFERENCIA).toBe("")
    // sem lacuna, sem aviso poluindo o prompt
    expect(vars.PHOTO_DIRECTION).not.toContain("cores de REFERÊNCIA")
  })

  it("sem paleta: o hex fica, e o prompt diz que ele NÃO é da marca", () => {
    // Trocar por preto e branco pioraria a peça em 19 das 20 lojas.
    const vars = buildImagePromptVars({ ...base, brand: null })
    expect(vars.PHOTO_DIRECTION).toContain("#2A4439")
    expect(vars.PHOTO_DIRECTION).toContain("NÃO da paleta desta marca")
    expect(vars.CORES_TRADUZIDAS).toBe("")
    expect(vars.CORES_DE_REFERENCIA).toContain("#2A4439")
  })

  it("o aviso não faz uma variante SEM direção passar a ter uma", () => {
    const vars = buildImagePromptVars({
      ...base,
      brand: null,
      photoDirectionByVariant: {},
      fieldKey: "seal_1_image",
    })
    expect(vars.PHOTO_DIRECTION).toBe("")
    expect(vars.PHOTO_DIRECTION_AUSENTE).toBe("true")
    // …e o aviso vai para o IMAGE_SLOTS, que é onde a cor aparece
    expect(vars.IMAGE_SLOTS).toContain("NÃO da paleta desta marca")
  })
})
