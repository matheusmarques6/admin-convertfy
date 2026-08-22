import { describe, it, expect } from "vitest"
import {
  getAspectDimensions,
  resolveAspectForBlock,
  blockAspectFromBlueprint,
  imageDimsFromBlueprint,
  resolveAspectForField,
  aspectInstructionForPrompt,
  dimsInstructionForPrompt,
  isAspectKey,
  type AspectKey,
} from "./aspect-ratio"

describe("getAspectDimensions", () => {
  it("retorna 1200x1500 para 4:5", () => {
    expect(getAspectDimensions("4:5")).toEqual({ width: 1200, height: 1500 })
  })
  it("retorna 720x1200 para 3:5", () => {
    expect(getAspectDimensions("3:5")).toEqual({ width: 720, height: 1200 })
  })
  it("retorna 1200x900 para 4:3", () => {
    expect(getAspectDimensions("4:3")).toEqual({ width: 1200, height: 900 })
  })
  it("retorna 1200x1200 para 1:1", () => {
    expect(getAspectDimensions("1:1")).toEqual({ width: 1200, height: 1200 })
  })
  it("retorna 900x1200 para 3:4", () => {
    expect(getAspectDimensions("3:4")).toEqual({ width: 900, height: 1200 })
  })
  it("retorna 1600x900 para 16:9", () => {
    expect(getAspectDimensions("16:9")).toEqual({ width: 1600, height: 900 })
  })
  it("retorna 1600x800 para 2:1", () => {
    expect(getAspectDimensions("2:1")).toEqual({ width: 1600, height: 800 })
  })
  it("retorna 900x1600 para 9:16", () => {
    expect(getAspectDimensions("9:16")).toEqual({ width: 900, height: 1600 })
  })
})

describe("isAspectKey", () => {
  it("aceita strings validas", () => {
    ;(
      ["4:5", "3:5", "4:3", "1:1", "3:4", "16:9", "2:1", "9:16"] as AspectKey[]
    ).forEach((s) => {
      expect(isAspectKey(s)).toBe(true)
    })
  })
  it("rejeita strings invalidas", () => {
    expect(isAspectKey("5:7")).toBe(false)
    expect(isAspectKey("")).toBe(false)
    expect(isAspectKey(null)).toBe(false)
    expect(isAspectKey(undefined)).toBe(false)
    expect(isAspectKey(45)).toBe(false)
  })
})

describe("resolveAspectForBlock — blueprint override", () => {
  it("blueprintAspect valido sempre vence", () => {
    expect(
      resolveAspectForBlock({
        blueprintAspect: "3:5",
        flowType: "welcome",
        emailNumber: 1, // matriz diria 4:5
      }),
    ).toBe("3:5")
  })

  it("blueprintAspect 1:1 sobrescreve matriz", () => {
    expect(
      resolveAspectForBlock({
        blueprintAspect: "1:1",
        flowType: "welcome",
        emailNumber: 5, // matriz diria 4:3
      }),
    ).toBe("1:1")
  })

  it("blueprintAspect invalido (string nao-AspectKey) cai pra matriz", () => {
    expect(
      resolveAspectForBlock({
        blueprintAspect: "5:7",
        flowType: "welcome",
        emailNumber: 3,
      }),
    ).toBe("3:5") // matriz E3
  })

  it("blueprintAspect null cai pra matriz", () => {
    expect(
      resolveAspectForBlock({
        blueprintAspect: null,
        flowType: "welcome",
        emailNumber: 5,
      }),
    ).toBe("4:3")
  })
})

describe("resolveAspectForBlock — matriz welcome", () => {
  it("welcome E1 -> 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 1 }),
    ).toBe("4:5")
  })
  it("welcome E2 -> 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 2 }),
    ).toBe("4:5")
  })
  it("welcome E3 -> 3:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 3 }),
    ).toBe("3:5")
  })
  it("welcome E4 -> 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 4 }),
    ).toBe("4:5")
  })
  it("welcome E5 -> 4:3", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 5 }),
    ).toBe("4:3")
  })
  it("welcome E6 -> 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 6 }),
    ).toBe("4:5")
  })
})

describe("resolveAspectForBlock — defaults", () => {
  it("welcome E99 (fora da matriz) -> default 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 99 }),
    ).toBe("4:5")
  })
  it("flow desconhecido -> default 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: "abandoned_cart", emailNumber: 1 }),
    ).toBe("4:5")
  })
  it("sem flowType e sem emailNumber -> default 4:5", () => {
    expect(resolveAspectForBlock({})).toBe("4:5")
  })
  it("flowType=null e emailNumber=null -> default 4:5", () => {
    expect(
      resolveAspectForBlock({ flowType: null, emailNumber: null }),
    ).toBe("4:5")
  })
  it("welcome sem emailNumber -> default 4:5", () => {
    expect(resolveAspectForBlock({ flowType: "welcome" })).toBe("4:5")
  })
})

describe("aspectInstructionForPrompt", () => {
  it("inclui o aspect ratio textualmente", () => {
    const out = aspectInstructionForPrompt("4:5", false)
    expect(out).toContain("4:5 aspect ratio")
  })

  it("inclui dimensoes esperadas", () => {
    const out = aspectInstructionForPrompt("4:5", false)
    expect(out).toContain("1200x1500")
  })

  it("orientation portrait para 4:5", () => {
    const out = aspectInstructionForPrompt("4:5", false)
    expect(out).toContain("vertical portrait")
  })

  it("orientation landscape para 4:3", () => {
    const out = aspectInstructionForPrompt("4:3", false)
    expect(out).toContain("horizontal landscape")
  })

  it("orientation square para 1:1", () => {
    const out = aspectInstructionForPrompt("1:1", false)
    expect(out).toContain("square")
  })

  it("reserveBottom=true menciona reserve bottom", () => {
    const out = aspectInstructionForPrompt("4:5", true)
    expect(out).toContain("Reserve the bottom")
    expect(out).toContain("overlay")
  })

  it("reserveBottom=false NAO menciona reserve bottom", () => {
    const out = aspectInstructionForPrompt("4:5", false)
    expect(out).not.toContain("Reserve the bottom")
  })

  it("3:5 vertical portrait com dims corretas", () => {
    const out = aspectInstructionForPrompt("3:5", false)
    expect(out).toContain("3:5")
    expect(out).toContain("vertical portrait")
    expect(out).toContain("720x1200")
  })
})

describe("aspect por BLOCO (blocks[].image_aspect via tags do template)", () => {
  it("blockAspect válido vence blueprint/matriz/default", () => {
    expect(
      resolveAspectForBlock({
        blockAspect: "1:1",
        blueprintAspect: "4:3",
        flowType: "welcome",
        emailNumber: 3,
      }),
    ).toBe("1:1")
  })

  it("blockAspect inválido/ausente cai na cascata antiga", () => {
    expect(
      resolveAspectForBlock({
        blockAspect: "banana",
        blueprintAspect: "4:3",
        flowType: "welcome",
        emailNumber: 3,
      }),
    ).toBe("4:3")
    expect(
      resolveAspectForBlock({ flowType: "welcome", emailNumber: 3 }),
    ).toBe("3:5")
  })

  it("blockAspectFromBlueprint casa position 1-based com blocks[position-1] guardado por type", () => {
    const blocks = [
      { type: "header", image_aspect: null },
      { type: "hero", image_aspect: "4:5" },
      { type: "products", image_aspect: "1:1" },
    ]
    expect(blockAspectFromBlueprint(blocks, 2, "hero")).toBe("4:5")
    expect(blockAspectFromBlueprint(blocks, 3, "products")).toBe("1:1")
    // type não casa em nenhum dos dois índices → null
    expect(blockAspectFromBlueprint(blocks, 1, "products")).toBeNull()
    // rows legadas 0-based: fallback pro próprio índice
    expect(blockAspectFromBlueprint(blocks, 1, "hero")).toBe("4:5")
    expect(blockAspectFromBlueprint(null, 2, "hero")).toBeNull()
  })
})

describe("imageDimsFromBlueprint (dims declaradas no schema)", () => {
  const blocks = [
    { type: "header", fields: [] },
    {
      type: "hero",
      fields: [
        { key: "hero_headline", type: "text_short" },
        { key: "hero_image", type: "image", image_width: 600, image_height: 700 },
      ],
    },
    {
      type: "products",
      fields: [
        { type: "image", image_width: 0, image_height: 0 }, // sem dims
      ],
    },
  ]

  it("devolve o primeiro field type=image com w e h > 0 (casa por position+type)", () => {
    expect(imageDimsFromBlueprint(blocks, 2, "hero")).toEqual({
      width: 600,
      height: 700,
    })
  })

  it("field de imagem sem dims (0x0) → null", () => {
    expect(imageDimsFromBlueprint(blocks, 3, "products")).toBeNull()
  })

  it("bloco sem field de imagem, type divergente ou blueprint null → null", () => {
    expect(imageDimsFromBlueprint(blocks, 1, "header")).toBeNull()
    expect(imageDimsFromBlueprint(blocks, 2, "products")).toBeNull()
    expect(imageDimsFromBlueprint(null, 2, "hero")).toBeNull()
  })
})

describe("dimsInstructionForPrompt", () => {
  it("reduz a proporção e descreve o frame exato", () => {
    const txt = dimsInstructionForPrompt(600, 700, false)
    expect(txt).toContain("600x700 pixels")
    expect(txt).toContain("proportion 6:7")
    expect(txt).toContain("vertical portrait")
    expect(txt).not.toContain("bottom 30%")
  })

  it("reserveBottom acrescenta a área do overlay", () => {
    expect(dimsInstructionForPrompt(1600, 800, true)).toContain("bottom 30%")
    expect(dimsInstructionForPrompt(1600, 800, true)).toContain(
      "horizontal landscape",
    )
  })
})

describe("dims e aspect POR CAMPO (geração por slot)", () => {
  // `produtos 7 - dois produtos`: a foto grande e as miniaturas do mesmo
  // bloco têm geometrias diferentes. Gerar as quatro no tamanho da primeira
  // entregava três imagens com o enquadramento errado.
  const blocks = [
    {
      type: "products",
      fields: [
        {
          key: "panel_1_main_photo",
          type: "image",
          image_width: 314,
          image_height: 733,
          image_aspect: "9:16",
        },
        {
          key: "panel_1_thumb_a",
          type: "image",
          image_width: 160,
          image_height: 182,
          image_aspect: "4:5",
        },
      ],
    },
  ]

  it("devolve as dims DAQUELE campo, não as do primeiro", () => {
    expect(
      imageDimsFromBlueprint(blocks, 1, "products", "panel_1_main_photo"),
    ).toEqual({ width: 314, height: 733 })
    expect(
      imageDimsFromBlueprint(blocks, 1, "products", "panel_1_thumb_a"),
    ).toEqual({ width: 160, height: 182 })
  })

  it("sem fieldKey mantém o comportamento antigo (primeiro campo com dims)", () => {
    expect(imageDimsFromBlueprint(blocks, 1, "products")).toEqual({
      width: 314,
      height: 733,
    })
  })

  it("fieldKey inexistente cai no primeiro campo com dims", () => {
    expect(
      imageDimsFromBlueprint(blocks, 1, "products", "nao_existe"),
    ).toEqual({ width: 314, height: 733 })
  })

  it("resolveAspectForField prefere o aspect do campo", () => {
    expect(
      resolveAspectForField({ fieldAspect: "9:16", blockAspect: "4:5" }),
    ).toBe("9:16")
  })

  it("campo sem aspect (ou inválido) cai na cascata do bloco", () => {
    expect(resolveAspectForField({ blockAspect: "4:5" })).toBe("4:5")
    expect(
      resolveAspectForField({ fieldAspect: "banana", blockAspect: "1:1" }),
    ).toBe("1:1")
    expect(resolveAspectForField({})).toBe("4:5")
  })
})
