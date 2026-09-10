import { describe, expect, it } from "vitest"

import { applyOps, type FormatOp } from "./apply-patches"
import { extrairCtas, extrairFaixas } from "./color-faixas"

function bloco(indice: number, tipo: string, miolo: string): string {
  return `<!-- cfy:block:${indice}:${tipo}:start -->${miolo}<!-- cfy:block:${indice}:${tipo}:end -->`
}

const BOTAO = (fundo: string, label: string, texto = "Comprar") =>
  `<table role="presentation" width="260"><tr>
     <td align="center" width="260" bgcolor="${fundo}" style="background-color:${fundo};border-radius:4px;">
       <a href="https://loja.com/col" style="display:inline-block;padding:14px 36px;color:${label};">${texto}</a>
     </td></tr></table>`

/** Quatro blocos, TRÊS deles com o mesmo `#FFFFFF` de fundo. */
const DOC = `<!DOCTYPE html><html><body><table width="600" style="width:600px;">
${bloco(0, "hero", `<tr><td width="600" style="background-color:#222222;"><p style="color:#FFFFFF;">hero</p></td></tr>`)}
${bloco(1, "body", `<tr><td width="600" style="background-color:#FFFFFF;"><p style="color:#111111;">corpo</p></td></tr>`)}
${bloco(2, "products", `<tr><td width="600" style="background-color:#FFFFFF;"><p style="color:#111111;">produtos</p>${BOTAO("#111111", "#FFFFFF")}</td></tr>`)}
${bloco(3, "footer", `<tr><td width="600" style="background-color:#FFFFFF;"><p style="color:#111111;">rodapé</p></td></tr>`)}
</table></body></html>`

function contexto(html: string) {
  const faixas = extrairFaixas(html)
  return { faixas, ctas: extrairCtas(html, faixas) }
}

function aplicar(html: string, ops: FormatOp[]) {
  const ctx = contexto(html)
  return applyOps(html, ops, { allowHero: true, ...ctx })
}

describe("set_fundo — o teste que prova a frente inteira", () => {
  it("escurece UMA faixa e deixa as outras duas do mesmo hex intactas", () => {
    // Hoje isto era impossível: a única op existente (`recolor`) é global e
    // trocaria os três brancos de uma vez.
    const r = aplicar(DOC, [{ action: "set_fundo", bloco: 2, para: "#111111" }])
    expect(r.faixasPintadas).toBe(1)
    expect(r.skipped).toEqual([])

    const depois = extrairFaixas(r.html)
    expect(depois.map((f) => f.fundo)).toEqual(["#222222", "#FFFFFF", "#111111", "#FFFFFF"])
  })

  it("pinta as duas formas do fundo — o atributo bgcolor e o style", () => {
    const doc = `<table width="600">${bloco(
      0,
      "body",
      `<tr><td width="600" bgcolor="#FFFFFF" style="background-color:#FFFFFF;">x</td></tr>`,
    )}</table>`
    const r = aplicar(doc, [{ action: "set_fundo", bloco: 0, para: "#111111" }])
    expect(r.html).not.toContain("#FFFFFF")
    expect(r.html.match(/#111111/g)).toHaveLength(2)
  })

  it("faixa que pousa no canvas é recusada com motivo, não pintada em silêncio", () => {
    const doc = `<table width="600">${bloco(0, "body", `<tr><td width="600">sem fundo declarado</td></tr>`)}</table>`
    const r = aplicar(doc, [{ action: "set_fundo", bloco: 0, para: "#111111" }])
    expect(r.faixasPintadas).toBe(0)
    expect(r.skipped[0].reason).toBe("sem_fundo_editavel")
  })

  it("pinta a faixa e NÃO o card branco que mora dentro dela", () => {
    // Trocar "todo #FFFFFF do bloco" repintaria o card também. A faixa
    // endereça a própria declaração; o resto do bloco fica de fora.
    const doc = `<table width="600">${bloco(
      0,
      "products",
      `<tr><td width="600" style="background-color:#FFFFFF;">
         <table width="280"><tr><td width="280" style="background-color:#FFFFFF;">card</td></tr></table>
       </td></tr>`,
    )}</table>`
    const r = aplicar(doc, [{ action: "set_fundo", bloco: 0, para: "#111111" }])
    expect(r.faixasPintadas).toBe(1)
    // A faixa virou escura; o card seguiu branco.
    expect(r.html).toContain('width="600" style="background-color:#111111;"')
    expect(r.html).toContain('width="280" style="background-color:#FFFFFF;"')
  })

  it("bloco que não existe no documento é descartado com motivo", () => {
    const r = aplicar(DOC, [{ action: "set_fundo", bloco: 99, para: "#111111" }])
    expect(r.skipped[0].reason).toBe("endereco_inexistente")
    expect(r.html).toBe(DOC)
  })
})

describe("set_botao", () => {
  it("inverte o botão da faixa que escureceu — fundo e label", () => {
    const ctx = contexto(DOC)
    const cta = ctx.ctas[0]
    const r = applyOps(
      DOC,
      [
        { action: "set_fundo", bloco: 2, para: "#111111" },
        { action: "set_botao", cta: cta.id, fundo: "#FFFFFF", label: "#111111" },
      ],
      { allowHero: true, ...ctx },
    )
    expect(r.faixasPintadas).toBe(1)
    expect(r.botoesRecoloridos).toBe(1)

    const depois = extrairCtas(r.html, extrairFaixas(r.html))
    expect(depois[0].fundo).toBe("#FFFFFF")
    expect(depois[0].label).toBe("#111111")
  })

  it("com VML, troca também o fillcolor do roundrect — senão o Outlook mostra a cor antiga", () => {
    const doc = `<table width="600">${bloco(
      0,
      "cta",
      `<tr><td width="600" style="background-color:#FFFFFF;">
         <!--[if mso]><v:roundrect fillcolor="#111111" strokecolor="#111111"><![endif]-->
         ${BOTAO("#111111", "#FFFFFF")}
       </td></tr>`,
    )}</table>`
    const ctx = contexto(doc)
    expect(ctx.ctas[0].vml).toBe(true)
    const r = applyOps(doc, [{ action: "set_botao", cta: ctx.ctas[0].id, fundo: "#D4AF37" }], {
      allowHero: true,
      ...ctx,
    })
    expect(r.html).toContain('fillcolor="#D4AF37"')
    expect(r.html).not.toContain('fillcolor="#111111"')
  })

  it("botão que não existe é descartado com motivo", () => {
    const r = aplicar(DOC, [{ action: "set_botao", cta: "cta99", fundo: "#FFFFFF" }])
    expect(r.skipped[0].reason).toBe("endereco_inexistente")
  })
})

describe("add_cta", () => {
  const OP: FormatOp = {
    action: "add_cta",
    bloco: 1,
    label: "Ver a coleção",
    href: "https://loja.com/colecao",
    fundo: "#111111",
    corLabel: "#FFFFFF",
  }

  it("insere o botão no bloco que não tinha nenhum", () => {
    const r = aplicar(DOC, [OP])
    expect(r.botoesInseridos).toBe(1)
    const depois = extrairCtas(r.html, extrairFaixas(r.html))
    expect(depois.map((c) => c.texto)).toContain("Ver a coleção")
  })

  it("o href é EXATAMENTE o que foi passado — nada é inventado", () => {
    const r = aplicar(DOC, [OP])
    const novo = extrairCtas(r.html, extrairFaixas(r.html)).find((c) => c.texto === "Ver a coleção")
    expect(novo?.href).toBe("https://loja.com/colecao")
  })

  it("o botão nasce DENTRO da região do bloco de destino", () => {
    const r = aplicar(DOC, [OP])
    const faixa = extrairFaixas(r.html).find((f) => f.bloco === 1)
    const novo = extrairCtas(r.html, extrairFaixas(r.html)).find((c) => c.texto === "Ver a coleção")
    expect(novo?.bloco).toBe(faixa?.bloco)
  })

  it("cor em hex literal, nunca var() — o bloco pode não estar sob o escopo das variáveis", () => {
    const r = aplicar(DOC, [OP])
    expect(r.html).toContain("background-color:#111111;border-radius:4px")
    expect(r.html).not.toContain("var(--button-bg)")
  })

  it("a linha do botão carrega o fundo da faixa — senão ele flutua fora da banda", () => {
    // A `<tr>` inserida é IRMÃ da que pinta o bloco e não herda o fundo
    // dela. Sem repetir a cor aqui, o botão pousa no canvas da tabela: o
    // render mostrou isso com todos os testes de string passando.
    const r = aplicar(DOC, [OP])
    expect(r.html).toContain('<td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:')
  })

  it("faixa sem fundo declarado NÃO ganha banda inventada — o canvas é o certo", () => {
    const doc = `<table width="600">${bloco(0, "body", `<tr><td width="600">sem fundo</td></tr>`)}</table>`
    const r = aplicar(doc, [{ ...OP, bloco: 0 }])
    expect(r.botoesInseridos).toBe(1)
    expect(r.html).toContain('<td align="center" style="padding:')
  })

  it("bloco sem ponto de inserção seguro é recusado, não improvisado", () => {
    const doc = `<div>${bloco(0, "body", `<span>texto solto sem tabela</span>`)}</div>`
    const r = aplicar(doc, [{ ...OP, bloco: 0 }])
    expect(r.botoesInseridos).toBe(0)
    expect(r.skipped[0].reason).toBe("sem_ponto_de_insercao")
  })

  it("escapa aspas do label — o texto entra em atributo e em conteúdo", () => {
    const r = aplicar(DOC, [{ ...OP, label: 'Leve "2 por 1"', href: 'https://loja.com/?a="b"' }])
    expect(r.html).toContain("&quot;b&quot;")
    expect(r.html).toContain('Leve "2 por 1"')
  })
})

describe("faixa e botão juntos — a regressão que o plano existe para evitar", () => {
  it("o botão invertido NÃO é reerguido para o cinza de superfície pelo guard de painel", () => {
    // Sem a exceção de botão no `panelFixes`, o botão branco recém-invertido
    // dentro da faixa escura seria lido como "painel colapsado" e mandado
    // para `surface` — um retângulo cinza no meio da banda.
    const ctx = contexto(DOC)
    const r = applyOps(
      DOC,
      [
        { action: "set_fundo", bloco: 2, para: "#111111" },
        { action: "set_botao", cta: ctx.ctas[0].id, fundo: "#111111", label: "#FFFFFF" },
      ],
      { allowHero: true, ...ctx, surfaces: { surface: "#F4F4F4", surface_strong: "#E8E8E8" } },
    )
    expect(r.html).not.toContain("#F4F4F4")
    expect(r.panelFixes).toBe(0)
  })
})
