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

// ─── Campo personalizado (`custom:<key>`) ───────────────────────────
//
// Cobrar "URL da loja" ao entrar na etapa é regra de OPERAÇÃO. Antes
// disto ela só caberia num `if` por nome de etapa — invisível e
// intocável por quem opera o funil.

describe("required_fields de campo personalizado", () => {
  const base = {
    value: 1000,
    expected_close_date: "2026-12-01",
    client_id: "c1",
    phone: "5511999998888",
    products_count: 1,
  }

  it("parse aceita `custom:` ao lado das chaves fixas e descarta lixo", () => {
    expect(
      parseRequiredFields(["value", "custom:url_da_sua_loja", "inexistente", 42]),
    ).toEqual(["value", "custom:url_da_sua_loja"])
  })

  it("`custom:` sem key não passa — viraria uma exigência vazia", () => {
    expect(parseRequiredFields(["custom:"])).toEqual([])
  })

  it("campo preenchido libera; ausente bloqueia", () => {
    expect(
      missingRequiredFields(["custom:url_da_sua_loja"], {
        ...base,
        custom_fields: { url_da_sua_loja: "https://loja.com" },
      }),
    ).toEqual([])
    expect(
      missingRequiredFields(["custom:url_da_sua_loja"], { ...base, custom_fields: {} }),
    ).toEqual(["custom:url_da_sua_loja"])
  })

  it("string vazia não conta — o select grava '' ao abrir e fechar", () => {
    expect(
      missingRequiredFields(["custom:maturidade_loja"], {
        ...base,
        custom_fields: { maturidade_loja: "   " },
      }),
    ).toEqual(["custom:maturidade_loja"])
  })

  it("zero e false CONTAM como preenchidos — são respostas", () => {
    expect(
      missingRequiredFields(["custom:tentativas_contato", "custom:tem_loja"], {
        ...base,
        custom_fields: { tentativas_contato: 0, tem_loja: false },
      }),
    ).toEqual([])
  })

  it("array vazio não conta como preenchido", () => {
    expect(
      missingRequiredFields(["custom:tags_extra"], {
        ...base,
        custom_fields: { tags_extra: [] },
      }),
    ).toEqual(["custom:tags_extra"])
  })

  it("custom_fields ausente bloqueia em vez de explodir", () => {
    expect(missingRequiredFields(["custom:x"], base)).toEqual(["custom:x"])
  })

  it("mensagem usa o rótulo do campo, não a key crua", () => {
    const msg = requiredFieldsMessage(
      "Diagnóstico agendado",
      ["custom:url_da_sua_loja", "value"],
      { url_da_sua_loja: "URL da sua loja" },
    )
    expect(msg).toContain("URL da sua loja")
    expect(msg).toContain("Valor do negócio")
    expect(msg).not.toContain("custom:")
  })

  it("sem rótulo cadastrado mostra a key — melhor que 'undefined'", () => {
    expect(requiredFieldsMessage("X", ["custom:maturidade_loja"])).toContain(
      "maturidade_loja",
    )
  })
})
