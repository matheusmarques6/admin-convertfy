import { describe, expect, it } from "vitest"

import { buildQaAdvisorQuery } from "./qa-advisor-context"

describe("buildQaAdvisorQuery", () => {
  it("combina objetivo, tipos e conteúdo visível sem enviar HTML", () => {
    const query = buildQaAdvisorQuery({
      objective: "Apresentar a marca e reduzir objeção de preço",
      blockViews: [{ block_id: "hero-1", visible_text: "Conheça nossa história" }],
      expectedBlocks: [{ block_type: "hero", content: { headline: "Conheça" } }],
    })

    expect(query).toContain("reduzir objeção de preço")
    expect(query).toContain("Blocos: hero")
    expect(query).toContain("Conheça nossa história")
    expect(query).not.toContain("<html")
  })

  it("limita a consulta para proteger custo de embedding e busca", () => {
    const query = buildQaAdvisorQuery({
      objective: "x".repeat(10_000),
      blockViews: [],
      expectedBlocks: [],
    })
    expect(query.length).toBeLessThanOrEqual(4_000)
  })
})
