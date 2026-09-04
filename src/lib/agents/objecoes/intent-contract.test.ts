import { describe, it, expect } from "vitest"
import { aliviadorAdmissivel, parseIntentContract, renderIntentContract } from "./intent-contract"
import { TIPOS_DE_RISCO } from "./vocabulario"

describe("parseIntentContract", () => {
  it("sem modo válido não há contrato — nunca se inventa", () => {
    expect(parseIntentContract(null)).toBeNull()
    expect(parseIntentContract({ tipo: "intencao", status: "aprovada" })).toBeNull()
    expect(parseIntentContract({ modo: "quebrar_tudo" })).toBeNull()
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
    })!
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
    })!
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
    })!
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
