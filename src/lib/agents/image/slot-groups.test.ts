import { describe, it, expect } from "vitest"
import {
  isLockupSlot,
  slotGroupKey,
  imageSlotGroups,
  flattenGroups,
  buildImageWorklist,
} from "./slot-groups"
import { selectImageSlots } from "./limits"
import type { BlueprintBlockField } from "@/types/email-generation"

const img = (
  key: string,
  width?: number,
  height?: number,
): BlueprintBlockField => ({
  key,
  label: "",
  type: "image",
  nature: "imagem_gerada",
  max_len: 0,
  min_len: null,
  required: false,
  example: "",
  guidance: "",
  source: "schema",
  image_width: width ?? null,
  image_height: height ?? null,
})

const copy = (key: string): BlueprintBlockField => ({
  key,
  label: "",
  type: "text_short",
  nature: "copy",
  max_len: 40,
  min_len: null,
  required: false,
  example: "exemplo",
  guidance: "",
  source: "schema",
})

describe("slotGroupKey", () => {
  it("agrupa os slots de um painel pela mesma chave", () => {
    // Keys reais de `produtos 7 - dois produtos`.
    expect(slotGroupKey("panel_1_main_photo")).toBe("panel_1")
    expect(slotGroupKey("panel_1_thumb_a")).toBe("panel_1")
    expect(slotGroupKey("panel_1_thumb_c")).toBe("panel_1")
    expect(slotGroupKey("panel_2_main_photo")).toBe("panel_2")
  })

  it("cobre as outras convenções da biblioteca", () => {
    expect(slotGroupKey("review_1_scene")).toBe("review_1")
    expect(slotGroupKey("product_2_photo")).toBe("product_2")
    expect(slotGroupKey("tip_3_image")).toBe("tip_3")
  })

  it("sem ordinal, o campo é o próprio grupo (singleton)", () => {
    expect(slotGroupKey("hero_campanha_editorial")).toBe(
      "hero_campanha_editorial",
    )
    expect(slotGroupKey("collage_composed")).toBe("collage_composed")
  })
})

describe("isLockupSlot", () => {
  it("pega os 9 campos não-fotográficos reais da biblioteca", () => {
    for (const k of [
      "brand_logo",
      "brand_lockup",
      "feature_icon",
      "verified_badge",
      "guarantee_1_icon",
      "guarantee_2_icon",
      "guarantee_3_icon",
    ]) {
      expect(isLockupSlot(k), k).toBe(true)
    }
  })

  it("NÃO pega as fotos de hero cujo spec menciona tipografia", () => {
    // O falso positivo que reprovou a heurística por texto do image_spec:
    // as duas são JPG q80 de campanha, não lockup.
    expect(isLockupSlot("hero_campanha_editorial")).toBe(false)
    expect(isLockupSlot("hero_campanha_monocromatica")).toBe(false)
  })

  it("não confunde slot fotográfico comum", () => {
    expect(isLockupSlot("panel_1_main_photo")).toBe(false)
    expect(isLockupSlot("review_1_scene")).toBe(false)
  })
})

describe("imageSlotGroups", () => {
  it("âncora é a de maior área; as menores viram dependentes", () => {
    // `produtos 7 - dois produtos`, painel 1: main 314×733 vs thumbs 160×182.
    const groups = imageSlotGroups([
      img("panel_1_main_photo", 314, 733),
      img("panel_1_thumb_a", 160, 182),
      img("panel_1_thumb_b", 160, 182),
      img("panel_1_thumb_c", 160, 182),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].groupKey).toBe("panel_1")
    expect(groups[0].anchor.key).toBe("panel_1_main_photo")
    expect(groups[0].dependents.map((f) => f.key)).toEqual([
      "panel_1_thumb_a",
      "panel_1_thumb_b",
      "panel_1_thumb_c",
    ])
  })

  it("empate de área no topo → âncoras separadas, sem dependentes", () => {
    // `review 8`, grupo review_1: duas fotos de 120.000px². São
    // independentes — uma não é miniatura da outra.
    const groups = imageSlotGroups([
      img("review_1_photo_a", 300, 400),
      img("review_1_photo_b", 300, 400),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.dependents.length === 0)).toBe(true)
    expect(groups.map((g) => g.anchor.key).sort()).toEqual([
      "review_1_photo_a",
      "review_1_photo_b",
    ])
  })

  it("sem dimensão declarada, todas empatam em zero → cada uma por si", () => {
    const groups = imageSlotGroups([img("panel_9_a"), img("panel_9_b")])
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.dependents.length === 0)).toBe(true)
  })

  it("descarta copy e slots de lockup", () => {
    // Hero real: uma foto + um lockup tipográfico.
    const groups = imageSlotGroups([
      copy("hero_tagline"),
      img("hero_campanha_editorial", 598, 1150),
      img("brand_lockup", 550, 114),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].anchor.key).toBe("hero_campanha_editorial")
  })

  it("bloco sem campo de imagem → lista vazia", () => {
    expect(imageSlotGroups([copy("headline"), copy("cta_label")])).toEqual([])
    expect(imageSlotGroups(null)).toEqual([])
    expect(imageSlotGroups(undefined)).toEqual([])
  })

  it("dois painéis viram dois grupos independentes", () => {
    const groups = imageSlotGroups([
      img("panel_1_main_photo", 314, 733),
      img("panel_1_thumb_a", 160, 182),
      img("panel_2_main_photo", 314, 733),
      img("panel_2_thumb_a", 160, 182),
    ])
    expect(groups.map((g) => g.groupKey)).toEqual(["panel_1", "panel_2"])
  })
})

describe("flattenGroups", () => {
  it("âncoras primeiro, dependentes depois (ordem das ondas)", () => {
    const groups = imageSlotGroups([
      img("panel_1_main_photo", 314, 733),
      img("panel_1_thumb_a", 160, 182),
      img("panel_2_main_photo", 314, 733),
      img("panel_2_thumb_a", 160, 182),
    ])
    const flat = flattenGroups(groups)
    expect(flat.map((s) => `${s.role}:${s.field.key}`)).toEqual([
      "anchor:panel_1_main_photo",
      "anchor:panel_2_main_photo",
      "dependent:panel_1_thumb_a",
      "dependent:panel_2_thumb_a",
    ])
  })
})

describe("buildImageWorklist", () => {
  // O Welcome 1 da Luxe Lift, com as variantes reais que o Montador casou.
  const blocks = [
    {
      id: "hero",
      position: 1,
      fields: [img("hero_campanha_editorial", 598, 1150), img("brand_lockup", 550, 114)],
    },
    { id: "body", position: 2, fields: [img("tip_1_image", 400, 400)] },
    {
      id: "produtos",
      position: 4,
      fields: [
        img("panel_1_main_photo", 314, 733),
        img("panel_1_thumb_a", 160, 182),
        img("panel_1_thumb_b", 160, 182),
        img("panel_2_main_photo", 314, 733),
        img("panel_2_thumb_a", 160, 182),
      ],
    },
    {
      id: "reviews",
      position: 5,
      fields: [img("review_1_scene", 241, 346), img("review_2_scene", 241, 346)],
    },
  ]
  const build = (cap: number) =>
    buildImageWorklist(blocks, (b) => b.fields, cap, selectImageSlots)

  it("gera um item por slot fotográfico, separado em duas ondas", () => {
    const w = build(50)
    // 1 hero + 1 body + 2 âncoras de painel + 2 reviews = 6 na onda 1.
    expect(w.anchors).toHaveLength(6)
    // 3 miniaturas na onda 2.
    expect(w.dependents.map((d) => d.slot?.field.key).sort()).toEqual([
      "panel_1_thumb_a",
      "panel_1_thumb_b",
      "panel_2_thumb_a",
    ])
    expect(w.lockupSkipped).toBe(1)
    expect(w.droppedByCap).toBe(0)
  })

  it("o bloco do fim do email não é mais descartado inteiro", () => {
    // Regressão do teto por BLOCO: reviews (position 5) perdia as 2 imagens.
    const w = build(50)
    const keys = [...w.anchors, ...w.dependents].map((i) => i.slot?.field.key)
    expect(keys).toContain("review_1_scene")
    expect(keys).toContain("review_2_scene")
  })

  it("teto corta por imagem e leva junto o dependente que perdeu a âncora", () => {
    const w = build(4)
    const total = w.anchors.length + w.dependents.length
    expect(total).toBeLessThanOrEqual(4)
    expect(w.droppedByCap).toBeGreaterThan(0)
    // Nenhum dependente sem a sua âncora na lista.
    const anchorGroups = new Set(
      w.anchors.map((a) => `${String(a.blk.id)}:${a.slot?.groupKey}`),
    )
    for (const d of w.dependents) {
      expect(anchorGroups.has(`${String(d.blk.id)}:${d.slot?.groupKey}`)).toBe(true)
    }
  })

  it("bloco sem slot de imagem no schema cai no caminho legado (1 imagem)", () => {
    const w = buildImageWorklist(
      [{ id: "legado", position: 1, fields: [] as BlueprintBlockField[] }],
      (b) => b.fields,
      10,
      selectImageSlots,
    )
    expect(w.anchors).toHaveLength(1)
    expect(w.anchors[0].slot).toBeNull()
    expect(w.dependents).toHaveLength(0)
  })

  it("slotIndex segue a ordem do schema (o corte respeita a curadoria)", () => {
    const w = build(50)
    const painel = [...w.anchors, ...w.dependents].filter(
      (i) => i.blk.id === "produtos",
    )
    expect(
      painel.find((i) => i.slot?.field.key === "panel_1_main_photo")?.slotIndex,
    ).toBe(0)
    expect(
      painel.find((i) => i.slot?.field.key === "panel_2_main_photo")?.slotIndex,
    ).toBe(3)
  })
})
