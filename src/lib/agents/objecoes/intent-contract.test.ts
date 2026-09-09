import { describe, it, expect } from "vitest"
import { aliviadorAdmissivel, parseIntentContract, renderIntentContract } from "./intent-contract"
import { TIPOS_DE_RISCO } from "./vocabulario"

describe("parseIntentContract", () => {
  // 07/09: a versão anterior devolvia `null` sem `modo` e o Seletor gravava
  // `skipped` em TODO email — uma etiqueta que ninguém escreveu nas notas
  // desligava o agente. O contrato agora sempre existe; o modo é que pode
  // faltar, e aí quem decide é o Seletor lendo a prosa da intenção.
  it("sem modo o contrato existe, com modo null — nunca se inventa o modo", () => {
    expect(parseIntentContract(null).modo).toBeNull()
    expect(parseIntentContract({ tipo: "intencao", status: "aprovada" }).modo).toBeNull()
    expect(parseIntentContract({ modo: "quebrar_tudo" }).modo).toBeNull()
    // Sem modo e sem catálogo, o resto continua utilizável.
    const c = parseIntentContract(null)
    expect(c.n_objecoes).toEqual([1, 1])
    expect(c.riscos_elegiveis).toEqual([...TIPOS_DE_RISCO])
    expect(c.profundidade_minima).toBe("afirmacao")
  })

  it("welcome-2 (varredura) — campos do §4 da spec tipados", () => {
    const c = parseIntentContract({
      modo: "varredura_de_objecoes",
      n_objecoes: [4, 5],
      fonte_das_objecoes: "nao_atacadas",
      riscos_elegiveis: ["desempenho", "financeiro", "tempo", "adequacao", "seguranca"],
      profundidade_minima: "afirmacao",
      aliviadores_admissiveis: ["todos"],
      aliviadores_vetados: ["prova_de_terceiro"],
      trabalhos_fixos: ["custo_de_adiar_sem_hora"],
      permite_reataque: false,
      proibicoes: ["repetir a tese do toque 1 no mesmo registro", "prazo com hora fechada"],
    })
    expect(c.modo).toBe("varredura_de_objecoes")
    expect(c.n_objecoes).toEqual([4, 5])
    expect(c.riscos_elegiveis).toEqual(["desempenho", "financeiro", "tempo", "adequacao", "seguranca"])
    expect(c.aliviadores_admissiveis).toBe("todos")
    expect(aliviadorAdmissivel(c, "prova_de_terceiro")).toBe(false)
    expect(aliviadorAdmissivel(c, "garantia_de_devolucao")).toBe(true)
    expect(c.proibicoes).toHaveLength(2)
    expect(c.desconhecidos).toEqual([])
  })

  it("defaults por modo: quebra sem riscos declarados aceita todos; confirmação vem de ja_atacadas com prova_de_terceiro e reataque", () => {
    const q = parseIntentContract({ modo: "quebra_de_objecao" })!
    expect(q.n_objecoes).toEqual([1, 1])
    expect(q.riscos_elegiveis).toEqual([...TIPOS_DE_RISCO])
    expect(q.fonte_das_objecoes).toBe("nao_atacadas")
    const conf = parseIntentContract({ modo: "confirmacao_por_terceiros" })!
    expect(conf.fonte_das_objecoes).toBe("ja_atacadas")
    expect(conf.profundidade_minima).toBe("prova_de_terceiro")
    expect(conf.permite_reataque).toBe(true)
    expect(conf.n_objecoes).toEqual([2, 3])
  })

  it("modo sem objeção zera riscos e contagem mesmo que o frontmatter declare", () => {
    const c = parseIntentContract({
      modo: "manutencao_de_confianca",
      riscos_elegiveis: ["desempenho"],
      n_objecoes: [1, 1],
      dimensao_alvo: "benevolencia",
      promessa_a_pagar: "prazo declarado no e-mail de confirmação",
    })
    expect(c.riscos_elegiveis).toEqual([])
    expect(c.n_objecoes).toEqual([0, 0])
    expect(c.dimensao_alvo).toBe("benevolencia")
    expect(c.promessa_a_pagar).toContain("prazo")
  })

  it("riscos_vetados são subtraídos dos elegíveis; valor fora do vocabulário vai para desconhecidos", () => {
    const c = parseIntentContract({
      modo: "quebra_de_objecao",
      riscos_vetados: ["social"],
      trabalhos_fixos: ["entrega_de_incentivo", "dancar"],
      profundidade_minima: "muito_funda",
    })
    expect(c.riscos_elegiveis).not.toContain("social")
    expect(c.trabalhos_fixos).toEqual(["entrega_de_incentivo"])
    expect(c.profundidade_minima).toBe("afirmacao")
    expect(c.desconhecidos.sort()).toEqual(["profundidade_minima: muito_funda", "trabalhos_fixos: dancar"])
  })

  it("n_objecoes aceita escalar e corrige max < min", () => {
    expect(parseIntentContract({ modo: "varredura_de_canal", n_objecoes: 4 })!.n_objecoes).toEqual([4, 4])
    expect(parseIntentContract({ modo: "varredura_de_canal", n_objecoes: [5, 2] })!.n_objecoes).toEqual([5, 5])
  })

  it("renderIntentContract lista só o que existe", () => {
    const txt = renderIntentContract(parseIntentContract({ modo: "quebra_de_objecao", exige_dominante_da_categoria: true, proibicoes: ["x"] })!)
    expect(txt).toContain("- modo: quebra_de_objecao")
    expect(txt).toContain("- exige_dominante_da_categoria: true")
    expect(txt).toContain("- proibicoes:\n  - x")
    expect(txt).not.toContain("veiculos_exigidos")
  })
})

// ── As três fontes (07/09) ──────────────────────────────────────────────
//
// O contrato deixou de ser fonte única. A régua é a Hero Boxers: o catálogo
// dela sustenta 11 dos 15 campos, e a run de 14:06 provou — as proibições e
// os trabalhos fixos daquele alvo saíram do catálogo e da prosa, não do
// frontmatter, que tinha uma chave só.
describe("parseIntentContract — catálogo da loja como fonte", () => {
  const catalogo = {
    objecoes: [
      {
        tipo_de_risco: "seguranca" as const,
        aliviador: "reputacao_da_loja" as const,
        dimensao_confianca: "integridade" as const,
        dominante_da_categoria: true,
        flows_elegiveis: ["welcome", "abandoned_cart"],
        lastro_operacional: { verificado: false },
      },
      {
        tipo_de_risco: "financeiro" as const,
        aliviador: "comparacao_de_categoria" as const,
        dimensao_confianca: "competencia" as const,
        dominante_da_categoria: false,
        flows_elegiveis: ["welcome"],
        lastro_operacional: { verificado: false },
      },
      {
        tipo_de_risco: "tempo" as const,
        aliviador: "transparencia_de_politica" as const,
        dimensao_confianca: "benevolencia" as const,
        dominante_da_categoria: false,
        flows_elegiveis: ["upsell"],
        lastro_operacional: { verificado: false },
      },
    ],
    veiculos_de_argumento: {
      mecanismo_unico: { texto: "bamboo fibre…", aplicavel: true, alerta: "83% não verificado" },
      economia_do_preco: { texto: null, aplicavel: true, alerta: "sem insumo" },
    },
    incentivo: { existe: null, valor: null, codigo: null, alerta: "não afirmar oferta sem confirmação" },
    medos_de_categoria: [{ medo: "prazo", verificado: false, alerta: "não prometer prazo" }],
  }

  it("riscos, aliviadores e dimensão saem do catálogo, filtrados pelo flow", () => {
    const c = parseIntentContract({ frontmatter: {}, catalogo, flowType: "welcome" })
    // A objeção de `upsell` fica de fora — e com ela o risco `tempo`.
    expect(c.riscos_elegiveis).toEqual(["seguranca", "financeiro"])
    expect(c.aliviadores_admissiveis).toEqual(["reputacao_da_loja", "comparacao_de_categoria"])
    expect(c.dimensao_alvo).toBe("integridade")
    expect(c.origens.riscos_elegiveis).toBe("catalogo")
    expect(c.origens.dimensao_alvo).toBe("catalogo")
  })

  it("lastro não verificado é teto de prova", () => {
    const c = parseIntentContract({ frontmatter: {}, catalogo, flowType: "welcome" })
    expect(c.profundidade_minima).toBe("afirmacao")
    expect(c.origens.profundidade_minima).toBe("catalogo")
  })

  it("só veículo COM texto é exigível; alerta vira proibição de redação", () => {
    const c = parseIntentContract({ frontmatter: {}, catalogo, flowType: "welcome" })
    expect(c.veiculos_exigidos).toEqual(["mecanismo_unico"])
    expect(c.proibicoes).toContain("não afirmar oferta sem confirmação")
    expect(c.proibicoes).toContain("não prometer prazo")
    expect(c.proibicoes).toContain("83% não verificado")
  })

  it("incentivo não confirmado NÃO vira promessa", () => {
    const c = parseIntentContract({ frontmatter: {}, catalogo, flowType: "welcome" })
    // `existe: null` é "não dá para saber" — inventar oferta é o pior erro.
    expect(c.promessa_a_pagar).toBeNull()
    const comOferta = parseIntentContract({
      frontmatter: {},
      catalogo: { ...catalogo, incentivo: { existe: true, valor: "10%", codigo: "BEM10", alerta: null } },
      flowType: "welcome",
    })
    expect(comOferta.promessa_a_pagar).toContain("BEM10")
  })

  it("a nota VENCE o catálogo", () => {
    const c = parseIntentContract({
      frontmatter: { riscos_elegiveis: ["adequacao"], profundidade_minima: "prova_de_terceiro" },
      catalogo,
      flowType: "welcome",
    })
    expect(c.riscos_elegiveis).toEqual(["adequacao"])
    expect(c.profundidade_minima).toBe("prova_de_terceiro")
    expect(c.origens.riscos_elegiveis).toBe("nota")
    expect(c.origens.profundidade_minima).toBe("nota")
  })

  it("o bloco do prompt diz quando o modo não foi declarado e de onde veio cada campo", () => {
    const b = renderIntentContract(parseIntentContract({ frontmatter: {}, catalogo, flowType: "welcome" }))
    expect(b).toContain("NÃO DECLARADO")
    expect(b).toContain("origem dos campos")
    expect(b).toContain("riscos_elegiveis=catalogo")
  })
})

describe("proibições deduplicadas por chave (09/09)", () => {
  it("nota e catálogo com a mesma regra em redações diferentes → uma só", () => {
    const c = parseIntentContract({ modo: "quebra_de_objecao", proibicoes: ["Não prometer prazo.", "não prometer prazo", "urgência artificial"] })!
    expect(c.proibicoes).toEqual(["Não prometer prazo.", "urgência artificial"])
  })
})
