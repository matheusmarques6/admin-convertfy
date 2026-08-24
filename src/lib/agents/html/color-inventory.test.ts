/**
 * Inventário de cores + recolor global (F4 — arquitetura por views).
 * O extractor é o ponto crítico do desenho: cor invisível pro inventário
 * é cor que o agente não troca — fixtures cobrem hex/short-hex/rgb/rgba/
 * bgcolor/<style> (dark mode).
 */
import { describe, it, expect } from "vitest"
import {
  declaredWidth,
  extractColorInventory,
  applyRecolor,
  canonicalHex,
  isColorLiteral,
} from "./color-inventory"

const DOC = [
  "<style>@media (prefers-color-scheme: dark) { body { background:#111111 } }</style>",
  '<table bgcolor="#6B46C1"><tr><td style="background-color:#6b46c1">',
  '<h1 style="color:#fff">Título</h1>',
  '<a style="background:#6B46C1;color:rgb(255, 255, 255)">CTA</a>',
  '<td style="border:1px solid #ddd">x</td>',
  '<div style="background:rgba(31, 31, 31, 0.5)">scrim</div>',
  "</td></tr></table>",
].join("\n")

describe("canonicalHex / isColorLiteral", () => {
  it("normaliza short-hex e caixa", () => {
    expect(canonicalHex("#abc")).toBe("#AABBCC")
    expect(canonicalHex("#6b46c1")).toBe("#6B46C1")
  })
  it("aceita só literais hex 3/6", () => {
    expect(isColorLiteral("#1F1F1F")).toBe(true)
    expect(isColorLiteral("#fff")).toBe(true)
    expect(isColorLiteral("red")).toBe(false)
    expect(isColorLiteral("#12345")).toBe(false)
    expect(isColorLiteral("<td>#fff</td>")).toBe(false)
  })
})

describe("extractColorInventory", () => {
  it("agrega todas as formas da mesma cor com contextos, ordenado por uso", () => {
    const inv = extractColorInventory(DOC)
    const roxo = inv.find((e) => e.valor === "#6B46C1")!
    expect(roxo.ocorrencias).toBe(3) // bgcolor + background-color + background
    // `contextos` virou mapa contexto→contagem (20/08): a soma das
    // contagens fecha com o total de ocorrências, por construção.
    expect(roxo.contextos.bgcolor).toBeGreaterThan(0)
    expect(roxo.contextos.background).toBeGreaterThan(0)
    expect(
      Object.values(roxo.contextos).reduce((a, b) => a + b, 0),
    ).toBe(roxo.ocorrencias)

    const branco = inv.find((e) => e.valor === "#FFFFFF")!
    expect(branco.ocorrencias).toBe(2) // #fff + rgb(255,255,255)
    expect(branco.contextos.color).toBeGreaterThan(0)

    // <style> entra (dark mode) e rgba entra
    expect(inv.some((e) => e.valor === "#111111")).toBe(true)
    expect(inv.some((e) => e.valor === "#1F1F1F")).toBe(true)
    // ordenação por ocorrências desc
    expect(inv[0].ocorrencias).toBeGreaterThanOrEqual(inv[inv.length - 1].ocorrencias)
  })

  // Caso REAL (Luxe Lift, 12/08): o spacer do preheader é `&#847;&zwnj;&nbsp;`
  // repetido 5 vezes. O `#847` de dentro da entidade casava como hex curto e
  // era expandido para #884477 — uma cor que não existe no documento. O
  // agente de cor gastou sua única op tentando corrigi-la e o email saiu sem
  // nenhuma cor de marca.
  it("entidade numérica não vira cor", () => {
    const html =
      '<div style="color:#3D2820">' +
      "&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;" +
      "</div>"
    const inv = extractColorInventory(html)
    expect(inv.map((e) => e.valor)).toEqual(["#3D2820"])
    expect(inv.some((e) => e.valor === "#884477")).toBe(false)
  })

  it("hex curto legítimo continua sendo expandido", () => {
    const inv = extractColorInventory('<td bgcolor="#847">x</td>')
    expect(inv[0].valor).toBe("#884477")
  })
})

describe("applyRecolor", () => {
  it("troca TODAS as formas da cor (hex, hex-caixa, rgb) e conta as trocas", () => {
    const { html, replaced } = applyRecolor(DOC, "#6B46C1", "#1F1F1F")
    expect(replaced).toBe(3)
    expect(html).not.toMatch(/#6b46c1/i)
    expect((html.match(/#1F1F1F/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it("short-hex e rgb(255,255,255) viram o alvo; rgba preserva o alpha", () => {
    const r1 = applyRecolor(DOC, "#ffffff", "#EFE9DF")
    expect(r1.html).not.toContain("#fff")
    expect(r1.html).not.toContain("rgb(255, 255, 255)")
    expect(r1.replaced).toBe(2)

    const r2 = applyRecolor(DOC, "#1F1F1F", "#000000")
    expect(r2.html).toContain("rgba(0, 0, 0, 0.5)")
  })

  it("cor ausente → 0 trocas (op vira find_not_found no Integrador)", () => {
    expect(applyRecolor(DOC, "#ABCDEF", "#000000").replaced).toBe(0)
  })

  it("não encosta em nada que não seja a cor: estrutura idêntica", () => {
    const { html } = applyRecolor(DOC, "#6B46C1", "#1F1F1F")
    const tables = (s: string) => (s.match(/<table/g) ?? []).length
    expect(tables(html)).toBe(tables(DOC))
    expect(html).toContain("CTA")
  })
})

describe("recolor NÃO come entidade HTML (incidente Luxe Lift, 10/08)", () => {
  // O preheader usa `&#847;` (combining grapheme joiner) como espaçador
  // invisível — é o padrão da biblioteca inteira. Um recolor de #884477
  // monta a forma curta `#847`, que casava DENTRO da entidade porque o
  // `\b` vale entre o `7` e o `;`. Uma única op de cor transformou
  // `&#847;` em `&#3D2820;` e quebrou o preheader do email.
  it("não troca dentro de `&#847;`", () => {
    const html = '<div>&#847;&zwnj;&nbsp;&#847;</div>'
    const r = applyRecolor(html, "#884477", "#3D2820")
    expect(r.html).toBe(html)
    expect(r.replaced).toBe(0)
  })

  it("continua trocando a cor de verdade no mesmo documento", () => {
    const html = '<td style="color:#847">x</td><span>&#847;</span>'
    const r = applyRecolor(html, "#884477", "#3D2820")
    expect(r.html).toBe('<td style="color:#3D2820">x</td><span>&#847;</span>')
    expect(r.replaced).toBe(1)
  })

  it("hex completo colado num & também é preservado", () => {
    const r = applyRecolor("&#884477;", "#884477", "#000000")
    expect(r.replaced).toBe(0)
  })
})

// ── Escopo por contexto (20/08) ────────────────────────────────────────

import { colorOccurrenceCount, contextOf, isColorContext } from "./color-inventory"

describe("recolor com escopo (where)", () => {
  // Caso Luxe Lift: preto é fundo de botão E texto de corpo. Antes do
  // escopo, a única resposta correta era não mexer — e o email inteiro
  // ficava fora da marca.
  const DOC_MISTO = [
    '<td style="background:#000000;">',
    '<a style="color:#FFFFFF;">CTA</a></td>',
    '<p style="color:#000000;">corpo preto</p>',
    '<td bgcolor="#000000">outro fundo</td>',
  ].join("\n")

  it("where:background troca só os fundos e preserva o texto", () => {
    const r = applyRecolor(DOC_MISTO, "#000000", "#3D2820", "background")
    expect(r.replaced).toBe(1)
    expect(r.html).toContain('background:#3D2820;')
    expect(r.html).toContain('style="color:#000000;">corpo preto')
    // bgcolor é OUTRO contexto — não entra em where:background.
    expect(r.html).toContain('bgcolor="#000000"')
  })

  it("where:color troca só o texto", () => {
    const r = applyRecolor(DOC_MISTO, "#000000", "#1F1F1F", "color")
    expect(r.replaced).toBe(1)
    expect(r.html).toContain('style="color:#1F1F1F;">corpo preto')
    expect(r.html).toContain("background:#000000;")
  })

  it("sem where continua global (retrocompatibilidade)", () => {
    const r = applyRecolor(DOC_MISTO, "#000000", "#3D2820")
    expect(r.replaced).toBe(3) // background + color + bgcolor
    expect(r.html).not.toContain("#000000")
  })

  it("where sem ocorrência naquele papel devolve replaced 0", () => {
    const r = applyRecolor(DOC_MISTO, "#000000", "#3D2820", "css-var")
    expect(r.replaced).toBe(0)
    expect(r.html).toBe(DOC_MISTO)
  })

  it("offsets não driftam quando `to` é mais longo que `from`", () => {
    // rgb(...) → #hex encurta; #hex → rgba() alonga. Se o contexto fosse
    // julgado no doc já parcialmente alterado, o 2º match cairia na
    // posição errada e o escopo trocaria o alvo errado.
    const doc = [
      '<td style="background:rgb(0,0,0);">a</td>',
      '<td style="color:rgb(0,0,0);">b</td>',
      '<td style="background:rgb(0,0,0);">c</td>',
    ].join("\n")
    const r = applyRecolor(doc, "#000000", "#FAF5F3", "background")
    expect(r.replaced).toBe(2)
    expect(r.html).toContain('background:#FAF5F3;">a')
    expect(r.html).toContain('color:rgb(0,0,0);">b') // texto intacto
    expect(r.html).toContain('background:#FAF5F3;">c')
  })

  it("alpha do rgba é preservado sob escopo", () => {
    const doc = '<td style="background:rgba(0, 0, 0, 0.5);">x</td>'
    const r = applyRecolor(doc, "#000000", "#3D2820", "background")
    expect(r.replaced).toBe(1)
    expect(r.html).toContain("rgba(61, 40, 32, 0.5)")
  })

  it("regressão: entidade &#847; do preheader segue imune com escopo", () => {
    const doc = '<span style="color:#884477;">&#847;&#847;</span>'
    const r = applyRecolor(doc, "#884477", "#3D2820", "color")
    expect(r.replaced).toBe(1)
    expect(r.html).toContain("&#847;&#847;")
    expect(r.html).toContain("color:#3D2820")
  })

  it("forma curta #abc entra no escopo", () => {
    const doc = '<td style="background:#fff;">x</td><p style="color:#fff;">y</p>'
    const r = applyRecolor(doc, "#FFFFFF", "#FAF5F3", "background")
    expect(r.replaced).toBe(1)
    expect(r.html).toContain("background:#FAF5F3")
    expect(r.html).toContain("color:#fff")
  })
})

describe("inventário por contexto", () => {
  it("conta ocorrências por papel — a informação que permite escopar", () => {
    const doc = [
      '<td style="background:#000000;">a</td>',
      '<p style="color:#000000;">b</p>',
      '<p style="color:#000000;">c</p>',
    ].join("\n")
    const inv = extractColorInventory(doc)
    const preto = inv.find((e) => e.valor === "#000000")!
    expect(preto.ocorrencias).toBe(3)
    expect(preto.contextos.color).toBe(2)
    expect(preto.contextos.background).toBe(1)
    // Papel mais usado primeiro.
    expect(Object.keys(preto.contextos)[0]).toBe("color")
  })

  it("contextOf é a mesma régua do inventário e do aplicador", () => {
    const doc = '<td bgcolor="#000000">x</td>'
    expect(contextOf(doc, doc.indexOf("#000000"))).toBe("bgcolor")
    expect(isColorContext("bgcolor")).toBe(true)
    expect(isColorContext("qualquer")).toBe(false)
  })

  it("colorOccurrenceCount fecha com a soma do inventário", () => {
    const doc = '<td style="background:#000;color:#FFF;">x</td>'
    const inv = extractColorInventory(doc)
    expect(colorOccurrenceCount(doc)).toBe(
      inv.reduce((s, e) => s + e.ocorrencias, 0),
    )
  })
})

describe("área: fundo de container tem largura, borda não", () => {
  it("marca o fundo da seção com a largura declarada no próprio tag", () => {
    // Cadastro real de `produtos 4 - um produto`: a largura vem três vezes
    // no mesmo style (width/min-width/max-width) e mais uma no atributo.
    const html =
      '<table width="598" style="width:598px;min-width:598px;max-width:598px;' +
      'background:#B1B3B6;"><tr><td style="border:1px solid #130E31">x</td></tr>' +
      "</table>"
    const inv = extractColorInventory(html)
    expect(inv.find((e) => e.valor === "#B1B3B6")?.cobre_px).toBe(598)
    // Borda não tem área: `cobre_px` só existe para fundo.
    expect(inv.find((e) => e.valor === "#130E31")?.cobre_px).toBeUndefined()
  })

  it("fundo de seção com 1 ocorrência vem ANTES de borda com 24", () => {
    const borda = '<td style="border:1px solid #130E31"></td>'
    const html =
      '<table width="598" style="background:#B1B3B6;"><tr>' +
      borda.repeat(24) +
      "</tr></table>"
    const inv = extractColorInventory(html)
    expect(inv[0].valor).toBe("#B1B3B6")
    expect(inv[0].ocorrencias).toBe(1)
    expect(inv[1].valor).toBe("#130E31")
    expect(inv[1].ocorrencias).toBe(24)
  })

  it("fundo estreito (botão) não vira seção — segue ordenado por contagem", () => {
    const html =
      '<table width="260" style="background:#123456"><tr><td></td></tr></table>' +
      '<td style="border:1px solid #ABCDEF"></td>'.repeat(5)
    const inv = extractColorInventory(html)
    expect(inv[0].valor).toBe("#ABCDEF")
    expect(inv.find((e) => e.valor === "#123456")?.cobre_px).toBe(260)
  })

  it("cor de regra CSS dentro de <style> não herda largura de tag nenhum", () => {
    const html =
      '<table width="600"><tr><td>' +
      "<style>.x { background:#AA0000 }</style>" +
      "</td></tr></table>"
    expect(
      extractColorInventory(html).find((e) => e.valor === "#AA0000")?.cobre_px,
    ).toBeUndefined()
  })

  it("declaredWidth pega a maior largura declarada, e ignora %", () => {
    expect(declaredWidth('<table width="598" style="max-width:600px">')).toBe(600)
    expect(declaredWidth('<td width="100%">')).toBeNull()
    expect(declaredWidth("<td>")).toBeNull()
  })
})
