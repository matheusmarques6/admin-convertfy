import { describe, it, expect, vi } from "vitest"

// Isola o I/O: as funções puras testadas aqui não tocam o banco, mas a
// cadeia de imports puxa createAdminClient (telemetry/llm-invoke).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type {
  EmailComponentVariant,
  EmailOutlineTemplate,
} from "@/types/email-generation"
import { resolveSections } from "./outline-sections"
import {
  resolveChoices,
  assembleReferenceHtml,
} from "./component-assembler.service"
import { parseBlueprintOutput } from "./blueprint-generator.service"

function outline(blocks: string[]): EmailOutlineTemplate {
  return { suggested_blocks: blocks } as unknown as EmailOutlineTemplate
}

function variant(section: string, name: string): EmailComponentVariant {
  return {
    id: `${section}-${name}`,
    block_type: section,
    name,
    html: `<div data-sec="${section}">${name}</div>`,
    description: null,
    long_description: null,
    slots: [],
    niche_affinity: [],
    positioning: [],
    mood: [],
    objectives: [],
    tones: [],
    when_use: null,
    when_not_use: null,
    copy_guidance: null,
    product_slots: 0,
    output_schema: [],
    density: null,
    tags: [],
    thumbnail: null,
    is_active: true,
    version: 1,
    created_at: "2026-01-01",
    created_by: null,
  }
}

describe("resolveSections (normalização do outline)", () => {
  it("mantém seções válidas e mapeia tipos técnicos → seção", () => {
    expect(
      resolveSections(
        outline(["header", "hero", "testimonials", "coupon", "footer"]),
      ),
    ).toEqual(["header", "hero", "reviews", "offer", "footer"])
  })

  it("preserva ordem e repetições", () => {
    expect(resolveSections(outline(["cta", "products", "cta"]))).toEqual([
      "cta",
      "products",
      "cta",
    ])
  })

  it("ignora itens desconhecidos", () => {
    expect(resolveSections(outline(["hero", "xpto", "footer"]))).toEqual([
      "hero",
      "footer",
    ])
  })

  it("cai no fallback quando vazio ou nulo", () => {
    const fb = ["header", "hero", "body", "products", "footer"]
    expect(resolveSections(null)).toEqual(fb)
    expect(resolveSections(outline([]))).toEqual(fb)
    expect(resolveSections(outline(["zzz"]))).toEqual(fb)
  })
})

describe("encadeamento Montador → Blueprint (inversão)", () => {
  it("1º) Montador monta o HTML a partir das seções do outline, na ordem", () => {
    const sections = resolveSections(
      outline(["header", "hero", "products", "footer"]),
    )
    // 2 candidatos por seção; sem escolha do LLM → cai no top-1 (A).
    const candidates = sections.map((s) => [variant(s, "A"), variant(s, "B")])
    const chosen = resolveChoices(candidates, [])
    const html = assembleReferenceHtml(chosen)

    // cada seção aparece no HTML e na ordem do outline
    const positions = sections.map((s) => html.indexOf(`data-sec="${s}"`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(chosen.map((v) => v.id)).toEqual([
      "header-A",
      "hero-A",
      "products-A",
      "footer-A",
    ])
  })

  it("2º) Blueprint extrai a estrutura do HTML montado (parse)", () => {
    // Saída simulada do agente DEPOIS de ler o HTML montado pelo Montador.
    const raw = JSON.stringify({
      objective: "Recuperar o carrinho",
      messaging: "Urgência leve",
      subject_hint: "Você esqueceu algo",
      blocks: [
        { type: "header", label: "Topo", purpose: "logo" },
        { type: "hero", label: "Banner", purpose: "destaque" },
        { type: "products", label: "Grade", purpose: "itens" },
        { type: "footer", label: "Rodapé", purpose: "social" },
      ],
    })
    const bp = parseBlueprintOutput(raw)
    expect(bp).not.toBeNull()
    // a estrutura reflete a ordem/seções do HTML
    expect(bp!.blocks.map((b) => b.type)).toEqual([
      "header",
      "hero",
      "products",
      "footer",
    ])
    expect(bp!.blocks.find((b) => b.type === "hero")?.needs_image).toBe(true)
  })
})
