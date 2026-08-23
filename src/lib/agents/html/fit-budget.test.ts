/**
 * O caso travado aqui é o botão real da Luxe Lift (23/08): 32 caracteres
 * num campo de limite 34 — dentro do cadastro — que quebrou em duas linhas
 * e vazou da faixa.
 */
import { describe, it, expect } from "vitest"
import { measureSlot } from "./fit-budget"
import { buildAncestorChain } from "./dom-locator"

const medir = (html: string, agulha: string) =>
  measureSlot(html, html.indexOf(agulha), agulha, buildAncestorChain(html))

/** CTA final de `produtos 7 - dois produtos`, como saiu no e-mail. */
const BOTAO = (rotulo: string) =>
  '<table><tr><td align="center" style="padding:47px 21px 49px 21px;">' +
  '<table width="556" style="width:556px;"><tr>' +
  '<td align="center" height="58" style="width:556px;height:58px;background:#FAF5F3;">' +
  '<a style="display:block;width:556px;height:58px;line-height:58px;' +
  "font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:25px;" +
  'font-weight:700;letter-spacing:0.15em;color:#1F1F1F;">' +
  `${rotulo}</a></td></tr></table></td></tr></table>`

describe("measureSlot — o botão que quebrou", () => {
  it("mede a caixa e diz que cabem ~26, não 34", () => {
    const m = medir(BOTAO("SHOP THE COMFORT LIFT COLLECTION"), "SHOP THE")
    expect(m).not.toBeNull()
    expect(m!.widthPx).toBe(556)
    expect(m!.fontSizePx).toBe(25)
    expect(m!.trackingPx).toBeCloseTo(3.75, 2)
    expect(m!.uppercase).toBe(true)
    // 556 × 0.95 / (25×0.7 + 3.75) ≈ 24-26. O que importa é reprovar o 32.
    expect(m!.chars).toBeGreaterThanOrEqual(22)
    expect(m!.chars).toBeLessThan(32)
  })

  it("o rótulo que estourou fica ACIMA do medido; o exemplo do cadastro cabe", () => {
    const m = medir(BOTAO("SHOP THE COMFORT LIFT COLLECTION"), "SHOP THE")!
    expect("SHOP THE COMFORT LIFT COLLECTION".length).toBeGreaterThan(m.chars)
    expect("SHOP COLLECTION".length).toBeLessThanOrEqual(m.chars)
  })

  it("caixa mista cabe mais que caixa alta na MESMA caixa", () => {
    const alta = medir(BOTAO("SHOP THE COLLECTION"), "SHOP THE")!
    const mista = medir(BOTAO("Shop the collection"), "Shop the")!
    expect(mista.chars).toBeGreaterThan(alta.chars)
  })

  it("sem tracking cabe mais — o letter-spacing é metade do problema", () => {
    const semTracking = BOTAO("SHOP THE COLLECTION").replace(
      "letter-spacing:0.15em;",
      "",
    )
    const com = medir(BOTAO("SHOP THE COLLECTION"), "SHOP THE")!
    const sem = medir(semTracking, "SHOP THE")!
    expect(sem.chars).toBeGreaterThan(com.chars)
  })
})

describe("measureSlot — quando NÃO medir", () => {
  it("célula sem altura declarada devolve null (pode ter N linhas)", () => {
    // Corpo de 5 linhas: a largura de UMA linha não é o limite do campo.
    const html =
      '<table><tr><td style="width:300px;font-size:16px;line-height:24px;">' +
      "Uma copy longa de corpo</td></tr></table>"
    expect(medir(html, "Uma copy")).toBeNull()
  })

  it("altura MAIOR que o line-height devolve null (cabe mais de uma linha)", () => {
    const html =
      '<table><tr><td style="width:300px;height:96px;line-height:24px;font-size:16px;">' +
      "Texto</td></tr></table>"
    expect(medir(html, "Texto")).toBeNull()
  })

  it("sem largura em lugar nenhum devolve null", () => {
    const html =
      '<table><tr><td style="height:58px;line-height:58px;font-size:25px;">' +
      "Texto</td></tr></table>"
    expect(medir(html, "Texto")).toBeNull()
  })

  it("sem font-size devolve null", () => {
    const html =
      '<table><tr><td style="width:556px;height:58px;line-height:58px;">' +
      "Texto</td></tr></table>"
    expect(medir(html, "Texto")).toBeNull()
  })
})

describe("measureSlot — a caixa útil", () => {
  it("desconta o padding de quem está DENTRO da caixa de largura", () => {
    // O padding do elemento interno come a área do texto; o do próprio
    // elemento que declara `width` fica fora dela (content-box), e o de um
    // ancestral ACIMA é irrelevante — a largura já está declarada.
    const comPad =
      '<table><tr><td style="width:400px;">' +
      '<div style="padding:0 30px;height:40px;line-height:40px;font-size:20px;">' +
      "TEXTO</div></td></tr></table>"
    const semPad =
      '<table><tr><td style="width:400px;">' +
      '<div style="height:40px;line-height:40px;font-size:20px;">TEXTO</div>' +
      "</td></tr></table>"
    expect(medir(comPad, "TEXTO")!.widthPx).toBe(340)
    expect(medir(semPad, "TEXTO")!.widthPx).toBe(400)
  })

  it("padding do ancestral ACIMA da largura não desconta nada", () => {
    // É o caso real do botão: o <td> externo tem padding 47px 21px, e o
    // <table width=556> dentro dele declara a caixa. 556 é a verdade.
    const m = medir(BOTAO("SHOP THE COLLECTION"), "SHOP THE")!
    expect(m.widthPx).toBe(556)
  })

  it("shorthand com `0` sem unidade é lido (padding:0 30px)", () => {
    // Forma mais comum em e-mail. Recusar o zero fazia o shorthand inteiro
    // ser ignorado e o padding sumir da conta.
    const html =
      '<table><tr><td style="width:400px;">' +
      '<div style="padding:0 25px;height:40px;line-height:40px;font-size:20px;">' +
      "TEXTO</div></td></tr></table>"
    expect(medir(html, "TEXTO")!.widthPx).toBe(350)
  })

  it("width como ATRIBUTO conta (padrão antigo de e-mail)", () => {
    const html =
      '<table><tr><td width="480" style="height:40px;line-height:40px;font-size:20px;">' +
      "TEXTO</td></tr></table>"
    expect(medir(html, "TEXTO")!.widthPx).toBe(480)
  })

  it("o font-size mais INTERNO vence o do ancestral", () => {
    const html =
      '<table><tr><td style="width:400px;font-size:40px;">' +
      '<span style="height:30px;line-height:30px;font-size:15px;">TEXTO</span>' +
      "</td></tr></table>"
    expect(medir(html, "TEXTO")!.fontSizePx).toBe(15)
  })
})
