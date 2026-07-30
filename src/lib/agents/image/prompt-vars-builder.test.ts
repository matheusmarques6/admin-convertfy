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
