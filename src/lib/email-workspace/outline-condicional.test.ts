import { describe, expect, it } from "vitest"
import {
  PREFIXO_INCENTIVO_NAO_CONFIRMADO,
  PREFIXO_SEM_INCENTIVO,
  condicionarOutline,
  couponCodeEfetivo,
} from "./outline-condicional"

const OUTLINE = {
  objective: "Cumprir o contrato",
  guidance: "O incentivo prometido é entregue nos primeiros segundos.",
  suggested_blocks: ["hero", "coupon", "body", "offer", "footer"],
  tone_hint: "direto",
  coupon_code: "WELCOME10",
}

describe("condicionarOutline (09/09)", () => {
  it("sem incentivo: prefixo, blocos de oferta fora, cupom null", () => {
    const r = condicionarOutline(OUTLINE, { existe: false, codigo: null, valor: null })!
    expect(r.guidance.startsWith(PREFIXO_SEM_INCENTIVO)).toBe(true)
    expect(r.guidance).toContain("entregue nos primeiros segundos")
    expect(r.suggested_blocks).toEqual(["hero", "body", "footer"])
    expect(r.coupon_code).toBeNull()
  })
  it("com incentivo e código: o código da loja vence o do outline", () => {
    const r = condicionarOutline(OUTLINE, { existe: true, codigo: "HERO15", valor: "15%" })!
    expect(r.coupon_code).toBe("HERO15")
    expect(r.guidance).toBe(OUTLINE.guidance)
  })
  // O caso da Hero Boxers (09/09): catálogo com `existe: null` deixava o
  // outline passar inteiro — "entregue o incentivo nos primeiros
  // segundos" — e o `coupon_code` do template (`BEMVINDO10`, o mesmo nos 8
  // e-mails do welcome) ia junto para uma loja inglesa.
  it("desconhecido não promete: prefixo próprio, blocos de oferta fora, cupom null", () => {
    const r = condicionarOutline(OUTLINE, { existe: null, codigo: null, valor: null })!
    expect(r.guidance.startsWith(PREFIXO_INCENTIVO_NAO_CONFIRMADO)).toBe(true)
    // Não afirma que a loja NÃO tem — isso seria `false`.
    expect(r.guidance).not.toContain(PREFIXO_SEM_INCENTIVO)
    expect(r.guidance).toContain("entregue nos primeiros segundos")
    expect(r.suggested_blocks).toEqual(["hero", "body", "footer"])
    expect(r.coupon_code).toBeNull()
  })
  it("sem decisão, ou sem outline: nada muda", () => {
    expect(condicionarOutline(OUTLINE, null)).toBe(OUTLINE)
    expect(condicionarOutline(null, { existe: false, codigo: null, valor: null })).toBeNull()
  })
  it("couponCodeEfetivo segue a mesma régua", () => {
    expect(couponCodeEfetivo("WELCOME10", { existe: false, codigo: null, valor: null })).toBeNull()
    // Desconhecido não entrega o código do template — era o vazamento.
    expect(couponCodeEfetivo("BEMVINDO10", { existe: null, codigo: null, valor: null })).toBeNull()
    expect(couponCodeEfetivo("WELCOME10", { existe: true, codigo: "HERO15", valor: null })).toBe("HERO15")
    // Confirmado sem código próprio ainda usa o do flow: a loja disse que tem.
    expect(couponCodeEfetivo("WELCOME10", { existe: true, codigo: null, valor: null })).toBe("WELCOME10")
    expect(couponCodeEfetivo("WELCOME10", null)).toBe("WELCOME10")
    expect(couponCodeEfetivo(null, { existe: null, codigo: null, valor: null })).toBeNull()
  })
})
