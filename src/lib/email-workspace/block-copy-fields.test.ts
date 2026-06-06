import { describe, it, expect } from "vitest"
import { blockCopyFields } from "./block-copy-fields"
import type { EmailBlock } from "@/types/email-workspace"

function mk(block_type: string, content: Record<string, unknown>): EmailBlock {
  return {
    id: "b1",
    email_id: "e1",
    block_type,
    label: block_type,
    position: 1,
    content,
    applied: false,
  } as unknown as EmailBlock
}

describe("blockCopyFields (content-driven)", () => {
  it("coupon novo {cta,body,text,headline} — antes ficava oculto", () => {
    const f = blockCopyFields(
      mk("coupon", {
        cta: "RESGATAR 12% OFF",
        body: "12% OFF adicional aplicado.",
        text: "USE O CUPOM: EXCLUSIVO12",
        headline: "SEU DESCONTO EXCLUSIVO",
      }),
    )
    const keys = f.map((x) => x.key)
    expect(keys).toContain("headline")
    expect(keys).toContain("body")
    expect(keys).toContain("text")
    expect(keys).toContain("cta")
    expect(f.find((x) => x.key === "cta")?.value).toBe("RESGATAR 12% OFF")
  })

  it("coupon antigo {code,hint,cta_text} — continua funcionando", () => {
    const f = blockCopyFields(
      mk("coupon", { code: "BEMVINDO10", hint: "expira hoje", cta_text: "Resgatar" }),
    )
    expect(f.map((x) => x.key)).toEqual(
      expect.arrayContaining(["cta_text", "code", "hint"]),
    )
    expect(f.find((x) => x.key === "code")?.value).toBe("BEMVINDO10")
  })

  it("cta {cta,url,body,text,heading,headline} — mostra tudo menos url", () => {
    const f = blockCopyFields(
      mk("cta", {
        cta: "USE MY DISCOUNT NOW",
        url: "https://x.com",
        body: "Code expires tonight.",
        text: "Tap below.",
        heading: "Your 10% off ends in hours.",
        headline: "FINAL NOTICE",
      }),
    )
    const keys = f.map((x) => x.key)
    expect(keys).toContain("cta")
    expect(keys).toContain("headline")
    expect(keys).toContain("heading")
    expect(keys).toContain("body")
    expect(keys).toContain("text")
    expect(keys).not.toContain("url") // url é skip
  })

  it("header {url,headline} — mostra headline, pula url", () => {
    const f = blockCopyFields(mk("header", { url: "https://x.com", headline: "Royal Loom" }))
    expect(f).toEqual([{ key: "headline", label: "Headline", value: "Royal Loom" }])
  })

  it("items como ARRAY DE STRINGS (features/comparison/social_proof)", () => {
    const f = blockCopyFields(
      mk("features", {
        heading: "Our Guarantees:",
        headline: "Shop With Confidence",
        items: ["🔒 Secure Checkout", "↩️ Money Back", "📦 Guaranteed Delivery"],
      }),
    )
    const items = f.find((x) => x.key === "items")
    expect(items).toBeTruthy()
    expect(items?.value).toContain("Secure Checkout")
    expect(items?.value).toContain("Money Back")
    expect(items?.value.split("\n")).toHaveLength(3)
  })

  it("items como ARRAY DE OBJETOS (testimonials) ainda formata", () => {
    const f = blockCopyFields(
      mk("testimonials", {
        headline: "O que dizem",
        items: [{ author: "Ana", quote: "Amei", rating: 5 }],
      }),
    )
    const items = f.find((x) => x.key === "items")
    expect(items?.value).toContain("Ana")
    expect(items?.value).toContain("Amei")
  })

  it("hero {headline,body,eyebrow,cta_text,image_url,image_alt} — pula imagem", () => {
    const f = blockCopyFields(
      mk("hero", {
        eyebrow: "NOSSA HISTÓRIA",
        headline: "DE UM SONHO",
        body: "Em 2021...",
        cta_text: "DESCOBRIR",
        image_url: "",
        image_alt: "Fundador",
      }),
    )
    const keys = f.map((x) => x.key)
    expect(keys).toEqual(["eyebrow", "headline", "body", "cta_text"])
    expect(keys).not.toContain("image_url")
    expect(keys).not.toContain("image_alt")
  })

  it("footer {columns,copyright} — lista links + copyright", () => {
    const f = blockCopyFields(
      mk("footer", {
        copyright: "© 2026 LOJA",
        columns: [{ links: [{ url: "#", label: "MASCULINO" }, { url: "#", label: "FEMININO" }] }],
      }),
    )
    expect(f.find((x) => x.key === "copyright")?.value).toBe("© 2026 LOJA")
    expect(f.find((x) => x.key === "columns")?.value).toBe("MASCULINO · FEMININO")
  })

  it("products {title,products[]} — lista numerada", () => {
    const f = blockCopyFields(
      mk("products", {
        title: "NOSSOS FAVORITOS",
        products: [{ name: "Tênis Pro", price: "49,95", cta_text: "BUY NOW" }],
      }),
    )
    expect(f.find((x) => x.key === "title")?.value).toBe("NOSSOS FAVORITOS")
    expect(f.find((x) => x.key === "products")?.value).toContain("1. Tênis Pro (49,95) — BUY NOW")
  })

  it("chave desconhecida com valor ainda aparece (humanizada)", () => {
    const f = blockCopyFields(mk("text", { headline: "Oi", subtitulo_extra: "valor" }))
    expect(f.find((x) => x.key === "subtitulo_extra")).toMatchObject({
      label: "Subtitulo Extra",
      value: "valor",
    })
  })

  it("ignora campos vazios e content {}", () => {
    expect(blockCopyFields(mk("divider", {}))).toEqual([])
    expect(blockCopyFields(mk("hero", { headline: "  ", body: "Só isso" }))).toEqual([
      { key: "body", label: "Body", value: "Só isso" },
    ])
  })
})
