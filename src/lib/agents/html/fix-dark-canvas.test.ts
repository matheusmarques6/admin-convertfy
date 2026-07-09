import { describe, expect, it } from "vitest"
import { fixDarkCanvas } from "./fix-dark-canvas"

const DARK_EMAIL = `<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --bg: #3A3A3A;
    --text: #1F1F1F;
    --button-bg: #000000;
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#3A3A3A;" bgcolor="#3A3A3A">
  <table role="presentation" width="100%" style="background-color:#3A3A3A;">
    <tr><td align="center">
      <table role="presentation" width="600" style="background-color:#FFFFFF;">
        <tr><td>
          <table width="100%" style="background-color:#F6F6F6;"><tr><td>Conteudo</td></tr></table>
          <table width="100%"><tr>
            <td style="background-color:#000000;border-radius:4px;">
              <a href="#" style="color:#FFFFFF;">SHOP NOW</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

describe("fixDarkCanvas", () => {
  it("troca --bg escuro, body e wrapper full-width por branco", () => {
    const r = fixDarkCanvas(DARK_EMAIL)
    expect(r.changed).toBe(true)
    expect(r.replaced_hexes).toEqual(["#3A3A3A"])
    expect(r.html).toContain("--bg: #FFFFFF")
    expect(r.html).toMatch(/<body[^>]*background-color:#FFFFFF/)
    expect(r.html).toMatch(/<body[^>]*bgcolor="#FFFFFF"/)
    // wrapper full-width clareado
    expect(r.html).toContain(`width="100%" style="background-color:#FFFFFF;"`)
    // nenhum resto do hex de canvas
    expect(r.html).not.toContain("#3A3A3A")
  })

  it("NÃO toca no botão preto nem em seção escura de outra cor", () => {
    const r = fixDarkCanvas(DARK_EMAIL)
    // CTA preto intacto (vive em <td>, fora dos contextos de canvas)
    expect(r.html).toContain(`background-color:#000000;border-radius:4px;`)
    // --button-bg intacto
    expect(r.html).toContain("--button-bg: #000000")
    // seção clara interna intacta
    expect(r.html).toContain("background-color:#F6F6F6")
  })

  it("email com canvas claro passa intocado", () => {
    const light = DARK_EMAIL.replaceAll("#3A3A3A", "#F6F6F6")
    const r = fixDarkCanvas(light)
    expect(r.changed).toBe(false)
    expect(r.html).toBe(light)
  })

  it("canvas via var(--bg) no body: só a declaração da var muda", () => {
    const html = `<style>:root{--bg:#0A0A0A;}</style><body style="background-color:var(--bg);"><table width="100%" style="background-color:var(--bg);"><tr><td>x</td></tr></table></body>`
    const r = fixDarkCanvas(html)
    expect(r.changed).toBe(true)
    expect(r.html).toContain("--bg:#FFFFFF")
    // referências var() preservadas
    expect(r.html).toContain("background-color:var(--bg)")
  })

  it("hex de 3 dígitos escuro também é detectado", () => {
    const html = `<body style="background:#333;">x</body>`
    const r = fixDarkCanvas(html)
    expect(r.changed).toBe(true)
    expect(r.html).toContain("background:#FFFFFF")
  })

  it("html vazio → no-op", () => {
    const r = fixDarkCanvas("")
    expect(r.changed).toBe(false)
  })
})
