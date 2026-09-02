/**
 * Largura canônica de 600px nos blocos da biblioteca.
 *
 * Os casos vêm do acervo real: variantes são documentos completos com
 * calha `width="100%"` + container `width="600"` (uma nasceu em 598, outra
 * usa breakpoint de 620). A normalização tem de corrigir o container sem
 * encostar em coluna interna, e ser idempotente.
 */

import { describe, it, expect } from "vitest"
import {
  auditEmailWidth,
  classifyEmailRoot,
  enforceEmailWidth,
} from "./email-width"

const DOC_598 = `<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr><td align="center">
<table role="presentation" width="598" cellpadding="0" cellspacing="0" border="0" style="width:598px;min-width:598px;max-width:598px;background:#B1B3B6;">
<tr><td>
<table role="presentation" width="351" cellpadding="0" cellspacing="0" border="0" style="width:351px;background:#F2F2F2;border-radius:14px;"><tr><td>x</td></tr></table>
</td></tr></table>
</td></tr></table></body></html>`

const DOC_600 = DOC_598.replace(/598/g, "600")

describe("classifyEmailRoot", () => {
  it("documento completo, mesmo atrás de comentário", () => {
    expect(classifyEmailRoot(DOC_598)).toBe("document")
    expect(classifyEmailRoot("<!-- x -->\n  <html><body></body></html>")).toBe("document")
    expect(classifyEmailRoot("<head><style></style></head><body>a</body>")).toBe("document")
  })
  it("fragmentos: tr, table, outro, vazio", () => {
    expect(classifyEmailRoot("<tr><td>a</td></tr>")).toBe("tr")
    expect(classifyEmailRoot("<table><tr><td>a</td></tr></table>")).toBe("table")
    expect(classifyEmailRoot("<div>a</div>")).toBe("other")
    expect(classifyEmailRoot("   <!-- só comentário -->  ")).toBe("empty")
    expect(classifyEmailRoot(null)).toBe("empty")
  })
})

describe("enforceEmailWidth", () => {
  it("corrige container 598 → 600 no atributo e no style, sem tocar coluna interna", () => {
    const r = enforceEmailWidth(DOC_598)
    expect(r.changed).toBe(true)
    expect(r.html).toContain('width="600" cellpadding')
    expect(r.html).toContain("width:600px;min-width:600px;max-width:600px")
    expect(r.html).not.toContain("598")
    // coluna interna e calha intactas
    expect(r.html).toContain('width="351"')
    expect(r.html).toContain("width:351px")
    expect(r.html).toContain('width="100%"')
    expect(r.changes.map((c) => c.kind)).toEqual(["attr", "style", "style", "style"])
  })

  it("é idempotente: HTML já em 600 volta igual", () => {
    const r = enforceEmailWidth(DOC_600)
    expect(r.changed).toBe(false)
    expect(r.html).toBe(DOC_600)
    expect(r.changes).toEqual([])
    expect(enforceEmailWidth(r.html).html).toBe(r.html)
  })

  it("corrige 620 e ignora larguras fora da faixa (500, 700)", () => {
    const r = enforceEmailWidth(
      '<table width="620" style="max-width:620px"></table><table width="500"></table><table style="width:700px"></table>',
    )
    expect(r.html).toBe(
      '<table width="600" style="max-width:600px"></table><table width="500"></table><table style="width:700px"></table>',
    )
  })

  it("não confunde width=\"100%\" com número perto de 600", () => {
    const r = enforceEmailWidth('<table width="100%"></table><table width="6000"></table>')
    expect(r.changed).toBe(false)
  })

  it("fragmento com raiz <table> sem largura ganha width=600 + style", () => {
    const r = enforceEmailWidth('<table role="presentation"><tr><td>a</td></tr></table>')
    expect(r.html).toBe(
      '<table width="600" style="width:600px;max-width:600px;" role="presentation"><tr><td>a</td></tr></table>',
    )
    expect(r.changes[0].kind).toBe("added")
    expect(enforceEmailWidth(r.html).changed).toBe(false)
  })

  it("raiz <table> com style mas sem largura: a largura entra no style existente", () => {
    const r = enforceEmailWidth('<table style="background:#fff"><tr><td>a</td></tr></table>')
    expect(r.html).toBe(
      '<table width="600" style="width:600px;max-width:600px;background:#fff"><tr><td>a</td></tr></table>',
    )
  })

  it("raiz <tr> não recebe largura (herda da tabela que a envolve)", () => {
    const r = enforceEmailWidth('<tr><td width="598">a</td></tr>')
    expect(r.changed).toBe(false)
  })

  it("só <table> é tocada — <td width=\"598\"> e <img width=\"598\"> ficam", () => {
    const r = enforceEmailWidth(
      '<table width="600"><tr><td width="598"><img width="598"></td></tr></table>',
    )
    expect(r.changed).toBe(false)
  })
})

describe("auditEmailWidth", () => {
  it("documento com container 600 passa; 598 reprova apontando o valor", () => {
    expect(auditEmailWidth(DOC_600)).toMatchObject({ ok: true, container: 600 })
    expect(auditEmailWidth(DOC_598)).toMatchObject({ ok: false, container: 598 })
  })
  it("calha width=100% não é container", () => {
    const a = auditEmailWidth('<table width="100%"><tr><td>a</td></tr></table>')
    expect(a).toMatchObject({ ok: false, container: null })
  })
  it("container só por style conta", () => {
    expect(auditEmailWidth('<table style="width:600px"></table>').ok).toBe(true)
  })
  it("<tr> passa com explicação; vazio reprova", () => {
    expect(auditEmailWidth("<tr><td>a</td></tr>").ok).toBe(true)
    expect(auditEmailWidth("").ok).toBe(false)
  })
  it("normalizar deixa a auditoria verde", () => {
    expect(auditEmailWidth(enforceEmailWidth(DOC_598).html).ok).toBe(true)
  })
})
