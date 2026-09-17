import { describe, expect, it } from "vitest"

import { htmlSemBlocos, preservarBlocos } from "./blocos-tokenizados"

const doc = (b0: string, b1: string) =>
  `<table><!-- cfy:block:0:hero:start -->${b0}<!-- cfy:block:0:hero:end --><!-- cfy:block:1:body:start -->${b1}<!-- cfy:block:1:body:end --></table>`

describe("htmlSemBlocos", () => {
  it("apaga só as regiões pedidas, mantendo o comprimento e os marcadores", () => {
    const html = doc('<td bgcolor="#FFFFFF">hero</td>', '<td bgcolor="#FFFFFF">body</td>')
    const out = htmlSemBlocos(html, [0])
    expect(out.length).toBe(html.length)
    expect(out).toContain("cfy:block:0:hero:start")
    expect(out).not.toMatch(/hero<\/td>/)
    expect(out).toMatch(/body<\/td>/)
    expect(htmlSemBlocos(html, [])).toBe(html)
    expect(htmlSemBlocos(html, [7])).toBe(html)
  })
})

describe("preservarBlocos", () => {
  it("restaura o bloco tokenizado que uma op global alcançou; o outro bloco fica com a op", () => {
    const original = doc('<td bgcolor="#FFFFFF">hero</td>', '<td bgcolor="#FFFFFF">body</td>')
    // recolor global #FFFFFF → #F2F2F2 pegou os dois; e o body ganhou um botão (comprimento mudou)
    const modificado = doc('<td bgcolor="#F2F2F2">hero</td>', '<td bgcolor="#F2F2F2">body<a>CTA</a></td>')
    const r = preservarBlocos(original, modificado, [0])
    expect(r.restaurados).toEqual([0])
    expect(r.html).toContain('<td bgcolor="#FFFFFF">hero</td>')
    expect(r.html).toContain('<td bgcolor="#F2F2F2">body<a>CTA</a></td>')
    expect(r.nao_localizados).toEqual([])
  })

  it("bloco já igual não conta como restaurado; índice sem marcador é reportado", () => {
    const original = doc("<td>a</td>", "<td>b</td>")
    const r = preservarBlocos(original, original, [0, 1, 9])
    expect(r.restaurados).toEqual([])
    expect(r.nao_localizados).toEqual([9])
    expect(r.html).toBe(original)
  })
})
