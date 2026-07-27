/**
 * Protocolo de patch da Fase A (arquitetura por slots): ações set_text /
 * remove_row + matriz de posse (allowedTags). O envelope {"ops":[...]} é o
 * formato ÚNICO de output dos agentes de texto/imagem/cores.
 */
import { describe, it, expect } from "vitest"
import { applyOps, parseOps } from "./apply-patches"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "./hero-locator"

const DOC = [
  "<table><tr><td>{{BODY_TITLE}}</td></tr>",
  "<tr><td>{{BODY_TEXT}}</td></tr>",
  "<tr><td>{{EXTRA_NOTE}}</td></tr></table>",
].join("\n")

describe("parseOps — ações novas", () => {
  it("aceita set_text e remove_row (com normalização da tag)", () => {
    const ops = parseOps(
      '{"ops":[{"action":"set_text","tag":"{{ BODY_TITLE }}","value":"Olá"},{"action":"remove_row","tag":"EXTRA_NOTE"}]}',
    )
    expect(ops).toEqual([
      { action: "set_text", tag: "BODY_TITLE", value: "Olá" },
      { action: "remove_row", tag: "EXTRA_NOTE" },
    ])
  })

  it("set_text sem value → OpsParseError", () => {
    expect(() =>
      parseOps('{"ops":[{"action":"set_text","tag":"X"}]}'),
    ).toThrow("set_text")
  })
})

describe("applyOps — set_text", () => {
  it("troca TODAS as ocorrências (branches MSO) e neutraliza < >", () => {
    const doc = "<td>{{CTA_LABEL}}</td><!--[if mso]><td>{{CTA_LABEL}}</td><![endif]-->"
    const res = applyOps(
      doc,
      [{ action: "set_text", tag: "CTA_LABEL", value: "Compre <já>" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.html.match(/Compre &lt;já&gt;/g)).toHaveLength(2)
    expect(res.html).not.toContain("{{CTA_LABEL}}")
  })

  it('valor com "$" não vira grupo de captura do replace', () => {
    const res = applyOps(
      "<td>{{PRECO}}</td>",
      [{ action: "set_text", tag: "PRECO", value: "R$ 100 e $' teste" }],
      { allowHero: true },
    )
    expect(res.html).toContain("R$ 100 e $' teste")
  })

  it("dentro da hero → hero_protected (posse é do agente de hero)", () => {
    const doc = `${HERO_SENTINEL_START}<table><tr><td>{{HERO_HEADLINE}}</td></tr></table>${HERO_SENTINEL_END}`
    const res = applyOps(
      doc,
      [{ action: "set_text", tag: "HERO_HEADLINE", value: "x" }],
      { allowHero: false },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("hero_protected")
  })
})

describe("applyOps — remove_row", () => {
  it("remove a <tr> do slot de texto vazio", () => {
    const res = applyOps(
      DOC,
      [{ action: "remove_row", tag: "EXTRA_NOTE" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.html).not.toContain("EXTRA_NOTE")
    expect(res.html).toContain("{{BODY_TITLE}}")
  })
})

describe("applyOps — matriz de posse (allowedTags)", () => {
  it("op fora da alçada → ownership_rejected; dentro aplica", () => {
    const res = applyOps(
      DOC,
      [
        { action: "set_text", tag: "BODY_TITLE", value: "ok" },
        { action: "set_text", tag: "BODY_TEXT", value: "invasão" },
      ],
      { allowHero: true, allowedTags: new Set(["BODY_TITLE"]) },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("ok")
    expect(res.html).toContain("{{BODY_TEXT}}")
    expect(res.skipped[0]).toMatchObject({ reason: "ownership_rejected" })
  })

  it("replace (sem tag) não passa pela posse", () => {
    const res = applyOps(
      "<td bgcolor=\"#111111\">x</td>",
      [{ action: "replace", find: "#111111", replace: "#0B3D2E" }],
      { allowHero: true, allowedTags: new Set() },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("#0B3D2E")
  })
})
