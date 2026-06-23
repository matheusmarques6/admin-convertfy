/**
 * Testes de buildLiteralMaster — "Usar minha estrutura como master" preserva o
 * texto da "Estrutura & tom da copy" LITERALMENTE, sem a IA reescrever. O value
 * do bloco tem que bater 1:1 com o que o COO digitou.
 */
import { describe, it, expect, vi } from "vitest"

// Deps pesadas mockadas só pra permitir importar o módulo (a função sob teste é pura).
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }))
vi.mock("./anthropic-client", () => ({ callAnthropicJson: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

import { buildLiteralMaster } from "./copy-master.service"

describe("buildLiteralMaster", () => {
  it("preserva o texto LITERAL no value do único bloco de texto", () => {
    const raw =
      "Hero com logo da loja.\nA GENTE DEIXA ELES FALAREM.\n[NÚMERO]+ clientes já recomendam.\nQUERO FAZER PARTE"
    const draft = buildLiteralMaster(raw)
    expect(draft.blocks).toHaveLength(1)
    expect(draft.blocks[0].type).toBe("text")
    expect(draft.blocks[0].value).toBe(raw)
  })

  it("deixa subject/preheader/strategy vazios (têm bloco/campo dedicado próprio)", () => {
    const draft = buildLiteralMaster("a copy inteira do COO vai aqui dentro do corpo")
    expect(draft.subject).toBe("")
    expect(draft.preheader).toBe("")
    expect(draft.strategy).toBe("")
  })

  it("gera um id de bloco não-vazio", () => {
    const draft = buildLiteralMaster("texto qualquer")
    expect(typeof draft.blocks[0].id).toBe("string")
    expect(draft.blocks[0].id.length).toBeGreaterThan(0)
  })

  it("apara só as pontas, preservando quebras e repetições internas", () => {
    const raw = "  \n A GENTE DEIXA ELES FALAREM.\n\nA GENTE DEIXA ELES FALAREM.\n "
    const draft = buildLiteralMaster(raw)
    expect(draft.blocks[0].value).toBe(raw.trim())
    // linha repetida NÃO é deduplicada — o texto vai inteiro pro value
    expect(draft.blocks[0].value).toContain(
      "A GENTE DEIXA ELES FALAREM.\n\nA GENTE DEIXA ELES FALAREM.",
    )
  })

  it("gera ids distintos a cada chamada (não colidem entre drafts)", () => {
    const a = buildLiteralMaster("a")
    const b = buildLiteralMaster("b")
    expect(a.blocks[0].id).not.toBe(b.blocks[0].id)
  })
})
