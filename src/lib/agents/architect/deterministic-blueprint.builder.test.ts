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
  fieldsFromSchema,
  fieldsFromTags,
  fieldsFromCopySpec,
  imageBriefFromSchema,
  buildDeterministicBlueprint,
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

// Blocos do skeleton com tags REAIS do registry (specs válidas no lookup).
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

// ── matchVariantsToSkeleton ─────────────────────────────────────────

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
    // bloco de texto sem variante → cobertura < 100%
    expect(m.coverage).toBeLessThan(1)
    expect(m.unmatchedBlockIndexes).toEqual([1])
  })

  it("variante sem guidance/schema não conta como coberta", () => {
    const vHero = variant({ id: "vh", block_type: "hero" }) // sem contexto
    const m = matchVariantsToSkeleton(skeleton([heroBlock()]), [
      slot("hero", vHero),
    ])
    expect(m.matches.get(0)?.variant.id).toBe("vh")
    expect(m.coverage).toBe(0)
  })

  it("sem blocos de copy → cobertura 1", () => {
    const imgOnly: ExtractedBlock = { ...heroBlock(), copy_spec: [] }
    const m = matchVariantsToSkeleton(skeleton([imgOnly]), [])
    expect(m.coverage).toBe(1)
  })
})

// ── fields v2 (3 origens) ───────────────────────────────────────────

describe("fieldsFromSchema", () => {
  it("resolve tag por copyKey e marca source=schema", () => {
    const fields = fieldsFromSchema(SCHEMA_HERO, ["HERO_HEADLINE", "HERO_IMAGE"])
    const headline = fields.find((f) => f.key === "headline")!
    expect(headline.tag).toBe("HERO_HEADLINE")
    expect(headline.source).toBe("schema")
    expect(headline.max_len).toBe(40)
    expect(headline.guidance).toBe("CAIXA ALTA")
  })

  it("resolve tag pelo nome normalizado quando não há copyKey igual", () => {
    const schema: ComponentOutputField[] = [
      {
        key: "coupon_code",
        label: "Código",
        type: "text_short",
        max_len: 15,
        required: true,
        example: "BEMVINDO15",
        guidance: "",
      },
    ]
    const fields = fieldsFromSchema(schema, ["COUPON_CODE"])
    // copyKey de COUPON_CODE é "code" ≠ "coupon_code" → cai no match por nome
    expect(fields[0].tag).toBe("COUPON_CODE")
  })

  it("campo sem tag correspondente → tag null", () => {
    const schema: ComponentOutputField[] = [
      {
        key: "campo_inexistente",
        label: "X",
        type: "text_short",
        max_len: 10,
        required: false,
        example: "",
        guidance: "",
      },
    ]
    expect(fieldsFromSchema(schema, ["HERO_HEADLINE"])[0].tag).toBeNull()
  })
})

describe("fieldsFromTags", () => {
  it("deriva do registry, dedup por copyKey, type heurístico", () => {
    const fields = fieldsFromTags(["BODY_TEXT", "BODY_TEXT", "HERO_IMAGE"])
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({
      key: "body",
      type: "text_long", // max 280 > 120
      max_len: 280,
      min_len: 120,
      required: true,
      tag: "BODY_TEXT",
      source: "tag_registry",
    })
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
      tag: null,
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
})

// ── buildDeterministicBlueprint (rota A) ────────────────────────────

describe("buildDeterministicBlueprint", () => {
  it("monta o blueprint completo a partir do skeleton + variantes + outline", () => {
    const vHero = variant({
      id: "vh",
      block_type: "hero",
      name: "Hero premium",
      copy_guidance: "Headline em caixa alta",
      output_schema: SCHEMA_HERO,
    })
    const sk = skeleton([heroBlock()])
    const match = matchVariantsToSkeleton(sk, [slot("hero", vHero, "Hero de boas-vindas")])
    const bp = buildDeterministicBlueprint({ skeleton: sk, match, outline: OUTLINE })

    expect(bp.objective).toBe("Boas-vindas com cupom")
    expect(bp.messaging).toBe("Storytelling antes da oferta")
    expect(bp.subject_hint).toBeNull()
    const b = bp.blocks[0]
    expect(b.type).toBe("hero")
    expect(b.label).toBe("Hero de boas-vindas")
    expect(b.purpose).toBe("Headline em caixa alta")
    expect(b.image_brief).toContain("Foto lifestyle")
    expect(b.variant_id).toBe("vh")
    expect(b.fields?.[0]?.source).toBe("schema")
    expect(b.tags).toEqual(["HERO_HEADLINE", "HERO_IMAGE"])
    expect(b.copy_spec).toEqual(heroBlock().copy_spec)
  })

  it("bloco sem variante casada cai em fields do tag-registry", () => {
    const sk = skeleton([textBlock()])
    const match = matchVariantsToSkeleton(sk, [])
    const bp = buildDeterministicBlueprint({ skeleton: sk, match, outline: null })
    expect(bp.blocks[0].variant_id).toBeNull()
    expect(bp.blocks[0].purpose).toBe("")
    expect(bp.blocks[0].fields?.[0]?.source).toBe("tag_registry")
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

  it("sem match (skeleton null): mantém o LLM e deriva fields das tags", () => {
    const out = packageBlueprint(llmBlueprint, null)
    const b = out.blocks[0]
    expect(b.purpose).toBe("purpose do llm")
    expect(b.image_brief).toBe("brief do llm")
    expect(b.variant_id).toBeNull()
    expect(b.fields?.every((f) => f.source === "tag_registry")).toBe(true)
  })

  it("bloco sem tags nem schema converte o copy_spec do LLM (source=llm)", () => {
    const noTags: GeneratedBlueprint = {
      ...llmBlueprint,
      blocks: [{ ...llmBlueprint.blocks[0], tags: [] }],
    }
    const out = packageBlueprint(noTags, null)
    expect(out.blocks[0].fields?.[0]).toMatchObject({
      key: "headline",
      source: "llm",
      max_len: 40,
    })
  })
})
