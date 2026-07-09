/**
 * Testes da associação copy↔porta (varredura monotônica com cursor).
 */

import { describe, it, expect } from "vitest"
import { assignBlocksToPorts } from "./copy-match"
import type { CutPort } from "@/types/campaign-cuts"
import type { EmailDraftBlock } from "@/types/campaign-central"

function port(id: string, type: CutPort["type"], y0: number, y1: number): CutPort {
  return { id, label: id, type, y0, y1 }
}

/** Layout típico: header / hero / produtos / cupom / cta / rodapé. */
function typicalPorts(): CutPort[] {
  return [
    port("p-header", "header", 0, 0.1),
    port("p-hero", "hero", 0.1, 0.35),
    port("p-prod", "produtos", 0.35, 0.6),
    port("p-cupom", "cupom", 0.6, 0.75),
    port("p-cta", "cta", 0.75, 0.9),
    port("p-rodape", "rodape", 0.9, 1),
  ]
}

function block(
  id: string,
  type: EmailDraftBlock["type"],
  extra: Partial<EmailDraftBlock> = {},
): EmailDraftBlock {
  return { id, type, ...extra }
}

describe("assignBlocksToPorts", () => {
  it("distribui um email típico nas portas certas", () => {
    const blocks = [
      block("b1", "heading", { headline: "Título hero" }),
      block("b2", "text", { value: "Sub do hero" }),
      block("b3", "products", { columns: 3 }),
      block("b4", "offer", { value: "CUPOM10" }),
      block("b5", "button", { value: "Comprar" }),
      block("b6", "footer"),
    ]
    const r = assignBlocksToPorts(typicalPorts(), blocks)
    expect(r.byPort["p-hero"].map((b) => b.id)).toEqual(["b1", "b2"])
    expect(r.byPort["p-prod"].map((b) => b.id)).toEqual(["b3"])
    expect(r.byPort["p-cupom"].map((b) => b.id)).toEqual(["b4"])
    expect(r.byPort["p-cta"].map((b) => b.id)).toEqual(["b5"])
    expect(r.leftovers.map((b) => b.id)).toEqual(["b6"])
    expect(r.ambiguous).toBe(false)
  })

  it("é monotônico: texto tardio não volta para porta anterior", () => {
    const ports = [
      port("p-hero", "hero", 0, 0.3),
      port("p-texto", "texto", 0.3, 0.5),
      port("p-cta", "cta", 0.5, 1),
    ]
    const blocks = [
      block("b1", "heading"),
      block("b2", "button", { value: "CTA" }),
      // Depois do CTA, um text não pode voltar pro hero/texto → leftover.
      block("b3", "text", { value: "PS: frete grátis" }),
    ]
    const r = assignBlocksToPorts(ports, blocks)
    expect(r.byPort["p-hero"].map((b) => b.id)).toEqual(["b1"])
    expect(r.byPort["p-cta"].map((b) => b.id)).toEqual(["b2"])
    expect(r.byPort["p-texto"]).toEqual([])
    expect(r.leftovers.map((b) => b.id)).toEqual(["b3"])
    expect(r.ambiguous).toBe(true)
  })

  it("section explícita força a porta correspondente", () => {
    const ports = [
      port("p-hero", "hero", 0, 0.4),
      port("p-texto", "texto", 0.4, 0.7),
      port("p-cta", "cta", 0.7, 1),
    ]
    // text com section PRODUCTS não existe como porta → cai no type-compat;
    // text com section HERO vai pro hero mesmo sendo compatível com texto.
    const blocks = [block("b1", "text", { section: "HERO" })]
    const r = assignBlocksToPorts(ports, blocks)
    expect(r.byPort["p-hero"].map((b) => b.id)).toEqual(["b1"])
  })

  it("divider é ignorado e footer não marca ambíguo", () => {
    const blocks = [
      block("b1", "heading"),
      block("b2", "divider"),
      block("b3", "footer"),
    ]
    const r = assignBlocksToPorts(typicalPorts(), blocks)
    expect(r.byPort["p-hero"].map((b) => b.id)).toEqual(["b1"])
    expect(r.leftovers.map((b) => b.id)).toEqual(["b3"])
    expect(r.ambiguous).toBe(false)
  })

  it("blocks vazio → tudo vazio, sem ambiguidade", () => {
    const r = assignBlocksToPorts(typicalPorts(), [])
    expect(Object.values(r.byPort).every((arr) => arr.length === 0)).toBe(true)
    expect(r.leftovers).toEqual([])
    expect(r.ambiguous).toBe(false)
  })

  it("porta forte vazia com bloco do tipo perdido marca ambíguo", () => {
    // products vem DEPOIS do cta no documento → cursor já passou da porta
    // produtos (que fica antes do cta) → bloco perdido + porta forte vazia.
    const ports = [
      port("p-prod", "produtos", 0, 0.5),
      port("p-cta", "cta", 0.5, 1),
    ]
    const blocks = [
      block("b1", "button", { value: "CTA" }),
      block("b2", "products"),
    ]
    const r = assignBlocksToPorts(ports, blocks)
    expect(r.byPort["p-prod"]).toEqual([])
    expect(r.leftovers.map((b) => b.id)).toEqual(["b2"])
    expect(r.ambiguous).toBe(true)
  })

  it("sem portas com copy → conteúdo real vira leftover ambíguo", () => {
    const ports = [port("p-h", "header", 0, 0.5), port("p-r", "rodape", 0.5, 1)]
    const r = assignBlocksToPorts(ports, [block("b1", "text", { value: "x" })])
    expect(r.leftovers.map((b) => b.id)).toEqual(["b1"])
    expect(r.ambiguous).toBe(true)
  })
})
