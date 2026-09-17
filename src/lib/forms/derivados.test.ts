import { describe, it, expect } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import { camposDerivados, camposParaAuditoria, refDoPiso, SUFIXO_PISO } from "./derivados"
import { opcoesDeFaturamento } from "./moeda"

const REGIAO = "r1"
const FAT = "f1"

function schema(): FormSchema {
  return {
    version: 1,
    blocks: [
      {
        ref: REGIAO,
        type: "multiple_choice",
        label: "Para onde você vende?",
        options: [
          { label: "Brasil", value: "Brasil" },
          { label: "Estados Unidos", value: "Estados Unidos" },
        ],
      },
      {
        ref: FAT,
        type: "multiple_choice",
        label: "Faturamento mensal",
        opcoes_por_moeda: true,
        moeda_de: REGIAO,
        options: opcoesDeFaturamento("BRL"),
      },
    ],
    endings: [],
  } as unknown as FormSchema
}

describe("piso derivado no envio", () => {
  it("converte a faixa em dólar para o piso em real", () => {
    const d = camposDerivados(schema(), {
      [REGIAO]: "Estados Unidos",
      [FAT]: "US$50k – US$100k",
    })
    expect(d.answers[refDoPiso(FAT)]).toBe(250_000)
  })

  it("a faixa em real vale por ela mesma", () => {
    const d = camposDerivados(schema(), { [REGIAO]: "Brasil", [FAT]: "R$200k – R$500k" })
    expect(d.answers[refDoPiso(FAT)]).toBe(200_000)
  })

  it("resposta fora de qualquer escada NÃO vira piso — nem zero", () => {
    // Zero desqualificaria por causa de um rótulo renomeado.
    const d = camposDerivados(schema(), { [REGIAO]: "Brasil", [FAT]: "mais ou menos R$ 300 mil" })
    expect(d.answers).toEqual({})
    expect(d.fields).toEqual([])
  })

  it("sem a região respondida ainda acha o piso pela união das escadas", () => {
    // Região é a dica, não o requisito: quem responde o faturamento e
    // volta para trocar a região não pode perder a qualificação.
    const d = camposDerivados(schema(), { [FAT]: "US$1M – US$3M" })
    expect(d.answers[refDoPiso(FAT)]).toBe(5_000_000)
  })

  it("o endereço derivado não colide com ref de verdade", () => {
    // O `ref` real é um uuid do crm_form_fields e nunca contém isto.
    expect(refDoPiso("abc")).toBe(`abc${SUFIXO_PISO}`)
    expect(SUFIXO_PISO.startsWith("__")).toBe(true)
  })

  it("bloco sem opções por moeda não deriva nada", () => {
    const s = schema()
    s.blocks[1].opcoes_por_moeda = false
    expect(camposDerivados(s, { [FAT]: "R$200k – R$500k" }).answers).toEqual({})
  })
})

describe("campos para a auditoria", () => {
  it("a pergunta de faturamento entra com a UNIÃO das escadas", () => {
    const campos = camposParaAuditoria(schema())
    const fat = campos.find((c) => c.id === FAT)!
    expect(fat.options).toContain("Até R$100k")
    expect(fat.options).toContain("US$50k – US$100k")
    expect(fat.options).toContain("€1M – €3M")
  })

  it("o derivado entra como campo próprio, sem opções e marcado", () => {
    const campos = camposParaAuditoria(schema())
    const piso = campos.find((c) => c.id === refDoPiso(FAT))!
    expect(piso.derivado).toBe(true)
    expect(piso.options).toEqual([])
    expect(piso.label).toContain("equivalente em R$")
  })

  it("cada opção leva o piso que o servidor calcularia para ela", () => {
    const campos = camposParaAuditoria(schema())
    const fat = campos.find((c) => c.id === FAT)!
    const porOpcao = fat.derivados![0].porOpcao
    expect(porOpcao["US$50k – US$100k"]).toBe(250_000)
    expect(porOpcao["R$100k – R$200k"]).toBe(100_000)
  })

  it("pergunta comum atravessa sem derivado", () => {
    const campos = camposParaAuditoria(schema())
    const regiao = campos.find((c) => c.id === REGIAO)!
    expect(regiao.derivados).toBeUndefined()
    expect(regiao.options).toEqual(["Brasil", "Estados Unidos"])
  })

  it("schema vazio devolve lista vazia, não estoura", () => {
    expect(camposParaAuditoria(null)).toEqual([])
    expect(camposParaAuditoria({ version: 1, blocks: [], endings: [] } as unknown as FormSchema)).toEqual([])
  })
})
