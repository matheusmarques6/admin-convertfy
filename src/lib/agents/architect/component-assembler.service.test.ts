import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  causaDaLacuna,
  causaEhRetomavel,
  lacunaEhFatal,
  parseAssemblerOutput,
  resolveChoices,
  slotMapFromSlots,
  variantIsFillable,
  type AssemblySlot,
} from "./component-assembler.service"

function mk(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "v",
    html: p.html ?? "<div></div>",
    rendered_html: null,
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

  // Passo 11: a lacuna tem NOME no slot_map — sem isto "variant_id: null"
  // não distinguia falta de biblioteca de recusa pela decisão.
  it("missing com motivo e dispositivo pedido viaja no slot_map", () => {
    const slots: AssemblySlot[] = [
      { kind: "missing", section: "products", label: "Produtos", motivo: "todas_descartadas", dispositivo_pedido: "vitrine_paralela" },
      { kind: "missing", section: "offer", label: "Oferta" },
    ]
    const map = slotMapFromSlots(slots)
    expect(map[0]).toMatchObject({ variant_id: null, motivo: "todas_descartadas", dispositivo_pedido: "vitrine_paralela" })
    expect(map[1]).not.toHaveProperty("motivo")
  })
})

describe("lacunaEhFatal (Passo 11)", () => {
  it("nenhuma posição vazia não é fatal", () => {
    expect(lacunaEhFatal([])).toBe(false)
  })
  // Peça com uma seção a menos é POBRE, não inviável — entra e o QA registra.
  it("uma posição não-hero vazia não é fatal", () => {
    expect(lacunaEhFatal([{ section: "products" }])).toBe(false)
  })
  // Sem hero a fase 2 morre em hero_failed de qualquer jeito.
  it("hero vazia é fatal", () => {
    expect(lacunaEhFatal([{ section: "hero" }])).toBe(true)
    expect(lacunaEhFatal([{ section: " HERO " }])).toBe(true)
  })
  it("duas ou mais posições vazias são fatais", () => {
    expect(lacunaEhFatal([{ section: "body" }, { section: "products" }])).toBe(true)
  })
})

describe("causaDaLacuna (16/09)", () => {
  it("sem posição por relógio, a causa é a biblioteca", () => {
    expect(causaDaLacuna([{ motivo: "sem_candidata" }])).toBe("biblioteca")
    expect(
      causaDaLacuna([{ motivo: "todas_descartadas" }, { motivo: "dispositivo_indisponivel" }]),
    ).toBe("biblioteca")
  })

  // Uma basta: com a peça decidida pela metade, qualquer veredito sobre a
  // biblioteca é sobre o que ainda não foi perguntado.
  it("uma posição por relógio já muda a causa", () => {
    expect(
      causaDaLacuna([{ motivo: "sem_candidata" }, { motivo: "orcamento_esgotado" }]),
    ).toBe("relogio")
  })

  it("lista vazia não acusa relógio", () => {
    expect(causaDaLacuna([])).toBe("biblioteca")
  })

  // 19/09, batch d2bd526b: 402 in-flight nas posições 2-5 do leque. A
  // chamada não aconteceu; a causa é o PROVEDOR, e ela é retomável como o
  // relógio — nunca lacuna de biblioteca, nunca resgate.
  it("chamada recusada pelo provedor é causa própria, e retomável", () => {
    expect(causaDaLacuna([{ motivo: "sem_candidata" }, { motivo: "chamada_falhou" }])).toBe("provedor")
    expect(causaEhRetomavel("provedor")).toBe(true)
    expect(causaEhRetomavel("relogio")).toBe(true)
    expect(causaEhRetomavel("biblioteca")).toBe(false)
  })

  it("provedor vence relógio quando os dois aparecem", () => {
    expect(causaDaLacuna([{ motivo: "orcamento_esgotado" }, { motivo: "chamada_falhou" }])).toBe("provedor")
  })
})

describe("variantIsFillable (guard de elegibilidade por example/token)", () => {
  const schemaCopy = [
    {
      key: "headline",
      label: "H",
      type: "text_short" as const,
      max_len: 40,
      required: true,
      example: "Frase autorada no HTML",
      guidance: "",
    },
  ]
  const schemaImage = [
    {
      key: "hero_image",
      label: "Foto",
      type: "image" as const,
      max_len: 0,
      required: false,
      example: "",
      guidance: "",
    },
  ]

  it("schema + example encontrável no HTML → elegível (as 30 da biblioteca real)", () => {
    expect(
      variantIsFillable(
        mk({
          html: "<table><tr><td>Frase autorada no HTML</td></tr></table>",
          output_schema: schemaCopy,
        }),
      ),
    ).toBe(true)
  })

  it("sem schema → fora do pool (não há contrato de copy)", () => {
    expect(
      variantIsFillable(mk({ html: "<td>{{HERO_HEADLINE}}</td>", output_schema: [] })),
    ).toBe(false)
  })

  it("schema cujo example NÃO existe no HTML → fora (cadastro podre)", () => {
    expect(
      variantIsFillable(
        mk({
          html: "<table><tr><td>Outra frase qualquer</td></tr></table>",
          output_schema: schemaCopy,
        }),
      ),
    ).toBe(false)
  })

  it("só imagem: token de atributo casável torna elegível", () => {
    expect(
      variantIsFillable(
        mk({
          html: '<table><tr><td><img src="URL_DA_IMAGEM_1" alt=""></td></tr></table>',
          output_schema: schemaImage,
        }),
      ),
    ).toBe(true)
    expect(
      variantIsFillable(
        mk({
          html: '<table><tr><td><img src="https://cdn/real.png" alt=""></td></tr></table>',
          output_schema: schemaImage,
        }),
      ),
    ).toBe(false)
  })
})
