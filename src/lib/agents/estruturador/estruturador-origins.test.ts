import { describe, it, expect } from "vitest"
import { DEFAULT_ESTRUTURADOR_USER } from "./estruturador-prompt"
import { USER_ORIGINS } from "./estruturador.service"

/**
 * Var no template sem entrada em USER_ORIGINS não quebra nada: o guard de
 * recomposição simplesmente grava `segments: null` e a run inteira perde a
 * marcação por origem — em silêncio. Foi o que quase aconteceu ao renomear
 * `estruturas_proibidas` (27/08). Aqui a omissão vira falha de teste.
 */
describe("proveniência do Estruturador", () => {
  const vars = Array.from(
    DEFAULT_ESTRUTURADOR_USER.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g),
  ).map((m) => m[1])

  it("o template tem vars (o regex não silenciou o teste)", () => {
    expect(vars.length).toBeGreaterThan(5)
  })

  it("toda var do template tem origem declarada", () => {
    const semOrigem = [...new Set(vars)].filter((v) => !(v in USER_ORIGINS))
    expect(semOrigem, `sem entrada em USER_ORIGINS: ${semOrigem.join(", ")}`).toEqual([])
  })

  it("a var da anti-repetição diz que é dos OUTROS emails", () => {
    expect(DEFAULT_ESTRUTURADOR_USER).toContain("{{estruturas_dos_outros_emails}}")
    expect(USER_ORIGINS.estruturas_dos_outros_emails.cls).toBe("sistema")
    expect(USER_ORIGINS.estruturas_dos_outros_emails.rotulo).toContain("outros emails")
  })
})
