import { describe, it, expect, vi } from "vitest"

// Isola o I/O: as funções puras testadas aqui não tocam o banco, mas o
// módulo importa createAdminClient na cadeia (telemetry/llm-invoke).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import {
  parseBlueprintOutput,
  blueprintFromDefault,
} from "./blueprint-generator.service"

describe("parseBlueprintOutput", () => {
  it("parseia JSON válido e descarta tipos de bloco inválidos", () => {
    const raw =
      '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"},{"type":"xpto","label":"X"},{"type":"footer","label":"F"}]}'
    const bp = parseBlueprintOutput(raw)
    expect(bp).not.toBeNull()
    expect(bp!.blocks.map((b) => b.type)).toEqual(["hero", "footer"])
    expect(bp!.blocks[0].needs_image).toBe(true) // hero
    expect(bp!.blocks[1].needs_image).toBe(false) // footer
  })

  it("remove fences markdown e prosa ao redor", () => {
    const raw =
      'Aqui está:\n```json\n{"objective":"o","blocks":[{"type":"text","label":"T"}]}\n```'
    const bp = parseBlueprintOutput(raw)
    expect(bp).not.toBeNull()
    expect(bp!.blocks).toHaveLength(1)
  })

  it("retorna null se blocks vazio ou JSON inválido", () => {
    expect(parseBlueprintOutput("{}")).toBeNull()
    expect(parseBlueprintOutput("não é json")).toBeNull()
    expect(parseBlueprintOutput('{"blocks":[{"type":"invalid"}]}')).toBeNull()
  })
})

describe("blueprintFromDefault", () => {
  it("retorna o blueprint default do flow/email (welcome 1)", () => {
    const bp = blueprintFromDefault("welcome", 1)
    expect(bp).not.toBeNull()
    expect(bp!.blocks.length).toBeGreaterThan(0)
    expect(bp!.blocks.some((b) => b.type === "hero" && b.needs_image)).toBe(true)
  })

  it("retorna null para flow/email inexistente", () => {
    expect(blueprintFromDefault("inexistente", 99)).toBeNull()
  })
})
