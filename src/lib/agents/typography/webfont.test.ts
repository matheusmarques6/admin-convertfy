import { describe, it, expect } from "vitest"
import { applyTypographyOps } from "./apply"
import { googleFontsHref, LINK_ATTR, pesosPorFamilia, reconciliarWebfonts } from "./webfont"

const HTML = `<!DOCTYPE html><html><head>
  <!--[if !mso]><!-->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;900&display=swap">
  <!--<![endif]-->
</head><body>
  <div style="font-family:Montserrat,Arial;font-size:56px;font-weight:900;">TÍTULO</div>
  <p style="font-family:Montserrat,Arial;font-size:14px;font-weight:400;">corpo</p>
</body></html>`

describe("pesosPorFamilia", () => {
  it("lê os pesos do documento, não das ops", () => {
    const m = pesosPorFamilia(HTML)
    expect([...(m.get("montserrat") ?? [])].sort()).toEqual([400, 900])
  })
})

describe("reconciliarWebfonts", () => {
  it("declara a família nova com os pesos que o documento usa", () => {
    const comSora = applyTypographyOps(HTML, [{ item: 0, familia: "Sora", motivo: "x" }], null)
    const out = reconciliarWebfonts(comSora.html, ["Sora"])
    expect(out).toContain(`${LINK_ATTR} href="${googleFontsHref("Sora", [900])}"`)
  })

  it("não acumula: três trocas seguidas deixam UM link gerenciado", () => {
    let doc = HTML
    for (const familia of ["Sora", "Inter", "Playfair Display"]) {
      doc = applyTypographyOps(doc, [{ item: 0, familia, motivo: "x" }], null).html
      doc = reconciliarWebfonts(doc, [familia])
    }
    expect(doc.match(new RegExp(LINK_ATTR, "g"))).toHaveLength(1)
    expect(doc).toContain("Playfair+Display")
    expect(doc).not.toContain("family=Sora")
    expect(doc).not.toContain("family=Inter")
  })

  it("não remove o link da montagem — ele não é nosso", () => {
    const out = reconciliarWebfonts(HTML, [])
    expect(out).toContain("family=Montserrat:wght@400;900")
  })

  it("não redeclara família que a montagem já declarou", () => {
    const out = reconciliarWebfonts(HTML, ["Montserrat"], ["Montserrat, Arial"])
    expect(out.match(new RegExp(LINK_ATTR, "g"))).toBeNull()
  })

  it("família que sumiu do documento não ganha link", () => {
    expect(reconciliarWebfonts(HTML, ["Sora"])).not.toContain(LINK_ATTR)
  })

  it("nome que não passa no saneamento não vira href", () => {
    const doc = applyTypographyOps(HTML, [{ item: 0, familia: "Sora", motivo: "x" }], null).html
    expect(reconciliarWebfonts(doc, ['Sora";x="'])).not.toContain(LINK_ATTR)
  })

  it("é idempotente — reconciliar duas vezes dá o mesmo documento", () => {
    const doc = applyTypographyOps(HTML, [{ item: 0, familia: "Sora", motivo: "x" }], null).html
    const uma = reconciliarWebfonts(doc, ["Sora"])
    expect(reconciliarWebfonts(uma, ["Sora"])).toBe(uma)
  })
})
