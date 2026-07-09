import { describe, it, expect } from "vitest"
import { validateTemplateVariables, buildTemplateBodyComponents } from "./templates"

describe("validateTemplateVariables", () => {
  const tpl = { name: "boas_vindas", body_variables: 2 }

  it("aceita contagem exata", () => {
    expect(validateTemplateVariables(tpl, ["João", "Convertfy"])).toEqual({ valid: true })
  })

  it("rejeita contagem errada", () => {
    const r = validateTemplateVariables(tpl, ["João"])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.error).toContain("espera 2")
  })

  it("rejeita variável vazia com índice", () => {
    const r = validateTemplateVariables(tpl, ["João", "  "])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.error).toContain("{{2}}")
  })

  it("template sem variáveis aceita array vazio", () => {
    expect(validateTemplateVariables({ name: "x", body_variables: 0 }, [])).toEqual({ valid: true })
  })
})

describe("buildTemplateBodyComponents", () => {
  it("array vazio pra template sem params", () => {
    expect(buildTemplateBodyComponents([])).toEqual([])
  })

  it("monta body parameters na ordem", () => {
    expect(buildTemplateBodyComponents(["A", "B"])).toEqual([
      { type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }] },
    ])
  })
})
