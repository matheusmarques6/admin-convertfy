import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import { comIntencoesPorBloco } from "./estruturador.service"

describe("comIntencoesPorBloco", () => {
  it("anexa a lista por posição à intenção do email; vazia devolve a intenção intacta", () => {
    expect(comIntencoesPorBloco("Entregar o cupom.", [])).toBe("Entregar o cupom.")
    const out = comIntencoesPorBloco("Entregar o cupom.", [
      { section: "hero", intencao: "Cupom visível nos primeiros segundos" },
      { section: "body", intencao: "   " },
      { section: "reviews", intencao: "Voz externa confirmando a tese" },
    ])
    expect(out).toContain("Entregar o cupom.")
    expect(out).toContain("Intenções por bloco")
    expect(out).toContain("1. hero — Cupom visível nos primeiros segundos")
    expect(out).toContain("2. reviews — Voz externa confirmando a tese")
    expect(out).not.toContain("body")
  })
})
