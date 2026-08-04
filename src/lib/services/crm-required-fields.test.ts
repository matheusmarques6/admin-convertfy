import { describe, it, expect } from "vitest"
import {
  parseRequiredFields,
  missingRequiredFields,
  requiredFieldsMessage,
  type DealRequirementSnapshot,
} from "./crm-required-fields"

const deal = (over: Partial<DealRequirementSnapshot> = {}): DealRequirementSnapshot => ({
  value: 1000,
  expected_close_date: "2026-09-01",
  client_id: "c1",
  phone: "+5511999999999",
  products_count: 1,
  ...over,
})

describe("parseRequiredFields", () => {
  it("filtra chaves desconhecidas e aceita as validas", () => {
    expect(parseRequiredFields(["value", "hack", "phone"])).toEqual(["value", "phone"])
  })

  it("nao-array vira vazio", () => {
    expect(parseRequiredFields(null)).toEqual([])
    expect(parseRequiredFields("value")).toEqual([])
  })
})

describe("missingRequiredFields", () => {
  it("deal completo nao tem pendencias", () => {
    expect(missingRequiredFields(["value", "client", "phone", "products"], deal())).toEqual([])
  })

  it("valor zero ou nulo conta como faltando", () => {
    expect(missingRequiredFields(["value"], deal({ value: 0 }))).toEqual(["value"])
    expect(missingRequiredFields(["value"], deal({ value: null }))).toEqual(["value"])
  })

  it("telefone vazio ou so espacos falta", () => {
    expect(missingRequiredFields(["phone"], deal({ phone: "  " }))).toEqual(["phone"])
    expect(missingRequiredFields(["phone"], deal({ phone: null }))).toEqual(["phone"])
  })

  it("sem produtos falta quando exigido", () => {
    expect(missingRequiredFields(["products"], deal({ products_count: 0 }))).toEqual([
      "products",
    ])
  })

  it("sem exigencias, nada falta mesmo com deal vazio", () => {
    expect(
      missingRequiredFields(
        [],
        deal({ value: null, client_id: null, phone: null, products_count: 0 }),
      ),
    ).toEqual([])
  })
})

describe("requiredFieldsMessage", () => {
  it("monta mensagem legivel com os rotulos", () => {
    expect(requiredFieldsMessage("Proposta", ["value", "client"])).toBe(
      'Para mover para "Proposta", preencha: Valor do negócio, Cliente vinculado.',
    )
  })
})
