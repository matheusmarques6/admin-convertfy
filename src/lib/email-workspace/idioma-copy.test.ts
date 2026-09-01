import { describe, it, expect } from "vitest"
import { detectarIdioma, familiaDoIdioma, idiomaDivergente } from "./idioma-copy"

describe("detectarIdioma", () => {
  // Os campos REAIS do Welcome 1 da Innova Bay (loja `en`), 01/09.
  it("português no meio de um email inglês", () => {
    expect(
      detectarIdioma("Use code WELCOME10 na compra. Sem mínimo, sem expiração."),
    ).toBe("pt")
    expect(
      detectarIdioma(
        "Plug-and-play, compatível com OBD2 (veículos 1996+). Garantia vitalícia, sem risco.",
      ),
    ).toBe("pt")
  })

  it("inglês é inglês", () => {
    expect(detectarIdioma("Does it work on my car?")).toBe("en")
    expect(detectarIdioma("Get 10% off your first order and free shipping.")).toBe("en")
  })

  // É aqui que um falso positivo estragaria copy boa: rótulo de botão,
  // cupom e headline de três palavras não têm evidência nenhuma.
  it("texto curto não recebe veredicto", () => {
    expect(detectarIdioma("SHOP NOW")).toBe("indefinido")
    expect(detectarIdioma("10% OFF")).toBe("indefinido")
    expect(detectarIdioma("WELCOME10")).toBe("indefinido")
    expect(detectarIdioma("Compre agora")).toBe("indefinido")
    expect(detectarIdioma("")).toBe("indefinido")
    expect(detectarIdioma(null)).toBe("indefinido")
  })

  it("nome de produto em português dentro de frase inglesa NÃO vira pt", () => {
    expect(detectarIdioma("Shop the Café da Manhã Blend now and save 20%")).not.toBe(
      "pt",
    )
  })

  // O detector separa pt de en. Espanhol não é nem um nem outro — e
  // chamá-lo de "pt" mandaria traduzir copy correta de loja `es`.
  it("espanhol sai indefinido, nunca pt", () => {
    expect(
      detectarIdioma("Consigue un 10% de descuento en tu primera compra sin mínimo"),
    ).not.toBe("pt")
    expect(detectarIdioma("Todos los productos con envío gratis para ti")).not.toBe(
      "pt",
    )
  })

  it("morfologia exclusiva basta quando as palavras funcionais faltam", () => {
    expect(detectarIdioma("Instalação rápida, manutenção zero, garantia vitalícia")).toBe(
      "pt",
    )
  })
})

describe("familiaDoIdioma", () => {
  it("códigos canônicos e variantes gravadas no banco", () => {
    expect(familiaDoIdioma("pt-BR")).toBe("pt")
    expect(familiaDoIdioma("português")).toBe("pt")
    expect(familiaDoIdioma("en")).toBe("en")
    expect(familiaDoIdioma("en-US")).toBe("en")
    expect(familiaDoIdioma("Inglês")).toBe("en")
  })

  it("idioma que o detector não sabe ler é `outro`, não `en`", () => {
    expect(familiaDoIdioma("de")).toBe("outro")
    expect(familiaDoIdioma("es")).toBe("outro")
    expect(familiaDoIdioma(null)).toBe("outro")
  })
})

describe("idiomaDivergente", () => {
  const frasePT = "Use code WELCOME10 na compra. Sem mínimo, sem expiração."

  it("loja en com copy em português: diverge", () => {
    expect(idiomaDivergente(frasePT, "en")).toEqual({
      divergente: true,
      detectado: "pt",
    })
  })

  it("loja pt-BR com copy em português: não diverge", () => {
    expect(idiomaDivergente(frasePT, "pt-BR").divergente).toBe(false)
  })

  it("loja alemã com copy em inglês diverge — o detector se pronunciou", () => {
    expect(
      idiomaDivergente("Get 10% off your first order and free shipping.", "de")
        .divergente,
    ).toBe(true)
  })

  it("sem veredicto do detector nunca diverge", () => {
    expect(idiomaDivergente("SHOP NOW", "pt-BR").divergente).toBe(false)
  })

  it("loja sem idioma configurado não gera alvo", () => {
    expect(idiomaDivergente(frasePT, null).divergente).toBe(false)
    expect(idiomaDivergente(frasePT, "  ").divergente).toBe(false)
  })
})
