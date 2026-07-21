import { describe, it, expect } from "vitest"
import type { EmailComponentVariant } from "@/types/email-generation"
import {
  derivePositioning,
  deriveMoodKeys,
  buildMatchContext,
  scoreVariant,
  prefilterCandidates,
} from "./component-deriver"

function makeVariant(p: Partial<EmailComponentVariant>): EmailComponentVariant {
  return {
    id: p.id ?? "id",
    block_type: p.block_type ?? "hero",
    name: p.name ?? "v",
    html: p.html ?? "<div></div>",
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

describe("derivePositioning", () => {
  it("mapeia premium/popular/medio por substring", () => {
    expect(derivePositioning("Premium")).toBe("premium")
    expect(derivePositioning("posicionamento popular")).toBe("popular")
    expect(derivePositioning("médio")).toBe("medio")
  })
  it("retorna null para vazio/desconhecido", () => {
    expect(derivePositioning("")).toBeNull()
    expect(derivePositioning(null)).toBeNull()
    expect(derivePositioning("indefinido")).toBeNull()
  })
})

describe("deriveMoodKeys", () => {
  it("extrai a chave do tom de voz", () => {
    expect(deriveMoodKeys("Formal")).toEqual(["formal"])
    expect(deriveMoodKeys("divertido e jovem")).toEqual(["divertido"])
  })
  it("retorna [] para vazio ou desconhecido", () => {
    expect(deriveMoodKeys("")).toEqual([])
    expect(deriveMoodKeys("sério")).toEqual([])
  })
})

describe("buildMatchContext", () => {
  it("normaliza nicho por substring (override de imagem reusa a mesma taxonomia)", () => {
    const ctx = buildMatchContext({
      nicho: "Acessórios Automotivos",
      posicionamento: "premium",
      tom_voz: "formal",
    })
    expect(ctx.nicheKey).toBe("automotivo")
    expect(ctx.positioning).toBe("premium")
    expect(ctx.moodKeys).toEqual(["formal"])
  })
  it("nicho desconhecido vira null", () => {
    expect(buildMatchContext({ nicho: "xyz" }).nicheKey).toBeNull()
  })
})

describe("scoreVariant", () => {
  it("nicho específico pontua mais que wildcard", () => {
    const ctx = buildMatchContext({ nicho: "beleza" })
    const match = makeVariant({ niche_affinity: ["beleza"] })
    const wildcard = makeVariant({ niche_affinity: [] })
    expect(scoreVariant(match, ctx)).toBeGreaterThan(scoreVariant(wildcard, ctx))
  })
  it("soma mood overlap e densidade", () => {
    const ctx = buildMatchContext({ tom_voz: "formal", density: "minimal" })
    const base = makeVariant({})
    const rich = makeVariant({ mood: ["formal"], density: "minimal" })
    expect(scoreVariant(rich, ctx)).toBeGreaterThan(scoreVariant(base, ctx))
  })
})

describe("prefilterCandidates", () => {
  const ctx = buildMatchContext({
    nicho: "pet",
    posicionamento: "popular",
    tom_voz: "casual",
  })

  it("ordena por score e corta em top-K", () => {
    const variants = [
      makeVariant({ id: "a", niche_affinity: ["pet"], positioning: ["popular"] }),
      makeVariant({ id: "b", niche_affinity: [] }),
      makeVariant({ id: "c", niche_affinity: ["moda"] }),
    ]
    const out = prefilterCandidates(variants, ctx, 2)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe("a")
  })

  it("desempata por version desc", () => {
    const variants = [
      makeVariant({ id: "v1", version: 1 }),
      makeVariant({ id: "v2", version: 3 }),
    ]
    const out = prefilterCandidates(variants, ctx)
    expect(out[0].id).toBe("v2")
  })

  it("sempre retorna ao menos 1 (fallback de degrade seguro)", () => {
    const out = prefilterCandidates([makeVariant({ niche_affinity: ["moda"] })], ctx, 5)
    expect(out).toHaveLength(1)
  })
})
