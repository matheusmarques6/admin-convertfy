/**
 * Aplicador de ops do color_format — o vocabulário encolheu em 20/08:
 * img/set_text/remove_slot/remove_row viraram código (image-merge e
 * copy-merge); sobraram replace (find único) e recolor (troca global por
 * valor de cor).
 */

import { describe, it, expect } from "vitest"
import { applyOps, parseOps, OpsParseError } from "./apply-patches"
import { HERO_SENTINEL_START, HERO_SENTINEL_END } from "./hero-locator"

describe("parseOps", () => {
  it("aceita replace e recolor com envelope {ops:[...]}", () => {
    const ops = parseOps(
      '{"ops":[{"action":"replace","find":"x","replace":"y"},{"action":"recolor","from":"#111111","to":"#222222"}]}',
    )
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ action: "replace", find: "x" })
    expect(ops[1]).toMatchObject({ action: "recolor", from: "#111111" })
  })

  it("action do vocabulário antigo (set_text/img) é ERRO de config, não silêncio", () => {
    expect(() =>
      parseOps('{"ops":[{"action":"set_text","tag":"X","value":"y"}]}'),
    ).toThrow(OpsParseError)
    expect(() =>
      parseOps('{"ops":[{"action":"img","tag":"X","url":"https://x"}]}'),
    ).toThrow(OpsParseError)
  })

  it("recolor com from/to que não são cor é rejeitado no parse", () => {
    expect(() =>
      parseOps('{"ops":[{"action":"recolor","from":"azul","to":"#111111"}]}'),
    ).toThrow(OpsParseError)
  })

  it("fences markdown e texto em volta são tolerados", () => {
    const ops = parseOps(
      'antes\n```json\n{"ops":[{"action":"replace","find":"a","replace":"b"}]}\n```',
    )
    expect(ops).toHaveLength(1)
  })
})

describe("applyOps — replace", () => {
  it("find ÚNICO é trocado; ambíguo e ausente são pulados com a razão", () => {
    const html = "<td>alpha</td><td>beta</td><td>beta</td>"
    const r = applyOps(
      html,
      [
        { action: "replace", find: "alpha", replace: "ALPHA" },
        { action: "replace", find: "beta", replace: "BETA" },
        { action: "replace", find: "gamma", replace: "GAMMA" },
      ],
      { allowHero: true },
    )
    expect(r.html).toContain("ALPHA")
    expect(r.html).not.toContain("BETA")
    expect(r.applied).toBe(1)
    expect(r.skipped.map((s) => s.reason).sort()).toEqual([
      "find_ambiguous",
      "find_not_found",
    ])
  })

  it("hero protegida quando allowHero=false; liberada quando true", () => {
    const html = [
      "<table>",
      HERO_SENTINEL_START,
      "<tr><td>hero copy</td></tr>",
      HERO_SENTINEL_END,
      "</table>",
    ].join("\n")
    const blocked = applyOps(
      html,
      [{ action: "replace", find: "hero copy", replace: "x" }],
      { allowHero: false },
    )
    expect(blocked.skipped[0].reason).toBe("hero_protected")
    const allowed = applyOps(
      html,
      [{ action: "replace", find: "hero copy", replace: "nova copy" }],
      { allowHero: true },
    )
    expect(allowed.html).toContain("nova copy")
  })

  it("splices sobrepostos: o da direita vence, o outro vira overlapping_edit", () => {
    const html = "<td>um dois tres</td>"
    const r = applyOps(
      html,
      [
        { action: "replace", find: "um dois tres", replace: "A" },
        { action: "replace", find: "dois", replace: "B" },
      ],
      { allowHero: true },
    )
    expect(r.skipped.some((s) => s.reason === "overlapping_edit")).toBe(true)
    expect(r.applied).toBe(1)
  })
})

describe("applyOps — recolor", () => {
  it("troca global por VALOR (todas as formas equivalentes) e conta como aplicada", () => {
    const html =
      '<td style="color:#111111">a</td><td bgcolor="#111111">b</td>'
    const r = applyOps(
      html,
      [{ action: "recolor", from: "#111111", to: "#ABCDEF" }],
      { allowHero: true },
    )
    expect(r.html).not.toContain("#111111")
    expect((r.html.match(/#ABCDEF/gi) ?? []).length).toBe(2)
    expect(r.applied).toBe(1)
  })

  it("cor ausente no documento → find_not_found (telemetria, não erro)", () => {
    const r = applyOps(
      "<td>sem cor</td>",
      [{ action: "recolor", from: "#123456", to: "#654321" }],
      { allowHero: true },
    )
    expect(r.applied).toBe(0)
    expect(r.skipped[0].reason).toBe("find_not_found")
  })
})
