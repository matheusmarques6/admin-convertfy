import { describe, expect, it } from "vitest"

import { avaliarSnapshot, type ResumoDoSnapshot } from "./snapshot-saude"

const resumo = (p: Partial<ResumoDoSnapshot>): ResumoDoSnapshot => ({
  orgs: 1,
  escritos: { pipeline: 4, org: 1, funil: 1 },
  erros: [],
  ...p,
})

describe("avaliarSnapshot", () => {
  it("rodada normal passa e diz o que gravou", () => {
    const v = avaliarSnapshot(resumo({}))
    expect(v.ok).toBe(true)
    expect(v.motivo).toContain("4 pipeline")
  })

  // O caso medido em 16/09: o filtro `type = 'agency'` não achava a única
  // organização do banco (`internal`), o laço percorria lista vazia e o
  // cron respondia `200 {success: true, orgs: 0}` todo dia. Três tabelas
  // com ZERO linhas desde sempre, e a tela de Reports vazia.
  it("nenhuma organização percorrida é FALHA, não vazio", () => {
    const v = avaliarSnapshot(resumo({ orgs: 0, escritos: { pipeline: 0, org: 0, funil: 0 } }))
    expect(v.ok).toBe(false)
    expect(v.motivo).toMatch(/nenhuma organização/)
  })

  // O snapshot da org é incondicional — grava até com a carteira vazia.
  // Zero linhas com org percorrida só acontece se a escrita falhou calada.
  it("org percorrida sem nenhuma linha gravada é falha", () => {
    const v = avaliarSnapshot(resumo({ escritos: { pipeline: 0, org: 0, funil: 0 } }))
    expect(v.ok).toBe(false)
    expect(v.motivo).toContain("nenhuma linha gravada")
  })

  it("org sem pipeline ainda passa — o que conta é ter gravado algo", () => {
    const v = avaliarSnapshot(resumo({ escritos: { pipeline: 0, org: 1, funil: 1 } }))
    expect(v.ok).toBe(true)
  })

  // Meia fotografia publicada como fotografia é pior que nenhuma.
  it("erro de escrita reprova mesmo com outras linhas gravadas", () => {
    const v = avaliarSnapshot(resumo({ erros: ["23505 duplicate key"] }))
    expect(v.ok).toBe(false)
    expect(v.motivo).toContain("23505")
  })

  it("com muitos erros, o motivo não vira parede de texto", () => {
    const v = avaliarSnapshot(resumo({ erros: ["a", "b", "c", "d", "e"] }))
    expect(v.motivo).toContain("a · b · c")
    expect(v.motivo).not.toContain("d")
  })
})
