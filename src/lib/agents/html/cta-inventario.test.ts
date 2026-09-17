import { describe, expect, it } from "vitest"

import type { BlockContract } from "./block-contract"
import { ehCampoDeCta, inventarioDeCtas } from "./cta-inventario"

const contrato = (position: number, campos: string[], tipo = "body"): BlockContract => ({
  block_id: `b${position}`,
  position,
  tipo,
  label: null,
  campos: Object.fromEntries(
    campos.map((k) => [k, { label: k, tipo: /url$/.test(k) ? "url" : "text_short", natureza: "copy", max_caracteres: null, exemplo_ancora: null }]),
  ),
})

describe("ehCampoDeCta", () => {
  it("reconhece as grafias da biblioteca", () => {
    for (const k of ["cta", "cta_label", "hero_cta_2_label", "button_text", "panel_1_cta", "cta_1_text"]) {
      expect(ehCampoDeCta(k), k).toBe(true)
    }
  })
  it("url/href/alt e tipos não-texto não são botão", () => {
    expect(ehCampoDeCta("cta_url")).toBe(false)
    expect(ehCampoDeCta("hero_cta_href")).toBe(false)
    expect(ehCampoDeCta("cta", "url")).toBe(false)
    expect(ehCampoDeCta("headline")).toBe(false)
  })
})

describe("inventarioDeCtas — contrato × heurística", () => {
  const faixas = [
    { bloco: 0, tipo: "hero" },
    { bloco: 1, tipo: "body" },
    { bloco: 2, tipo: "products" },
    { bloco: 3, tipo: "footer" },
  ]
  // body-3 e products-7 do batch 6249aef2: contrato com CTA, heurística cega.
  const contratos = [
    contrato(1, ["hero_headline", "hero_cta_label", "hero_cta_url"], "hero"),
    contrato(2, ["headline", "cta_label"]),
    contrato(3, ["panel_1_name", "panel_1_cta"], "products"),
  ]

  it("bloco com campo de CTA no contrato TEM botão, mesmo que a heurística não veja", () => {
    const inv = inventarioDeCtas(faixas, contratos, [{ bloco: 0, somente_outlook: false }])
    expect(inv[1]).toMatchObject({ bloco: 1, tem_cta_por_contrato: true, campos_cta: ["cta_label"], tem_cta_por_heuristica: false, divergente: true })
    expect(inv[2]).toMatchObject({ tem_cta_por_contrato: true, divergente: true })
  })

  it("contrato e heurística concordando não é divergência", () => {
    const inv = inventarioDeCtas(faixas, contratos, [{ bloco: 0, somente_outlook: false }])
    expect(inv[0]).toMatchObject({ tem_cta_por_contrato: true, tem_cta_por_heuristica: true, divergente: false })
  })

  it("bloco sem contrato responde null e nunca é divergente", () => {
    const inv = inventarioDeCtas(faixas, contratos, [])
    expect(inv[3]).toMatchObject({ tem_cta_por_contrato: null, divergente: false })
  })

  it("botão só do Outlook não conta como presente", () => {
    const inv = inventarioDeCtas(faixas, [], [{ bloco: 1, somente_outlook: true }])
    expect(inv[1].tem_cta_por_heuristica).toBe(false)
  })
})
