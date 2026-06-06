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

describe("blockCopyFields", () => {
  it("hero: eyebrow, headline, body, cta_text", () => {
    const f = blockCopyFields(
      mk("hero", { eyebrow: "Bem-vindo", headline: "Olá", body: "Texto", cta_text: "Comprar" }),
    )
    expect(f.map((x) => x.key)).toEqual(["eyebrow", "headline", "body", "cta_text"])
    expect(f.find((x) => x.key === "cta_text")?.value).toBe("Comprar")
  })

  it("cta: usa a chave `text` (não cta_text) — antes ficava oculto", () => {
    const f = blockCopyFields(mk("cta", { text: "Ver ofertas", url: "https://x" }))
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ key: "text", label: "CTA", value: "Ver ofertas" })
  })

  it("features: lista items[{icon,label}] — antes ficava oculto", () => {
    const f = blockCopyFields(
      mk("features", { items: [{ icon: "🚚", label: "Frete grátis" }, { label: "Troca fácil" }] }),
    )
    expect(f).toHaveLength(1)
    expect(f[0].key).toBe("items")
    expect(f[0].value).toContain("Frete grátis")
    expect(f[0].value).toContain("Troca fácil")
  })

  it("testimonials: headline + um campo por depoimento", () => {
    const f = blockCopyFields(
      mk("testimonials", {
        headline: "Depoimentos",
        items: [
          { author: "Ana", quote: "Amei", rating: 5 },
          { author: "Beto", quote: "Top" },
        ],
      }),
    )
    expect(f.find((x) => x.key === "headline")?.value).toBe("Depoimentos")
    expect(f.filter((x) => x.key.startsWith("testimonial_"))).toHaveLength(2)
    expect(f.find((x) => x.key === "testimonial_0")?.value).toContain("Ana")
    expect(f.find((x) => x.key === "testimonial_0")?.value).toContain("Amei")
  })

  it("social_proof: number, label, rating, body", () => {
    const f = blockCopyFields(
      mk("social_proof", { number: "10k+", label: "clientes", rating: 4.8, body: "avaliações" }),
    )
    expect(f.map((x) => x.key)).toEqual(["number", "label", "rating", "body"])
    expect(f.find((x) => x.key === "rating")?.value).toContain("4.8")
  })

  it("comparison: headline + linhas us/them", () => {
    const f = blockCopyFields(
      mk("comparison", {
        headline: "Por que nós",
        us_label: "Nós",
        them_label: "Eles",
        rows: [{ label: "Frete", us: "Grátis", them: "Pago" }],
      }),
    )
    expect(f.find((x) => x.key === "rows")?.value).toContain("Frete")
    expect(f.find((x) => x.key === "rows")?.value).toContain("Grátis")
  })

  it("letter: greeting, body, signoff, author", () => {
    const f = blockCopyFields(
      mk("letter", { greeting: "Oi", body: "Corpo", signoff: "Abraços", author: "CEO" }),
    )
    expect(f.map((x) => x.key)).toEqual(["greeting", "body", "signoff", "author"])
  })

  it("header: tagline", () => {
    const f = blockCopyFields(mk("header", { logo_url: "x.png", tagline: "Slogan" }))
    expect(f).toEqual([{ key: "tagline", label: "Tagline", value: "Slogan" }])
  })

  it("image/divider/spacer: sem campos de copy", () => {
    expect(blockCopyFields(mk("image", { image_url: "x.png" }))).toEqual([])
    expect(blockCopyFields(mk("divider", {}))).toEqual([])
    expect(blockCopyFields(mk("spacer", {}))).toEqual([])
  })

  it("ignora campos vazios", () => {
    const f = blockCopyFields(mk("hero", { headline: "  ", body: "Só isso" }))
    expect(f).toEqual([{ key: "body", label: "Body", value: "Só isso" }])
  })

  it("products: lista numerada com nome e preço", () => {
    const f = blockCopyFields(
      mk("products", { products: [{ name: "Tênis", price: 199, cta_text: "Ver" }] }),
    )
    expect(f.find((x) => x.key === "products")?.value).toContain("1. Tênis (199)")
  })
})
