import { describe, expect, it } from "vitest"

import {
  TAG_REGISTRY,
  lookupTag,
  normalizeTagName,
} from "./tag-registry"
import { clampCopySpecField } from "./copy-spec"

describe("normalizeTagName", () => {
  it("normaliza todos os índices numéricos para _N", () => {
    expect(normalizeTagName("PRODUCT_1_NAME")).toBe("PRODUCT_N_NAME")
    expect(normalizeTagName("PRODUCT_2_THUMB_3")).toBe("PRODUCT_N_THUMB_N")
    expect(normalizeTagName("USP_10_TITLE")).toBe("USP_N_TITLE")
    expect(normalizeTagName("HERO_HEADLINE")).toBe("HERO_HEADLINE")
  })
})

describe("lookupTag", () => {
  it("resolve tag direta e indexada", () => {
    expect(lookupTag("HERO_EYEBROW")?.copyKey).toBe("eyebrow")
    expect(lookupTag("PRODUCT_3_NAME")?.kind).toBe("data")
    expect(lookupTag("FOOTER_LINK_7_URL")?.kind).toBe("url")
    expect(lookupTag("REVIEW_2_TEXT")?.copyKey).toBe("text")
  })

  it("tag fora do vocabulário → null", () => {
    expect(lookupTag("HEADLINE")).toBeNull()
    expect(lookupTag("HERO_KICKER")).toBeNull()
    expect(lookupTag("CONTEUDO")).toBeNull()
  })
})

describe("TAG_REGISTRY — consistência", () => {
  it("toda tag de copy tem copyKey e orçamento min<=max", () => {
    for (const [tag, spec] of Object.entries(TAG_REGISTRY)) {
      if (spec.kind !== "copy") continue
      expect(spec.copyKey, tag).toBeTruthy()
      expect(spec.min, tag).toBeGreaterThan(0)
      expect(spec.max, tag).toBeGreaterThanOrEqual(spec.min ?? 0)
    }
  })

  it("orçamentos sobrevivem ao clamp do copy-spec (dentro dos bounds)", () => {
    // Se o clamp altera o valor, o registry viola os ABSOLUTE_BOUNDS — o
    // orçamento declarado seria mentira. Falha aqui = corrigir o registry.
    for (const [tag, spec] of Object.entries(TAG_REGISTRY)) {
      if (spec.kind !== "copy" || !spec.copyKey) continue
      const clamped = clampCopySpecField({
        key: spec.copyKey,
        min_chars: spec.min,
        max_chars: spec.max,
      })
      expect(clamped, tag).not.toBeNull()
      expect(clamped?.min_chars, tag).toBe(spec.min)
      expect(clamped?.max_chars, tag).toBe(spec.max)
    }
  })

  it("HERO_EYEBROW respeita o teto de 24 chars (migration 20260923)", () => {
    expect(TAG_REGISTRY.HERO_EYEBROW.max).toBe(24)
  })

  it("tags de kind não-copy nunca têm orçamento", () => {
    for (const [tag, spec] of Object.entries(TAG_REGISTRY)) {
      if (spec.kind === "copy") continue
      expect(spec.copyKey, tag).toBeNull()
      expect(spec.min, tag).toBeUndefined()
      expect(spec.max, tag).toBeUndefined()
    }
  })
})
