import { describe, expect, it } from "vitest"
import { PREFIXO_SEM_INCENTIVO, condicionarOutline, couponCodeEfetivo } from "./outline-condicional"

const OUTLINE = {
  objective: "Cumprir o contrato",
  guidance: "O incentivo prometido é entregue nos primeiros segundos.",
  suggested_blocks: ["hero", "coupon", "body", "offer", "footer"],
  tone_hint: "direto",
  coupon_code: "BEMVINDO10",
}

describe("condicionarOutline (14/09)", () => {
  it("toque sem incentivo: prefixo, blocos de oferta fora, cupom null", () => {
    const r = condicionarOutline(OUTLINE, { existe: false, codigo: null })!
    expect(r.guidance.startsWith(PREFIXO_SEM_INCENTIVO)).toBe(true)
    expect(r.guidance).toContain("entregue nos primeiros segundos")
    expect(r.suggested_blocks).toEqual(["hero", "body", "footer"])
    expect(r.coupon_code).toBeNull()
  })
  it("com incentivo e código resolvido: o código da decisão vence o pt-BR do outline", () => {
    const r = condicionarOutline(OUTLINE, { existe: true, codigo: "WELCOME10" })!
    expect(r.coupon_code).toBe("WELCOME10")
    expect(r.guidance).toBe(OUTLINE.guidance)
    expect(r.suggested_blocks).toEqual(OUTLINE.suggested_blocks)
  })
  it("com incentivo sem código na decisão: outline intacto", () => {
    expect(condicionarOutline(OUTLINE, { existe: true, codigo: null })).toEqual(OUTLINE)
  })
  it("sem decisão, ou sem outline: nada muda", () => {
    expect(condicionarOutline(OUTLINE, null)).toBe(OUTLINE)
    expect(condicionarOutline(null, { existe: false, codigo: null })).toBeNull()
  })
  it("couponCodeEfetivo segue a mesma régua", () => {
    expect(couponCodeEfetivo("BEMVINDO10", { existe: false, codigo: null })).toBeNull()
    expect(couponCodeEfetivo("BEMVINDO10", { existe: true, codigo: "WELCOME10" })).toBe("WELCOME10")
    expect(couponCodeEfetivo("BEMVINDO10", { existe: true, codigo: null })).toBe("BEMVINDO10")
    expect(couponCodeEfetivo("BEMVINDO10", null)).toBe("BEMVINDO10")
    expect(couponCodeEfetivo(null, { existe: true, codigo: null })).toBeNull()
  })
})
