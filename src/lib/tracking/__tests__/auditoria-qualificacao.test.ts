import { describe, expect, it } from "vitest"
import { auditarQualificacao, type CampoComOpcoes } from "../auditoria-qualificacao"
import type { QualifiedLeadConfig } from "@/types/form-tracking"

/** O campo real do "Pagina de vendas", medido em produção em 17/09. */
const FATURAMENTO: CampoComOpcoes = {
  id: "b645918f-83cd-42a6-8025-3053261a4506",
  label: "Qual sua média de faturamento mensal?",
  options: [
    "R$0 - R$99.000",
    "R$100.000 - R$300.000",
    "R$500.000 - R$1 milhão",
    "R$1 milhão - R$5 milhões",
  ],
}

/** A regra real gravada em `tracking_config`, medida no mesmo dia. */
const CONFIG_REAL: QualifiedLeadConfig = {
  enabled: true,
  logic: "or",
  event_name: "LeadQualificado",
  rules: [
    {
      field_id: FATURAMENTO.id,
      field_label: FATURAMENTO.label!,
      operator: "in",
      value: ["R$100.000 - R$300.000", "R$500.000 - R$1 milhão", "R$1 milhão - R$5 milhões"],
    },
  ],
}

describe("auditarQualificacao", () => {
  it("sobre a config REAL: nenhum valor órfão, e só a faixa de baixo não dispara", () => {
    const a = auditarQualificacao(CONFIG_REAL, [FATURAMENTO])
    expect(a.auditavel).toBe(true)
    // A regra lista exatamente 3 das 4 opções — nada aponta para texto inexistente.
    expect(a.regras[0].valores_orfaos).toEqual([])
    expect(a.avisos).toEqual([])
    expect(a.respostas_que_nao_disparam).toEqual([
      { campo: FATURAMENTO.label, opcao: "R$0 - R$99.000" },
    ])
    expect(a.respostas_que_disparam).toHaveLength(3)
  })

  it("valor órfão: alguém renomeia a opção e a regra morre em silêncio", () => {
    const renomeado: CampoComOpcoes = {
      ...FATURAMENTO,
      options: ["R$0 - R$99.000", "R$100 mil a R$300 mil", "R$500.000 - R$1 milhão"],
    }
    const a = auditarQualificacao(CONFIG_REAL, [renomeado])
    expect(a.regras[0].valores_orfaos).toContain("R$100.000 - R$300.000")
    expect(a.avisos.join(" ")).toMatch(/não existe entre as opções/)
    // e a opção renomeada passa a NÃO disparar — que é o prejuízo real
    expect(a.respostas_que_nao_disparam.map((r) => r.opcao)).toContain("R$100 mil a R$300 mil")
  })

  it("opção descoberta: a faixa que ninguém aceita aparece nomeada", () => {
    const comFaixaNova: CampoComOpcoes = {
      ...FATURAMENTO,
      options: [...FATURAMENTO.options, "R$300.000 - R$500.000"],
    }
    const a = auditarQualificacao(CONFIG_REAL, [comFaixaNova])
    expect(a.regras[0].opcoes_descobertas).toContain("R$300.000 - R$500.000")
    expect(a.respostas_que_nao_disparam.map((r) => r.opcao)).toContain("R$300.000 - R$500.000")
  })

  it("compara sem caixa e sem acento — a mesma régua do executor", () => {
    const acentuado: CampoComOpcoes = {
      id: "f1",
      label: "Cidade",
      options: ["São Paulo", "Rio de Janeiro"],
    }
    const cfg: QualifiedLeadConfig = {
      enabled: true,
      logic: "or",
      event_name: "X",
      rules: [{ field_id: "f1", operator: "in", value: ["sao paulo"] }],
    }
    const a = auditarQualificacao(cfg, [acentuado])
    expect(a.regras[0].valores_orfaos).toEqual([])
    expect(a.respostas_que_disparam).toEqual([{ campo: "Cidade", opcao: "São Paulo" }])
  })

  it("campo que sumiu vira aviso, não silêncio", () => {
    const a = auditarQualificacao(CONFIG_REAL, [{ id: "outro", label: "Outro", options: ["x"] }])
    expect(a.regras[0].campo_ausente).toBe(true)
    expect(a.avisos.join(" ")).toMatch(/não existe mais/)
  })

  it("operador numérico não é auditado por opção — inventaria erro", () => {
    const cfg: QualifiedLeadConfig = {
      enabled: true,
      logic: "or",
      event_name: "X",
      rules: [{ field_id: "n1", operator: "gte", value: "200000" }],
    }
    const a = auditarQualificacao(cfg, [{ id: "n1", label: "Faturamento", options: [] }])
    expect(a.regras[0].valores_orfaos).toEqual([])
    expect(a.regras[0].opcoes_descobertas).toEqual([])
  })

  it("`not_in` inverte: estar na lista é o que NÃO dispara", () => {
    const cfg: QualifiedLeadConfig = {
      enabled: true,
      logic: "or",
      event_name: "X",
      rules: [{ field_id: FATURAMENTO.id, operator: "not_in", value: ["R$0 - R$99.000"] }],
    }
    const a = auditarQualificacao(cfg, [FATURAMENTO])
    // não faz sentido cobrar "opção descoberta" num operador de exclusão
    expect(a.regras[0].opcoes_descobertas).toEqual([])
    expect(a.respostas_que_nao_disparam.map((o) => o.opcao)).toEqual(["R$0 - R$99.000"])
    expect(a.respostas_que_disparam).toHaveLength(3)
  })

  it("com `and` em dois campos, nenhuma opção sozinha dispara — e isso é informação", () => {
    const campoB: CampoComOpcoes = { id: "f2", label: "Plataforma", options: ["Klaviyo", "Outra"] }
    const cfg: QualifiedLeadConfig = {
      enabled: true,
      logic: "and",
      event_name: "X",
      rules: [
        { field_id: FATURAMENTO.id, operator: "in", value: ["R$1 milhão - R$5 milhões"] },
        { field_id: "f2", operator: "in", value: ["Klaviyo"] },
      ],
    }
    const a = auditarQualificacao(cfg, [FATURAMENTO, campoB])
    expect(a.respostas_que_disparam).toEqual([])
    expect(a.respostas_que_nao_disparam).toHaveLength(6)
  })

  it("evento desligado ou sem regra não é auditável", () => {
    expect(auditarQualificacao({ ...CONFIG_REAL, enabled: false }, [FATURAMENTO]).auditavel).toBe(false)
    expect(auditarQualificacao({ ...CONFIG_REAL, rules: [] }, [FATURAMENTO]).auditavel).toBe(false)
    expect(auditarQualificacao(undefined, [FATURAMENTO]).auditavel).toBe(false)
  })
})
