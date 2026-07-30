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
