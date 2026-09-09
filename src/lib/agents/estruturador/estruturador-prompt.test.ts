import { describe, it, expect } from "vitest"
import {
  DEFAULT_ESTRUTURADOR_SYSTEM,
  INTENCAO_NAO_SERVIDA,
  intencaoParaOPrompt,
  normalizarOutput,
  normalizarRequisitos,
} from "./estruturador-prompt"

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

/**
 * 08/09: a nota de intenção sai do prompt quando o Seletor entregou alvo —
 * ele a lê inteira e a devolve traduzida (os anti-objetivos da nota são,
 * literalmente, o `proibido_neste_toque` do alvo).
 */
describe("a nota de intenção só viaja sem alvo", () => {
  const NOTA = "# Welcome 1\n\n## O que este email deve fazer\n\nEntregar o cupom."

  it("com alvo, o prompt recebe a declaração de ausência — não a nota", () => {
    const v = intencaoParaOPrompt(NOTA, { modo: "quebra_de_objecao" })
    expect(v).toBe(INTENCAO_NAO_SERVIDA)
    expect(v).not.toContain("Entregar o cupom")
  })

  it("sem alvo, a nota volta inteira (desligar o Seletor não regride)", () => {
    expect(intencaoParaOPrompt(NOTA, null)).toBe(NOTA)
    expect(intencaoParaOPrompt(NOTA, undefined)).toBe(NOTA)
  })

  // A lição do `exige` e do `momento`: tirar o dado sem tirar a regra faz o
  // modelo procurar o que não recebeu.
  it("a declaração proíbe procurar a nota e aponta onde a informação está", () => {
    expect(INTENCAO_NAO_SERVIDA).toContain("<decisao_de_objecao>")
    expect(INTENCAO_NAO_SERVIDA).toMatch(/não procure/i)
  })

  it("as três menções do system deixaram de pedir a nota incondicionalmente", () => {
    // VALIDAÇÃO passou a conferir contra o alvo.
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain("trabalhos fixos")
    // As menções que restam declaram a condição (fallback / quando servida).
    for (const trecho of DEFAULT_ESTRUTURADOR_SYSTEM.split("\n").filter((l) =>
      /intenção deste email|nota de intenção/i.test(l),
    )) {
      expect(trecho, trecho).toMatch(/fallback|servida|ausência/i)
    }
  })
})

describe("requisitos tipados por posição (09/09)", () => {
  it("normaliza tipos e descarta o inválido sem reprovar; nada declarado → ausente", () => {
    const r = normalizarRequisitos({
      cupom: false, cta: "não", n_itens: { min: 3, max: 2 }, preco: true, avaliacao: null,
      campos: ["preco", "idade", "cor_favorita"], imagem: "  uso real em corpo adulto ", exige: ["2 parágrafos", "", 7],
    })
    expect(r).toEqual({
      cupom: false, cta: null, n_itens: { min: 2, max: 3 }, preco: true, avaliacao: null,
      campos: ["preco", "idade"], imagem: "uso real em corpo adulto", exige: ["2 parágrafos"],
    })
    expect(normalizarRequisitos({ n_itens: 1 })).toMatchObject({ n_itens: { min: 1, max: 1 } })
    expect(normalizarRequisitos({ cupom: null, campos: [], exige: [] })).toBeNull()
    expect(normalizarRequisitos("x")).toBeNull()
    expect(normalizarRequisitos(null)).toBeNull()
  })
  it("normalizarOutput carrega requisitos só onde o modelo declarou", () => {
    const o = normalizarOutput({
      estrutura: [
        { section: "hero", papel: "apresenta", requisitos: { cupom: false, cta: false } },
        { section: "products", papel: "vitrine", requisitos: { n_itens: { min: 2, max: 3 }, campos: ["preco", "avaliacao"] } },
        { section: "reviews", papel: "prova" },
      ],
    })
    expect(o.estrutura[0].requisitos).toMatchObject({ cupom: false, cta: false })
    expect(o.estrutura[1].requisitos).toMatchObject({ n_itens: { min: 2, max: 3 }, campos: ["preco", "avaliacao"] })
    expect(o.estrutura[2].requisitos).toBeUndefined()
  })
  it("o system pede requisitos por posição e explica a capacidade das seções", () => {
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain("REQUISITOS por posição")
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain('"requisitos":{"cupom":null')
    expect(DEFAULT_ESTRUTURADOR_SYSTEM).toContain("Não exija o que não existe")
  })
})
