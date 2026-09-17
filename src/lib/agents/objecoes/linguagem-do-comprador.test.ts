import { describe, expect, it } from "vitest"

import { acharJargao, familiasNoTexto, traduzirInsumo } from "./linguagem-do-comprador"

// O insumo REAL do alvo da Hero Boxers (run do Seletor de 17/09 06:50) —
// é ele que virou "Your checkout runs on Shopify: PCI-compliant, SSL built
// in" no bloco de remoção de risco.
const REAL =
  "Store runs on Shopify, PCI-compliant checkout with SSL by default (pesquisa: medos_de_categoria — plataforma)"

describe("traduzirInsumo", () => {
  it("o caso real: o fornecedor sai, o fato fica, a origem é preservada", () => {
    const r = traduzirInsumo(REAL)
    expect(r.trocou).toBe(true)
    expect(r.texto).toBe("Secure, protected checkout (pesquisa: medos_de_categoria — plataforma)")
    expect(r.texto).not.toMatch(/shopify|pci|ssl/i)
    expect(r.familias).toContain("plataforma")
    expect(r.familias).toContain("seguranca")
  })

  it("insumo sem jargão volta idêntico e sem marcar troca", () => {
    const limpo =
      "Waistband sits above the abdomen rather than digging into it (pesquisa: mecanismo_unico)"
    expect(traduzirInsumo(limpo)).toEqual({ texto: limpo, trocou: false, familias: [] })
  })

  it("é idempotente — traduzir o já traduzido não muda mais nada", () => {
    const uma = traduzirInsumo(REAL).texto
    const duas = traduzirInsumo(uma)
    expect(duas.texto).toBe(uma)
    expect(duas.trocou).toBe(false)
  })

  // Derrubar a oração inteira perderia o frete grátis, que é fato de compra.
  it("oração com substância própria perde só a menção à plataforma", () => {
    const r = traduzirInsumo("Free shipping over $100 on the Shopify store (ficha: envio)")
    expect(r.trocou).toBe(true)
    expect(r.texto).toMatch(/\$100/)
    expect(r.texto).not.toMatch(/shopify/i)
    expect(r.texto).toMatch(/\(ficha: envio\)$/)
  })

  it("insumo que era SÓ infraestrutura cai — não sobrou fato para escrever", () => {
    const r = traduzirInsumo("Payment gateway with CDN (pesquisa: plataforma)")
    expect(r.texto).toBe("")
    expect(r.trocou).toBe(true)
  })

  it("o fato de segurança sai na língua do próprio insumo", () => {
    expect(traduzirInsumo("Checkout com certificado SSL e criptografia (pesquisa: plataforma)").texto)
      .toBe("Pagamento protegido no checkout (pesquisa: plataforma)")
  })

  it("duas orações de segurança viram um fato só", () => {
    const r = traduzirInsumo("SSL by default, PCI-DSS compliant (pesquisa: x)")
    expect(r.texto).toBe("Secure, protected checkout (pesquisa: x)")
  })

  it("insumo sem origem entre parênteses continua sem parênteses", () => {
    expect(traduzirInsumo("Store runs on Shopify").texto).toBe("")
    expect(traduzirInsumo("Bamboo fibre is softer than cotton").texto).toBe(
      "Bamboo fibre is softer than cotton",
    )
  })

  it("texto vazio não explode", () => {
    expect(traduzirInsumo("")).toEqual({ texto: "", trocou: false, familias: [] })
  })
})

describe("acharJargao — serve o lint, não decide nada", () => {
  it("aponta cada trecho com a família, sem repetir", () => {
    const achados = acharJargao("Your checkout runs on Shopify: PCI-compliant, SSL built in. Shopify again.")
    const familias = achados.map((a) => a.familia)
    expect(familias).toContain("plataforma")
    expect(familias).toContain("seguranca")
    expect(achados.filter((a) => /shopify/i.test(a.trecho))).toHaveLength(1)
  })

  it("texto de comprador não produz achado", () => {
    expect(acharJargao("Apply the code at checkout and the discount shows up")).toEqual([])
    expect(familiasNoTexto("cós que assenta acima do abdômen")).toEqual([])
  })
})
