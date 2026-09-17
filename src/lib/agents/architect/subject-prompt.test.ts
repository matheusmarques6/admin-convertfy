import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { DEFAULT_SUBJECT_SYSTEM, DEFAULT_SUBJECT_USER, SUBJECT_ORIGINS } from "./blueprint-generator.service"

/**
 * O prompt do assunto passou a ler a DECISÃO do e-mail (14/09). O do banco
 * vence e é trocado pela migration 20261146 com o MESMO texto — o teste
 * garante que o in-code (o fallback) e a proveniência estão alinhados.
 */
describe("prompt do subject lê a decisão", () => {
  const vars = [...DEFAULT_SUBJECT_USER.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])

  it("toda var do template tem origem declarada", () => {
    const semOrigem = [...new Set(vars)].filter((v) => !(v in SUBJECT_ORIGINS))
    expect(semOrigem).toEqual([])
  })

  it("as vars da decisão estão no template e são upstream", () => {
    for (const v of ["alvo_resumo", "fio_narrativo", "incentivo", "insumos_permitidos", "proibido"]) {
      expect(vars).toContain(v)
      expect(SUBJECT_ORIGINS[v].cls).toBe("upstream")
    }
    expect(vars).toContain("violacao_anterior")
  })

  it("o system proíbe oferta sem incentivo e trata o proibido como lista fechada", () => {
    expect(DEFAULT_SUBJECT_SYSTEM).toMatch(/sem incentivo neste toque/i)
    expect(DEFAULT_SUBJECT_SYSTEM).toMatch(/lista fechada/i)
    expect(DEFAULT_SUBJECT_SYSTEM).toContain("<violacao_anterior>")
    expect(DEFAULT_SUBJECT_SYSTEM).toContain('{"subject_hint":"...","messaging":"..."}')
  })

  it("a migration 20261146 grava o MESMO texto do in-code", async () => {
    const fs = await import("node:fs")
    const sql = fs.readFileSync("supabase/migrations/20261146_subject_prompt_decisao.sql", "utf8")
    expect(sql).toContain(DEFAULT_SUBJECT_SYSTEM)
    expect(sql).toContain(DEFAULT_SUBJECT_USER)
  })
})
