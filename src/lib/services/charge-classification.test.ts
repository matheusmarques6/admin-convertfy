import { describe, expect, it } from "vitest"
import {
  chargeStoreIds,
  isMissingStoreIdsColumn,
  parseChargeClassification,
  stripClassification,
  stripStoreIds,
} from "./charge-classification"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

describe("parseChargeClassification — lojas", () => {
  it("store_ids com uma loja preenche store_id também (contrato da migration 20261118)", () => {
    expect(parseChargeClassification({ store_ids: [A] })).toEqual({ store_id: A, store_ids: [A] })
  })

  it("store_ids com várias lojas zera store_id (quem só lê store_id vê 'sem loja', não a errada)", () => {
    expect(parseChargeClassification({ store_ids: [A, B, A] })).toEqual({ store_id: null, store_ids: [A, B] })
  })

  it("store_ids vazio ou null limpa os dois", () => {
    expect(parseChargeClassification({ store_ids: [] })).toEqual({ store_id: null, store_ids: null })
    expect(parseChargeClassification({ store_ids: null })).toEqual({ store_id: null, store_ids: null })
  })

  it("store_id legado vira store_ids=[id]; string vazia limpa", () => {
    expect(parseChargeClassification({ store_id: A })).toEqual({ store_id: A, store_ids: [A] })
    expect(parseChargeClassification({ store_id: "" })).toEqual({ store_id: null, store_ids: null })
  })

  it("store_ids vence store_id quando os dois vêm", () => {
    expect(parseChargeClassification({ store_id: B, store_ids: [A] })).toEqual({ store_id: A, store_ids: [A] })
  })

  it("rejeita id que não é uuid", () => {
    expect(() => parseChargeClassification({ store_ids: ["loja-a"] })).toThrow(/store_ids/)
    expect(() => parseChargeClassification({ store_id: "x" })).toThrow(/store_id/)
  })

  it("chave ausente não mexe", () => {
    expect(parseChargeClassification({ charge_type: "commission" })).toEqual({ charge_type: "commission" })
  })
})

describe("chargeStoreIds", () => {
  it("store_ids vence; senão store_id; senão vazio", () => {
    expect(chargeStoreIds({ store_id: B, store_ids: [A] })).toEqual([A])
    expect(chargeStoreIds({ store_id: B, store_ids: [] })).toEqual([B])
    expect(chargeStoreIds({ store_id: null, store_ids: null })).toEqual([])
  })
})

describe("degradação sem a migration 20261118", () => {
  it("isMissingStoreIdsColumn só casa 42703/PGRST204 citando store_ids", () => {
    expect(isMissingStoreIdsColumn({ code: "42703", message: 'column "store_ids" does not exist' })).toBe(true)
    expect(isMissingStoreIdsColumn({ code: "PGRST204", message: "Could not find the 'store_ids' column" })).toBe(true)
    expect(isMissingStoreIdsColumn({ code: "42703", message: 'column "charge_type" does not exist' })).toBe(false)
    expect(isMissingStoreIdsColumn({ code: "23505", message: "store_ids" })).toBe(false)
    expect(isMissingStoreIdsColumn(null)).toBe(false)
  })

  it("stripStoreIds tira só store_ids; stripClassification tira tudo", () => {
    const payload = { amount: 1, charge_type: "commission", store_id: A, store_ids: [A, B] }
    expect(stripStoreIds(payload)).toEqual({ amount: 1, charge_type: "commission", store_id: A })
    expect(stripClassification(payload)).toEqual({ amount: 1 })
  })
})
