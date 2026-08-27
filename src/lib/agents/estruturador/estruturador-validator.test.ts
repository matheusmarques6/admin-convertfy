import { describe, it, expect } from "vitest"
import { validarOutput, type ValidacaoInput } from "./estruturador-validator"
import { buildSystemVars, wrapDocs } from "./estruturador-prompt"

const CAPACIDADE = {
  porCategoria: { hero: 9, body: 9, products: 9, reviews: 7, footer: 4 },
  produtosDaLoja: 5,
}

const REFS = ["avelmore-inspecao-antecipada", "medicube-comparacao-categoria"]
const APRS = ["prova-de-terceiro-antes-do-cta"]

function outputValido() {
  return {
    diagnostico: {
      objecao_dominante: "Eficácia — funciona mesmo?",
      referencia_base: "avelmore-inspecao-antecipada",
      traducao_do_mecanismo: "Inspeção vira demonstração + garantia",
    },
    estrutura: [
      { section: "hero", papel: "Entregar o cupom em 3s", referencia: "avelmore-inspecao-antecipada", porque: "regra 1 do flow" },
      { section: "body", papel: "O pivô", referencia: "avelmore-inspecao-antecipada", porque: "ICP prova-antes" },
      { section: "reviews", papel: "Terceiro confirma", referencia: "avelmore-inspecao-antecipada", porque: "fecha o arco" },
      { section: "products", papel: "Aterrissa a tese", referencia: "avelmore-inspecao-antecipada", porque: "grade = amplitude" },
      { section: "footer", papel: "Rota de saída", referencia: "avelmore-inspecao-antecipada", porque: "padrão" },
    ],
    fio_narrativo: "cupom → dúvida nomeada → prova → produto → saída",
    fontes: [{ ref: "avelmore-inspecao-antecipada", o_que_pegou: "arco completo", porque: "objeção análoga" }],
    aprendizados_aplicados: [{ slug: "prova-de-terceiro-antes-do-cta", como: "reviews antes da grade" }],
    text_only: false,
    descartes: [] as Array<{
      section: string | null
      papel_na_referencia: string | null
      porque: string
      origem: "modelo" | "validador"
    }>,
  }
}

function valida(output: unknown, extra?: Partial<ValidacaoInput>) {
  return validarOutput({
    output,
    refsServidas: REFS,
    aprendizadosServidos: APRS,
    capacidade: CAPACIDADE,
    sequenciasProibidas: [],
    ...extra,
  })
}

describe("validarOutput — caminho feliz", () => {
  it("output válido passa e sai com descartes de shape único", () => {
    const r = valida(outputValido())
    expect(r.ok).toBe(true)
    expect(r.saida?.estrutura).toHaveLength(5)
    expect(r.errosFatais).toEqual([])
  })
})

describe("fatais — justificativa dupla e anti-alucinação", () => {
  it("posição sem referencia+porque reprova o output INTEIRO (retry)", () => {
    const o = outputValido()
    // @ts-expect-error teste de shape inválido
    delete o.estrutura[1].porque
    const r = valida(o)
    expect(r.ok).toBe(false)
    expect(r.errosFatais.join(" ")).toContain("obrigatórios")
  })

  it("referencia inventada (fora dos embrulhos servidos) é fatal", () => {
    const o = outputValido()
    o.estrutura[0].referencia = "ref-que-nao-existe"
    const r = valida(o)
    expect(r.ok).toBe(false)
    expect(r.errosFatais.join(" ")).toContain("não está entre as servidas")
  })

  it("aprendizado alucinado é fatal", () => {
    const o = outputValido()
    o.aprendizados_aplicados = [{ slug: "aprendizado-fantasma", como: "x" }]
    const r = valida(o)
    expect(r.ok).toBe(false)
  })

  it("JSON que não é objeto é fatal", () => {
    expect(valida(null).ok).toBe(false)
    expect(valida("texto").ok).toBe(false)
  })
})

describe("removíveis — origem: validador", () => {
  it("header/cta emitidos apesar da proibição são removidos, não fatais", () => {
    const o = outputValido()
    o.estrutura.unshift({
      section: "header", papel: "logo", referencia: REFS[0], porque: "x",
    })
    const r = valida(o)
    expect(r.ok).toBe(true)
    expect(r.saida?.estrutura.map((p) => p.section)).not.toContain("header")
    const d = r.saida?.descartes.find((d) => d.section === "header")
    expect(d?.origem).toBe("validador")
  })

  it("seção sem variante preenchível (offer hoje) → descartada com demanda registrada", () => {
    const o = outputValido()
    o.estrutura.splice(1, 0, {
      section: "offer", papel: "o motor de prazo", referencia: REFS[0], porque: "x",
    })
    const r = valida(o)
    expect(r.ok).toBe(true)
    const d = r.saida?.descartes.find((d) => d.section === "offer")
    expect(d?.origem).toBe("validador")
    expect(d?.porque).toContain("curadoria")
  })

  it("descartes do modelo e do validador convivem no shape único", () => {
    const o = outputValido()
    o.descartes = [{ section: null, papel_na_referencia: "faixa escura", porque: "sem variante", origem: "modelo" as const }]
    o.estrutura.push({ section: "cta", papel: "isolado", referencia: REFS[0], porque: "x" })
    const r = valida(o)
    expect(r.ok).toBe(true)
    expect(r.saida?.descartes.map((d) => d.origem).sort()).toEqual(["modelo", "validador"])
  })

  it("tudo removido → fatal (nenhuma posição construível)", () => {
    const o = outputValido()
    o.estrutura = [{ section: "offer", papel: "x", referencia: REFS[0], porque: "y" }]
    const r = valida(o)
    expect(r.ok).toBe(false)
    expect(r.errosFatais.join(" ")).toContain("nenhuma posição construível")
  })
})

describe("anti-repetição em código", () => {
  it("sequência idêntica a uma proibida é fatal", () => {
    const o = outputValido()
    const r = valida(o, {
      sequenciasProibidas: [["hero", "body", "reviews", "products", "footer"]],
    })
    expect(r.ok).toBe(false)
    expect(r.errosFatais.join(" ")).toContain("repete uma estrutura recente")
  })

  it("a comparação é PÓS-filtro: header removido não descola a sequência", () => {
    const o = outputValido()
    o.estrutura.unshift({ section: "header", papel: "x", referencia: REFS[0], porque: "y" })
    const r = valida(o, {
      sequenciasProibidas: [["hero", "body", "reviews", "products", "footer"]],
    })
    expect(r.ok).toBe(false) // ainda colide — o header não conta
  })

  it("sequência diferente passa", () => {
    const o = outputValido()
    const r = valida(o, { sequenciasProibidas: [["hero", "products", "footer"]] })
    expect(r.ok).toBe(true)
  })
})

describe("prompt — embrulho de slugs", () => {
  it("wrapDocs embrulha cada documento com o slug do arquivo", () => {
    const out = wrapDocs("referencia", [
      { slug: "a", body: "corpo A" },
      { slug: "b", body: "corpo B" },
    ])
    expect(out).toContain('<referencia slug="a">')
    expect(out).toContain('<referencia slug="b">')
    expect(out).toContain("corpo B")
  })

  it("buildSystemVars declara ausência em vez de string vazia", () => {
    const v = buildSystemVars({ intencaoFlow: null, progressao: null, referencias: [], aprendizados: [] })
    expect(v.intencao_flow).toContain("sem intenção")
    expect(v.referencias).toBe("(nenhum)")
  })
})

// O bug que manteve o Estruturador reprovando 100% das runs desde que
// nasceu: o serviço passava ao validador o retorno de `extractJson`, que é
// STRING, e não o objeto. Como `ValidacaoInput.output` é `unknown`, o
// compilador não pegou — e o primeiro teste do validador (`typeof !==
// "object"`) reprovava sempre, com uma mensagem que culpava o modelo.
describe("validarOutput — a entrada tem de ser objeto, não texto", () => {
  it("string de JSON (saída crua do extractJson) é reprovada", () => {
    const r = valida(JSON.stringify(outputValido()))
    expect(r.ok).toBe(false)
    expect(r.errosFatais).toContain("output não é um objeto JSON")
  })

  it("o MESMO conteúdo, já parseado, passa", () => {
    const r = valida(JSON.parse(JSON.stringify(outputValido())))
    expect(r.ok).toBe(true)
  })
})
