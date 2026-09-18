import { describe, expect, it } from "vitest"

import {
  CATALOGO_DE_SEPARACAO,
  catalogoParaPrompt,
  formaPorId,
} from "./separador-catalogo"

describe("CATALOGO_DE_SEPARACAO", () => {
  it("toda forma declara o que o aplicador e o prompt precisam", () => {
    for (const f of CATALOGO_DE_SEPARACAO) {
      expect(f.id, `${f.nome}: id`).toMatch(/^[a-z]+$/)
      expect(f.nome.length, `${f.id}: nome`).toBeGreaterThan(2)
      expect(f.alturaPx, `${f.id}: altura`).toBeGreaterThan(0)
      expect(f.quandoUsar.length, `${f.id}: quandoUsar`).toBeGreaterThan(20)
    }
  })

  it("id é único — apelido ambíguo resolveria para a forma errada", () => {
    const ids = CATALOGO_DE_SEPARACAO.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("só a forma `html` fica sem desenho; toda `png` tem svg", () => {
    for (const f of CATALOGO_DE_SEPARACAO) {
      if (f.render === "png") expect(f.svg, `${f.id}`).toBeTypeOf("function")
      else expect(f.svg, `${f.id}`).toBeUndefined()
    }
  })

  it("o svg usa as DUAS cores e sai em 600px", () => {
    for (const f of CATALOGO_DE_SEPARACAO) {
      if (!f.svg) continue
      const s = f.svg({ fundo: "#AABBCC", tinta: "#112233" })
      expect(s, `${f.id}`).toContain("#AABBCC")
      expect(s, `${f.id}`).toContain("#112233")
      expect(s, `${f.id}`).toContain('width="600"')
      expect(s, `${f.id}`).toContain(`height="${f.alturaPx}"`)
    }
  })

  it("os dois grupos existem — a biblioteca serve os dois casos", () => {
    const emenda = CATALOGO_DE_SEPARACAO.filter((f) => f.escondeEmenda)
    const marca = CATALOGO_DE_SEPARACAO.filter((f) => !f.escondeEmenda)
    expect(emenda.length).toBeGreaterThanOrEqual(3)
    expect(marca.length).toBeGreaterThanOrEqual(3)
  })
})

describe("formaPorId", () => {
  it("acha por id, ignorando caixa e espaço", () => {
    expect(formaPorId(" Onda ")?.id).toBe("onda")
  })

  it("forma inventada devolve null — o código não improvisa desenho", () => {
    expect(formaPorId("espiral")).toBeNull()
    expect(formaPorId(undefined)).toBeNull()
  })
})

describe("catalogoParaPrompt", () => {
  it("é GERADO da lista — nenhuma forma fica de fora do que o agente lê", () => {
    // Uma tabela escrita à mão no prompt envelheceria calada na primeira
    // forma acrescentada: o código a aceitaria e o agente nunca a pediria.
    const txt = catalogoParaPrompt()
    for (const f of CATALOGO_DE_SEPARACAO) {
      expect(txt, `${f.id} no prompt`).toContain(`\`${f.id}\``)
      expect(txt, `${f.id} altura`).toContain(`(${f.alturaPx}px)`)
    }
  })

  it("separa os dois grupos, porque trocá-los é erro de composição", () => {
    const txt = catalogoParaPrompt()
    expect(txt).toMatch(/ONDE O FUNDO TROCA/)
    expect(txt).toMatch(/ONDE O FUNDO É O MESMO/)
    const corte = txt.indexOf("ONDE O FUNDO É O MESMO")
    for (const f of CATALOGO_DE_SEPARACAO) {
      const pos = txt.indexOf(`\`${f.id}\``)
      if (f.escondeEmenda) expect(pos, f.id).toBeLessThan(corte)
      else expect(pos, f.id).toBeGreaterThan(corte)
    }
  })
})
