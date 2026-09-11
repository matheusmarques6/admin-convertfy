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

describe("tonsDeFundo — a procedência do fundo", () => {
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

  // A identidade REAL da Hero Boxers, lida do banco: duas principais, zero
  // secundárias. Mais os papéis que o código deriva delas.
  // A identidade REAL, lida do banco, mais o que `deriveColorRoles` produz a
  // partir dela: bg #FFFFFF, surface #F2F2F2, surface_strong #E3E3E3.
  const HERO_BOXERS = ["#000000", "#ffffff", "#FFFFFF", "#F2F2F2", "#E3E3E3"]

  it("o caso real: passa no teto de três e mesmo assim é o e-mail errado", () => {
    // Loja preto-e-branco. `#E1DEDE` está a 5 de distância do
    // surface_strong derivado (#E3E3E3) — é o mesmo cinza, e passa. O que
    // não passa é `#B1B3B6`, a 50 de distância, cobrindo o bloco de
    // produtos inteiro. E o preto da identidade não aparece em seção
    // nenhuma.
    const r = tonsDeFundo(
      [faixa(0, "#FFFFFF"), faixa(1, "#FFFFFF"), faixa(2, "#E1DEDE"), faixa(3, "#B1B3B6")],
      HERO_BOXERS,
    )
    expect(r.excede).toBe(false)
    expect(r.estranhos).toEqual(["#B1B3B6"])
    expect(r.foraDaIdentidade).toBe(true)
  })

  it("as duas principais da loja passam limpas", () => {
    const r = tonsDeFundo([faixa(0, "#000000"), faixa(1, "#FFFFFF")], HERO_BOXERS)
    expect(r.estranhos).toEqual([])
    expect(r.foraDaIdentidade).toBe(false)
    expect(r.tons.every((t) => t.da_marca)).toBe(true)
  })

  it("UMA cor estranha como FUNDO DE SEÇÃO já é desvio", () => {
    // A exceção da terceira cor vale para lugar pontual — card, selo,
    // filete. Uma banda que o leitor atravessa inteira não é isso.
    const r = tonsDeFundo(
      [faixa(0, "#000000"), faixa(1, "#FFFFFF"), faixa(2, "#B0C4AB")],
      HERO_BOXERS,
    )
    expect(r.estranhos).toEqual(["#B0C4AB"])
    expect(r.foraDaIdentidade).toBe(true)
  })

  it("o cinza DERIVADO da paleta é da marca; o cinza de outra loja não", () => {
    // É a diferença que o próprio agente escreveu na lacuna dele e não fez:
    // "#B1B3B6 não é um dos color_roles — deveria virar #E3E3E3".
    const r = tonsDeFundo([faixa(0, "#E3E3E3"), faixa(1, "#B1B3B6")], HERO_BOXERS)
    expect(r.tons[0].da_marca).toBe(true)
    expect(r.tons[1].da_marca).toBe(false)
  })

  it("loja SEM paleta cadastrada não acusa ninguém", () => {
    // Sem identidade não há de onde um fundo divergir, e inventar desvio
    // sobre o que não existe é pior que não medir.
    const r = tonsDeFundo([faixa(0, "#E1DEDE"), faixa(1, "#B1B3B6")], [])
    expect(r.estranhos).toEqual([])
    expect(r.tons.every((t) => t.da_marca)).toBe(true)
  })

  it("o teto de trás continua valendo mesmo com tudo da marca", () => {
    const paleta = ["#000000", "#FFFFFF", "#F2F2F2", "#E3E3E3"]
    const r = tonsDeFundo(
      [faixa(0, "#000000"), faixa(1, "#FFFFFF"), faixa(2, "#F2F2F2"), faixa(3, "#E3E3E3")],
      paleta,
    )
    expect(r.estranhos).toEqual([])
    expect(r.excede).toBe(true)
  })

  it("o mesmo tom em duas faixas conta uma vez, e a repetição fica registrada", () => {
    const r = tonsDeFundo([faixa(0, "#FFFFFF"), faixa(1, "#FFFFFF")], HERO_BOXERS)
    expect(r.tons).toHaveLength(1)
    expect(r.tons[0].faixas).toBe(2)
  })

  it("FOTO não gasta um tom", () => {
    const r = tonsDeFundo(
      [faixa(0, "#101010", true), faixa(1, "#FFFFFF"), faixa(2, "#E1DEDE")],
      HERO_BOXERS,
    )
    expect(r.tons.map((t) => t.hex)).toEqual(["#FFFFFF", "#E1DEDE"])
  })

  it("documento sem marcadores não acusa nada", () => {
    const r = tonsDeFundo([], HERO_BOXERS)
    expect(r.tons).toEqual([])
    expect(r.excede).toBe(false)
    expect(r.foraDaIdentidade).toBe(false)
  })

  it("#FFFFFF e #FDFDFD são o MESMO tom, e o branco da marca reconhece os dois", () => {
    // Dois brancos indistinguíveis vindos de variantes diferentes. Exigir o
    // hex exato contaria dois tons E marcaria um deles como estranho.
    const r = tonsDeFundo([faixa(0, "#FFFFFF"), faixa(1, "#FDFDFD")], HERO_BOXERS)
    expect(r.tons).toHaveLength(1)
    expect(r.tons[0].da_marca).toBe(true)
  })

  it("mas dois cinzas de verdade continuam sendo dois", () => {
    const r = tonsDeFundo([faixa(0, "#E1DEDE"), faixa(1, "#B1B3B6")], HERO_BOXERS)
    expect(r.tons).toHaveLength(2)
  })
})

describe("CTA que só existe no ramo do Outlook", () => {
  // Markup REAL da Hero Boxers (11/09): o roundrect carrega o texto de
  // exemplo de outra peça e o ramo `<!--[if !mso]>` ao lado está vazio.
  const bloco = (miolo: string) =>
    `<!-- cfy:block:0:body:start --><table width="600" style="width:600px"><tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF">${miolo}</td></tr></table><!-- cfy:block:0:body:end -->`

  const VML_ORFAO = `<!--[if mso]>
    <v:roundrect href="https://heroboxers.com" style="height:61px;width:354px;" arcsize="13%" fillcolor="#000000">
      <center style="color:#FFFFFF;font-size:32px;">DIGITAL GIFT CARD</center>
    </v:roundrect>
  <![endif]--> <!--[if !mso]><!-- --> <!--<![endif]-->`

  it("o roundrect órfão é ENCONTRADO e marcado", () => {
    const html = bloco(VML_ORFAO)
    const ctas = extrairCtas(html, extrairFaixas(html))
    expect(ctas).toHaveLength(1)
    expect(ctas[0].texto).toBe("DIGITAL GIFT CARD")
    expect(ctas[0].somente_outlook).toBe(true)
    expect(ctas[0].href).toBe("https://heroboxers.com")
    expect(ctas[0].fundo).toBe("#000000")
  })

  it("o par NORMAL (VML + <a>) continua contando UMA vez", () => {
    // É o padrão da casa, e contá-lo duas vezes faria o agente recolorir o
    // mesmo botão por dois caminhos.
    const html = bloco(
      `<!--[if mso]><v:roundrect href="#" fillcolor="#000000"><center>Comprar</center></v:roundrect><![endif]-->` +
        `<table><tr><td bgcolor="#000000" style="background-color:#000000;border-radius:4px"><a href="#" style="display:inline-block;padding:14px 36px;font-size:15px;color:#FFFFFF">Comprar</a></td></tr></table>`,
    )
    const ctas = extrairCtas(html, extrairFaixas(html))
    expect(ctas).toHaveLength(1)
    expect(ctas[0].vml).toBe(true)
    expect(ctas[0].somente_outlook).toBe(false)
  })

  it("botão comum não é marcado como só-Outlook", () => {
    const html = bloco(
      `<table><tr><td bgcolor="#000000" style="background-color:#000000"><a href="#" style="display:inline-block;padding:14px 36px;font-size:24px;font-weight:700;color:#FFFFFF">Ver tudo</a></td></tr></table>`,
    )
    const ctas = extrairCtas(html, extrairFaixas(html))
    expect(ctas[0].somente_outlook).toBe(false)
    expect(ctas[0].font_size_px).toBe(24)
    expect(ctas[0].peso).toBe(700)
    expect(ctas[0].padding_v).toBe(14)
    expect(ctas[0].padding_h).toBe(36)
  })
})
