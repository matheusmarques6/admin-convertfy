import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  parseAssemblerOutput,
  resolveChoices,
  slotMapFromSlots,
  variantHasPlaceholders,
  type AssemblySlot,
} from "./component-assembler.service"

function mk(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "v",
    html: p.html ?? "<div></div>",
    rendered_html: null,
    html_tagged: p.html_tagged ?? null,
    tagging_status: p.tagging_status ?? null,
    tagging_meta: p.tagging_meta ?? null,
    description: p.description ?? null,
    long_description: p.long_description ?? null,
    slots: p.slots ?? [],
    niche_affinity: p.niche_affinity ?? [],
    positioning: p.positioning ?? [],
    mood: p.mood ?? [],
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
    thumbnail: p.thumbnail ?? null,
    is_active: p.is_active ?? true,
    version: p.version ?? 1,
    created_at: p.created_at ?? "2026-01-01",
    created_by: p.created_by ?? null,
  }
}

describe("parseAssemblerOutput", () => {
  it("parseia array válido", () => {
    expect(parseAssemblerOutput('[{"block_index":0,"variant_id":"a"}]')).toEqual([
      { block_index: 0, variant_id: "a" },
    ])
  })
  it("remove fences markdown", () => {
    expect(
      parseAssemblerOutput('```json\n[{"block_index":1,"variant_id":"b"}]\n```'),
    ).toEqual([{ block_index: 1, variant_id: "b" }])
  })
  it("retorna [] para inválido ou não-array", () => {
    expect(parseAssemblerOutput("xpto")).toEqual([])
    expect(parseAssemblerOutput('{"x":1}')).toEqual([])
  })
  it("captura reasoning e brand_evidence quando presentes", () => {
    expect(
      parseAssemblerOutput(
        '[{"block_index":0,"variant_id":"a","reasoning":"r","brand_evidence":"e"}]',
      ),
    ).toEqual([
      { block_index: 0, variant_id: "a", reasoning: "r", brand_evidence: "e" },
    ])
  })
})

describe("resolveChoices", () => {
  const a = mk({ id: "a" })
  const b = mk({ id: "b" })
  const c = mk({ id: "c" })

  it("aplica a escolha do LLM", () => {
    const out = resolveChoices([[a, b]], [{ block_index: 0, variant_id: "b" }])
    expect(out).toEqual([b])
  })
  it("cai no top-1 quando a escolha está ausente ou é inválida", () => {
    expect(resolveChoices([[a, b]], [])).toEqual([a])
    expect(
      resolveChoices([[a, b]], [{ block_index: 0, variant_id: "zzz" }]),
    ).toEqual([a])
  })
  it("pula blocos sem candidato", () => {
    const out = resolveChoices([[a], [], [c]], [])
    expect(out).toEqual([a, c])
  })
})

describe("slotMapFromSlots", () => {
  it("mapeia variante e missing com block_index posicional", () => {
    const hero = mk({ id: "vh", block_type: "hero", name: "Hero A" })
    const slots: AssemblySlot[] = [
      { kind: "variant", variant: hero, section: "hero", label: "Hero" },
      { kind: "missing", section: "offer", label: "Oferta" },
    ]
    expect(slotMapFromSlots(slots)).toEqual([
      {
        block_index: 0, section: "hero", label: "Hero",
        variant_id: "vh", variant_name: "Hero A", assembled: true,
      },
      {
        block_index: 1, section: "offer", label: "Oferta",
        variant_id: null, variant_name: null, assembled: false,
      },
    ])
  })

  it("variante que a montagem descartou fica assembled:false (MC-1)", () => {
    // Ter variante nao basta: HTML vazio ou fragmento irrecuperavel tambem
    // deixa a secao fora do documento. Sem este sinal o dispatch pediria
    // copy para uma secao que nao existe no email.
    const hero = mk({ id: "vh", block_type: "hero", name: "Hero A" })
    const body = mk({ id: "vb", block_type: "body", name: "Body A" })
    const slots: AssemblySlot[] = [
      { kind: "variant", variant: hero, section: "hero", label: "Hero" },
      { kind: "variant", variant: body, section: "body", label: "Corpo" },
    ]
    const map = slotMapFromSlots(slots, [{ block_index: 1 }])
    expect(map.map((s) => s.assembled)).toEqual([true, false])
    // o variant_id continua registrado — quem foi descartado tambem precisa
    // aparecer no diagnostico
    expect(map[1].variant_id).toBe("vb")
  })
})

describe("variantHasPlaceholders (guard de elegibilidade)", () => {
  it("variante com {{TAG}} é elegível", () => {
    expect(
      variantHasPlaceholders(mk({ html: "<td>{{HERO_HEADLINE}}</td>" })),
    ).toBe(true)
  })
  it("variante 100% hardcoded (caso body 2) NÃO é elegível", () => {
    expect(
      variantHasPlaceholders(
        mk({ html: "<td>Lorem ipsum</td><img src=\"\" alt=\"\">" }),
      ),
    ).toBe(false)
  })
  it("merge tag minúscula do provedor não conta como placeholder", () => {
    expect(
      variantHasPlaceholders(mk({ html: "<a href=\"{{ unsubscribe }}\">x</a>" })),
    ).toBe(false)
  })
  it("html_tagged APROVADO com placeholder torna elegível (T7)", () => {
    expect(
      variantHasPlaceholders(
        mk({
          html: "<td>Lorem ipsum</td>",
          html_tagged: "<td>{{SECTION_HEADLINE}}</td>",
          tagging_status: "approved",
        }),
      ),
    ).toBe(true)
  })
  it("proposta PENDENTE não conta — só aprovado entra no pool", () => {
    expect(
      variantHasPlaceholders(
        mk({
          html: "<td>Lorem ipsum</td>",
          html_tagged: "<td>{{SECTION_HEADLINE}}</td>",
          tagging_status: "pending",
        }),
      ),
    ).toBe(false)
  })
})
