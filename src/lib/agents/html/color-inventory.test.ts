/**
 * Inventário de cores + recolor global (F4 — arquitetura por views).
 * O extractor é o ponto crítico do desenho: cor invisível pro inventário
 * é cor que o agente não troca — fixtures cobrem hex/short-hex/rgb/rgba/
 * bgcolor/<style> (dark mode).
 */
import { describe, it, expect } from "vitest"
import {
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
    expect(roxo.contextos).toContain("bgcolor")
    expect(roxo.contextos).toContain("background")

    const branco = inv.find((e) => e.valor === "#FFFFFF")!
    expect(branco.ocorrencias).toBe(2) // #fff + rgb(255,255,255)
    expect(branco.contextos).toContain("color")

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
