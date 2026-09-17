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

describe("régua por piso derivado", () => {
  // O que o funil multimoeda faz: a condição deixa de comparar texto e
  // passa a comparar o piso em real que o servidor calcula.
  const FAIXAS: CampoComOpcoes = {
    id: "f1",
    label: "Faturamento mensal",
    options: [
      "Até R$100k",
      "R$100k – R$200k",
      "R$200k – R$500k",
      "Até US$20k",
      "US$20k – US$50k",
      "US$50k – US$100k",
    ],
    derivados: [
      {
        ref: "f1__piso_brl",
        label: "Faturamento mensal — equivalente em R$",
        porOpcao: {
          "Até R$100k": 0,
          "R$100k – R$200k": 100_000,
          "R$200k – R$500k": 200_000,
          "Até US$20k": 0,
          "US$20k – US$50k": 100_000,
          "US$50k – US$100k": 250_000,
        },
      },
    ],
  }
  const PISO: CampoComOpcoes = {
    id: "f1__piso_brl",
    label: "Faturamento mensal — equivalente em R$",
    options: [],
    derivado: true,
  }
  const CFG = {
    enabled: true,
    event_name: "LeadQualificado",
    logic: "and" as const,
    rules: [{ field_id: "f1__piso_brl", operator: "gte" as const, value: "200000" }],
  }

  it("a regra do piso NÃO é campo ausente", () => {
    // Antes, a condição apontava para um endereço fora da lista e a tela
    // acusava "campo que não existe mais" sobre o mecanismo funcionando.
    const a = auditarQualificacao(CFG, [FAIXAS, PISO])
    expect(a.regras[0].campo_ausente).toBe(false)
    expect(a.avisos).toEqual([])
  })

  it("a simulação fala em FAIXAS, não em números", () => {
    const a = auditarQualificacao(CFG, [FAIXAS, PISO])
    const disparam = a.respostas_que_disparam.map((r) => r.opcao)
    expect(disparam).toContain("R$200k – R$500k")
    expect(disparam).toContain("US$50k – US$100k")
    expect(a.respostas_que_disparam.every((r) => r.campo === "Faturamento mensal")).toBe(true)
  })

  it("a loja de US$50k qualifica — era ela que o corte em real perdia", () => {
    const a = auditarQualificacao(CFG, [FAIXAS, PISO])
    expect(a.respostas_que_disparam.some((r) => r.opcao === "US$50k – US$100k")).toBe(true)
    expect(a.respostas_que_nao_disparam.some((r) => r.opcao === "US$20k – US$50k")).toBe(true)
  })

  it("o campo derivado não é simulado sozinho", () => {
    // Ele não tem opção que alguém possa escolher; listá-lo mostraria
    // "250000 dispara", que ensina a operar pelo número.
    const a = auditarQualificacao(CFG, [FAIXAS, PISO])
    const campos = new Set(
      [...a.respostas_que_disparam, ...a.respostas_que_nao_disparam].map((r) => r.campo),
    )
    expect(campos.has("Faturamento mensal — equivalente em R$")).toBe(false)
  })

  it("opção sem piso não vira zero — ela simplesmente não dispara", () => {
    const semPiso: CampoComOpcoes = {
      ...FAIXAS,
      options: [...FAIXAS.options, "Prefiro não dizer"],
    }
    const a = auditarQualificacao(CFG, [semPiso, PISO])
    expect(a.respostas_que_nao_disparam.some((r) => r.opcao === "Prefiro não dizer")).toBe(true)
    expect(a.respostas_que_disparam.some((r) => r.opcao === "Prefiro não dizer")).toBe(false)
  })

  it("mover o corte move a linha, e a tela mostra para onde", () => {
    const maior = { ...CFG, rules: [{ ...CFG.rules[0], value: "250000" }] }
    const a = auditarQualificacao(maior, [FAIXAS, PISO])
    const disparam = a.respostas_que_disparam.map((r) => r.opcao)
    expect(disparam).toEqual(["US$50k – US$100k"])
  })

  it("valor de comparação ilegível reprova tudo em vez de aprovar tudo", () => {
    const torto = { ...CFG, rules: [{ ...CFG.rules[0], value: "duzentos mil" }] }
    const a = auditarQualificacao(torto, [FAIXAS, PISO])
    expect(a.respostas_que_disparam).toEqual([])
  })
})
