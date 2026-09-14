import { describe, it, expect } from "vitest"
import { resumirContrato, type ContratoResumo } from "../field-roles"
import { montarDecisao, type DecisaoDoEmail } from "../decisao-do-email"
import { ALVO_HERO_BOXERS_W1, ESTRUTURADOR_HERO_BOXERS_W1 } from "../fixtures/hero-boxers-welcome-1"
import type { DecisaoDeIncentivo } from "../../objecoes/incentivo"
import { validarEscolhas } from "./escolhas"
import { validarResgate } from "./resgate"
import { validarBlueprint } from "./blueprint"

const schema = (...keys: string[]): Array<{ key: string; type: string; omitir?: boolean }> => keys.map((key) => ({ key, type: "text_short" }))

/** Contratos das variantes reais citadas no plano (anatomia resumida). */
const CONTRATOS: Record<string, ContratoResumo> = {
  "hero-3-cupom": resumirContrato(schema("hero_headline", "hero_subhead", "coupon_line", "cta_label", "hero_image")),
  "hero-7-limpa": resumirContrato(schema("hero_headline", "hero_subhead", "cta_label")),
  "body-4": resumirContrato(schema("headline", "feature_1_title", "feature_2_title", "feature_3_title", "cta_label")),
  "reviews-2": resumirContrato(schema("review_1_quote", "review_1_name", "review_1_context", "review_2_quote", "review_2_name")),
  "products-7-sem-preco": resumirContrato(schema("panel_1_title", "panel_1_cta", "panel_2_title", "panel_2_cta")),
  "products-4-um-item": resumirContrato(schema("product_1_title", "product_1_price_new", "product_1_price_old", "badge_deadline", "product_cta_label_1")),
  "products-2-com-preco": resumirContrato(schema("product_1_title", "product_1_price", "product_2_title", "product_2_price", "product_cta_label_1")),
  "footer-1": resumirContrato(schema("footer_nav", "footer_support")),
}
const POR_ID = new Map(Object.entries(CONTRATOS))

const SEM: DecisaoDeIncentivo = { existe: false, codigo: null, valor: null, origem: "sem_incentivo", traducao_faltante: false }
const COM: DecisaoDeIncentivo = { existe: true, codigo: "WELCOME10", valor: "10%", origem: "outline_traduzido", traducao_faltante: false }

const decisao = (incentivo: DecisaoDeIncentivo, patch?: (d: DecisaoDoEmail) => void): DecisaoDoEmail => {
  const d = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo })
  patch?.(d)
  return d
}

// Posições da fixture: 0 hero · 1 body · 2 body · 3 reviews · 4 products · 5 footer
const ESCOLHA_BOA = [
  { block_index: 0, variant_id: "hero-7-limpa" },
  { block_index: 1, variant_id: "body-4" },
  { block_index: 2, variant_id: "body-4" },
  { block_index: 3, variant_id: "reviews-2" },
  { block_index: 4, variant_id: "products-2-com-preco" },
  { block_index: 5, variant_id: "footer-1" },
]

describe("validarEscolhas", () => {
  it("a composição coerente com a decisão passa sem violação (body repetido é permitido)", () => {
    const r = validarEscolhas(decisao(SEM), ESCOLHA_BOA, POR_ID)
    expect(r.violacoes).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.regra_pendente).toEqual([])
  })

  it("(i) hero com slot de cupom numa peça sem incentivo é high — pelo requisito E pelo incentivo", () => {
    const r = validarEscolhas(decisao(SEM), [{ block_index: 0, variant_id: "hero-3-cupom" }], POR_ID)
    expect(r.ok).toBe(false)
    expect(r.violacoes.map((v) => v.tipo)).toEqual(["requisito_violado"])
    expect(r.violacoes[0].evidencia).toContain("cupom")
  })

  it("(i-b) cupom:null na posição + incentivo.existe:false → cupom_sem_incentivo (o requisito calou, a decisão não)", () => {
    const d = decisao(SEM, (x) => { x.posicoes[0].requisitos!.cupom = null })
    const r = validarEscolhas(d, [{ block_index: 0, variant_id: "hero-3-cupom" }], POR_ID)
    expect(r.violacoes.map((v) => v.tipo)).toEqual(["cupom_sem_incentivo"])
    expect(r.violacoes[0].severidade).toBe("high")
  })

  it("com incentivo e cupom:true, a hero de cupom é a certa e a limpa viola", () => {
    const d = decisao(COM, (x) => { x.posicoes[0].requisitos!.cupom = true })
    expect(validarEscolhas(d, [{ block_index: 0, variant_id: "hero-3-cupom" }], POR_ID).violacoes).toEqual([])
    const r = validarEscolhas(d, [{ block_index: 0, variant_id: "hero-7-limpa" }], POR_ID)
    expect(r.violacoes[0]).toMatchObject({ tipo: "requisito_violado", severidade: "high" })
  })

  it("(iii) products-7 sem preço com preco:true é violação de REDAÇÃO (medium) — passa em ok", () => {
    const r = validarEscolhas(decisao(SEM), [{ block_index: 4, variant_id: "products-7-sem-preco" }], POR_ID)
    expect(r.violacoes).toHaveLength(1)
    expect(r.violacoes[0]).toMatchObject({ tipo: "requisito_violado", severidade: "medium" })
    expect(r.ok).toBe(true)
  })

  it("products-4 (1 item, preço riscado, prazo) contra n_itens 2–2 é anatomia: high", () => {
    const r = validarEscolhas(decisao(SEM), [{ block_index: 4, variant_id: "products-4-um-item" }], POR_ID)
    expect(r.violacoes.map((v) => [v.tipo, v.severidade])).toEqual([["requisito_violado", "high"]])
    expect(r.violacoes[0].evidencia).toContain("no mínimo 2")
  })

  it("(iv) a mesma variante em duas posições de hero/products é high; em body não", () => {
    const d = decisao(SEM, (x) => { x.posicoes[1].section = "products"; x.posicoes[1].requisitos = null })
    const r = validarEscolhas(d, [
      { block_index: 1, variant_id: "products-2-com-preco" },
      { block_index: 4, variant_id: "products-2-com-preco" },
    ], POR_ID)
    expect(r.violacoes.map((v) => v.tipo)).toEqual(["variante_repetida"])
    expect(r.violacoes[0].block_index).toBe(4)
  })

  it("variante sem contrato conhecido não gera violação (fail-open declarado)", () => {
    expect(validarEscolhas(decisao(SEM), [{ block_index: 0, variant_id: "desconhecida" }], POR_ID).violacoes).toEqual([])
  })

  it("(ii) body-4 (body_comparacao) na posição que pede body_tese é HIGH — a regra deixou de ser pendente (B3)", () => {
    const d = decisao(SEM)
    expect(d.descartes.some((x) => /compara/i.test(x.motivo))).toBe(true)
    expect(d.posicoes[1].dispositivo).toBe("body_tese")
    const comDisp = new Map(POR_ID)
    comDisp.set("body-4", { ...CONTRATOS["body-4"], dispositivo: "body_comparacao" })
    const r = validarEscolhas(d, [{ block_index: 1, variant_id: "body-4" }], comDisp)
    expect(r.violacoes.map((v) => [v.tipo, v.severidade])).toEqual([["requisito_violado", "high"]])
    expect(r.violacoes[0].evidencia).toBe("dispositivo body_comparacao e a decisão pede body_tese")
    expect(r.regra_pendente).toEqual([])
    // Variante ainda não classificada não conflita (fail-open declarado).
    expect(validarEscolhas(d, [{ block_index: 1, variant_id: "body-4" }], POR_ID).violacoes).toEqual([])
  })
})

describe("validarResgate", () => {
  it("resgate com concessão de redação (sem preço) é aceito; com cupom sem incentivo é recusado", () => {
    const ok = validarResgate(decisao(SEM), { block_index: 4, variant_id: "products-7-sem-preco" }, CONTRATOS["products-7-sem-preco"])
    expect(ok.ok).toBe(true)
    expect(ok.violacoes[0].tipo).toBe("resgate_requisito_violado")
    const nao = validarResgate(decisao(SEM), { block_index: 0, variant_id: "hero-3-cupom" }, CONTRATOS["hero-3-cupom"])
    expect(nao.ok).toBe(false)
  })
})

describe("validarBlueprint", () => {
  const blocks = [
    { variant_id: "hero-3-cupom", purpose: "Boas-vindas. Forma: linha do cupom — o código em bold", fields: schema("hero_headline", "coupon_line", "cta_label") },
    { variant_id: "body-4", purpose: "pivô", fields: schema("headline", "item_1") },
    { variant_id: "body-4", purpose: "risco", fields: schema("headline") },
    { variant_id: "reviews-2", purpose: "prova", fields: schema("review_1_quote") },
    { variant_id: "products-4-um-item", purpose: "grade", fields: schema("product_1_title", "product_1_price_new", "product_1_price_old", "badge_deadline") },
    { variant_id: "footer-1", purpose: "saída", fields: schema("footer_nav") },
  ]

  it("sem incentivo: campos de cupom, preço riscado e prazo viram omitir; preço vigente fica; purpose com oferta é medium", () => {
    const r = validarBlueprint(decisao(SEM, (x) => { x.posicoes[0].requisitos!.cupom = null }), blocks, { corrigir: true })
    expect(r.omitidos.map((o) => o.key)).toEqual(["coupon_line", "product_1_price_old", "badge_deadline"])
    expect(r.blocks[4].fields!.find((f) => f.key === "product_1_price_new")!.omitir).toBeUndefined()
    expect(r.violacoes.filter((v) => v.severidade === "high")).toHaveLength(3)
    expect(r.violacoes.find((v) => v.tipo === "purpose_com_oferta")).toMatchObject({ block_index: 0, severidade: "medium" })
    expect(r.blocks[1]).toBe(blocks[1]) // bloco intocado mantém a referência
  })

  it("em shadow (corrigir:false) acusa e não mexe", () => {
    const r = validarBlueprint(decisao(SEM), blocks, { corrigir: false })
    expect(r.omitidos).toEqual([])
    expect(r.blocks[0].fields![1].omitir).toBeUndefined()
    expect(r.ok).toBe(false)
  })

  it("com incentivo nada é omitido; cta:false com campo de CTA a preencher é high", () => {
    const d = decisao(COM, (x) => { x.posicoes[0].requisitos!.cta = false })
    const r = validarBlueprint(d, blocks, { corrigir: true })
    expect(r.omitidos).toEqual([])
    expect(r.violacoes.map((v) => v.tipo)).toEqual(["cta_negado_com_campo"])
  })

  it("blocos desalinhados com as posições: só as regras de incentivo rodam", () => {
    const d = decisao(SEM, (x) => { x.posicoes[0].requisitos!.cta = false })
    const r = validarBlueprint(d, blocks.slice(0, 2), { corrigir: true })
    expect(r.violacoes.map((v) => v.tipo)).not.toContain("cta_negado_com_campo")
    expect(r.omitidos.map((o) => o.key)).toEqual(["coupon_line"])
  })
})
