import { describe, it, expect } from "vitest"

import { fitFragment, fitFragmentToRow } from "./fragment-fit"

describe("fitFragment — matriz de encaixe", () => {
  it("<tr> entra direto", () => {
    const tr = "<tr><td>oi</td></tr>"
    expect(fitFragment(tr)).toEqual({ html: tr, kind: "row" })
  })

  it("<table> é embrulhado em <tr><td>", () => {
    const fit = fitFragment("<table><tr><td>oi</td></tr></table>")
    expect(fit?.kind).toBe("wrapped_table")
    expect(fit?.html.startsWith("<tr>")).toBe(true)
  })

  it("comentário inicial não atrapalha", () => {
    const fit = fitFragment("<!-- variante x -->\n<tr><td>oi</td></tr>")
    expect(fit?.kind).toBe("row")
  })

  it("div solto: recusado no modo conservador, embrulhado na montagem", () => {
    expect(fitFragment("<div>oi</div>")).toBeNull()
    expect(fitFragment("<div>oi</div>", { wrapUnknown: true })?.kind).toBe(
      "wrapped_unknown",
    )
  })

  it("vazio é recusado nos dois modos", () => {
    expect(fitFragment("   ")).toBeNull()
    expect(fitFragment("   ", { wrapUnknown: true })).toBeNull()
  })
})

// O defeito real: variante cadastrada como export inteiro caía no
// wrapUnknown e virava <td><!DOCTYPE html><html>…</html></td> dentro do
// email. O agente de hero recebia essa região, devolvia como recebeu e o
// parser rejeitava o output — o agente levava a culpa da montagem.
describe("fitFragment — variante cadastrada como documento completo", () => {
  const doc = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"></head>
<body><table><tr><td>hero</td></tr></table></body>
</html>`

  it("tira a casca e reavalia o miolo pela mesma matriz", () => {
    const fit = fitFragment(doc, { wrapUnknown: true })
    expect(fit?.kind).toBe("wrapped_table")
    expect(fit?.unshelled).toBe(true)
  })

  it("NUNCA embrulha o documento inteiro numa célula", () => {
    const fit = fitFragment(doc, { wrapUnknown: true })
    expect(fit?.html).not.toMatch(/<!DOCTYPE|<html[\s>]|<body[\s>]/i)
    expect(fit?.kind).not.toBe("wrapped_unknown")
  })

  it("miolo que já é <tr> entra direto, ainda marcado como unshelled", () => {
    const fit = fitFragment(
      "<!DOCTYPE html><html><body><tr><td>hero</td></tr></body></html>",
      { wrapUnknown: true },
    )
    expect(fit?.kind).toBe("row")
    expect(fit?.unshelled).toBe(true)
  })

  it("vale também para o enxerto (modo conservador)", () => {
    const html = fitFragmentToRow(doc)
    expect(html).not.toBeNull()
    expect(html).not.toMatch(/<!DOCTYPE|<html[\s>]/i)
  })

  it("documento sem nada aproveitável continua recusado", () => {
    expect(
      fitFragment("<!DOCTYPE html><html><head><title>x</title></head></html>", {
        wrapUnknown: true,
      }),
    ).toBeNull()
  })

  it("fragmento normal não é marcado como unshelled", () => {
    expect(fitFragment("<tr><td>oi</td></tr>")?.unshelled).toBeUndefined()
  })
})

// O caso REAL que manteve `invalid_variant` em todas as gerações depois do
// primeiro fix: quase todo export de email abre o <body> com <center> ou um
// <div> de fundo, e o modo conservador recusava esse miolo.
describe("miolo do body que não começa com tabela", () => {
  const doc = (inner: string) =>
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"></head>
<body style="margin:0">${inner}</body></html>`

  const variante = '<table><tr><td bgcolor="#111111">hero</td></tr></table>'

  it("<center> em volta: enxerta embrulhando", () => {
    const fit = fitFragmentToRow(doc(`<center>${variante}</center>`))
    expect(fit).not.toBeNull()
    expect(fit).toContain("<center>")
    expect(fit).not.toMatch(/<!DOCTYPE|<html[\s>]|<body[\s>]/i)
  })

  // Descer até a primeira <table> jogaria a banda fora — o div É o desenho.
  it("<div> de fundo sobrevive inteiro", () => {
    const fit = fitFragmentToRow(
      doc(`<div style="background:#111111">${variante}</div>`),
    )
    expect(fit).toContain('style="background:#111111"')
    expect(fit).toContain('bgcolor="#111111"')
  })

  it("comentário condicional do Outlook antes do conteúdo", () => {
    const fit = fitFragmentToRow(
      doc(`<!--[if mso]><table><tr><td><![endif]--><center>${variante}</center>`),
    )
    expect(fit).not.toBeNull()
    expect(fit).toContain("hero")
  })

  it("o miolo que já é tabela continua no caminho de antes", () => {
    const fit = fitFragment(doc(variante))
    expect(fit?.kind).toBe("wrapped_table")
    expect(fit?.unshelled).toBe(true)
  })

  // A proteção que o ramo existe para dar: documento NUNCA entra na célula.
  it("nenhum caminho deixa a casca de documento entrar", () => {
    for (const inner of [
      variante,
      `<center>${variante}</center>`,
      `<div>${variante}</div>`,
    ]) {
      expect(fitFragmentToRow(doc(inner))).not.toMatch(
        /<!DOCTYPE|<html[\s>]|<body[\s>]/i,
      )
    }
  })
})

/**
 * A calha da variante no encaixe.
 *
 * O destino é sempre a célula de 600px do documento. Ali o recuo horizontal
 * da calha — invisível na peça solta, onde a calha ocupa a janela — soma à
 * largura do container e estica o email (incidente 08/09: `.email-container`
 * de 680px, cada bloco numa largura diferente).
 */
const VARIANTE_COM_CALHA = `<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEE;">
<tr><td align="center" style="padding:28px 28px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;"><tr><td>{{HEADLINE}}</td></tr></table>
</td></tr></table>
</body></html>`

describe("fitFragment + calha", () => {
  it("zera o recuo horizontal da calha e sinaliza na volta", () => {
    const fit = fitFragment(VARIANTE_COM_CALHA, { wrapUnknown: true })
    expect(fit).not.toBeNull()
    expect(fit!.gutterNeutralized).toBe(true)
    expect(fit!.html).toContain("padding:28px 0")
    expect(fit!.html).not.toContain("padding:28px 28px")
    // O resto do encaixe segue igual: casca fora, CSS resgatado, placeholder
    // intacto.
    expect(fit!.unshelled).toBe(true)
    expect(fit!.styles).toEqual([".x{color:red}"])
    expect(fit!.html).toContain("{{HEADLINE}}")
  })

  it("variante sem recuo na calha não é marcada", () => {
    const fit = fitFragment(VARIANTE_COM_CALHA.replace("padding:28px 28px;", "padding:28px 0;"), {
      wrapUnknown: true,
    })
    expect(fit!.gutterNeutralized).toBeUndefined()
  })

  it("o modo conservador (enxerto) recebe o MESMO fragmento", () => {
    // Se só a montagem normalizasse, o enxerto compararia a região montada
    // com a variante crua, não veria igualdade e reenxertaria a versão com
    // recuo — desfazendo o conserto no caminho principal.
    expect(fitFragmentToRow(VARIANTE_COM_CALHA)).toBe(
      fitFragment(VARIANTE_COM_CALHA, { wrapUnknown: true })!.html,
    )
  })
})
