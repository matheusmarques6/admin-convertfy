import { describe, it, expect } from "vitest"

import { stripDocumentShell, hasDocumentShell } from "./document-shell"

describe("stripDocumentShell", () => {
  it("recorta o miolo do body num documento completo", () => {
    const doc = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>.a{color:red}</style></head>
<body style="margin:0">
  <table><tr><td>hero</td></tr></table>
</body>
</html>`
    const r = stripDocumentShell(doc)
    expect(r.stripped).toBe(true)
    expect(r.html).toBe("<table><tr><td>hero</td></tr></table>")
    expect(hasDocumentShell(r.html)).toBe(false)
  })

  it("remove a moldura quando o documento vem pela metade (sem </body>)", () => {
    const r = stripDocumentShell(
      '<!DOCTYPE html><html><head><title>x</title></head><body><table><tr><td>a</td></tr></table>',
    )
    expect(r.stripped).toBe(true)
    expect(r.html).toBe("<table><tr><td>a</td></tr></table>")
  })

  it("não mexe num fragmento que já é fragmento", () => {
    const frag = '<table role="presentation"><tr><td>oi</td></tr></table>'
    const r = stripDocumentShell(frag)
    expect(r.stripped).toBe(false)
    expect(r.html).toBe(frag)
  })

  it("preserva o conteúdo do mockup-imagem, que é o que serve de espelho", () => {
    const mock =
      '<!DOCTYPE html><html><body><img src="https://cdn/x.png" width="600" alt="hero"></body></html>'
    const r = stripDocumentShell(mock)
    expect(r.html).toBe('<img src="https://cdn/x.png" width="600" alt="hero">')
  })

  it("vazio continua vazio", () => {
    expect(stripDocumentShell(null)).toEqual({ html: "", stripped: false })
    expect(stripDocumentShell("   ")).toEqual({ html: "", stripped: false })
  })

  it("não confunde <bodyguard> com <body>", () => {
    const frag = "<table><tr><td><bodyguard>x</bodyguard></td></tr></table>"
    expect(stripDocumentShell(frag).stripped).toBe(false)
    expect(hasDocumentShell(frag)).toBe(false)
  })
})

describe("hasDocumentShell", () => {
  it("reconhece as três marcas de documento", () => {
    expect(hasDocumentShell("<!DOCTYPE html><table></table>")).toBe(true)
    expect(hasDocumentShell("<html><table></table></html>")).toBe(true)
    expect(hasDocumentShell('<body style="x"><table></table>')).toBe(true)
    expect(hasDocumentShell("<table></table>")).toBe(false)
  })
})
