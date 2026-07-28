import { describe, it, expect } from "vitest"
import { runSchemaChecks } from "./qa.chain"
import { validateSchemaTagCoherence } from "@/lib/email-workspace/schema-tag-coherence"
import type { ComponentOutputField } from "@/types/email-generation"

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

describe("validateSchemaTagCoherence", () => {
  const schema: ComponentOutputField[] = [
    {
      key: "headline",
      label: "Headline",
      type: "text_short",
      max_len: 40,
      required: true,
      example: "",
      guidance: "",
    },
    {
      key: "campo_orfao",
      label: "Órfão",
      type: "text_short",
      max_len: 20,
      required: false,
      example: "",
      guidance: "",
    },
    {
      key: "hero_image",
      label: "Imagem",
      type: "image",
      max_len: 0,
      required: true,
      example: "",
      guidance: "",
    },
  ]

  it("aponta campos sem tag e tags de copy sem campo", () => {
    // HTML tem HERO_HEADLINE (casa com headline via copyKey) e HERO_BODY
    // (tag de copy sem campo). campo_orfao não tem tag. hero_image é imagem
    // (fora da checagem de keysWithoutTag).
    const html = "<div>{{HERO_HEADLINE}} {{HERO_BODY}} {{HERO_IMAGE}}</div>"
    const r = validateSchemaTagCoherence(html, schema)
    expect(r.keysWithoutTag).toEqual(["campo_orfao"])
    expect(r.copyTagsWithoutKey).toEqual(["HERO_BODY"])
  })

  it("coerência total → listas vazias", () => {
    const html = "<div>{{HERO_HEADLINE}}</div>"
    const r = validateSchemaTagCoherence(html, [schema[0]])
    expect(r.keysWithoutTag).toEqual([])
    expect(r.copyTagsWithoutKey).toEqual([])
  })
})
