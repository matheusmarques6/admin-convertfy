import { describe, it, expect } from "vitest"
import {
  resolveImageMode,
  productRefDescriptionFallback,
} from "./mode-resolution"

describe("resolveImageMode — blueprint override", () => {
  it("blueprint='product_ref' + multimodal enabled + has ref → product_ref/blueprint", () => {
    const res = resolveImageMode({
      blueprintMode: "product_ref",
      flowType: "welcome",
      emailNumber: 4,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "product_ref", source: "blueprint" })
  })

  it("blueprint='text2img' vence matriz product_ref do E1", () => {
    const res = resolveImageMode({
      blueprintMode: "text2img",
      flowType: "welcome",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "blueprint" })
  })

  it("blueprint='product_ref' + multimodal DISABLED → fallback_text2img_disabled", () => {
    const res = resolveImageMode({
      blueprintMode: "product_ref",
      flowType: "welcome",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: false,
    })
    expect(res).toEqual({
      mode: "text2img",
      source: "fallback_text2img_disabled",
    })
  })

  it("blueprint='product_ref' + sem topProductImageUrl → fallback_text2img_no_product", () => {
    const res = resolveImageMode({
      blueprintMode: "product_ref",
      flowType: "welcome",
      emailNumber: 1,
      topProductImageUrl: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({
      mode: "text2img",
      source: "fallback_text2img_no_product",
    })
  })

  it("blueprint='auto' delega pra matriz", () => {
    const res = resolveImageMode({
      blueprintMode: "auto",
      flowType: "welcome",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "product_ref", source: "matrix" })
  })
})

describe("resolveImageMode — matriz Welcome", () => {
  it.each([
    [1, "product_ref"],
    [2, "product_ref"],
    [3, "product_ref"],
    [6, "product_ref"],
  ] as const)("E%s com multimodal+ref → %s/matrix", (n, mode) => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: n,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode, source: "matrix" })
  })

  it.each([
    [4, "text2img"],
    [5, "text2img"],
  ] as const)("E%s → %s/matrix (sem fallback necessario)", (n, mode) => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: n,
      topProductImageUrl: null,
      multimodalEnabled: false,
    })
    expect(res).toEqual({ mode, source: "matrix" })
  })

  it("matriz E1 mas multimodal disabled → fallback_text2img_disabled", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: false,
    })
    expect(res).toEqual({
      mode: "text2img",
      source: "fallback_text2img_disabled",
    })
  })

  it("matriz E2 (obrigatorio) sem ref → fallback_text2img_no_product", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: 2,
      topProductImageUrl: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({
      mode: "text2img",
      source: "fallback_text2img_no_product",
    })
  })

  it("welcome E99 (fora da matriz) → text2img/default", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: 99,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })
})

describe("resolveImageMode — default", () => {
  it("flow desconhecido → text2img/default", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "abandoned_cart",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })

  it("sem flowType nem blueprint → text2img/default", () => {
    const res = resolveImageMode({})
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })

  it("emailNumber null em welcome → text2img/default", () => {
    const res = resolveImageMode({
      flowType: "welcome",
      emailNumber: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })
})

describe("productRefDescriptionFallback", () => {
  it("inclui nome do produto e URL quando ambos presentes", () => {
    const out = productRefDescriptionFallback({
      productName: "Capa banco couro preto",
      productImageUrl: "https://cdn/capa.jpg",
    })
    expect(out).toContain("Capa banco couro preto")
    expect(out).toContain("https://cdn/capa.jpg")
    expect(out).toContain("Match material")
  })

  it("funciona sem productImageUrl", () => {
    const out = productRefDescriptionFallback({
      productName: "Tenis branco",
    })
    expect(out).toContain("Tenis branco")
    expect(out).not.toContain("style guide image at")
  })

  it("funciona com productImageUrl null/undefined", () => {
    const out = productRefDescriptionFallback({
      productName: "Tenis branco",
      productImageUrl: null,
    })
    expect(out).toContain("Tenis branco")
    expect(out).not.toContain("style guide image at")
  })
})
