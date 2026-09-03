import { describe, it, expect } from "vitest"
import {
  extractTypographyInventory,
  isDarkHex,
  parseWeight,
  soPontuacao,
  renderInventoryForPrompt,
} from "./inventory"

// Recorte fiel ao Welcome 1 da Innova (02/09): marcadores de bloco, fundo
// escuro na hero, cupom em pílula clara, CTA em <a>, título 56px em caixa
// alta, e a aspa decorativa que veio da variante "review 1".
const HTML = `<!DOCTYPE html><html><head><style>body{font-family:Arial;}</style></head><body>
<!-- cfy:block:0:hero:start -->
<table><tr><td style="background:#1F1F1F;padding:57px 24px 0 24px;">
  <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:50px;line-height:57px;font-weight:400;letter-spacing:-0.06em;color:#FFFFFF;">Welcome to Innova Bay</div>
  <td style="background:#F2F2F2;border-radius:50px;">
    <span style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;color:#1F1F1F;">BEMVINDO10</span>
  </td>
  <a href="#" style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;color:#FFFFFF;">SHOP NOW</a>
</td></tr></table>
<!-- cfy:block:0:hero:end -->
<!-- cfy:block:2:body:start -->
<table><tr><td style="background:#FFFFFF;">
  <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:56px;font-weight:900;letter-spacing:0.03em;text-transform:uppercase;color:#1F1F1F;">INNOVA BAY VS OTHERS</div>
  <div class="txt-wht" style="font-family:Georgia,'Times New Roman',serif;font-size:52px;font-weight:700;color:#1F1F1F;">&ldquo;</div>
  <p style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;font-weight:400;">Unsubscribe</p>
</td></tr></table>
<!-- cfy:block:2:body:end -->
</body></html>`

describe("extractTypographyInventory", () => {
  const inv = extractTypographyInventory(HTML)

  it("ignora o <style> do head e numera só o corpo", () => {
    expect(inv).toHaveLength(6)
    expect(inv.map((o) => o.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(inv.every((o) => !o.family.startsWith("Arial"))).toBe(true)
  })

  it("lê tamanho, peso, caixa e tracking da MESMA declaração", () => {
    expect(inv[0]).toMatchObject({
      sizePx: 50,
      weight: 400,
      uppercase: false,
      tracking: "-0.06em",
    })
    expect(inv[3]).toMatchObject({ sizePx: 56, weight: 900, uppercase: true, tracking: "0.03em" })
  })

  it("situa a ocorrência no bloco e na seção", () => {
    expect(inv[0]).toMatchObject({ blockIndex: 0, section: "hero" })
    expect(inv[3]).toMatchObject({ blockIndex: 2, section: "body" })
  })

  it("resolve o fundo em vigor e marca o escuro", () => {
    expect(inv[0]).toMatchObject({ bg: "#1F1F1F", bgDark: true })
    // O cupom está na pílula clara declarada logo antes dele.
    expect(inv[1]).toMatchObject({ bg: "#F2F2F2", bgDark: false })
    expect(inv[3]).toMatchObject({ bg: "#FFFFFF", bgDark: false })
  })

  it("marca o rótulo de link como CTA", () => {
    expect(inv[2]).toMatchObject({ tag: "a", isCta: true, text: "SHOP NOW" })
    expect(inv[0].isCta).toBe(false)
  })

  it("marca a aspa decorativa como ornamento", () => {
    expect(inv[4]).toMatchObject({ soPontuacao: true })
    expect(inv[4].family.startsWith("Georgia")).toBe(true)
    expect(inv[3].soPontuacao).toBe(false)
  })

  it("captura o texto da ocorrência", () => {
    expect(inv[0].text).toBe("Welcome to Innova Bay")
    expect(inv[5].text).toBe("Unsubscribe")
  })
})

describe("parseWeight", () => {
  it("aceita número e nome conhecido", () => {
    expect(parseWeight("font-weight:700")).toBe(700)
    expect(parseWeight("font-weight: bold")).toBe(700)
    expect(parseWeight("font-weight:normal")).toBe(400)
  })
  it("não inventa peso quando não há declaração ou o nome é desconhecido", () => {
    expect(parseWeight("color:#000")).toBeNull()
    expect(parseWeight("font-weight:lighter")).toBeNull()
  })
})

describe("isDarkHex", () => {
  it("classifica pela luminância, com hex curto e longo", () => {
    expect(isDarkHex("#1F1F1F")).toBe(true)
    expect(isDarkHex("#000")).toBe(true)
    expect(isDarkHex("#FFFFFF")).toBe(false)
    expect(isDarkHex("#F2F2F2")).toBe(false)
    expect(isDarkHex(null)).toBe(false)
  })
})

describe("soPontuacao", () => {
  it("entidade de aspa é ornamento; texto com letra não é", () => {
    expect(soPontuacao("&ldquo;")).toBe(true)
    expect(soPontuacao("“")).toBe(true)
    expect(soPontuacao("— Sarah M.")).toBe(false)
  })
})

describe("renderInventoryForPrompt", () => {
  it("descreve cada item sem devolver HTML", () => {
    const txt = renderInventoryForPrompt(extractTypographyInventory(HTML))
    expect(txt).toContain("#0 bloco 0 (hero) · <div>")
    expect(txt).toContain("fundo #1F1F1F (escuro)")
    expect(txt).toContain("rótulo de link/botão")
    expect(txt).toContain("só pontuação (ornamento)")
    expect(txt).not.toContain("<td")
  })
})
