import { describe, expect, it } from "vitest"

import { deriveColorRoles } from "./color-roles"
import {
  TOKENS_DE_IDENTIDADE,
  VALOR_PADRAO,
  aplicarTokens,
  raioDoBotao,
  resolverTokens,
  temTokensDeIdentidade,
  tokensNoHtml,
} from "./identity-tokens"

// A MESMA anatomia, escrita com tokens — é o que a biblioteca passa a guardar.
const ANATOMIA = `<tr><td bgcolor="{{COR_FUNDO}}" style="background-color:{{COR_FUNDO}};padding:24px;font-family:{{FONTE_CORPO}};color:{{COR_TEXTO}};">
  <h1 style="font-family:{{FONTE_TITULO}};font-weight:{{PESO_TITULO}};color:{{COR_TEXTO}};font-size:32px">Título</h1>
  <p style="font-weight:{{ PESO_CORPO }};">Corpo</p>
  <table><tr><td style="background-color:{{COR_SUPERFICIE}};padding:16px">painel</td></tr></table>
  <a href="#" style="background-color:{{COR_PRINCIPAL}};color:{{COR_TEXTO_SOBRE_PRINCIPAL}};border-radius:{{RAIO_BOTAO}};display:inline-block;padding:14px 32px">Comprar</a>
  <span style="color:{{COR_DESTAQUE}}">★</span>
</td></tr>`

const heroBoxers = resolverTokens({
  roles: deriveColorRoles([{ hex: "#000000", name: "Preto", role: "principal" }, { hex: "#FFFFFF", name: "Branco", role: "fundo" }]),
  fontHeading: "Poppins",
  fontBody: "Poppins",
  fontHeadingWeight: "Bold",
  fontBodyWeight: "Regular 400",
})
const innovaBay = resolverTokens({
  roles: deriveColorRoles([{ hex: "#034326", name: "Verde", role: "principal" }, { hex: "#FFFFFF", name: "Branco", role: "fundo" }]),
  fontHeading: "Playfair Display",
  fontBody: "Open Sans",
  fontHeadingWeight: "black 900",
  fontBodyWeight: null,
  raioBotaoPx: 0,
})

describe("resolverTokens", () => {
  it("cobre os 11 tokens e nunca deixa valor vazio", () => {
    for (const t of TOKENS_DE_IDENTIDADE) {
      expect(heroBoxers[t], t).toBeTruthy()
      expect(innovaBay[t], t).toBeTruthy()
    }
  })

  it("principal = fundo do botão; texto sobre principal contrasta; fonte sai com a pilha e o peso numérico", () => {
    expect(heroBoxers.COR_PRINCIPAL).toBe("#000000")
    expect(heroBoxers.COR_TEXTO_SOBRE_PRINCIPAL).toBe("#FFFFFF")
    expect(heroBoxers.COR_FUNDO).toBe("#FFFFFF")
    expect(heroBoxers.FONTE_TITULO).toBe("Poppins,Arial,Helvetica,sans-serif")
    expect(heroBoxers.PESO_TITULO).toBe("700")
    expect(heroBoxers.PESO_CORPO).toBe("400")
    expect(heroBoxers.RAIO_BOTAO).toBe("6px")

    expect(innovaBay.COR_PRINCIPAL).toBe("#034326")
    expect(innovaBay.FONTE_TITULO).toBe("'Playfair Display',Georgia,'Times New Roman',serif")
    expect(innovaBay.FONTE_CORPO).toBe("'Open Sans',Arial,Helvetica,sans-serif")
    expect(innovaBay.PESO_TITULO).toBe("900")
    expect(innovaBay.PESO_CORPO).toBe(VALOR_PADRAO.PESO_CORPO)
    expect(innovaBay.RAIO_BOTAO).toBe("0px")
  })

  it("sem fonte de corpo, o corpo herda a de título (e vice-versa); sem nenhuma, a sans padrão", () => {
    const soTitulo = resolverTokens({ roles: heroBoxers as never, fontHeading: "Lora" } as never)
    expect(soTitulo.FONTE_CORPO).toBe("Lora,Georgia,'Times New Roman',serif")
    const nenhuma = resolverTokens({ roles: deriveColorRoles([]) })
    expect(nenhuma.FONTE_TITULO).toBe(VALOR_PADRAO.FONTE_TITULO)
  })
})

describe("aplicarTokens", () => {
  it("a MESMA anatomia sai diferente em cada paleta e sem nenhum token cru", () => {
    const a = aplicarTokens(ANATOMIA, heroBoxers)
    const b = aplicarTokens(ANATOMIA, innovaBay)
    expect(a.html).not.toBe(b.html)
    expect(a.html).not.toMatch(/\{\{/)
    expect(b.html).not.toMatch(/\{\{/)
    expect(a.html).toContain("background-color:#000000;color:#FFFFFF;border-radius:6px")
    expect(b.html).toContain("background-color:#034326;color:#FFFFFF;border-radius:0px")
    expect(a.html).toContain("font-family:Poppins,Arial,Helvetica,sans-serif")
    expect(b.html).toContain("font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:900")
    // tolera espaço interno
    expect(a.html).toContain("font-weight:400;")
    expect(a.total).toBe(13)
    expect(a.aplicados.COR_FUNDO).toBe(2)
    expect(a.sem_valor).toEqual([])
  })

  it("chamador parcial: o token sem valor cai no padrão e é REPORTADO — nunca fica cru", () => {
    const r = aplicarTokens(ANATOMIA, { COR_FUNDO: "#FAF5F3" })
    expect(r.html).not.toMatch(/\{\{/)
    expect(r.html).toContain("#FAF5F3")
    expect(r.html).toContain(`background-color:${VALOR_PADRAO.COR_PRINCIPAL}`)
    expect(r.sem_valor).toContain("COR_PRINCIPAL")
    expect(r.sem_valor).not.toContain("COR_FUNDO")
  })

  it("HTML sem tokens devolve a mesma referência; valores nulos também não quebram", () => {
    const html = '<tr><td style="color:#111">x</td></tr>'
    expect(aplicarTokens(html, heroBoxers).html).toBe(html)
    expect(aplicarTokens(html, null).total).toBe(0)
    expect(temTokensDeIdentidade(html)).toBe(false)
    expect(temTokensDeIdentidade(ANATOMIA)).toBe(true)
    expect(tokensNoHtml(ANATOMIA)).toEqual([...TOKENS_DE_IDENTIDADE])
  })

  it("placeholder de copy ({{HERO_HEADLINE}}) não é token de identidade e fica intacto", () => {
    const html = '<h1 style="color:{{COR_TEXTO}}">{{HERO_HEADLINE}}</h1>'
    const r = aplicarTokens(html, heroBoxers)
    expect(r.html).toBe('<h1 style="color:#1F1F1F">{{HERO_HEADLINE}}</h1>')
  })
})

describe("raioDoBotao", () => {
  it("mediana dos <a> com fundo; selo redondo não arredonda os outros; sem declaração → null", () => {
    const html = `
      <a style="background-color:#000;border-radius:4px">a</a>
      <a style="background:#000;border-radius:4px">b</a>
      <a style="background-color:#000;border-radius:999px">selo</a>
      <a style="border-radius:40px">vazado sem fundo</a>`
    expect(raioDoBotao(html)).toBe(4)
    expect(raioDoBotao('<a style="background:#000">x</a>')).toBeNull()
    expect(raioDoBotao("")).toBeNull()
  })
})
