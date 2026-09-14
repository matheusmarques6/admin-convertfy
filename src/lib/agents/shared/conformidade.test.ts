import { describe, expect, it } from "vitest"

import { montarDecisao } from "./decisao-do-email"
import { resumirContrato, type ContratoResumo } from "./field-roles"
import { ALVO_HERO_BOXERS_W1, ESTRUTURADOR_HERO_BOXERS_W1 } from "./fixtures/hero-boxers-welcome-1"
import { custoAteDivergencia, montarConformidade, type PosicaoCrua } from "./conformidade"

const schema = (...keys: string[]) => keys.map((key) => ({ key, type: "text_short" }))
/** Contratos das variantes REAIS entregues no batch 6249aef2 (ids do banco). */
const CONTRATOS = new Map<string, ContratoResumo>([
  ["3e241d7f-5f84-4017-a553-880736a450dc", resumirContrato(schema("hero_headline", "hero_subhead", "coupon_line", "cta_label", "hero_image"))], // hero 3 (cupom)
  ["4e9726d1-40fe-40ce-aa81-c2a33b062603", resumirContrato(schema("headline", "feature_1_title", "feature_2_title", "feature_3_title", "cta_label"))], // body 3 (3 cards)
  ["63736c6c-7d1b-4c7c-83ea-bae15599f1d7", resumirContrato(schema("headline", "feature_1_title", "feature_2_title", "feature_3_title", "cta_label"))], // body 4
  ["7dafa6ca-65de-4907-b52c-dad83ecd63a4", resumirContrato(schema("review_1_quote", "review_1_name", "review_1_rating", "review_2_quote", "review_2_name"))], // review
  ["cee34b0a-030c-43df-93b6-c54de6f00569", resumirContrato(schema("panel_1_title", "panel_1_cta", "panel_2_title", "panel_2_cta"))], // produtos 7 (sem preço)
  ["35b5d8fd-59b5-4e0f-92ab-a180745242e0", resumirContrato(schema("footer_nav", "footer_support"))], // footer
])
const IDS = Array.from(CONTRATOS.keys())

const SEM = { existe: false, codigo: null, valor: null, origem: "sem_incentivo" as const, traducao_faltante: false }

/** As seis posições como o banco as guarda para o batch: ids iguais nas quatro colunas, sem `_contrato`. */
const posicoesDoBatch = (): PosicaoCrua[] =>
  IDS.map((id, i) => ({
    block_index: i,
    variante_curador: id,
    variante_blueprint: id,
    variante_montada: id,
    variante_entregue: id,
    contrato_presente: false,
  }))

describe("montarConformidade — batch 6249aef2, retroativo", () => {
  const decisao = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: SEM })
  const { linhas, resumo } = montarConformidade({ posicoes: posicoesDoBatch(), decisao, contratoPorId: CONTRATOS })

  it("a hero com slot de cupom numa decisão sem incentivo é divergente, e o nó é o Curador", () => {
    expect(linhas[0].estado).toBe("divergente")
    expect(linhas[0].no_responsavel).toBe("assembler_chooser")
    expect(linhas[0].violacoes.map((v) => [v.tipo, v.origem])).toEqual([["requisito_violado", "retroativa"]])
  })

  it("products-7 sem preço contra preco:true é divergente (redação, medium) — o nó é o Curador", () => {
    expect(linhas[4].estado).toBe("divergente")
    expect(linhas[4].violacoes[0]).toMatchObject({ severidade: "medium", origem: "retroativa" })
    expect(linhas[4].no_responsavel).toBe("assembler_chooser")
  })

  it("as demais são conformes pela régua atual, com o dispositivo declarado pendente", () => {
    for (const i of [1, 2, 3, 5]) {
      expect(linhas[i].estado).toBe("conforme")
      expect(linhas[i].regra_pendente).toEqual(["dispositivo"])
    }
    expect(resumo).toEqual({ posicoes: 6, conformes: 4, divergentes: 2, nao_avaliadas: 0, por_no: { assembler_chooser: 2 } })
  })
})

describe("montarConformidade — fronteiras", () => {
  const decisao = montarDecisao({ alvo: ALVO_HERO_BOXERS_W1, estruturador: ESTRUTURADOR_HERO_BOXERS_W1, incentivo: SEM })

  it("sem decisão nada é avaliado — nem com ids iguais", () => {
    const { linhas, resumo } = montarConformidade({ posicoes: posicoesDoBatch(), decisao: null })
    expect(linhas.every((l) => l.estado === "nao_avaliada")).toBe(true)
    expect(linhas[0].motivo).toContain("anterior ao contrato")
    expect(resumo.nao_avaliadas).toBe(6)
  })

  it("a primeira fronteira em que a variante muda de mãos é o nó responsável", () => {
    const base = posicoesDoBatch().slice(1, 2)
    const bp = { ...base[0], variante_blueprint: "outra", contrato_presente: true }
    expect(montarConformidade({ posicoes: [bp], decisao }).linhas[0]).toMatchObject({ estado: "divergente", no_responsavel: "blueprint" })
    const mont = { ...base[0], variante_montada: "outra", contrato_presente: true }
    expect(montarConformidade({ posicoes: [mont], decisao }).linhas[0].no_responsavel).toBe("assembler")
    const seed = { ...base[0], variante_entregue: "outra", contrato_presente: true }
    expect(montarConformidade({ posicoes: [seed], decisao }).linhas[0].no_responsavel).toBe("seed")
  })

  it("violação gravada em `_contrato` vale como está; resgate aponta o Montador, copy aponta a Copy", () => {
    const p: PosicaoCrua = {
      ...posicoesDoBatch()[3],
      contrato_presente: true,
      violacoes: [
        { tipo: "resgate_requisito_violado", severidade: "medium", block_index: 3, section: "reviews", variant_id: "x", evidencia: "sem avaliação", esperado: "{}", origem: "assembler" },
      ],
    }
    expect(montarConformidade({ posicoes: [p], decisao }).linhas[0].no_responsavel).toBe("assembler")
    const c: PosicaoCrua = {
      ...p,
      violacoes: [{ tipo: "percentual_diverge", severidade: "high", block_index: 3, section: "reviews", variant_id: "x", evidencia: "15%", esperado: "10%", origem: "copy" }],
    }
    expect(montarConformidade({ posicoes: [c], decisao }).linhas[0].no_responsavel).toBe("copy")
  })

  it("com `_contrato` gravado e zero violações a posição é conforme", () => {
    const p = { ...posicoesDoBatch()[1], contrato_presente: true, regra_pendente: ["dispositivo"] }
    expect(montarConformidade({ posicoes: [p], decisao }).linhas[0]).toMatchObject({ estado: "conforme", no_responsavel: null })
  })

  it("custo até a divergência soma as runs até a do nó responsável, inclusive", () => {
    const { linhas } = montarConformidade({ posicoes: posicoesDoBatch(), decisao, contratoPorId: CONTRATOS })
    const runs = [
      { agent: "seletor", cost_cents: 10, created_at: "2026-09-11T00:00:01Z" },
      { agent: "estruturador", cost_cents: 20, created_at: "2026-09-11T00:00:02Z" },
      { agent: "assembler_chooser", cost_cents: 30, created_at: "2026-09-11T00:00:03Z" },
      { agent: "blueprint", cost_cents: 40, created_at: "2026-09-11T00:00:04Z" },
    ]
    expect(custoAteDivergencia(linhas, runs)).toBe(60)
    expect(custoAteDivergencia(linhas.map((l) => ({ ...l, no_responsavel: null })), runs)).toBeNull()
  })
})
