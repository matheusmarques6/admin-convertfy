import { describe, expect, it } from "vitest"

import { personaToText } from "./persona-text"

describe("personaToText", () => {
  it("string passa direto (trim + cap 300)", () => {
    expect(personaToText("  Mulheres 35-55, buscam conforto  ")).toBe(
      "Mulheres 35-55, buscam conforto",
    )
    expect(personaToText("x".repeat(500))).toHaveLength(300)
  })

  it("objeto com campo textual conhecido usa o campo (nunca [object Object])", () => {
    const icp = {
      idade: [35, 55],
      resumo: "Mulheres adultas que valorizam conforto e sustentação",
      dores: ["alças que marcam"],
    }
    expect(personaToText(icp)).toBe(
      "Mulheres adultas que valorizam conforto e sustentação",
    )
    expect(personaToText(icp)).not.toContain("[object Object]")
  })

  it("objeto sem campo conhecido vira JSON compacto truncado", () => {
    const out = personaToText({ faixa: "35-55", canal: "instagram" })
    expect(out).toContain('"faixa":"35-55"')
    expect(out.length).toBeLessThanOrEqual(300)
  })

  it("null/undefined/array/objeto vazio → string vazia", () => {
    expect(personaToText(null)).toBe("")
    expect(personaToText(undefined)).toBe("")
    expect(personaToText([1, 2])).toBe("")
    expect(personaToText({})).toBe("")
  })
})
