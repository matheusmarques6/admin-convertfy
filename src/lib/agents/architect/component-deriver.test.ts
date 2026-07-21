import { describe, it, expect } from "vitest"
import type { EmailComponentVariant } from "@/types/email-generation"
import {
  flowTypeToObjective,
  deriveToneKeys,
} from "@/lib/agents/shared/component-dimensions"
import {
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

describe("flowTypeToObjective", () => {
  it("mapeia flows canônicos para o objetivo", () => {
    expect(flowTypeToObjective("welcome")).toBe("Boas-vindas")
    expect(flowTypeToObjective("abandoned_cart")).toBe("Carrinho abandonado")
    expect(flowTypeToObjective("site_abandoned")).toBe("Carrinho abandonado")
    expect(flowTypeToObjective("browse_abandonment")).toBe("Carrinho abandonado")
    expect(flowTypeToObjective("upsell")).toBe("Upsell")
    expect(flowTypeToObjective("win_back")).toBe("Win-back")
    expect(flowTypeToObjective("post_purchase")).toBe("Pós-compra")
    expect(flowTypeToObjective("shipping_stages")).toBe("Pós-compra")
  })
  it("custom/desconhecido/vazio vira null", () => {
    expect(flowTypeToObjective("custom")).toBeNull()
    expect(flowTypeToObjective("")).toBeNull()
    expect(flowTypeToObjective(null)).toBeNull()
  })
})

describe("deriveToneKeys", () => {
  it("extrai tons por keyword do tom de voz", () => {
    expect(deriveToneKeys("Formal e premium")).toEqual(["Premium"])
    expect(deriveToneKeys("divertido e jovem")).toEqual(["Descontraído"])
    expect(deriveToneKeys("acolhedor, próximo")).toEqual(["Amigável"])
  })
  it("acumula tons do tom de voz + tone_hint sem duplicar", () => {
    const tones = deriveToneKeys("premium", "Urgente, premium")
    expect(tones).toContain("Premium")
    expect(tones).toContain("Urgente")
    expect(tones.filter((t) => t === "Premium")).toHaveLength(1)
  })
  it("retorna [] para vazio ou desconhecido", () => {
    expect(deriveToneKeys("")).toEqual([])
    expect(deriveToneKeys("sério")).toEqual([])
    expect(deriveToneKeys(null, null)).toEqual([])
  })
})

describe("buildMatchContext", () => {
  it("deriva objetivo do flow e tons do tom de voz + hint", () => {
    const ctx = buildMatchContext({
      flow_type: "welcome",
      tom_voz: "premium",
      tone_hint: "Urgente, amigável",
    })
    expect(ctx.objective).toBe("Boas-vindas")
    expect(ctx.tones).toContain("Premium")
    expect(ctx.tones).toContain("Urgente")
    expect(ctx.tones).toContain("Amigável")
  })
  it("flow desconhecido vira objective null", () => {
    expect(buildMatchContext({ flow_type: "xyz" }).objective).toBeNull()
  })
})

describe("scoreVariant", () => {
  it("objetivo específico pontua mais que wildcard", () => {
    const ctx = buildMatchContext({ flow_type: "welcome" })
    const match = makeVariant({ objectives: ["Boas-vindas"] })
    const wildcard = makeVariant({ objectives: [] })
    expect(scoreVariant(match, ctx)).toBeGreaterThan(scoreVariant(wildcard, ctx))
  })
  it("objetivo errado pontua menos que wildcard", () => {
    const ctx = buildMatchContext({ flow_type: "welcome" })
    const wrong = makeVariant({ objectives: ["Win-back"] })
    const wildcard = makeVariant({ objectives: [] })
    expect(scoreVariant(wrong, ctx)).toBeLessThan(scoreVariant(wildcard, ctx))
  })
  it("soma overlap de tons e densidade", () => {
    const ctx = buildMatchContext({
      flow_type: null,
      tom_voz: "premium",
      density: "minimal",
    })
    const base = makeVariant({})
    const rich = makeVariant({ tones: ["Premium"], density: "minimal" })
    expect(scoreVariant(rich, ctx)).toBeGreaterThan(scoreVariant(base, ctx))
  })
})

describe("prefilterCandidates", () => {
  const ctx = buildMatchContext({
    flow_type: "abandoned_cart",
    tom_voz: "urgente e casual",
  })

  it("ordena por score e corta em top-K", () => {
    const variants = [
      makeVariant({
        id: "a",
        objectives: ["Carrinho abandonado"],
        tones: ["Urgente"],
      }),
      makeVariant({ id: "b", objectives: [] }),
      makeVariant({ id: "c", objectives: ["Newsletter"] }),
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
    const out = prefilterCandidates(
      [makeVariant({ objectives: ["Newsletter"] })],
      ctx,
      5,
    )
    expect(out).toHaveLength(1)
  })
})
