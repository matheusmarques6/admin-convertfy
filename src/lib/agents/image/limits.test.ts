import { describe, it, expect } from "vitest"
import { MAX_AI_IMAGES, selectImageBlocks } from "./limits"

describe("selectImageBlocks", () => {
  it("retorna [] para lista vazia", () => {
    expect(selectImageBlocks([])).toEqual([])
  })

  it("mantém todos quando abaixo do teto", () => {
    const blocks = [{ position: 1 }, { position: 2 }]
    expect(selectImageBlocks(blocks)).toHaveLength(2)
  })

  it("corta no teto quando acima", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => ({ position: i + 1 }))
    const out = selectImageBlocks(blocks)
    expect(out).toHaveLength(MAX_AI_IMAGES)
    // Mantém os de menor position (topo do email).
    expect(out.map((b) => b.position)).toEqual([1, 2, 3, 4])
  })

  it("ordena por position antes de cortar (entrada fora de ordem)", () => {
    const blocks = [
      { position: 5, id: "e" },
      { position: 1, id: "a" },
      { position: 3, id: "c" },
      { position: 2, id: "b" },
      { position: 4, id: "d" },
    ]
    const out = selectImageBlocks(blocks)
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
