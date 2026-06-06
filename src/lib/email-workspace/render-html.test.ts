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

  // ── Chaves GENÉRICAS reais do gerador (antes quebravam) ──

  it("cta novo: botão usa `cta` (não `text`) + mostra headline/body", () => {
    const block = makeBlock("cta", {
      cta: "USE MY DISCOUNT",
      url: "https://x",
      headline: "FINAL NOTICE",
      body: "Code expires tonight.",
      text: "Tap below.",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("USE MY DISCOUNT") // botão
    expect(out).toContain("FINAL NOTICE")
    expect(out).toContain("Code expires tonight.")
    expect(out).toContain('href="https://x"')
  })

  it("coupon novo {cta,body,text,headline} aparece (sem code)", () => {
    const block = makeBlock("coupon", {
      headline: "SEU DESCONTO",
      body: "12% OFF aplicado.",
      text: "USE O CUPOM: EXCLUSIVO12",
      cta: "RESGATAR",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("SEU DESCONTO")
    expect(out).toContain("USE O CUPOM: EXCLUSIVO12")
    expect(out).toContain("RESGATAR")
    expect(out).not.toContain("{{coupon_code}}")
  })

  it("header {url,headline} mostra o headline (não {{brand_name}})", () => {
    const block = makeBlock("header", { url: "https://x", headline: "Royal Loom" })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Royal Loom")
    expect(out).not.toContain("{{brand_name}}")
  })

  it("features com items como STRINGS renderiza cada um", () => {
    const block = makeBlock("features", {
      heading: "Our Guarantees:",
      items: ["🔒 Secure Checkout", "↩️ Money Back"],
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Secure Checkout")
    expect(out).toContain("Money Back")
  })

  it("testimonials com items como STRINGS renderiza os cards", () => {
    const block = makeBlock("testimonials", {
      headline: "O que dizem",
      items: ["⭐⭐⭐⭐⭐ | Ingrid — Oslo | Amei o produto"],
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Ingrid")
    expect(out).toContain("Amei o produto")
  })

  it("social_proof genérico {headline,body,items[]} aparece", () => {
    const block = makeBlock("social_proof", {
      headline: "+10,000 clientes",
      body: "Confiada por mulheres no UK.",
      items: ["10,000+ pedidos", "4.9★ média"],
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("+10,000 clientes")
    expect(out).toContain("10,000+ pedidos")
    expect(out).toContain("4.9★ média")
  })

  it("comparison com items[] STRINGS renderiza linhas (sem rows)", () => {
    const block = makeBlock("comparison", {
      headline: "Nós vs. outros",
      items: ["✅ Safira — Nós | ❌ Vidro — outros"],
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Nós vs. outros")
    expect(out).toContain("Safira")
  })

  it("letter genérico {body,cta,url} mostra body + botão", () => {
    const block = makeBlock("letter", {
      body: "Olá, querida...",
      cta: "Usar meu desconto",
      url: "https://x",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Olá, querida")
    expect(out).toContain("Usar meu desconto")
    expect(out).toContain('href="https://x"')
  })

  it("headline {headline,body} agora mostra o body também", () => {
    const block = makeBlock("headline", {
      headline: "Não acredite só na gente",
      body: "Veja o que a comunidade diz.",
    })
    const out = renderEmailHtml(makeEmail(), [block])
    expect(out).toContain("Não acredite só na gente")
    expect(out).toContain("Veja o que a comunidade diz.")
  })
})
