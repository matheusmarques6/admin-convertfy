/**
 * Normalização da chave técnica do output_schema + validação zod.
 * Regressão do erro de PATCH em /api/admin/components/[id] quando a chave
 * vinha em MAIÚSCULO (espelhando o placeholder {{HEADLINE}} do HTML).
 */

import { describe, it, expect } from "vitest"
import {
  deriveFieldNature,
  normalizeOutputKey,
  sanitizeOutputKeyInput,
} from "./component-dimensions"
import { outputFieldSchema } from "./component-schemas"

describe("normalizeOutputKey", () => {
  it("baixa a caixa (HEADLINE → headline)", () => {
    expect(normalizeOutputKey("HEADLINE")).toBe("headline")
  })

  it("troca espaços e hífens por underscore", () => {
    expect(normalizeOutputKey("CTA Text")).toBe("cta_text")
    expect(normalizeOutputKey("sub-headline")).toBe("sub_headline")
  })

  it("remove acentos", () => {
    expect(normalizeOutputKey("Preço")).toBe("preco")
    expect(normalizeOutputKey("Descrição")).toBe("descricao")
  })

  it("tira dígito/underscore do início (precisa começar por letra)", () => {
    expect(normalizeOutputKey("1headline")).toBe("headline")
    expect(normalizeOutputKey("_key")).toBe("key")
  })

  it("colapsa underscores e tira do fim", () => {
    expect(normalizeOutputKey("a  --  b")).toBe("a_b")
    expect(normalizeOutputKey("headline_")).toBe("headline")
  })

  it("retorna '' quando não sobra letra utilizável", () => {
    expect(normalizeOutputKey("123")).toBe("")
    expect(normalizeOutputKey("---")).toBe("")
  })
})

describe("sanitizeOutputKeyInput (a cada tecla)", () => {
  it("baixa a caixa e troca inválidos, mas preserva início/fim", () => {
    expect(sanitizeOutputKeyInput("CTA ")).toBe("cta_")
    expect(sanitizeOutputKeyInput("Head")).toBe("head")
  })
})

describe("outputFieldSchema", () => {
  const base = { label: "Título", type: "text_short" as const }

  it("aceita e canoniza chave em MAIÚSCULO em vez de estourar", () => {
    const parsed = outputFieldSchema.parse({ ...base, key: "HEADLINE" })
    expect(parsed.key).toBe("headline")
    // defaults preenchidos
    expect(parsed.max_len).toBe(0)
    expect(parsed.required).toBe(false)
  })

  it("canoniza 'CTA Text' → 'cta_text'", () => {
    const parsed = outputFieldSchema.parse({ ...base, key: "CTA Text" })
    expect(parsed.key).toBe("cta_text")
  })

  it("rejeita chave que normaliza para vazio", () => {
    expect(() => outputFieldSchema.parse({ ...base, key: "123" })).toThrow()
  })

  // O editor deixou de pedir o rótulo (ele viajava pro n8n dizendo "Novo
  // campo"). Exigir >=1 aqui reprovava o save inteiro com "Dados inválidos".
  it("aceita rótulo vazio e ausente — a key é quem identifica o campo", () => {
    expect(outputFieldSchema.parse({ ...base, key: "x", label: "" }).label).toBe("")
    expect(
      outputFieldSchema.parse({ key: "y", type: "text_short" }).label,
    ).toBe("")
  })

  it("continua exigindo a chave técnica", () => {
    expect(() =>
      outputFieldSchema.parse({ key: "", type: "text_short", label: "" }),
    ).toThrow()
  })

  it("aceita nature válida e rejeita inválida (épico Taguedor)", () => {
    const parsed = outputFieldSchema.parse({
      ...base,
      key: "selo",
      nature: "asset_fixo",
    })
    expect(parsed.nature).toBe("asset_fixo")
    // ausente → segue ausente (derivação fica pro deriveFieldNature)
    expect(
      outputFieldSchema.parse({ ...base, key: "titulo" }).nature,
    ).toBeUndefined()
    expect(() =>
      outputFieldSchema.parse({ ...base, key: "x", nature: "zzz" }),
    ).toThrow()
  })
})

describe("deriveFieldNature", () => {
  it("explícita vence a derivação por tipo", () => {
    expect(
      deriveFieldNature({ type: "image", nature: "asset_fixo" }),
    ).toBe("asset_fixo")
    expect(deriveFieldNature({ type: "text_short", nature: "imagem_gerada" }))
      .toBe("imagem_gerada")
  })

  it("ausente/inválida → image vira imagem_gerada, resto copy", () => {
    expect(deriveFieldNature({ type: "image" })).toBe("imagem_gerada")
    expect(deriveFieldNature({ type: "text_long" })).toBe("copy")
    expect(deriveFieldNature({ type: "url", nature: null })).toBe("copy")
    expect(deriveFieldNature({ type: "image", nature: "outra_coisa" })).toBe(
      "imagem_gerada",
    )
  })
})
