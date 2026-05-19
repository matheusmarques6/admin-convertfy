import { describe, it, expect } from "vitest"
import { renderEmailHtml } from "./render-html"
import type { EmailBlock, EmailFlowEmail } from "@/types/email-workspace"

function makeEmail(html: string | null = null): Pick<EmailFlowEmail, "html" | "name"> {
  return { html, name: "Test Email" }
}

function makeBlock(
  block_type: EmailBlock["block_type"],
  content: Record<string, unknown> = {},
  label = "Bloco teste",
): EmailBlock {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email_id: "00000000-0000-0000-0000-000000000002",
    block_type,
    position: 1,
    label,
    content: content as EmailBlock["content"],
    applied: false,
    applied_at: null,
    applied_by: null,
    created_at: new Date().toISOString(),
  }
}

describe("renderEmailHtml", () => {
  it("retorna html salvo se ja existe", () => {
    const saved = "<html><body>cached</body></html>"
    const out = renderEmailHtml(makeEmail(saved), [])
    expect(out).toBe(saved)
  })

  it("renderiza estrutura base com DOCTYPE + lang + Inter font", () => {
    const out = renderEmailHtml(makeEmail(), [])
    expect(out).toContain("<!DOCTYPE html>")
    expect(out).toContain('lang="pt-BR"')
    expect(out).toContain("Inter")
    expect(out).toContain('<table class="wrap"')
  })

  it("escapa HTML em textos do usuario", () => {
    const block = makeBlock("text", {
      headline: '<script>alert("xss")</script>',
      body: "Tem & ainda " + '"aspas"',
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).not.toContain("<script>alert")
    expect(out).toContain("&lt;script&gt;")
    expect(out).toContain("&amp;")
    expect(out).toContain("&quot;aspas&quot;")
  })

  it("renderiza bloco hero com eyebrow, headline e CTA", () => {
    const block = makeBlock("hero", {
      eyebrow: "BEM-VINDO",
      headline: "OLA",
      cta_text: "COMECAR",
      cta_url: "https://example.com",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("BEM-VINDO")
    expect(out).toContain("OLA")
    expect(out).toContain("COMECAR")
    expect(out).toContain('href="https://example.com"')
  })

  it("renderiza bloco coupon com codigo + hint", () => {
    const block = makeBlock("coupon", {
      code: "BEMVINDO10",
      hint: "Aplique no checkout",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("BEMVINDO10")
    expect(out).toContain("Aplique no checkout")
  })

  it("renderiza bloco products com lista de produtos", () => {
    const block = makeBlock("products", {
      title: "Recomendados",
      products: [
        {
          name: "Camiseta Azul",
          price: "R$ 79,90",
          image_url: "https://img/1.jpg",
          url: "https://shop/1",
        },
        {
          name: "Tenis Branco",
          price: "R$ 299,00",
          image_url: "https://img/2.jpg",
          url: "https://shop/2",
        },
      ],
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Recomendados")
    expect(out).toContain("Camiseta Azul")
    expect(out).toContain("Tenis Branco")
    expect(out).toContain("R$ 79,90")
  })

  it("placeholders {{...}} para URLs faltantes em hero", () => {
    const block = makeBlock("hero", {
      headline: "Sem imagem",
      cta_text: "Click",
      // sem image_url, sem cta_url
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("{{hero_image_url}}")
    expect(out).toContain("{{cta_url}}")
  })

  it("renderiza footer com links + copyright escapado", () => {
    const block = makeBlock("footer", {
      columns: [
        { links: [{ label: "Termos", url: "https://termos" }] },
        { links: [{ label: "Privacidade", url: "https://priv" }] },
      ],
      copyright: "© 2026 Loja",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Termos")
    expect(out).toContain("Privacidade")
    expect(out).toContain("© 2026 Loja")
  })

  it("ordena multiplos blocos na ordem fornecida", () => {
    const blocks = [
      makeBlock("hero", { headline: "PRIMEIRO" }),
      makeBlock("text", { headline: "SEGUNDO" }),
      makeBlock("coupon", { code: "TERCEIRO" }),
    ]
    const out = renderEmailHtml(makeEmail(), blocks)
    const firstIdx = out.indexOf("PRIMEIRO")
    const secondIdx = out.indexOf("SEGUNDO")
    const thirdIdx = out.indexOf("TERCEIRO")
    expect(firstIdx).toBeGreaterThan(0)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    expect(thirdIdx).toBeGreaterThan(secondIdx)
  })

  it("renderiza divider e spacer sem content", () => {
    const blocks = [makeBlock("divider"), makeBlock("spacer")]
    const out = renderEmailHtml(makeEmail(), blocks)
    expect(out).toContain("<!-- DIVIDER -->")
    expect(out).toContain("<!-- SPACER -->")
  })

  it("renderiza cta com texto fallback quando vazio", () => {
    const block = makeBlock("cta", { text: "", url: "https://x" })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("CONTINUAR")
    expect(out).toContain('href="https://x"')
  })
})
