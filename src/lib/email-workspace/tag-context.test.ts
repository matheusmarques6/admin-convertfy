import { describe, it, expect } from "vitest"
import { tagContext } from "./tag-context"

describe("tagContext", () => {
  it("mostra o texto ao redor, sem marcação", () => {
    const html = '<td><p style="x">Compre agora</p>{{CTA_LABEL}}<p>e ganhe</p></td>'
    const c = tagContext(html, "CTA_LABEL")!
    expect(c.before).toBe("Compre agora")
    expect(c.after).toBe("e ganhe")
  })

  it("null quando a tag não está no documento — é o caso do campo sem âncora", () => {
    expect(tagContext("<p>nada</p>", "PRODUCT_1_NAME")).toBeNull()
  })

  it("acusa repetição (o merge troca TODAS as ocorrências)", () => {
    const html = "<p>{{TAPE}}</p><p>{{TAPE}}</p>"
    expect(tagContext(html, "TAPE")!.repeated).toBe(true)
    expect(tagContext("<p>{{TAPE}}</p>", "TAPE")!.repeated).toBe(false)
  })

  it("tolera espaço interno na tag", () => {
    expect(tagContext("<p>oi {{ HERO_BODY }} tchau</p>", "HERO_BODY")).not.toBeNull()
  })

  it("não casa tag de nome parecido", () => {
    // {{CTA}} não pode casar dentro de {{CTA_LABEL}}.
    expect(tagContext("<p>{{CTA_LABEL}}</p>", "CTA")).toBeNull()
  })

  it("entidades e comentários não sujam o trecho", () => {
    const html = "<p>Frete&nbsp;gr&aacute;tis</p><!-- nota -->{{X}}"
    expect(tagContext(html, "X")!.before).toBe("Frete grtis")
  })
})
