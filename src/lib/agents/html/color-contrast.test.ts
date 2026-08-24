/**
 * Contraste: os casos espelham o incidente real da Luxe Lift (22/08) — o
 * botão que saiu branco sobre creme e a hero, cujo fundo é foto.
 */
import { describe, it, expect } from "vitest"
import {
  resolveEffectiveBackground,
  auditContrast,
  contrastRatio,
  isLargeText,
  DEFAULT_CANVAS,
  annotateInventoryPairs,
  backgroundDeclarations,
} from "./color-contrast"
import { extractColorInventory } from "./color-inventory"
import { buildAncestorChain } from "./dom-locator"

/**
 * Célula SEMPRE dentro de `<table><tr>`: fora dela o parse5 aplica foster
 * parenting e descarta o `<td>`, então a cadeia de ancestrais chegaria só
 * no `<a>`. HTML de e-mail real nunca tem célula solta — o fixture tem que
 * espelhar isso.
 */
const cell = (attrs: string, inner: string) =>
  `<table><tr><td ${attrs}>${inner}</td></tr></table>`

const bgAt = (html: string, needle: string) =>
  resolveEffectiveBackground(
    html,
    html.indexOf(needle),
    buildAncestorChain(html),
  )

describe("resolveEffectiveBackground", () => {
  it("sobe pelo ancestral: cor do <a> pousa no bgcolor do <td>", () => {
    const html = cell('bgcolor="#F5EFE6"', '<a style="color:#FFFFFF;">x</a>')
    expect(bgAt(html, "#FFFFFF")).toEqual({ kind: "color", hex: "#F5EFE6" })
  })

  it("o mais interno vence o ancestral", () => {
    const html =
      '<table style="background:#111111;"><tr><td style="background:#FAF5F3;">' +
      '<a style="color:#FFFFFF;">x</a></td></tr></table>'
    expect(bgAt(html, "#FFFFFF")).toEqual({ kind: "color", hex: "#FAF5F3" })
  })

  it("background-color vence bgcolor no mesmo elemento", () => {
    const html = cell(
      'bgcolor="#000000" style="background-color:#FAF5F3;"',
      '<a style="color:#FFFFFF;">x</a>',
    )
    expect(bgAt(html, "#FFFFFF")).toEqual({ kind: "color", hex: "#FAF5F3" })
  })

  it("background-image devolve kind:image com a URL — é o endereço do slot", () => {
    const html = cell(
      'style="background-image:url(https://cdn/foto.png);background-size:598px 1150px;"',
      '<div style="color:#FFFFFF;">Welcome to</div>',
    )
    expect(bgAt(html, "#FFFFFF")).toEqual({
      kind: "image",
      url: "https://cdn/foto.png",
    })
  })

  it("aspas simples no url() — a forma que o agente de hero escreve", () => {
    const html = cell(
      `style="background-image:url('https://cdn/assinada.png?token=AAA');"`,
      '<div style="color:#FFFFFF;">x</div>',
    )
    expect(bgAt(html, "#FFFFFF")).toEqual({
      kind: "image",
      url: "https://cdn/assinada.png?token=AAA",
    })
  })

  it("shorthand com url() também é imagem, mesmo tendo hex antes", () => {
    const html = cell(
      'style="background:#FFFFFF url(https://cdn/f.png) center;"',
      '<div style="color:#FFFFFF;">x</div>',
    )
    expect(bgAt(html, "#FFFFFF")).toEqual({
      kind: "image",
      url: "https://cdn/f.png",
    })
  })

  it("background como ATRIBUTO (padrão antigo) também carrega a URL", () => {
    const html = cell(
      'background="https://cdn/legado.png"',
      '<div style="color:#FFFFFF;">x</div>',
    )
    expect(bgAt(html, "#FFFFFF")).toEqual({
      kind: "image",
      url: "https://cdn/legado.png",
    })
  })

  it("sem fundo em nenhum ancestral → cai no branco do container", () => {
    const html = cell("", '<a style="color:#777777;">x</a>')
    expect(bgAt(html, "#777777")).toEqual({
      kind: "color",
      hex: DEFAULT_CANVAS,
    })
  })
})

describe("contrastRatio", () => {
  it("bate os valores WCAG conhecidos", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 4)
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 4)
  })

  it("o par do incidente é praticamente 1:1", () => {
    // Botão "SHOP THE COMFORT LIFT COLLECTION" como saiu em produção.
    expect(contrastRatio("#FFFFFF", "#FAF5F3")).toBeLessThan(1.1)
  })
})

describe("isLargeText", () => {
  it("≥24px é grande; ≥18.66px só com peso ≥700", () => {
    expect(isLargeText('style="font-size:26px;"')).toBe(true)
    expect(isLargeText('style="font-size:19px;font-weight:700;"')).toBe(true)
    expect(isLargeText('style="font-size:19px;"')).toBe(false)
    expect(isLargeText('style="font-size:16px;font-weight:bold;"')).toBe(false)
    expect(isLargeText("")).toBe(false)
  })
})

describe("auditContrast", () => {
  it("acha o par real do incidente", () => {
    const html = cell(
      'style="width:556px;height:58px;background:#FAF5F3;"',
      '<a style="font-size:25px;font-weight:700;color:#FFFFFF;">' +
        "SHOP THE COMFORT LIFT COLLECTION</a>",
    )
    const f = auditContrast(html)
    expect(f).toHaveLength(1)
    expect(f[0].textHex).toBe("#FFFFFF")
    expect(f[0].bgHex).toBe("#FAF5F3")
    expect(f[0].ratio).toBeLessThan(1.1)
    // Texto grande: o mínimo cai para 3, e mesmo assim reprova.
    expect(f[0].large).toBe(true)
    expect(f[0].min).toBe(3)
  })

  it("NÃO acusa o CTA da hero, que está em 11:1", () => {
    const html = cell(
      'style="background:#3D2820;"',
      '<a style="font-size:18px;color:#FFFFFF;">SHOP NOW</a>',
    )
    expect(auditContrast(html)).toEqual([])
  })

  it("fundo em foto entra como indecidível, não como reprovação", () => {
    const html = cell(
      'style="background-image:url(https://cdn/hero.png);"',
      '<div style="font-size:50px;color:#FFFFFF;">Welcome to</div>',
    )
    const f = auditContrast(html)
    expect(f).toHaveLength(1)
    expect(f[0].ratio).toBeNull()
    expect(f[0].motivo).toBe("fundo_imagem")
  })

  it("limiar de texto grande muda o veredito de um par intermediário", () => {
    // #949494 sobre branco ≈ 3,3:1 — reprova em 16px, passa em 26px.
    const pequeno = cell("", '<span style="font-size:16px;color:#949494;">x</span>')
    const grande = cell("", '<span style="font-size:26px;color:#949494;">x</span>')
    expect(auditContrast(pequeno)).toHaveLength(1)
    expect(auditContrast(grande)).toEqual([])
  })

  it("não confunde background-color nem border-color com cor de texto", () => {
    const html = cell(
      'style="background-color:#FAF5F3;border-color:#FAF5F3;"',
      '<span style="color:#1F1F1F;">legível</span>',
    )
    expect(auditContrast(html)).toEqual([])
  })
})

describe("annotateInventoryPairs", () => {
  const cellPair = (bg: string, text: string, size = "16px") =>
    cell(`style="background:${bg};"`, `<span style="font-size:${size};color:${text};">x</span>`)

  it("cor de TEXTO ganha sobre + contraste_min", () => {
    const html = cellPair("#FAF5F3", "#FFFFFF")
    const [entrada] = annotateInventoryPairs(html, extractColorInventory(html))
      .filter((e) => e.valor === "#FFFFFF")
    expect(entrada.sobre).toEqual({ "#FAF5F3": 1 })
    expect(entrada.contraste_min).toBeLessThan(1.1)
  })

  it("conta cada fundo em que a mesma cor de texto aparece", () => {
    const html =
      "<table><tr>" +
      '<td style="background:#3D2820;"><span style="color:#FFFFFF;">a</span></td>' +
      '<td style="background:#FAF5F3;"><span style="color:#FFFFFF;">b</span></td>' +
      "</tr></table>"
    const [entrada] = annotateInventoryPairs(html, extractColorInventory(html))
      .filter((e) => e.valor === "#FFFFFF")
    expect(entrada.sobre).toEqual({ "#3D2820": 1, "#FAF5F3": 1 })
    // O pior par é o que importa para a decisão.
    expect(entrada.contraste_min).toBeLessThan(1.1)
  })

  it("fundo em foto vira o rótulo 'imagem', não um hex inventado", () => {
    const html = cell(
      'style="background-image:url(https://cdn/h.png);"',
      '<div style="color:#FFFFFF;">Welcome</div>',
    )
    const [entrada] = annotateInventoryPairs(html, extractColorInventory(html))
      .filter((e) => e.valor === "#FFFFFF")
    expect(entrada.sobre).toEqual({ imagem: 1 })
    // Só sobre foto → não há contraste mensurável.
    expect(entrada.contraste_min).toBeNull()
  })

  it("cor que só aparece como FUNDO não ganha sobre", () => {
    const html = cellPair("#FAF5F3", "#1F1F1F")
    const fundo = annotateInventoryPairs(html, extractColorInventory(html))
      .find((e) => e.valor === "#FAF5F3")
    expect(fundo?.sobre).toBeUndefined()
    expect(fundo?.contraste_min).toBeUndefined()
  })
})

describe("fundo dentro de fundo (dentro_de)", () => {
  it("o painel sabe sobre qual fundo ele pousa", () => {
    // A forma exata da `produtos 4`: seção de 598px pintada dentro do
    // wrapper branco do Montador.
    const html =
      '<table width="600" style="background:#FFFFFF;"><tr><td>' +
      '<table width="598" style="background:#D9D9D9;"><tr><td>x</td></tr></table>' +
      "</td></tr></table>"
    const inv = annotateInventoryPairs(html, extractColorInventory(html))
    expect(inv.find((e) => e.valor === "#D9D9D9")?.dentro_de).toEqual({
      "#FFFFFF": 1,
    })
  })

  it("fundo no topo do documento não tem dentro_de", () => {
    const html = '<table width="600" style="background:#FFFFFF;"><tr><td>x</td></tr></table>'
    const inv = annotateInventoryPairs(html, extractColorInventory(html))
    expect(inv.find((e) => e.valor === "#FFFFFF")?.dentro_de).toBeUndefined()
  })

  it("td repetindo a cor do table não conta como um segundo painel", () => {
    // Redundância de compatibilidade, não hierarquia visual: o painel é UM
    // só. Contar as duas declarações faria o agente ver duas camadas onde
    // existe uma.
    const html =
      '<table style="background:#FFFFFF;"><tr><td>' +
      '<table style="background:#EEEEEE;"><tr>' +
      '<td bgcolor="#EEEEEE">x</td></tr></table>' +
      "</td></tr></table>"
    const inv = annotateInventoryPairs(html, extractColorInventory(html))
    expect(inv.find((e) => e.valor === "#EEEEEE")?.dentro_de).toEqual({
      "#FFFFFF": 1,
    })
  })

  it("painel sobre FOTO é anotado como imagem", () => {
    const html =
      '<table style="background:#FFFFFF url(https://cdn/x.jpg);"><tr><td>' +
      '<table style="background:#D9D9D9;"><tr><td>x</td></tr></table>' +
      "</td></tr></table>"
    const inv = annotateInventoryPairs(html, extractColorInventory(html))
    expect(inv.find((e) => e.valor === "#D9D9D9")?.dentro_de).toEqual({
      imagem: 1,
    })
  })

  it("backgroundDeclarations sai em ordem de documento, com bgcolor junto", () => {
    const html =
      '<table style="background:#FFFFFF;"><tr>' +
      '<td bgcolor="#D9D9D9">a</td>' +
      '<td style="background-color:#BEBEBE">b</td>' +
      "</tr></table>"
    const decls = backgroundDeclarations(html)
    expect(decls.map((d) => d.hex)).toEqual(["#FFFFFF", "#D9D9D9", "#BEBEBE"])
    // Os dois painéis pousam no branco da tabela; o branco, no canvas.
    expect(decls[1].parent).toEqual({ kind: "color", hex: "#FFFFFF" })
    expect(decls[2].parent).toEqual({ kind: "color", hex: "#FFFFFF" })
  })

  it("borda NÃO entra como declaração de fundo", () => {
    const html = '<table><tr><td style="border:1px solid #130E31">x</td></tr></table>'
    expect(backgroundDeclarations(html)).toHaveLength(0)
  })
})
