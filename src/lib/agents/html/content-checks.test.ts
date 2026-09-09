import { describe, expect, it } from "vitest"
import { computeContentChecks } from "./content-checks"

// O e-mail do batch 644d86c5 (Hero Boxers, Welcome 1), reduzido ao que
// os quatro checks precisam ver.
const HERO_BOXERS = `<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body>
<!-- cfy:hero:start -->
<table><tr><td><h1>Here's 10% OFF Your First Order</h1><p>Use code: [WELCOME-CODE]</p><a href="#">SHOP 10% OFF</a></td></tr></table>
<!-- cfy:hero:end -->
<table><tr><td>ICON 1</td><td>ICON 2</td><td>ICON 3</td></tr>
<tr><td><p>Every order is processed through Shopify's secure checkout, protected by industry-standard encryption.</p></td></tr>
<tr><td><p>Every order is processed through Shopify's secure checkout, protected by industry-standard encryption.</p></td></tr></table>
<a href="[unsubscribe_link]">Unsubscribe</a> <a href="{{ preferences }}">Preferences</a>
</body></html>`

describe("computeContentChecks — os quatro checks baratos (09/09)", () => {
  it("baseline: o Welcome 1 da Hero Boxers acusa os quatro", () => {
    const issues = computeContentChecks(HERO_BOXERS, { incentivoExiste: false })
    expect(issues.map((i) => i.type).sort()).toEqual(
      ["oferta_sem_incentivo", "paragrafo_repetido", "placeholder_colchetes", "texto_de_exemplo"].sort(),
    )
    const por = Object.fromEntries(issues.map((i) => [i.type, i]))
    expect(por.placeholder_colchetes.severity).toBe("high")
    expect(por.placeholder_colchetes.message).toContain("[WELCOME-CODE]")
    expect(por.oferta_sem_incentivo.severity).toBe("high")
    expect(por.oferta_sem_incentivo.message).toContain("10% OFF")
    expect(por.texto_de_exemplo.message).toContain("ICON 1")
    expect(por.paragrafo_repetido.message).toContain("Every order is processed")
  })

  it("incentivo desconhecido ou presente → o check de oferta não roda", () => {
    expect(computeContentChecks(HERO_BOXERS).map((i) => i.type)).not.toContain("oferta_sem_incentivo")
    expect(computeContentChecks(HERO_BOXERS, { incentivoExiste: true }).map((i) => i.type)).not.toContain("oferta_sem_incentivo")
    expect(computeContentChecks(HERO_BOXERS, { incentivoExiste: null }).map((i) => i.type)).not.toContain("oferta_sem_incentivo")
  })

  it("e-mail limpo → nada; merge tags e [unsubscribe] não são placeholder", () => {
    const ok = `<html><body><table><tr><td><h1>The right fit for your real body</h1><p>Hi {{ first_name }}, welcome.</p><a href="[unsubscribe_link]">Unsubscribe</a></td></tr></table></body></html>`
    expect(computeContentChecks(ok, { incentivoExiste: false })).toEqual([])
  })

  it("texto curto repetido (CTA em dois lugares) não é parágrafo repetido; texto em <style>/comentário não conta", () => {
    const html = `<html><body><!-- Use code: [X] --><style>/* Lorem ipsum */</style><table><tr><td><a>SHOP NOW</a></td></tr><tr><td><a>SHOP NOW</a></td></tr></table></body></html>`
    expect(computeContentChecks(html, { incentivoExiste: false })).toEqual([])
  })

  it("oferta em português e cupom também contam", () => {
    const html = `<html><body><p>Ganhe 15% de desconto com o cupom BEMVINDO</p></body></html>`
    const issues = computeContentChecks(html, { incentivoExiste: false })
    expect(issues.map((i) => i.type)).toEqual(["oferta_sem_incentivo"])
  })

  it("html vazio → nada", () => {
    expect(computeContentChecks("")).toEqual([])
  })
})
