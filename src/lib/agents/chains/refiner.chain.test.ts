import { describe, expect, it } from "vitest"
import {
  RefinerDeltaInvalidError,
  parseRefinerDelta,
} from "./refiner.chain"

describe("parseRefinerDelta", () => {
  it("parseia JSON limpo", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        strategy: "serif_luxury",
        rationale: "Relógios premium pedem serifada",
        display_font: { family: "Playfair Display", weights: [400, 700] },
        targets: [{ index: 0, role: "brand_name", font_weight: 700, letter_spacing: "-1.5px" }],
      }),
    )
    expect(delta.strategy).toBe("serif_luxury")
    expect(delta.display_font?.family).toBe("Playfair Display")
    expect(delta.targets).toHaveLength(1)
  })

  it("tolera fences markdown e prosa em volta", () => {
    const raw =
      'Aqui está a decisão:\n```json\n{"strategy":"none","rationale":"já comunica","display_font":null,"targets":[]}\n```'
    const delta = parseRefinerDelta(raw)
    expect(delta.strategy).toBe("none")
    expect(delta.display_font).toBeNull()
    expect(delta.targets).toEqual([])
  })

  it("descarta targets malformados e normaliza role desconhecido", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        strategy: "personality_sans",
        display_font: { family: "Sora", weights: [600] },
        targets: [
          { index: 2, role: "banana" },
          { index: "x", role: "brand_name" },
          null,
        ],
      }),
    )
    expect(delta.targets).toEqual([{ index: 2, role: "section_title" }])
  })

  it("strategy inválida → RefinerDeltaInvalidError", () => {
    expect(() =>
      parseRefinerDelta('{"strategy":"comic_sans_everywhere","targets":[]}'),
    ).toThrow(RefinerDeltaInvalidError)
  })

  it("JSON truncado/inválido → RefinerDeltaInvalidError", () => {
    expect(() => parseRefinerDelta('{"strategy":"none",')).toThrow(RefinerDeltaInvalidError)
    expect(() => parseRefinerDelta("sem json nenhum")).toThrow(RefinerDeltaInvalidError)
  })

  it("troca de família sem display_font → RefinerDeltaInvalidError", () => {
    expect(() =>
      parseRefinerDelta('{"strategy":"serif_luxury","display_font":null,"targets":[]}'),
    ).toThrow(RefinerDeltaInvalidError)
  })
})
