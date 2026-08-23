import { describe, it, expect } from "vitest"
import type {
  ComponentOutputField,
  EmailComponentVariant,
  EmailOutlineTemplate,
} from "@/types/email-generation"
import type { AssemblySlot } from "./component-assembler.service"
import type { GeneratedBlueprint } from "./blueprint-generator.service"
import {
  matchFromSlots,
  fieldsFromSchema,
  fieldsFromCopySpec,
  imageBriefFromSchema,
  buildDeterministicBlueprint,
  collectSchemaAnchorIssues,
  packageBlueprint,
} from "./deterministic-blueprint.builder"

// ── Fixtures ────────────────────────────────────────────────────────

function variant(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "v-id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "Variante",
    html: p.html ?? "<div></div>",
    rendered_html: p.rendered_html ?? null,
    description: p.description ?? null,
    long_description: p.long_description ?? null,
    slots: p.slots ?? [],
    niche_affinity: [],
    positioning: [],
    mood: [],
    objectives: p.objectives ?? [],
    tones: p.tones ?? [],
    when_use: p.when_use ?? null,
    when_not_use: p.when_not_use ?? null,
    copy_guidance: p.copy_guidance ?? null,
    design_system: null,
    photo_direction: null,
    product_slots: p.product_slots ?? 0,
    output_schema: p.output_schema ?? [],
    density: p.density ?? null,
    tags: p.tags ?? [],
    thumbnail: null,
    is_active: true,
    version: 1,
    created_at: "2026-01-01",
    created_by: null,
  }
}

function slot(
  section: string,
  v: EmailComponentVariant,
  label = section,
): AssemblySlot {
  return { kind: "variant", variant: v, section, label }
}

const OUTLINE = {
  objective: "Boas-vindas com cupom",
  guidance: "Storytelling antes da oferta",
  tone_hint: "Acolhedor",
} as unknown as EmailOutlineTemplate

const SCHEMA_HERO: ComponentOutputField[] = [
  {
    key: "headline",
    label: "Headline",
    type: "text_short",
    max_len: 40,
    required: true,
    example: "Bem-vindo",
    guidance: "CAIXA ALTA",
  },
  {
    key: "hero_image",
    label: "Imagem",
    type: "image",
    max_len: 0,
    required: true,
    example: "hero-welcome.jpg",
    guidance: "Foto lifestyle com overlay escuro",
  },
]

// ── matchFromSlots (rota A nova — os slots SÃO a estrutura) ─────────

describe("matchFromSlots", () => {
  it("um match por slot de variante, na ordem; missing fica fora", () => {
    const vHero = variant({ id: "vh", block_type: "hero", output_schema: SCHEMA_HERO })
    const vBody = variant({
      id: "vb",
      block_type: "text",
      output_schema: [SCHEMA_HERO[0]],
    })
    const m = matchFromSlots([
      slot("hero", vHero),
      { kind: "missing", section: "body", label: "Body" },
      slot("body", vBody),
    ])
    expect(m.matches.size).toBe(2)
    expect(m.matches.get(0)?.variant.id).toBe("vh")
    expect(m.matches.get(1)?.variant.id).toBe("vb")
    expect(m.coverage).toBe(1)
    expect(m.copyBlocks).toBe(2)
  })
})

// ── fields v2 ───────────────────────────────────────────────────────

describe("fieldsFromSchema — o example é a base", () => {
  it("snapshot sem tag: key/example/nature/source é o contrato inteiro", () => {
    const fields = fieldsFromSchema(SCHEMA_HERO)
    const headline = fields.find((f) => f.key === "headline")!
    expect(headline.source).toBe("schema")
    expect(headline.max_len).toBe(40)
    expect(headline.example).toBe("Bem-vindo")
    expect(headline.guidance).toBe("CAIXA ALTA")
    expect("tag" in headline).toBe(false)
    const image = fields.find((f) => f.key === "hero_image")!
    expect(image.nature).toBe("imagem_gerada")
  })
})

describe("fieldsFromSchema — o limite sai da CAIXA do slot", () => {
  // CTA final de `produtos 7 - dois produtos`. O cadastro diz 34; a caixa
  // de 556px em Montserrat Bold 25px com tracking 0.15em aguenta ~26. Foi
  // com 32 caracteres — dentro do cadastro — que o botão da Luxe Lift
  // quebrou em duas linhas (23/08).
  const BOTAO =
    '<table><tr><td align="center" style="padding:47px 21px 49px 21px;">' +
    '<table width="556" style="width:556px;"><tr>' +
    '<td align="center" height="58" style="width:556px;height:58px;">' +
    '<a style="display:block;width:556px;height:58px;line-height:58px;' +
    "font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:25px;" +
    'font-weight:700;letter-spacing:0.15em;">' +
    "SHOP COLLECTION</a></td></tr></table></td></tr></table>"

  const SCHEMA_CTA = [
    {
      key: "final_cta_label",
      label: "CTA final",
      type: "text_short" as const,
      max_len: 34,
      required: false,
      example: "SHOP COLLECTION",
      guidance: "Caixa alta, nomeia a coleção",
    },
  ]

  it("aperta o max_len para o que a caixa aguenta", () => {
    const [campo] = fieldsFromSchema(SCHEMA_CTA, BOTAO)
    expect(campo.max_len).toBeLessThan(34)
    expect(campo.max_len).toBeGreaterThanOrEqual(20)
    // O rótulo que quebrou tem 32 e agora seria reprovado.
    expect("SHOP THE COMFORT LIFT COLLECTION".length).toBeGreaterThan(
      campo.max_len,
    )
  })

  it("NUNCA afrouxa: cadastro mais apertado que a caixa manda", () => {
    // 12 pode ser intenção editorial; a medida não discorda dela.
    const [campo] = fieldsFromSchema(
      [{ ...SCHEMA_CTA[0], max_len: 12 }],
      BOTAO,
    )
    expect(campo.max_len).toBe(12)
  })

  it("sem HTML da variante, o cadastro vale como antes", () => {
    const [campo] = fieldsFromSchema(SCHEMA_CTA)
    expect(campo.max_len).toBe(34)
  })

  it("slot que não é de uma linha mantém o cadastro", () => {
    // Célula de corpo sem altura declarada: a largura de UMA linha não é o
    // limite do campo, e chutar quantas linhas cabem seria pior que o
    // cadastro.
    const corpo =
      '<table><tr><td style="width:300px;font-size:16px;line-height:24px;">' +
      "Uma frase de corpo bem comprida para ancorar</td></tr></table>"
    const [campo] = fieldsFromSchema(
      [
        {
          key: "section_copy",
          label: "Copy",
          type: "text_long" as const,
          max_len: 130,
          required: false,
          example: "Uma frase de corpo bem comprida para ancorar",
          guidance: "",
        },
      ],
      corpo,
    )
    expect(campo.max_len).toBe(130)
  })

  it("campo que não ancora no HTML mantém o cadastro", () => {
    const [campo] = fieldsFromSchema(
      [{ ...SCHEMA_CTA[0], example: "FRASE QUE NAO EXISTE NO HTML" }],
      BOTAO,
    )
    expect(campo.max_len).toBe(34)
  })
})

describe("fieldsFromCopySpec", () => {
  it("converte copy_spec do LLM pro shape v2 com source=llm", () => {
    const fields = fieldsFromCopySpec([
      { key: "headline", min_chars: 18, max_chars: 40 },
    ])
    expect(fields[0]).toMatchObject({
      key: "headline",
      type: "text_short",
      max_len: 40,
      min_len: 18,
      source: "llm",
    })
  })
})

describe("imageBriefFromSchema", () => {
  it("concatena guidance+example dos campos type=image", () => {
    expect(imageBriefFromSchema(SCHEMA_HERO)).toBe(
      "Foto lifestyle com overlay escuro (ex.: hero-welcome.jpg)",
    )
  })
  it("null quando não há campos de imagem", () => {
    expect(imageBriefFromSchema([SCHEMA_HERO[0]])).toBeNull()
  })
  it("T8: asset_fixo fica fora do brief (arte não é gerada)", () => {
    const selo: ComponentOutputField = {
      key: "selo",
      label: "Selo",
      type: "image",
      nature: "asset_fixo",
      max_len: 0,
      required: false,
      example: "selo.png",
      guidance: "selo dourado da marca",
    }
    expect(imageBriefFromSchema([SCHEMA_HERO[0], selo])).toBeNull()
    expect(imageBriefFromSchema([...SCHEMA_HERO, selo])).toBe(
      "Foto lifestyle com overlay escuro (ex.: hero-welcome.jpg)",
    )
  })
})

// ── buildDeterministicBlueprint (rota A por slots) ──────────────────

describe("buildDeterministicBlueprint", () => {
  it("um bloco por slot de variante, com fields do schema e brief da imagem", () => {
    const vHero = variant({
      id: "vh",
      block_type: "hero",
      name: "Hero premium",
      copy_guidance: "Headline em caixa alta",
      output_schema: SCHEMA_HERO,
    })
    const slots = [slot("hero", vHero, "Hero de boas-vindas")]
    const match = matchFromSlots(slots)
    const bp = buildDeterministicBlueprint({ slots, match, outline: OUTLINE })

    expect(bp.objective).toBe("Boas-vindas com cupom")
    expect(bp.messaging).toBe("Storytelling antes da oferta")
    expect(bp.subject_hint).toBeNull()
    expect(bp.blocks).toHaveLength(1)
    const b = bp.blocks[0]
    expect(b.type).toBe("hero")
    expect(b.label).toBe("Hero de boas-vindas")
    expect(b.purpose).toBe("Headline em caixa alta")
    expect(b.needs_image).toBe(true)
    expect(b.image_brief).toContain("Foto lifestyle")
    expect(b.variant_id).toBe("vh")
    expect(b.fields?.[0]?.source).toBe("schema")
  })

  it("slot missing não vira bloco (a montagem também o pula)", () => {
    const vBody = variant({
      id: "vb",
      block_type: "text",
      copy_guidance: "g",
      output_schema: [SCHEMA_HERO[0]],
    })
    const slots: AssemblySlot[] = [
      { kind: "missing", section: "hero", label: "Hero" },
      slot("body", vBody),
    ]
    const bp = buildDeterministicBlueprint({
      slots,
      match: matchFromSlots(slots),
      outline: null,
    })
    expect(bp.blocks).toHaveLength(1)
    expect(bp.blocks[0].variant_id).toBe("vb")
  })

  it("T8: schema só com asset_fixo NÃO liga needs_image", () => {
    const vText = variant({
      id: "vt",
      block_type: "text",
      copy_guidance: "g",
      output_schema: [
        {
          key: "selo",
          label: "Selo",
          type: "image",
          nature: "asset_fixo",
          max_len: 0,
          required: false,
          example: "",
          guidance: "",
        },
      ],
    })
    const slots = [slot("body", vText)]
    const bp = buildDeterministicBlueprint({
      slots,
      match: matchFromSlots(slots),
      outline: null,
    })
    expect(bp.blocks[0].needs_image).toBe(false)
    expect(bp.blocks[0].image_brief).toBeNull()
  })
})

// ── collectSchemaAnchorIssues (régua única por example) ─────────────

describe("collectSchemaAnchorIssues", () => {
  it("campo cujo example não é encontrável no HTML vira issue com motivo", () => {
    const v = variant({
      id: "vh",
      block_type: "hero",
      html: "<table><tr><td>Frase que existe no HTML</td></tr></table>",
      output_schema: [
        {
          key: "headline",
          label: "H",
          type: "text_short",
          max_len: 40,
          required: true,
          example: "Frase que existe no HTML",
          guidance: "",
        },
        {
          key: "subhead",
          label: "S",
          type: "text_short",
          max_len: 90,
          required: false,
          example: "Frase que NUNCA esteve lá",
          guidance: "",
        },
      ],
    })
    const issues = collectSchemaAnchorIssues(matchFromSlots([slot("hero", v)]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      key: "subhead",
      motivo: "nao_encontrado",
      variant_id: "vh",
    })
  })

  it("biblioteca alinhada → lista vazia; match null (rota B crua) idem", () => {
    const v = variant({
      id: "vh",
      block_type: "hero",
      html: "<table><tr><td>Frase ancorada</td></tr></table>",
      output_schema: [
        {
          key: "headline",
          label: "H",
          type: "text_short",
          max_len: 40,
          required: true,
          example: "Frase ancorada",
          guidance: "",
        },
      ],
    })
    expect(collectSchemaAnchorIssues(matchFromSlots([slot("hero", v)]))).toEqual([])
    expect(collectSchemaAnchorIssues(null)).toEqual([])
  })
})

// ── packageBlueprint (empacotador único — rota B) ───────────────────

describe("packageBlueprint", () => {
  const llmBlueprint: GeneratedBlueprint = {
    objective: "obj do llm",
    messaging: "msg do llm",
    subject_hint: "assunto do llm",
    blocks: [
      {
        type: "hero",
        label: "Hero",
        purpose: "purpose do llm",
        needs_image: true,
        image_brief: "brief do llm",
        copy_spec: [{ key: "headline", min_chars: 18, max_chars: 40 }],
        tags: ["HERO_HEADLINE", "HERO_IMAGE"],
      },
    ],
  }

  it("dado curado da variante vence o LLM onde casou", () => {
    const vHero = variant({
      id: "vh",
      block_type: "hero",
      copy_guidance: "guidance CURADA",
      output_schema: SCHEMA_HERO,
    })
    const match = matchFromSlots([slot("hero", vHero)])
    const out = packageBlueprint(llmBlueprint, match)
    const b = out.blocks[0]
    expect(b.purpose).toBe("guidance CURADA")
    expect(b.image_brief).toContain("Foto lifestyle")
    expect(b.variant_id).toBe("vh")
    expect(b.fields?.[0]?.source).toBe("schema")
    // nível-email do LLM preservado
    expect(out.subject_hint).toBe("assunto do llm")
  })

  it("sem match (rota B crua): mantém o LLM e converte o copy_spec (source=llm)", () => {
    // fieldsFromTags morreu com o tag-registry como origem de contrato — o
    // fallback sem variante é sempre a conversão do copy_spec do LLM.
    const out = packageBlueprint(llmBlueprint, null)
    const b = out.blocks[0]
    expect(b.purpose).toBe("purpose do llm")
    expect(b.image_brief).toBe("brief do llm")
    expect(b.variant_id).toBeNull()
    expect(b.fields?.every((f) => f.source === "llm")).toBe(true)
    expect(b.fields?.[0]?.key).toBe("headline")
  })
})
