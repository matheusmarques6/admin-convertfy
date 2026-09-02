import { describe, it, expect } from "vitest"
import { DEFAULT_ESTRUTURADOR_SYSTEM, normalizarOutput } from "./estruturador-prompt"

/**
 * Sem validador de conteúdo (02/09): `normalizarOutput` só garante a FORMA
 * que o pipeline consome. Slug desconhecido, seção fora da biblioteca e
 * sequência repetida passam intactos — o que o agente devolver vale.
 */
describe("normalizarOutput", () => {
  const base = {
    diagnostico: { objecao_dominante: "eficácia", traducao_do_mecanismo: "x" },
    estrutura: [
      { section: "header", papel: "abre", referencia: "slug-que-nao-existe", porque: "p" },
      { section: "body", papel: "pivô", referencia: "r", adaptacao: "a", porque: "p" },
    ],
    fio_narrativo: "fio",
  }

  it("passa header, slug desconhecido e campos faltantes sem reprovar; defaults nos arrays", () => {
    const o = normalizarOutput(base)
    expect(o.estrutura.map((p) => p.section)).toEqual(["header", "body"])
    expect(o.estrutura[0].referencia).toBe("slug-que-nao-existe")
    expect(o.estrutura[1].adaptacao).toBe("a")
    expect(o.fontes).toEqual([])
    expect(o.aprendizados_aplicados).toEqual([])
    expect(o.descartes).toEqual([])
    expect(o.text_only).toBe(false)
  })

  it("posição sem section ou sem papel cai fora; text_only só booleano estrito; descarte sem origem vira modelo", () => {
    const o = normalizarOutput({
      ...base,
      estrutura: [...base.estrutura, { section: "reviews" }, { papel: "sem seção" }, "lixo"],
      text_only: "true",
      descartes: [{ section: "cta", porque: "competia" }, null],
    })
    expect(o.estrutura).toHaveLength(2)
    expect(o.text_only).toBe(false)
    expect(o.descartes).toEqual([
      { section: "cta", papel_na_referencia: null, porque: "competia", origem: "modelo" },
    ])
  })

  it("sem estrutura utilizável → lança (é o único motivo de retry além do parse)", () => {
    expect(() => normalizarOutput({ ...base, estrutura: [] })).toThrow(/estrutura/)
    expect(() => normalizarOutput("texto")).toThrow(/objeto JSON/)
    expect(() => normalizarOutput({ ...base, estrutura: [{ section: "hero", papel: "  " }] })).toThrow(/estrutura/)
  })

  it("o system fala em <secoes_disponiveis> e <perfil_da_marca>, não em capacidade", () => {
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain("<secoes_disponiveis>")
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain("<perfil_da_marca>")
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).not.toContain("capacidade_da_biblioteca")
  })
})
