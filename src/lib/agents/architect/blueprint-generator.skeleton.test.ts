import { describe, expect, it } from "vitest"

import {
  applySkeletonToBlueprint,
  DEFAULT_BLUEPRINT_SYSTEM,
  DEFAULT_BLUEPRINT_USER,
  type GeneratedBlueprint,
} from "./blueprint-generator.service"
import { DEFAULT_ASSEMBLER_SYSTEM } from "./component-assembler.service"
import { extractStructureFromReference } from "./reference-structure"

const REFERENCE = `<html><body>
  <td>{{LOGO}}</td>
  <td>{{HERO_EYEBROW}} {{HERO_HEADLINE}} {{HERO_BODY}}
      <a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a>
      <img src="{{HERO_IMAGE}}"></td>
  <td>{{OFFER_HEADLINE}} {{COUPON_CODE}} {{COUPON_HINT}}</td>
  <td>{{FOOTER_TAGLINE}} <a href="{{UNSUBSCRIBE_URL}}">x</a></td>
</body></html>`

const skeleton = () => extractStructureFromReference(REFERENCE)!

describe("applySkeletonToBlueprint", () => {
  it("mantém label/purpose/image_brief do LLM quando os blocos casam", () => {
    const llm: GeneratedBlueprint = {
      objective: "obj",
      messaging: "msg",
      subject_hint: "hint",
      blocks: [
        { type: "header", label: "Logo", purpose: "abre", needs_image: false, image_brief: null, copy_spec: [] },
        { type: "hero", label: "Hero carrinho", purpose: "puxa pro CTA", needs_image: true, image_brief: "foto lifestyle", copy_spec: [] },
        { type: "coupon", label: "Cupom volta", purpose: "oferta", needs_image: false, image_brief: null, copy_spec: [] },
        { type: "footer", label: "Rodapé", purpose: "legal", needs_image: false, image_brief: null, copy_spec: [] },
      ],
    }
    const out = applySkeletonToBlueprint(llm, skeleton())
    expect(out.blocks.map((b) => b.type)).toEqual(["header", "hero", "coupon", "footer"])
    expect(out.blocks[1].label).toBe("Hero carrinho")
    expect(out.blocks[1].purpose).toBe("puxa pro CTA")
    expect(out.blocks[1].image_brief).toBe("foto lifestyle")
    expect(out.objective).toBe("obj")
    expect(out.subject_hint).toBe("hint")
  })

  it("carrega as tags do reference em cada bloco (contrato pro n8n)", () => {
    const llm: GeneratedBlueprint = {
      objective: "",
      messaging: "",
      subject_hint: null,
      blocks: [],
    }
    const out = applySkeletonToBlueprint(llm, skeleton())
    expect(out.blocks[1].tags).toEqual([
      "HERO_EYEBROW",
      "HERO_HEADLINE",
      "HERO_BODY",
      "HERO_CTA_URL",
      "HERO_CTA_LABEL",
      "HERO_IMAGE",
    ])
    expect(out.blocks[2].tags).toEqual([
      "OFFER_HEADLINE",
      "COUPON_CODE",
      "COUPON_HINT",
    ])
  })

  it("estrutura do esqueleto GANHA quando o LLM funde/pula/inventa blocos", () => {
    const llm: GeneratedBlueprint = {
      objective: "obj",
      messaging: "",
      subject_hint: null,
      blocks: [
        // LLM fundiu hero+cupom num só e inventou um bloco products
        { type: "hero", label: "Herozão", purpose: "tudo junto", needs_image: true, image_brief: "brief", copy_spec: [] },
        { type: "products", label: "Inventado", purpose: "nao existe", needs_image: true, image_brief: "x", copy_spec: [] },
      ],
    }
    const out = applySkeletonToBlueprint(llm, skeleton())
    // A estrutura é a do esqueleto — 4 blocos, sem products.
    expect(out.blocks.map((b) => b.type)).toEqual(["header", "hero", "coupon", "footer"])
    // hero casou por tipo → aproveita os campos criativos
    expect(out.blocks[1].label).toBe("Herozão")
    // coupon não casou → defaults
    expect(out.blocks[2].label).toBe("coupon")
    expect(out.blocks[2].purpose).toBe("")
  })

  it("needs_image e copy_spec vêm SEMPRE do esqueleto", () => {
    const llm: GeneratedBlueprint = {
      objective: "",
      messaging: "",
      subject_hint: null,
      blocks: [
        { type: "header", label: "h", purpose: "", needs_image: true, image_brief: "indevido", copy_spec: [{ key: "headline", min_chars: 1, max_chars: 999 }] },
        { type: "hero", label: "h", purpose: "", needs_image: false, image_brief: null, copy_spec: [] },
        { type: "coupon", label: "c", purpose: "", needs_image: false, image_brief: null, copy_spec: [] },
        { type: "footer", label: "f", purpose: "", needs_image: false, image_brief: null, copy_spec: [] },
      ],
    }
    const out = applySkeletonToBlueprint(llm, skeleton())
    // header não tem tag de imagem no reference → needs_image false, brief nulo
    expect(out.blocks[0].needs_image).toBe(false)
    expect(out.blocks[0].image_brief).toBeNull()
    expect(out.blocks[0].copy_spec).toEqual([])
    // hero TEM {{HERO_IMAGE}} → needs_image true mesmo com LLM dizendo false
    expect(out.blocks[1].needs_image).toBe(true)
    // copy_spec do cupom vem do registry (code/hint/headline), não do LLM
    const couponKeys = out.blocks[2].copy_spec.map((f) => f.key)
    expect(couponKeys).toEqual(["headline", "code", "hint"])
  })
})

describe("paridade dos prompts default com as migrations", () => {
  // Espelha a migration 20260925 (blueprint) — sem estes sentinelas o
  // fallback in-code regride para o comportamento pré-tags.
  it("DEFAULT_BLUEPRINT_SYSTEM contém a regra da estrutura pré-extraída", () => {
    expect(DEFAULT_BLUEPRINT_SYSTEM).toContain(
      "ESTRUTURA PRÉ-EXTRAÍDA (tags canônicas)",
    )
  })

  it("DEFAULT_BLUEPRINT_USER interpola {{estrutura_extraida}}", () => {
    expect(DEFAULT_BLUEPRINT_USER).toContain("<estrutura_extraida>")
    expect(DEFAULT_BLUEPRINT_USER).toContain("{{estrutura_extraida}}")
  })

  // Espelha a migration 20260926 (assembler).
  it("DEFAULT_ASSEMBLER_SYSTEM contém a regra das tags canônicas", () => {
    expect(DEFAULT_ASSEMBLER_SYSTEM).toContain("REGRA DAS TAGS CANÔNICAS")
  })
})
