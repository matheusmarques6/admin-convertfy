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

describe("parseOps — block_id opcional (rastreabilidade n8n → op)", () => {
  it("propaga block_id quando presente; op sem o campo continua válida", () => {
    const ops = parseOps(
      '{"ops":[{"action":"set_text","tag":"A","value":"x","block_id":"b1-uuid"},{"action":"remove_row","tag":"B"}]}',
    )
    expect(ops).toEqual([
      { action: "set_text", tag: "A", value: "x", block_id: "b1-uuid" },
      { action: "remove_row", tag: "B" },
    ])
  })

  it("block_id vazio ou não-string é descartado sem erro", () => {
    const ops = parseOps(
      '{"ops":[{"action":"img","tag":"HERO_IMAGE","url":"https://x/y.png","block_id":""},{"action":"replace","find":"a","replace":"b","block_id":42}]}',
    )
    expect(ops[0]).toEqual({ action: "img", tag: "HERO_IMAGE", url: "https://x/y.png" })
    expect(ops[1]).toEqual({ action: "replace", find: "a", replace: "b" })
  })

  it("block_id não interfere na aplicação (que segue por tag)", () => {
    const res = applyOps(
      "<td>{{TITULO}}</td>",
      [{ action: "set_text", tag: "TITULO", value: "Oi", block_id: "b9" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.html).toContain("Oi")
  })
})

describe("recolor — troca global por valor de cor (F4)", () => {
  it("parseOps valida from/to como literais de cor", () => {
    expect(
      parseOps('{"ops":[{"action":"recolor","from":"#6B46C1","to":"#1F1F1F"}]}'),
    ).toEqual([{ action: "recolor", from: "#6B46C1", to: "#1F1F1F" }])
    expect(() =>
      parseOps('{"ops":[{"action":"recolor","from":"#6B46C1","to":"</td>"}]}'),
    ).toThrow("recolor")
  })

  it("aplica em TODAS as ocorrências (inclusive dentro da hero) e ignora a matriz de posse", () => {
    const doc = `<table style="background:#6B46C1"><tr><td style="color:#6b46c1">x</td></tr></table>`
    const res = applyOps(
      doc,
      [{ action: "recolor", from: "#6B46C1", to: "#1F1F1F" }],
      { allowHero: true, allowedTags: new Set<string>() },
    )
    expect(res.applied).toBe(1)
    expect(res.html).not.toMatch(/#6b46c1/i)
    expect((res.html.match(/#1F1F1F/g) ?? []).length).toBe(2)
  })

  it("cor ausente no doc → find_not_found (telemetrizado, doc intocado)", () => {
    const res = applyOps(
      "<td>x</td>",
      [{ action: "recolor", from: "#ABCDEF", to: "#000000" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("find_not_found")
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
