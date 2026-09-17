import { describe, expect, it } from "vitest"

import type { QaIssue } from "@/types/email-generation"

import {
  RESPONSAVEL_POR_TIPO,
  atribuirResponsaveis,
  claimCoberto,
  filtrarClaimsCobertos,
  mapearParaConformidade,
} from "./qa-responsavel"

const issue = (p: Partial<QaIssue>): QaIssue => ({ type: "claim_nao_coberto", severity: "medium", message: "", ...p })

describe("RESPONSAVEL_POR_TIPO", () => {
  // O Record já obriga no typecheck; aqui a garantia é em runtime, para
  // um `as` esquecido não deixar tipo sem dono.
  it("todo tipo tem dono e nenhum dono é vazio", () => {
    for (const [tipo, dono] of Object.entries(RESPONSAVEL_POR_TIPO)) {
      expect(dono, tipo).toBeTruthy()
    }
    expect(RESPONSAVEL_POR_TIPO.posicao_sem_variante).toBe("biblioteca")
    expect(RESPONSAVEL_POR_TIPO.traducao_faltante).toBe("loja")
    expect(RESPONSAVEL_POR_TIPO.hero_copy_inventada).toBe("formatacao")
  })

  it("atribui sem sobrescrever o que o produtor já disse", () => {
    const out = atribuirResponsaveis([
      issue({ type: "oferta_sem_incentivo" }),
      issue({ type: "oferta_sem_incentivo", no_responsavel: "seletor" }),
    ])
    expect(out.map((i) => i.no_responsavel)).toEqual(["copy", "seletor"])
  })

  it("traduz para o vocabulário da Conformidade só onde há fronteira", () => {
    expect(mapearParaConformidade("curador")).toBe("assembler_chooser")
    expect(mapearParaConformidade("biblioteca")).toBe("assembler")
    expect(mapearParaConformidade("loja")).toBeNull()
  })
})

describe("filtrarClaimsCobertos — o caso do batch 6249aef2", () => {
  const cobertura = {
    insumosPermitidos: [
      "Checkout do Shopify com proteção PCI (página de checkout da loja)",
      "Testemunhos de clientes publicados no site (seção de reviews)",
    ],
    topProducts: [{ name: "Bamboo Boxer Brief" }],
  }

  it("claim sobre insumo verificado pelo Seletor é filtrada e nomeada", () => {
    const r = filtrarClaimsCobertos(
      [issue({ message: "Claim 'protected by Shopify PCI-compliant checkout' not supported by briefing", evidence: "Shopify PCI" })],
      cobertura,
    )
    expect(r.issues).toEqual([])
    expect(r.filtradas[0].coberto_por).toContain("Shopify")
  })

  it("claim sobre produto da tabela viva é filtrada", () => {
    const r = filtrarClaimsCobertos([issue({ message: "Mentions 'Bamboo Boxer Brief' which is not in the brand data" })], cobertura)
    expect(r.issues).toEqual([])
    expect(r.filtradas[0].coberto_por).toBe("Bamboo Boxer Brief")
  })

  // Uma palavra em comum não basta: "shopify" sozinho casaria com qualquer
  // insumo que mencione a plataforma.
  it("claim que só compartilha uma palavra com o insumo NÃO é filtrada", () => {
    const r = filtrarClaimsCobertos([issue({ message: "Claims 'fastest Shopify store in Europe'" })], cobertura)
    expect(r.issues).toHaveLength(1)
    expect(claimCoberto({ message: "fastest shopify store" }, cobertura)).toBeNull()
  })

  it("outros tipos nunca são filtrados, mesmo cobertos", () => {
    const r = filtrarClaimsCobertos([issue({ type: "compliance", message: "Shopify PCI guarantee" })], cobertura)
    expect(r.issues).toHaveLength(1)
  })

  it("sem decisão nem produtos devolve a lista intacta", () => {
    const lista = [issue({ message: "x" })]
    expect(filtrarClaimsCobertos(lista, {}).issues).toEqual(lista)
  })
})
