import { describe, it, expect } from "vitest"
import { emailUtm, applyUtm, FLOW_UTM_SLUG } from "./utm"

describe("emailUtm", () => {
  it("gera UTM determinístico por flow + número do e-mail", () => {
    const u = emailUtm("welcome", 1)
    expect(u.campaign).toBe("welcome-flow")
    expect(u.content).toBe("email-01")
    expect(u.query).toBe(
      "utm_source=Convertfy&utm_medium=email&utm_campaign=welcome-flow&utm_content=email-01",
    )
  })

  it("padroniza o número do e-mail com 2 dígitos", () => {
    expect(emailUtm("abandoned_cart", 12).content).toBe("email-12")
  })

  it("usa o slug correto de cada flow type", () => {
    expect(emailUtm("win_back", 2).campaign).toBe(FLOW_UTM_SLUG.win_back)
    expect(emailUtm("shipping_stages", 1).campaign).toBe("shipping-stages")
  })
})

describe("applyUtm", () => {
  const utm = emailUtm("welcome", 1)

  it("anexa UTMs a uma URL válida", () => {
    const out = applyUtm("https://loja.com/produto", utm)
    expect(out).toContain("utm_source=Convertfy")
    expect(out).toContain("utm_campaign=welcome-flow")
    expect(out.startsWith("https://loja.com/produto?")).toBe(true)
  })

  it("preserva query existente na URL", () => {
    const out = applyUtm("https://loja.com/p?ref=abc", utm)
    expect(out).toContain("ref=abc")
    expect(out).toContain("utm_content=email-01")
  })

  it("retorna só a querystring quando não há destino", () => {
    expect(applyUtm("", utm)).toBe(`?${utm.query}`)
    expect(applyUtm(null, utm)).toBe(`?${utm.query}`)
  })
})
