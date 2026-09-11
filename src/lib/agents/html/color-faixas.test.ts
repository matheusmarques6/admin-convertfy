import { describe, expect, it } from "vitest"

import { extrairCtas, extrairFaixas, tonsDeFundo } from "./color-faixas"

/** Bloco com os marcadores que a montagem escreve. */
function bloco(indice: number, tipo: string, miolo: string): string {
  return `<!-- cfy:block:${indice}:${tipo}:start -->${miolo}<!-- cfy:block:${indice}:${tipo}:end -->`
}

const BOTAO = (fundo: string, label: string, texto = "Comprar") =>
  `<table role="presentation" width="260"><tr>
     <td align="center" width="260" style="background-color:${fundo};border-radius:4px;">
       <a href="https://loja.com/col" style="display:inline-block;padding:14px 36px;color:${label};">${texto}</a>
     </td></tr></table>`

const DOC = `<!DOCTYPE html><html><body>
<table width="600" style="width:600px;background-color:#FFFFFF;">
${bloco(0, "hero", `<tr><td width="600" style="background:url(https://cdn/x.jpg);">
  <h1 style="color:#FFFFFF;">Bem-vindo</h1>${BOTAO("#D4AF37", "#111111", "Garantir 10% OFF")}
</td></tr>`)}
${bloco(1, "body", `<tr><td width="600" style="background-color:#FFFFFF;">
  <p style="color:#111111;">Texto do corpo com um <a href="https://loja.com/sobre" style="color:#111111;">link comum</a> no meio.</p>
</td></tr>`)}
${bloco(2, "products", `<tr><td width="600" style="background-color:#FFFFFF;">
  <table width="280"><tr><td width="280" style="background-color:#F4F4F4;">card</td></tr></table>
  ${BOTAO("#111111", "#FFFFFF")}
</td></tr>`)}
${bloco(3, "footer", `<tr><td width="600" style="background-color:#EEEEEE;">
  <span style="color:#6E6E6E;">rodapé</span>
</td></tr>`)}
</table></body></html>`

describe("extrairFaixas", () => {
  it("devolve a sequência na ordem do documento, com bloco e tipo", () => {
    const f = extrairFaixas(DOC)
    expect(f.map((x) => [x.ordem, x.bloco, x.tipo])).toEqual([
      [1, 0, "hero"],
      [2, 1, "body"],
      [3, 2, "products"],
      [4, 3, "footer"],
    ])
  })

  it("hero com foto sai como foto, sem fundo e sem luminância", () => {
    const hero = extrairFaixas(DOC)[0]
    expect(hero.foto).toBe(true)
    expect(hero.fundo).toBeNull()
    expect(hero.luminancia).toBeNull()
    // Não é editável: não há hex de seção ali para uma op trocar.
    expect(hero.editavel).toBe(false)
  })

  it("fundo de seção vira faixa com luminância; card de 280px NÃO vira", () => {
    const produtos = extrairFaixas(DOC)[2]
    expect(produtos.fundo).toBe("#FFFFFF")
    expect(produtos.cobre_px).toBe(600)
    expect(produtos.editavel).toBe(true)
    expect(produtos.luminancia).toBeCloseTo(1, 2)
    // O #F4F4F4 do card não aparece como faixa nenhuma.
    expect(extrairFaixas(DOC).some((f) => f.fundo === "#F4F4F4")).toBe(false)
  })

  it("o rodapé escuro entra com a própria luminância", () => {
    const rodape = extrairFaixas(DOC)[3]
    expect(rodape.fundo).toBe("#EEEEEE")
    expect(rodape.luminancia).toBeLessThan(1)
  })

  it("documento SEM marcadores devolve lista vazia — não inventa ordem", () => {
    const semMarcador = `<table width="600" style="background-color:#FFFFFF;"><tr><td>x</td></tr></table>`
    expect(extrairFaixas(semMarcador)).toEqual([])
  })
})

describe("extrairCtas", () => {
  const faixas = extrairFaixas(DOC)
  const ctas = extrairCtas(DOC, faixas)

  it("acha os botões e ignora link de texto", () => {
    expect(ctas.map((c) => c.texto)).toEqual(["Garantir 10% OFF", "Comprar"])
  })

  it("cada botão sabe em que faixa está", () => {
    expect(ctas[0].faixa).toBe(1)
    expect(ctas[0].bloco).toBe(0)
    expect(ctas[1].faixa).toBe(3)
    expect(ctas[1].bloco).toBe(2)
  })

  it("lê fundo, label, raio, largura e o contraste do par", () => {
    const hero = ctas[0]
    expect(hero.fundo).toBe("#D4AF37")
    expect(hero.label).toBe("#111111")
    expect(hero.tipo).toBe("preenchido")
    expect(hero.radius_px).toBe(4)
    expect(hero.largura_px).toBe(260)
    expect(hero.contraste).toBeGreaterThan(4.5)
  })

  it("guarda o href — é o que permite reusar o destino sem inventar URL", () => {
    expect(ctas[0].href).toBe("https://loja.com/col")
  })

  it("botão vazado (só borda) entra como vazado e sem contraste", () => {
    const doc = `<table width="600"><tr>${bloco(
      0,
      "cta",
      `<td width="600" style="background-color:#FFFFFF;">
         <td style="border:1px solid #111111;border-radius:4px;">
           <a href="https://loja.com" style="color:#111111;">Ver todos</a>
         </td></td>`,
    )}</tr></table>`
    const c = extrairCtas(doc, extrairFaixas(doc))
    expect(c).toHaveLength(1)
    expect(c[0].tipo).toBe("vazado")
    expect(c[0].fundo).toBeNull()
    expect(c[0].contraste).toBeNull()
  })

  it("marca vml quando o botão vem embrulhado no roundrect do Outlook", () => {
    const doc = `<table width="600"><tr>${bloco(
      0,
      "cta",
      `<td width="600" style="background-color:#FFFFFF;">
         <!--[if mso]><v:roundrect fillcolor="#111111"><![endif]-->
         <table width="260"><tr><td width="260" style="background-color:#111111;border-radius:4px;">
           <a href="https://loja.com" style="color:#FFFFFF;">Comprar</a>
         </td></tr></table>`,
    )}</tr></table>`
    const c = extrairCtas(doc, extrairFaixas(doc))
    expect(c).toHaveLength(1)
    expect(c[0].vml).toBe(true)
  })

  it("link dentro de faixa colorida NÃO vira botão", () => {
    // O `<td>` de 600px que pinta a seção não é o fundo de um botão. Sem a
    // guarda de largura, este link entrava como CTA preenchido de 600px — e
    // uma op de cor sobre ele repintaria a seção inteira.
    const doc = `<table width="600"><tr>${bloco(
      0,
      "body",
      `<td width="600" style="background-color:#F4F4F4;">
         <p style="color:#111111;">Leia <a href="https://loja.com/x" style="color:#111111;">nossa história</a> aqui.</p>
       </td>`,
    )}</tr></table>`
    expect(extrairCtas(doc, extrairFaixas(doc))).toEqual([])
  })

  it("botão sem fundo próprio é reconhecido pela caixa do <a>", () => {
    const doc = `<table width="600"><tr>${bloco(
      0,
      "cta",
      `<td width="600" style="background-color:#FFFFFF;">
         <a href="https://loja.com" style="display:inline-block;padding:14px 36px;color:#FFFFFF;background-color:#111111;">Comprar</a>
       </td>`,
    )}</tr></table>`
    const c = extrairCtas(doc, extrairFaixas(doc))
    expect(c).toHaveLength(1)
    expect(c[0].fundo).toBe("#111111")
  })

  it("texto longo com fundo é banda com link, não CTA", () => {
    const longo = "Este é um parágrafo bem comprido que por acaso está inteiro dentro de um link e não é botão nenhum"
    const doc = `<table width="600"><tr>${bloco(
      0,
      "body",
      `<td width="600" style="background-color:#F4F4F4;"><a href="https://loja.com" style="color:#111111;">${longo}</a></td>`,
    )}</tr></table>`
    expect(extrairCtas(doc, extrairFaixas(doc))).toEqual([])
  })
})

describe("tonsDeFundo — a R2 medida por código", () => {
  const faixa = (bloco: number, fundo: string | null, foto = false) => ({
    ordem: bloco + 1,
    bloco,
    tipo: "body",
    fundo,
    foto,
    luminancia: null,
    cobre_px: 600,
    editavel: fundo != null,
    decls: [],
  })

  it("o caso real da Hero Boxers: quatro fundos, teto de três", () => {
    // Medido em 11/09. O agente decidiu `manter` nas duas faixas cinza,
    // com justificativa boa em cada uma (R3 numa, R5/R6 na outra), e nunca
    // somou o conjunto.
    const r = tonsDeFundo([
      faixa(0, "#000000"),
      faixa(1, "#FFFFFF"),
      faixa(2, "#E1DEDE"),
      faixa(3, "#B1B3B6"),
      faixa(4, "#FFFFFF"),
    ])
    expect(r.tons).toEqual(["#000000", "#FFFFFF", "#E1DEDE", "#B1B3B6"])
    expect(r.excede).toBe(true)
    expect(r.excedentes).toEqual(["#B1B3B6"])
  })

  it("três tons passam; o repetido não conta duas vezes", () => {
    const r = tonsDeFundo([
      faixa(0, "#000000"),
      faixa(1, "#FFFFFF"),
      faixa(2, "#FFFFFF"),
      faixa(3, "#F2F2F2"),
    ])
    expect(r.tons).toHaveLength(3)
    expect(r.excede).toBe(false)
    expect(r.excedentes).toEqual([])
  })

  it("FOTO não gasta um tom", () => {
    // Quem lê a peça vê a foto, não a cor atrás dela. Contá-la faria a hero
    // fotográfica queimar um dos três tons sem que ninguém perceba um tom.
    const r = tonsDeFundo([
      faixa(0, "#101010", true),
      faixa(1, "#FFFFFF"),
      faixa(2, "#E1DEDE"),
      faixa(3, "#B1B3B6"),
    ])
    expect(r.tons).toEqual(["#FFFFFF", "#E1DEDE", "#B1B3B6"])
    expect(r.excede).toBe(false)
  })

  it("caixa do hex não duplica o tom", () => {
    const r = tonsDeFundo([faixa(0, "#ffffff"), faixa(1, "#FFFFFF")])
    expect(r.tons).toEqual(["#FFFFFF"])
  })

  it("documento sem marcadores não acusa nada", () => {
    // Sem endereço não há conta a fazer, e acusar aqui seria inventar
    // defeito sobre o que não foi medido.
    const r = tonsDeFundo([])
    expect(r.tons).toEqual([])
    expect(r.excede).toBe(false)
  })
})
