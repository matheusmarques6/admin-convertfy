import { describe, it, expect } from "vitest"
import { couponTokenKeys, hasCouponToken, resolveCouponTokens } from "./coupon-tokens"

describe("resolveCouponTokens", () => {
  // Os dois campos reais do Welcome 1 da Innova Bay (02/09).
  it("troca o colchete pelo código real", () => {
    expect(resolveCouponTokens("Use code [DISCOUNT_CODE] at checkout.", "BEMVINDO10")).toBe(
      "Use code BEMVINDO10 at checkout.",
    )
    expect(
      resolveCouponTokens(
        "Apply [DISCOUNT_CODE] at checkout and get 10% off your first order.",
        "BEMVINDO10",
      ),
    ).toBe("Apply BEMVINDO10 at checkout and get 10% off your first order.")
  })

  it("cobre as variantes que o flow inventa", () => {
    for (const t of ["[COUPON_CODE]", "[COUPON]", "[CODE]", "[PROMO_CODE]", "[DYNAMIC]", "{{DISCOUNT_CODE}}", "{{COUPON_CODE}}", "[ DISCOUNT CODE ]"]) {
      expect(resolveCouponTokens(`with ${t} today`, "WELCOME10")).toBe("with WELCOME10 today")
    }
  })

  it("`{{coupon_code}}` minúsculo é token do ESP e fica", () => {
    expect(resolveCouponTokens("Use {{coupon_code}} now", "X10")).toBe("Use {{coupon_code}} now")
    expect(hasCouponToken("Use {{coupon_code}} now")).toBe(false)
  })

  it("`[code]` minúsculo em prosa não é token", () => {
    expect(resolveCouponTokens("read the [code] section", "X10")).toBe("read the [code] section")
  })

  it("sem código o valor fica intacto — nunca some em silêncio", () => {
    expect(resolveCouponTokens("Use code [DISCOUNT_CODE]", null)).toBe("Use code [DISCOUNT_CODE]")
    expect(resolveCouponTokens("Use code [DISCOUNT_CODE]", "  ")).toBe("Use code [DISCOUNT_CODE]")
  })

  it("deep-walk no content do bloco", () => {
    const content = {
      coupon_line: "Use code [DISCOUNT_CODE] at checkout.",
      cta_label: "SHOP NOW",
      images: { hero: { alt: "x" } },
      lista: ["[COUPON]", 3],
    }
    expect(resolveCouponTokens(content, "BEMVINDO10")).toEqual({
      coupon_line: "Use code BEMVINDO10 at checkout.",
      cta_label: "SHOP NOW",
      images: { hero: { alt: "x" } },
      lista: ["BEMVINDO10", 3],
    })
    expect(couponTokenKeys(content)).toEqual(["coupon_line", "lista[0]"])
  })
})
