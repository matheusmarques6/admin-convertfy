import { describe, it, expect } from "vitest"
import {
  discountLabelFromCode,
  couponInfo,
  emailCoupons,
} from "./coupon-info"
import type { EmailBlock } from "@/types/email-workspace"

describe("discountLabelFromCode", () => {
  it("deriva % do sufixo numérico", () => {
    expect(discountLabelFromCode("BEMVINDO10")).toBe("10% OFF")
    expect(discountLabelFromCode("FRETE15OFF")).toBe("15% OFF")
    expect(discountLabelFromCode("VOLTA20")).toBe("20% OFF")
  })

  it("trata valores acima de 90 como R$ (evita 100% OFF falso)", () => {
    expect(discountLabelFromCode("CUPOM100")).toBe("R$ 100 OFF")
  })

  it("retorna null quando não há número", () => {
    expect(discountLabelFromCode("PROMO")).toBeNull()
    expect(discountLabelFromCode("")).toBeNull()
  })
})

describe("couponInfo", () => {
  it("interpreta um bloco de cupom completo", () => {
    expect(
      couponInfo({ code: "BEMVINDO10", hint: "válido por 7 dias", cta_url: "https://x.com" }),
    ).toEqual({
      code: "BEMVINDO10",
      discountLabel: "10% OFF",
      hint: "válido por 7 dias",
      expiresAt: null,
      ctaUrl: "https://x.com",
    })
  })

  it("retorna null sem código", () => {
    expect(couponInfo({ code: "" })).toBeNull()
    expect(couponInfo({})).toBeNull()
  })
})

describe("emailCoupons", () => {
  const block = (id: string, type: string, content: Record<string, unknown>): EmailBlock =>
    ({
      id,
      email_id: "e1",
      block_type: type as EmailBlock["block_type"],
      position: 1,
      label: type,
      content,
      applied: false,
      applied_at: null,
      applied_by: null,
      created_at: "",
    }) as EmailBlock

  it("extrai cupons só de blocos coupon e deduplica por código", () => {
    const blocks = [
      block("1", "hero", { headline: "oi" }),
      block("2", "coupon", { code: "BEMVINDO10", hint: "7 dias" }),
      block("3", "coupon", { code: "bemvindo10" }), // duplicado (case-insensitive)
      block("4", "coupon", { code: "FRETE15" }),
    ]
    const out = emailCoupons(blocks)
    expect(out.map((c) => c.code)).toEqual(["BEMVINDO10", "FRETE15"])
    expect(out[0].discountLabel).toBe("10% OFF")
  })

  it("retorna vazio sem cupons", () => {
    expect(emailCoupons([block("1", "text", { body: "x" })])).toEqual([])
  })
})
