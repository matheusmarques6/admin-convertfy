import { describe, it, expect } from "vitest"
import type {
  ComponentOutputField,
  EmailComponentVariant,
  EmailOutlineTemplate,
} from "@/types/email-generation"
import type { ExtractedStructure, ExtractedBlock } from "./reference-structure"
import type { AssemblySlot } from "./component-assembler.service"
import type { GeneratedBlueprint } from "./blueprint-generator.service"
import {
  matchVariantsToSkeleton,
  matchFromSlots,
  fieldsFromSchema,
  fieldsFromCopySpec,
  imageBriefFromSchema,
  buildDeterministicBlueprint,
  collectSchemaAnchorIssues,
  packageBlueprint,
  schemaTagsFromSlots,
} from "./deterministic-blueprint.builder"

// ── Fixtures ────────────────────────────────────────────────────────

function variant(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "v-id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "Variante",
    html: p.html ?? "<div></div>",
    rendered_html: p.rendered_html ?? null,
    html_tagged: p.html_tagged ?? null,
    tagging_status: p.tagging_status ?? null,
    tagging_meta: p.tagging_meta ?? null,
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

// Blocos do skeleton com tags REAIS do registry (rota B legada).
function heroBlock(): ExtractedBlock {
  return {
    type: "hero",
    section: "HERO",
    tags: ["HERO_HEADLINE", "HERO_IMAGE"],
    needs_image: true,
    image_aspect: "4:5",
    copy_spec: [{ key: "headline", min_chars: 18, max_chars: 40 }],
  }
}
function textBlock(): ExtractedBlock {
  return {
    type: "text",
    section: "BODY",
    tags: ["BODY_TEXT"],
    needs_image: false,
    image_aspect: null,
    copy_spec: [{ key: "body", min_chars: 120, max_chars: 280 }],
  }
}
function couponBlock(): ExtractedBlock {
  return {
    type: "coupon",
    section: "OFFER",
    tags: ["COUPON_CODE"],
    needs_image: false,
    image_aspect: null,
    copy_spec: [{ key: "code", min_chars: 4, max_chars: 15 }],
  }
}
function skeleton(blocks: ExtractedBlock[]): ExtractedStructure {
  return { blocks, knownTags: [], unknownTags: [] }
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

// ── matchVariantsToSkeleton (rota B legada) ─────────────────────────

describe("matchVariantsToSkeleton", () => {
  it("casa FIFO por categoria e mede cobertura 100%", () => {
    const vHero = variant({ id: "vh", block_type: "hero", copy_guidance: "g" })
    const vText = variant({ id: "vt", block_type: "body", copy_guidance: "g" })
    const m = matchVariantsToSkeleton(skeleton([heroBlock(), textBlock()]), [
      slot("hero", vHero),
      slot("body", vText),
    ])
    expect(m.matches.get(0)?.variant.id).toBe("vh")
    expect(m.matches.get(1)?.variant.id).toBe("vt")
    expect(m.coverage).toBe(1)
    expect(m.unusedVariantIds).toEqual([])
  })

  it("run fundido: 2 variantes da mesma categoria → 1 bloco; a 2ª vira sobra", () => {
    const v1 = variant({ id: "b1", block_type: "body", copy_guidance: "g" })
    const v2 = variant({ id: "b2", block_type: "body", copy_guidance: "g" })
    const m = matchVariantsToSkeleton(skeleton([textBlock()]), [
      slot("body", v1),
      slot("body", v2),
    ])
    expect(m.matches.get(0)?.variant.id).toBe("b1")
    expect(m.unusedVariantIds).toEqual(["b2"])
    expect(m.coverage).toBe(1)
  })

  it("slot missing no meio não desalinha o casamento", () => {
    const vHero = variant({ id: "vh", block_type: "hero", copy_guidance: "g" })
    const vCoupon = variant({
      id: "vc",
      block_type: "offer",
      copy_guidance: "g",
    })
    const slots: AssemblySlot[] = [
      slot("hero", vHero),
      { kind: "missing", section: "body", label: "Body" },
      slot("offer", vCoupon),
    ]
    const m = matchVariantsToSkeleton(
      skeleton([heroBlock(), textBlock(), couponBlock()]),
      slots,
    )
    expect(m.matches.get(0)?.variant.id).toBe("vh")
    expect(m.matches.get(1)).toBeUndefined()
    expect(m.matches.get(2)?.variant.id).toBe("vc")
    expect(m.coverage).toBeLessThan(1)
    expect(m.unmatchedBlockIndexes).toEqual([1])
  })
})

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

describe("schemaTagsFromSlots (rota B legada)", () => {
  it("mapeia UPPER(key)→kind por natureza e exclui asset_fixo", () => {
    const v = variant({
      id: "v1",
      block_type: "testimonial",
      output_schema: [
        {
          key: "quote_body",
          label: "Depoimento",
          type: "text_long",
          max_len: 200,
          required: true,
          example: "",
          guidance: "",
        },
        {
          key: "avatar_foto",
          label: "Avatar",
          type: "image",
          max_len: 0,
          required: false,
          example: "",
          guidance: "",
        },
        {
          key: "selo_arte",
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
    const map = schemaTagsFromSlots([
      slot("testimonial", v),
      { kind: "missing", section: "body", label: "Body" },
    ])
    expect(map.get("QUOTE_BODY")).toBe("copy")
    expect(map.get("AVATAR_FOTO")).toBe("image")
    expect(map.has("SELO_ARTE")).toBe(false)
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
    const sk = skeleton([heroBlock()])
    const match = matchVariantsToSkeleton(sk, [slot("hero", vHero)])
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
