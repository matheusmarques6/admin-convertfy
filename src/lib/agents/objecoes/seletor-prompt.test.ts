import { describe, expect, it } from "vitest"

import { CACHE_PREFIX_MARKER } from "../shared/cache-de-prompt"
import { DEFAULT_SELETOR_USER, SELETOR_ORIGINS } from "./seletor-prompt"

// 14/09: o bloco da loja (catálogo + oferta) vem antes da marca de cache e
// é lido do cache pelos 4 e-mails da loja; `email_number` saiu do bloco da
// loja — com ele lá, o prefixo mudava a cada e-mail.
describe("DEFAULT_SELETOR_USER — prefixo estável", () => {
  const tpl = DEFAULT_SELETOR_USER
  const marca = tpl.indexOf(CACHE_PREFIX_MARKER)
  it("uma marca só, com loja/catálogo/oferta antes e o resto depois", () => {
    expect(tpl.split(CACHE_PREFIX_MARKER).length - 1).toBe(1)
    for (const tag of ["{{brand_name}}", "{{catalogo_da_loja}}", "{{oferta_e_produtos}}"]) {
      expect(tpl.indexOf(tag), tag).toBeLessThan(marca)
    }
    for (const tag of ["{{email_number}}", "{{flow_type}}", "{{contrato_do_toque}}", "{{intencao_do_toque}}", "{{ja_atacadas}}", "{{correcoes}}", "{{orientacao_do_coo}}"]) {
      expect(tpl.indexOf(tag), tag).toBeGreaterThan(marca)
    }
  })
  it("toda var do template tem origem declarada", () => {
    const vars = [...tpl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
    for (const v of vars) expect(SELETOR_ORIGINS[v], v).toBeDefined()
  })
})

// S4 (19/09): a orientação do COO é bloco MUTÁVEL (depois da marca) e o
// contrato de saída pede `alertas_de_dado` separado das proibições (Q6).
describe("DEFAULT_SELETOR_SYSTEM — uma voz por saída", () => {
  it("o output declara alertas_de_dado e a regra 12 manda separar", async () => {
    const { DEFAULT_SELETOR_SYSTEM } = await import("./seletor-prompt")
    expect(DEFAULT_SELETOR_SYSTEM).toContain('"alertas_de_dado"')
    expect(DEFAULT_SELETOR_SYSTEM).toMatch(/NÃO é proibição/)
    expect(DEFAULT_SELETOR_SYSTEM).toContain("<orientacao_do_coo>")
  })
})
