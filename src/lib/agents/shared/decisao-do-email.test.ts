import { describe, expect, it } from "vitest"
import { mecanicaDoIncentivo } from "../objecoes/incentivo"

import { dedupeProibicoes, lerDecisao, montarDecisao } from "./decisao-do-email"
import { ALVO_HERO_BOXERS_W1, ESTRUTURADOR_HERO_BOXERS_W1 } from "./fixtures/hero-boxers-welcome-1"

const INCENTIVO = {
  existe: true, codigo: "WELCOME10", valor: "10%",
  // A mecânica atravessa a fronteira junto com o código: é ela que diz ao
  // redator que este toque precisa explicar ONDE o cupom se aplica.
  mecanica: mecanicaDoIncentivo(true),
  origem: "outline_traduzido" as const, traducao_faltante: false,
}

describe("montarDecisao — batch 6249aef2 (14/09)", () => {
  it("uma decisão, seis posições, requisitos e descartes preservados", () => {
    const d = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: INCENTIVO })
    expect(d.versao).toBe(1)
    expect(d.posicoes).toHaveLength(6)
    expect(d.posicoes.map((p) => p.section)).toEqual(["hero", "body", "body", "reviews", "products", "footer"])
    expect(d.posicoes[4].requisitos).toMatchObject({ preco: true, n_itens: { min: 2, max: 2 } })
    expect(d.posicoes[0].imagem).toContain("homem 50+")
    expect(d.descartes).toHaveLength(5)
    expect(d.descartes[1]).toMatchObject({ section: "body" })
    expect(d.descartes[1].motivo).toContain("Comparação categoria-vs-loja")
    expect(d.fio_narrativo).toContain("você foi visto")
  })
  it("o alvo vira o resumo tipado e o incentivo é o do toque, não o do alvo antigo", () => {
    const d = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: INCENTIVO })
    expect(d.alvo).toMatchObject({ objecao_id: "obj_1", tipo_de_risco: "seguranca", aliviador: "reputacao_da_loja", profundidade: "afirmacao", dimensao: "integridade" })
    expect(d.alvo?.trabalhos_fixos).toContain("entrega_de_incentivo")
    // O alvo gravado tinha `existe: null` (Catalogador); a decisão carrega o do outline.
    expect(d.incentivo).toEqual(INCENTIVO)
    expect(d.insumos_permitidos).toHaveLength(11)
  })
  it("as 28 proibições em dois idiomas viram uma lista sem pares PT/EN", () => {
    const d = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: INCENTIVO })
    expect(ALVO_HERO_BOXERS_W1.proibido_neste_toque).toHaveLength(29)
    expect(d.proibido.length).toBeLessThan(20)
    // A forma do contrato (PT, primeira) fica; o par em inglês cai.
    expect(d.proibido).toContain("urgência artificial")
    expect(d.proibido).not.toContain("No artificial urgency, countdown or 'offer ends soon'")
    expect(d.proibido).toContain("história longa da fundação (profundidade tem toque próprio)")
    expect(d.proibido).not.toContain("No long founding story — brand origin in two sentences at most, depth has its own touch")
    // Regras de famílias distintas continuam, uma de cada.
    expect(d.proibido.some((x) => /83%/.test(x))).toBe(true)
    // As duas linhas do 83% não são o mesmo par: uma cobre também o padrão de
    // corte (família a mais) — dedupe de menos custa uma linha, de mais apaga regra.
    expect(d.proibido.filter((x) => /83%/.test(x)).length).toBeLessThanOrEqual(2)
    expect(d.proibido.some((x) => /support|suporte/i.test(x))).toBe(true)
  })
  it("sem alvo (Seletor desligado) a decisão nasce só do Estruturador e do incentivo", () => {
    const d = montarDecisao({ alvo: null, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: { ...INCENTIVO, existe: false, codigo: null, origem: "sem_incentivo" } })
    expect(d.alvo).toBeNull()
    expect(d.proibido).toEqual([])
    expect(d.insumos_permitidos).toEqual([])
    expect(d.incentivo.existe).toBe(false)
    expect(d.posicoes).toHaveLength(6)
  })
  it("lerDecisao aceita o que montarDecisao gravou e recusa versão estranha", () => {
    const d = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: INCENTIVO })
    expect(lerDecisao(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(lerDecisao({ versao: 2 })).toBeNull()
    expect(lerDecisao(null)).toBeNull()
  })
})

describe("dedupeProibicoes", () => {
  it("texto igual com pontuação diferente é um só; famílias diferentes não se fundem", () => {
    expect(dedupeProibicoes(["Não prometer prazo.", "não prometer prazo", "sem história de fundação"])).toEqual(["Não prometer prazo.", "sem história de fundação"])
  })
  it("proibição sem família reconhecida só deduplica por texto", () => {
    expect(dedupeProibicoes(["não use verde", "não use azul", "Não use verde"])).toEqual(["não use verde", "não use azul"])
  })
})
