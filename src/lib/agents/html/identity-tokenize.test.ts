import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { deriveColorRoles } from "./color-roles"
import { tokenizarIdentidade } from "./identity-tokenize"
import { aplicarTokens, resolverTokens } from "./identity-tokens"

const fixture = (f: string) => readFileSync(join(process.cwd(), "src/lib/agents/html/fixtures", f), "utf8")

describe("tokenizarIdentidade — variantes REAIS da biblioteca", () => {
  it("body 3 (selos): container → COR_FUNDO, botão → COR_PRINCIPAL + label, texto, raio no <td>, VML acompanha", () => {
    const r = tokenizarIdentidade(fixture("variante-body-3-bridge-features-cards.html"))
    const porToken = Object.fromEntries(r.mapa.map((m) => [m.token, m]))
    expect(porToken.COR_FUNDO.de).toBe("#FFFFFF")
    expect(porToken.COR_FUNDO.motivo).toContain("container de 600px")
    expect(porToken.COR_PRINCIPAL.de).toBe("#000000")
    expect(porToken.COR_TEXTO_SOBRE_PRINCIPAL.de).toBe("#FFFFFF")
    expect(porToken.COR_TEXTO.de).toBe("#000000")
    expect(porToken.RAIO_BOTAO.de).toBe("8px")
    // O fundo do botão está no <td>, não no <a>: os dois lados são tokenizados.
    expect(r.html).toContain("background:{{COR_PRINCIPAL}};border-radius:{{RAIO_BOTAO}};")
    expect(r.html).toContain('fillcolor="{{COR_PRINCIPAL}}"')
    expect(r.html).toContain("color:{{COR_TEXTO_SOBRE_PRINCIPAL}};font-family:{{FONTE_TITULO}};font-size:32px")
    // O branco é COR_FUNDO como fundo E label como texto — famílias diferentes, sem conflito.
    expect(r.nao_inferidos.filter((n) => n.razao === "conflito")).toEqual([])
    expect(r.ja_tokenizado).toBe(false)
    expect(r.inalterado).toBe(false)
  })

  it("hero 3: nenhum hex de fundo/texto sobra; o fundo do v:fill acompanha COR_FUNDO", () => {
    const r = tokenizarIdentidade(fixture("variante-welcome-hero-section-3.html"))
    expect(r.html).toContain('<v:fill type="frame" src="URL_DA_IMAGEM_DE_FUNDO" color="{{COR_FUNDO}}" />')
    expect(r.html).not.toMatch(/background(?:-color)?:#[0-9a-f]{6}/i)
    expect(r.html).not.toMatch(/[^-]color:#[0-9a-f]{6}/i)
    // A borda do logo fica hex — borda não é papel inferido.
    expect(r.html).toContain("border:1px solid #000000")
    expect(r.nao_inferidos.some((n) => n.valor === "#000000" && n.contextos.includes("border"))).toBe(true)
  })

  it("é idempotente e o resultado resolve nas duas paletas sem token cru", () => {
    const uma = tokenizarIdentidade(fixture("variante-body-3-bridge-features-cards.html"))
    const duas = tokenizarIdentidade(uma.html)
    expect(duas.html).toBe(uma.html)
    expect(duas.ja_tokenizado).toBe(true)
    expect(duas.inalterado).toBe(true)

    const luxe = resolverTokens({ roles: deriveColorRoles([{ hex: "#3D2820", name: "Marrom", role: "principal" }, { hex: "#FAF5F3", name: "Creme", role: "fundo" }]), fontHeading: "Playfair Display", fontBody: "Lato" })
    const innova = resolverTokens({ roles: deriveColorRoles([{ hex: "#034326", name: "Verde", role: "principal" }, { hex: "#FFFFFF", name: "Branco", role: "fundo" }]), fontHeading: "Poppins", fontBody: "Poppins" })
    const a = aplicarTokens(uma.html, luxe).html
    const b = aplicarTokens(uma.html, innova).html
    expect(a).not.toMatch(/\{\{(COR|FONTE|PESO|RAIO)_/)
    expect(b).not.toMatch(/\{\{(COR|FONTE|PESO|RAIO)_/)
    expect(a).toContain("background:#3D2820;border-radius:6px")
    expect(b).toContain("background:#034326;border-radius:6px")
    expect(a).toContain("background:#FAF5F3")
    expect(a).not.toBe(b)
  })

  it("HTML sem cor nem fonte devolve inalterado", () => {
    const r = tokenizarIdentidade("<tr><td>oi</td></tr>")
    expect(r.inalterado).toBe(true)
    expect(r.mapa).toEqual([])
  })
})
