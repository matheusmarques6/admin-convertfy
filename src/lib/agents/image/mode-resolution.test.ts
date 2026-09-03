import { describe, it, expect } from "vitest"
import {
  resolveImageMode,
  resolveImageAppendices,
  productRefDescriptionFallback,
  productRefFidelityInstruction,
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

  it("welcome E99 (fora da matriz) SEM foto → text2img/default", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "welcome",
      emailNumber: 99,
      topProductImageUrl: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })
})

describe("resolveImageMode — default", () => {
  // Regressao Innova Bay (ago/2026): abandoned_cart com foto de produto
  // carregada gerava o produto do zero, porque a matriz so cobre welcome.
  it("flow fora da matriz COM foto → product_ref/default", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "abandoned_cart",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "product_ref", source: "default" })
  })

  it("flow fora da matriz SEM foto → text2img/default", () => {
    const res = resolveImageMode({
      blueprintMode: null,
      flowType: "abandoned_cart",
      emailNumber: 1,
      topProductImageUrl: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })

  it("flow fora da matriz com foto mas multimodal OFF → fallback", () => {
    const res = resolveImageMode({
      flowType: "abandoned_cart",
      emailNumber: 1,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: false,
    })
    expect(res).toEqual({
      mode: "text2img",
      source: "fallback_text2img_disabled",
    })
  })

  it("sem flowType nem blueprint → text2img/default", () => {
    const res = resolveImageMode({})
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })

  it("emailNumber null em welcome, sem foto → text2img/default", () => {
    const res = resolveImageMode({
      flowType: "welcome",
      emailNumber: null,
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "text2img", source: "default" })
  })

  it("welcome fora da matriz (E99) COM foto → product_ref/default", () => {
    const res = resolveImageMode({
      flowType: "welcome",
      emailNumber: 99,
      topProductImageUrl: "https://cdn/x.jpg",
      multimodalEnabled: true,
    })
    expect(res).toEqual({ mode: "product_ref", source: "default" })
  })
})

describe("productRefFidelityInstruction", () => {
  it("manda reproduzir o produto exato e proibe redesenhar", () => {
    const out = productRefFidelityInstruction({ productName: "EnergySave Pro" })
    expect(out).toContain("EnergySave Pro")
    expect(out).toContain("IDENTITY comes from that photo")
    expect(out).toMatch(/Never redesign it/)
  })

  // 03/09: "ATTACHED PHOTO WINS" fazia o modelo copiar a foto — inclusive o
  // ângulo e o fundo. A foto dá o objeto; a direção dá a cena.
  it("a foto dá o produto, a direção dá a cena — nunca copiar ângulo ou fundo da referência", () => {
    const out = productRefFidelityInstruction({ productName: "OBD CarScan" })
    expect(out).not.toContain("ATTACHED PHOTO WINS")
    expect(out).toContain("angle, background and staging are NOT to be copied")
    expect(out).toContain("keep the product from the photo and the scene from the direction")
    expect(out).toContain("CFY_REF_PRODUCT")
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

describe("resolveImageAppendices", () => {
  const produto = { productName: "EnergySave Pro", productImageUrl: "https://cdn/p.jpg" }

  it("product_ref → só a fidelidade", () => {
    const out = resolveImageAppendices({
      mode: "product_ref",
      modeSource: "blueprint",
      ...produto,
    })
    expect(out.fidelity).toContain("EnergySave Pro")
    expect(out.fidelity).toContain("CFY_PRODUCT_FIDELITY")
    expect(out.fallbackDescription).toBeNull()
  })

  // A divergência que motivou o helper: o `resolve-block-prompt` conhecia
  // dois dos três fallbacks e nunca aplicava a fidelidade.
  it.each([
    "fallback_text2img_disabled",
    "fallback_text2img_no_product",
    "fallback_text2img_unreachable",
  ] as const)("%s → só a descrição textual", (modeSource) => {
    const out = resolveImageAppendices({ mode: "text2img", modeSource, ...produto })
    expect(out.fidelity).toBeNull()
    expect(out.fallbackDescription).toContain("EnergySave Pro")
  })

  it("text2img escolhido de propósito (sem rebaixamento) → nenhum apêndice", () => {
    const out = resolveImageAppendices({
      mode: "text2img",
      modeSource: "matrix",
      ...produto,
    })
    expect(out).toEqual({ fidelity: null, fallbackDescription: null })
  })

  it("sem nome de produto → nenhum apêndice (as duas frases se apoiam nele)", () => {
    expect(
      resolveImageAppendices({ mode: "product_ref", modeSource: "default" }),
    ).toEqual({ fidelity: null, fallbackDescription: null })
    expect(
      resolveImageAppendices({
        mode: "text2img",
        modeSource: "fallback_text2img_unreachable",
        productName: "   ",
      }),
    ).toEqual({ fidelity: null, fallbackDescription: null })
  })
})
