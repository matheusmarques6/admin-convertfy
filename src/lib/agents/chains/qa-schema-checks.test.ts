import { describe, it, expect } from "vitest"
import { runSchemaChecks, runGlobalDocChecks } from "./qa.chain"

const FIELDS = [
  { key: "headline", type: "text_short", max_len: 40, required: true },
  { key: "body", type: "text_long", max_len: 200, required: false },
  { key: "hero_image", type: "image", max_len: 0, required: true },
]

describe("runSchemaChecks", () => {
  it("passa quando a copy respeita o schema", () => {
    const issues = runSchemaChecks(
      [
        {
          block_type: "hero",
          content: { headline: "Bem-vindo!", body: "Texto ok" },
        },
      ],
      [{ type: "hero", fields: FIELDS }],
    )
    expect(issues).toEqual([])
  })

  it("required vazio → campo_obrigatorio_vazio (medium)", () => {
    const issues = runSchemaChecks(
      [{ block_type: "hero", content: { body: "x" } }],
      [{ type: "hero", fields: FIELDS }],
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      type: "campo_obrigatorio_vazio",
      severity: "medium",
    })
    expect(issues[0].message).toContain("headline")
  })

  it("max_len: ≤15% acima = low; >15% = medium", () => {
    const soft = runSchemaChecks(
      [{ block_type: "hero", content: { headline: "x".repeat(44) } }], // +10%
      [{ type: "hero", fields: FIELDS }],
    )
    expect(soft[0]).toMatchObject({ type: "copy_excede_max_len", severity: "low" })

    const hard = runSchemaChecks(
      [{ block_type: "hero", content: { headline: "x".repeat(60) } }], // +50%
      [{ type: "hero", fields: FIELDS }],
    )
    expect(hard[0]).toMatchObject({
      type: "copy_excede_max_len",
      severity: "medium",
    })
  })

  it("campos type=image ficam fora da validação (preenchidos pelo pipeline)", () => {
    const issues = runSchemaChecks(
      [{ block_type: "hero", content: { headline: "ok" } }],
      [{ type: "hero", fields: FIELDS }],
    )
    // hero_image required mas ausente → NÃO reporta (é do image agent)
    expect(issues).toEqual([])
  })

  it("T8: nature asset_fixo fica fora da cobrança (mesmo required e type texto)", () => {
    const fields = [
      { key: "headline", type: "text_short", max_len: 40, required: true },
      {
        key: "carimbo_texto",
        type: "text_short",
        nature: "asset_fixo",
        max_len: 20,
        required: true,
      },
    ]
    const issues = runSchemaChecks(
      [{ block_type: "hero", content: { headline: "ok" } }],
      [{ type: "hero", fields }],
    )
    // carimbo_texto required + ausente, mas é arte fixa → sem issue
    expect(issues).toEqual([])
  })

  it("skip silencioso: sem fields, type divergente ou sem blueprint", () => {
    const blocks = [{ block_type: "hero", content: {} }]
    expect(runSchemaChecks(blocks, [])).toEqual([])
    expect(runSchemaChecks(blocks, [{ type: "hero" }])).toEqual([])
    expect(
      runSchemaChecks(blocks, [{ type: "text", fields: FIELDS }]),
    ).toEqual([])
  })
})

describe("runGlobalDocChecks — visão global vira código (F5)", () => {
  it("placeholder interno sobrando + <img> sem src são flagados", () => {
    const html =
      '<html><body><h1>{{HEADLINE}}</h1><img src=""><img src="https://ok.png"></body></html>'
    const issues = runGlobalDocChecks(html)
    expect(issues.some((i) => i.message.includes("{{HEADLINE}}"))).toBe(true)
    expect(issues.some((i) => i.message.includes("<img> sem src"))).toBe(true)
  })

  it("merge tags de provedor (minúsculas) NÃO são placeholder interno", () => {
    const html = "<html><body><a href=\"{{ unsubscribe }}\">sair</a></body></html>"
    expect(runGlobalDocChecks(html)).toEqual([])
  })

  it("token de atributo cru (src=\"URL_FOTO_1\") é flagado; URL real e base64 não", () => {
    const issues = runGlobalDocChecks(
      '<html><body><img src="URL_FOTO_1" alt="ALT_FOTO_1"></body></html>',
    )
    expect(issues.some((i) => i.message.includes("URL_FOTO_1"))).toBe(true)
    expect(
      runGlobalDocChecks(
        '<html><body><img src="https://cdn/x.png" alt="foto"><img src="data:image/png;base64,AA" alt=""></body></html>',
      ),
    ).toEqual([])
  })

  it("contagem de blocos divergente do blueprint gera issue informativa", () => {
    const issues = runGlobalDocChecks("<html></html>", {
      blocksCount: 7,
      blueprintBlocksCount: 9,
    })
    expect(issues.some((i) => i.message.includes("difere do blueprint"))).toBe(true)
    // igual → nada
    expect(
      runGlobalDocChecks("<html></html>", {
        blocksCount: 9,
        blueprintBlocksCount: 9,
      }),
    ).toEqual([])
  })
})
