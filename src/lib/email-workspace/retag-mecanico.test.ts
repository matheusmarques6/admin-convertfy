import { describe, it, expect } from "vitest"
import { retag } from "./retag-mecanico"
import type { ComponentOutputField } from "@/types/email-generation"

const f = (key: string, example = ""): ComponentOutputField =>
  ({ key, label: key, type: "text_short", max_len: 0, required: false, example, guidance: "" }) as ComponentOutputField

describe("retag mecânico — os dois caminhos, na ordem", () => {
  it("renomeia a tag existente quando ela serve o campo", () => {
    // COUPON_CODE já é o endereço do campo coupon_code pelo nome normalizado.
    const html = "<p>{{COUPON_CODE}}</p>"
    const r = retag(html, [f("coupon_code", "BEMVINDO10")])
    expect(r.html).toBe("<p>{{COUPON_CODE}}</p>")
    expect(r.outcomes[0].via).toBe("ja_ancorada")
  })

  it("sem tag, troca a FRASE do exemplo pelo placeholder", () => {
    const html = "<h1>Buy 1, Get 3 Free</h1>"
    const r = retag(html, [f("hero_headline", "Buy 1, Get 3 Free")])
    expect(r.html).toBe("<h1>{{HERO_HEADLINE}}</h1>")
    expect(r.outcomes[0].via).toBe("exemplo")
  })

  it("dois campos não brigam pela mesma tag (re-audita a cada campo)", () => {
    // O primeiro campo consome {{HEADLINE}}; o segundo tem de achar seu
    // próprio lugar pela frase, e não roubar a tag já reivindicada.
    const html = "<h1>{{HEADLINE}}</h1><p>Frete grátis hoje</p>"
    const r = retag(html, [
      f("hero_headline", "qualquer"),
      f("hero_subhead", "Frete grátis hoje"),
    ])
    expect(r.html).toContain("{{HERO_HEADLINE}}")
    expect(r.html).toContain("{{HERO_SUBHEAD}}")
    expect(r.html).not.toContain("{{HEADLINE}}")
  })

  it("campo sem tag e sem a frase sai como sem_lugar — não inventa elemento", () => {
    const r = retag("<h1>outra coisa</h1>", [f("coupon_hint", "Use o cupom")])
    expect(r.outcomes[0].via).toBe("sem_lugar")
    expect(r.html).toBe("<h1>outra coisa</h1>")
  })

  it("frase repetida não é trocada (seria adivinhar qual ocorrência)", () => {
    const html = "<a>Comprar</a><a>Comprar</a>"
    const r = retag(html, [f("cta_label", "Comprar")])
    expect(r.outcomes[0].via).toBe("sem_lugar")
    expect(r.html).toBe(html)
  })
})
