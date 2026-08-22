import { describe, it, expect } from "vitest"
import { MAX_AI_IMAGES, selectImageBlocks, selectImageSlots } from "./limits"

describe("selectImageBlocks", () => {
  it("retorna [] para lista vazia", () => {
    expect(selectImageBlocks([])).toEqual([])
  })

  it("mantém todos quando abaixo do teto", () => {
    const blocks = [{ position: 1 }, { position: 2 }]
    expect(selectImageBlocks(blocks)).toHaveLength(2)
  })

  it("corta no teto quando acima", () => {
    // Teto explícito: MAX_AI_IMAGES passou a contar IMAGENS, então usar a
    // constante aqui amarraria este teste ao valor dela sem necessidade.
    const blocks = Array.from({ length: 6 }, (_, i) => ({ position: i + 1 }))
    const out = selectImageBlocks(blocks, 4)
    expect(out).toHaveLength(4)
    // Mantém os de menor position (topo do email).
    expect(out.map((b) => b.position)).toEqual([1, 2, 3, 4])
  })

  it("o teto default é o mesmo de MAX_AI_IMAGES", () => {
    const blocks = Array.from({ length: MAX_AI_IMAGES + 3 }, (_, i) => ({
      position: i + 1,
    }))
    expect(selectImageBlocks(blocks)).toHaveLength(MAX_AI_IMAGES)
  })

  it("ordena por position antes de cortar (entrada fora de ordem)", () => {
    const blocks = [
      { position: 5, id: "e" },
      { position: 1, id: "a" },
      { position: 3, id: "c" },
      { position: 2, id: "b" },
      { position: 4, id: "d" },
    ]
    const out = selectImageBlocks(blocks, 4)
    expect(out.map((b) => b.id)).toEqual(["a", "b", "c", "d"])
  })

  it("respeita um teto custom", () => {
    const blocks = [{ position: 1 }, { position: 2 }, { position: 3 }]
    expect(selectImageBlocks(blocks, 2)).toHaveLength(2)
  })

  it("não muta o array de entrada", () => {
    const blocks = [{ position: 3 }, { position: 1 }]
    const copy = [...blocks]
    selectImageBlocks(blocks)
    expect(blocks).toEqual(copy)
  })
})

describe("selectImageSlots — o teto conta IMAGENS, não blocos", () => {
  const slot = (blockPosition: number, slotIndex: number, key: string) => ({
    blockPosition,
    slotIndex,
    key,
  })

  it("bloco no fim do email não é mais descartado inteiro pelo teto", () => {
    // Regressão do Welcome 1 (22/08): 5 blocos, teto de 4 BLOCOS cortava o
    // de reviews (position 5) e as 3 imagens dele nunca eram pedidas.
    const slots = [
      slot(1, 0, "hero"),
      slot(2, 0, "body_a"),
      slot(3, 0, "body_b"),
      slot(4, 0, "products"),
      slot(5, 0, "review_1"),
      slot(5, 1, "review_2"),
      slot(5, 2, "review_3"),
    ]
    const out = selectImageSlots(slots, 7)
    expect(out.map((s) => s.key)).toContain("review_1")
    expect(out.map((s) => s.key)).toContain("review_3")
  })

  it("corta por imagem, priorizando o topo do email e a ordem do schema", () => {
    const slots = [
      slot(2, 1, "b"),
      slot(1, 1, "hero_2"),
      slot(2, 0, "a"),
      slot(1, 0, "hero_1"),
    ]
    expect(selectImageSlots(slots, 3).map((s) => s.key)).toEqual([
      "hero_1",
      "hero_2",
      "a",
    ])
  })

  it("abaixo do teto devolve tudo; max 0 devolve vazio; não muta a entrada", () => {
    const slots = [slot(1, 0, "x"), slot(1, 1, "y")]
    expect(selectImageSlots(slots, 10)).toHaveLength(2)
    expect(selectImageSlots(slots, 0)).toEqual([])
    expect(slots.map((s) => s.key)).toEqual(["x", "y"])
  })
})
