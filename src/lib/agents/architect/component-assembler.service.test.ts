import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  parseAssemblerOutput,
  resolveChoices,
  assembleReferenceHtml,
  missingBlockNote,
  shuffle,
  validateBlockMarkers,
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

describe("shuffle", () => {
  it("preserva todos os elementos (sem perder nem duplicar)", () => {
    const out = shuffle([1, 2, 3, 4, 5])
    expect(out).toHaveLength(5)
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })
  it("não muta a array original", () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
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

describe("assembleReferenceHtml", () => {
  it("concatena os snippets na ordem dentro de um shell 600px", () => {
    const hero = mk({ id: "a", block_type: "hero", name: "H", html: "<div>hero</div>" })
    const foot = mk({ id: "b", block_type: "footer", name: "F", html: "<div>foot</div>" })
    const html = assembleReferenceHtml([hero, foot])
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("max-width:600px")
    expect(html.indexOf("hero")).toBeLessThan(html.indexOf("foot"))
  })
})

describe("missingBlockNote", () => {
  it("a nota tem o texto pedido pelo produto", () => {
    expect(missingBlockNote("offer")).toContain(
      "nao foi encontrada referencia para esse bloco",
    )
  })
})

describe("validateBlockMarkers", () => {
  const hero = mk({ id: "vh", block_type: "hero", name: "Hero A" })
  const cta = mk({ id: "vc", block_type: "cta", name: "CTA A" })
  const slots: AssemblySlot[] = [
    { kind: "variant", variant: hero, section: "hero", label: "Hero" },
    { kind: "variant", variant: cta, section: "cta", label: "CTA" },
  ]
  const ok = [
    "<!-- cfy:block:0:hero:start -->",
    "<div>hero</div>",
    "<!-- cfy:block:0:hero:end -->",
    "<!-- cfy:block:1:cta:start -->",
    "<div>cta</div>",
    "<!-- cfy:block:1:cta:end -->",
  ].join("\n")

  it("aceita pares corretos na ordem", () => {
    const res = validateBlockMarkers(ok, slots)
    expect(res.status).toBe("ok")
    expect(res.html).toBe(ok)
  })

  it("sem marcador nenhum → absent (documento intacto)", () => {
    const res = validateBlockMarkers("<div>x</div>", slots)
    expect(res.status).toBe("absent")
    expect(res.html).toBe("<div>x</div>")
  })

  it("contagem errada de pares → strip", () => {
    const partial = "<!-- cfy:block:0:hero:start --><div>hero</div><!-- cfy:block:0:hero:end -->"
    const res = validateBlockMarkers(partial, slots)
    expect(res.status).toBe("stripped")
    expect(res.html).not.toContain("cfy:block")
    expect(res.html).toContain("<div>hero</div>")
  })

  it("section divergente do slot → strip", () => {
    const wrong = ok.replace("cfy:block:1:cta:start", "cfy:block:1:body:start")
    const res = validateBlockMarkers(wrong, slots)
    expect(res.status).toBe("stripped")
  })

  it("pares fora de ordem/aninhados → strip", () => {
    const nested = [
      "<!-- cfy:block:0:hero:start -->",
      "<!-- cfy:block:1:cta:start -->",
      "<!-- cfy:block:0:hero:end -->",
      "<!-- cfy:block:1:cta:end -->",
    ].join("\n")
    expect(validateBlockMarkers(nested, slots).status).toBe("stripped")
  })

  it("tolera section maiúscula (case-insensitive)", () => {
    const upper = ok.replaceAll(":hero:", ":HERO:")
    expect(validateBlockMarkers(upper, slots).status).toBe("ok")
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
      { block_index: 0, section: "hero", label: "Hero", variant_id: "vh", variant_name: "Hero A" },
      { block_index: 1, section: "offer", label: "Oferta", variant_id: null, variant_name: null },
    ])
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

describe("HTML efetivo no assemble (T5 — épico Taguedor)", () => {
  it("assembleReferenceHtml usa html_tagged aprovado no lugar do exemplo", () => {
    const v = mk({
      id: "a",
      block_type: "hero",
      name: "H",
      html: "<div>Frase de exemplo</div>",
      html_tagged: "<div>{{HERO_HEADLINE_X}}</div>",
      tagging_status: "approved",
    })
    const html = assembleReferenceHtml([v])
    expect(html).toContain("{{HERO_HEADLINE_X}}")
    expect(html).not.toContain("Frase de exemplo")
  })
  it("proposta pendente NÃO substitui o html original", () => {
    const v = mk({
      id: "a",
      block_type: "hero",
      name: "H",
      html: "<div>{{HERO_HEADLINE}}</div>",
      html_tagged: "<div>{{OUTRA_COISA}}</div>",
      tagging_status: "pending",
    })
    const html = assembleReferenceHtml([v])
    expect(html).toContain("{{HERO_HEADLINE}}")
    expect(html).not.toContain("{{OUTRA_COISA}}")
  })
})
