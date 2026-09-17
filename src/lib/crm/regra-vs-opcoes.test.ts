import { describe, expect, it } from "vitest"

import type { QualifiedLeadConfig } from "@/types/form-tracking"

import {
  avisoDeValorSemOpcao,
  campoDaRegra,
  opcoesDoCampo,
  valoresDaRegra,
  valoresForaDasOpcoes,
} from "./regra-vs-opcoes"

// O formulário REAL medido em 15/09 ("Pagina de vendas"): quatro faixas de
// faturamento, e a regra qualifica as três de cima.
const CAMPO_FATURAMENTO = {
  id: "b645918f-83cd-42a6-8025-3053261a4506",
  label: "Qual sua média de faturamento mensal?",
  field_type: "select",
  options: [
    "R$0 - R$99.000",
    "R$100.000 - R$300.000",
    "R$500.000 - R$1 milhão",
    "R$1 milhão - R$5 milhões",
  ],
}

const cfg = (rules: QualifiedLeadConfig["rules"]): QualifiedLeadConfig => ({
  enabled: true,
  event_name: "LeadQualificado",
  logic: "or",
  rules,
})

const REGRA_REAL = cfg([
  {
    field_id: CAMPO_FATURAMENTO.id,
    field_label: CAMPO_FATURAMENTO.label,
    operator: "in",
    value: ["R$100.000 - R$300.000", "R$500.000 - R$1 milhão", "R$1 milhão - R$5 milhões"],
  },
])

describe("valoresForaDasOpcoes", () => {
  it("a configuração real de produção não acusa nada", () => {
    expect(valoresForaDasOpcoes(REGRA_REAL, [CAMPO_FATURAMENTO])).toEqual([])
  })

  // O modo de falha: alguém renomeia a opção no editor e a regra fica
  // apontando para o texto antigo. Nenhum cadastro pode respondê-lo, então
  // o evento para de sair — e antes disto nada acusava.
  it("opção renomeada depois deixa a regra apontando para o vazio", () => {
    const renomeado = {
      ...CAMPO_FATURAMENTO,
      options: [
        "R$0 - R$99.000",
        "R$100.000 - R$300.000",
        "R$500.000 - R$1 milhão",
        "Acima de R$1 milhão",
      ],
    }
    const achados = valoresForaDasOpcoes(REGRA_REAL, [renomeado])
    expect(achados).toHaveLength(1)
    expect(achados[0].valor).toBe("R$1 milhão - R$5 milhões")
    expect(achados[0].campo_label).toBe(CAMPO_FATURAMENTO.label)
  })

  // A comparação é a MESMA do envio. Acusar aqui o que lá casa mandaria
  // consertar o que está funcionando.
  it("acento e caixa não são divergência — a régua é a do envio", () => {
    const campo = { id: "f1", label: "Cidade", field_type: "select", options: ["São Paulo"] }
    const c = cfg([{ field_id: "f1", operator: "equals", value: "sao paulo" }])
    expect(valoresForaDasOpcoes(c, [campo])).toEqual([])
  })

  it("espaço nas pontas também não", () => {
    const campo = { id: "f1", label: "Cidade", field_type: "select", options: ["  Recife "] }
    const c = cfg([{ field_id: "f1", operator: "equals", value: "Recife" }])
    expect(valoresForaDasOpcoes(c, [campo])).toEqual([])
  })

  it("campo de texto livre não é julgado — não há lista para comparar", () => {
    const campo = { id: "f1", label: "Site", field_type: "text" }
    const c = cfg([{ field_id: "f1", operator: "equals", value: "qualquer coisa" }])
    expect(valoresForaDasOpcoes(c, [campo])).toEqual([])
  })

  it("contains é fragmento de propósito; gt compara número — nenhum dos dois é julgado", () => {
    const c = cfg([
      { field_id: CAMPO_FATURAMENTO.id, operator: "contains", value: "milhão" },
      { field_id: CAMPO_FATURAMENTO.id, operator: "gt", value: 1000 },
    ])
    expect(valoresForaDasOpcoes(c, [CAMPO_FATURAMENTO])).toEqual([])
  })

  it("campo que sumiu do formulário não vira aviso daqui — quem cobra isso é o teste contra os cadastros", () => {
    const c = cfg([{ field_id: "campo-que-nao-existe", operator: "equals", value: "x" }])
    expect(valoresForaDasOpcoes(c, [CAMPO_FATURAMENTO])).toEqual([])
  })

  it("qualificado desligado não é julgado", () => {
    expect(valoresForaDasOpcoes({ ...REGRA_REAL, enabled: false }, [CAMPO_FATURAMENTO])).toEqual([])
    expect(valoresForaDasOpcoes(undefined, [CAMPO_FATURAMENTO])).toEqual([])
  })

  it("acusa cada valor fora, e diz qual regra é", () => {
    const c = cfg([
      { field_id: CAMPO_FATURAMENTO.id, operator: "in", value: ["inexistente A", "inexistente B"] },
    ])
    const achados = valoresForaDasOpcoes(c, [CAMPO_FATURAMENTO])
    expect(achados.map((a) => a.valor)).toEqual(["inexistente A", "inexistente B"])
    expect(achados.every((a) => a.regra === 0)).toBe(true)
  })
})

describe("campoDaRegra", () => {
  // Mesma cascata da avaliação: id primeiro, label depois. Julgar por outro
  // caminho faria a régua medir um campo e o envio outro.
  it("resolve pelo label quando o id foi regenerado", () => {
    const c = campoDaRegra(
      { field_id: "id-antigo", field_label: "qual sua média de FATURAMENTO mensal?", operator: "equals" },
      [CAMPO_FATURAMENTO],
    )
    expect(c?.id).toBe(CAMPO_FATURAMENTO.id)
  })
  it("sem id nem label não inventa campo", () => {
    expect(campoDaRegra({ field_id: "x", operator: "equals" }, [CAMPO_FATURAMENTO])).toBeUndefined()
  })
})

describe("opcoesDoCampo", () => {
  it("aceita lista de string e lista de {label,value}", () => {
    expect(opcoesDoCampo({ id: "a", options: ["um", "dois"] })).toEqual(["um", "dois"])
    expect(opcoesDoCampo({ id: "a", options: [{ value: "v1", label: "L1" }, { label: "L2" }] })).toEqual(["v1", "L2"])
  })
  it("lista ausente, vazia ou só de lixo é lista ABERTA, não lista vazia", () => {
    expect(opcoesDoCampo({ id: "a" })).toBeNull()
    expect(opcoesDoCampo({ id: "a", options: [] })).toBeNull()
    expect(opcoesDoCampo({ id: "a", options: [null, 3, {}] })).toBeNull()
  })
})

describe("valoresDaRegra", () => {
  it("array, string e ausente", () => {
    expect(valoresDaRegra({ field_id: "a", operator: "in", value: ["x", "y"] })).toEqual(["x", "y"])
    expect(valoresDaRegra({ field_id: "a", operator: "equals", value: "x" })).toEqual(["x"])
    expect(valoresDaRegra({ field_id: "a", operator: "is_set" })).toEqual([])
    expect(valoresDaRegra({ field_id: "a", operator: "gt", value: 10 })).toEqual([])
  })
})

describe("avisoDeValorSemOpcao", () => {
  it("nada a dizer devolve null", () => {
    expect(avisoDeValorSemOpcao([])).toBeNull()
  })
  it("diz o campo, o valor, as opções reais e a causa provável", () => {
    const texto = avisoDeValorSemOpcao([
      { regra: 0, campo_label: "Faturamento", valor: "R$1 milhão - R$5 milhões", opcoes: ["A", "B"] },
    ])!
    expect(texto).toContain("Faturamento")
    expect(texto).toContain("R$1 milhão - R$5 milhões")
    expect(texto).toContain("A · B")
    expect(texto).toMatch(/renomeada/i)
  })
  it("resume quando há mais de um", () => {
    const texto = avisoDeValorSemOpcao([
      { regra: 0, campo_label: "F", valor: "v1", opcoes: ["A"] },
      { regra: 0, campo_label: "F", valor: "v2", opcoes: ["A"] },
    ])!
    expect(texto).toContain("e mais 1")
  })
})
