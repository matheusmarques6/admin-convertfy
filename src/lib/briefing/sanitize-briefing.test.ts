import { describe, it, expect } from "vitest"
import { stripStorageUrls, sanitizeBriefingContent } from "./sanitize-briefing"
import type { BriefingContent } from "@/types/onboarding-pipeline"

describe("stripStorageUrls", () => {
  it("remove a sentença com URL do Supabase, preservando o resto", () => {
    const input =
      "A logo da marca está disponível em: https://ppygkfeffknypfncsnlv.supabase.co/storage/v1/object/form-submissions/48951c2e/logo_url_123.png. Referências visuais devem seguir o padrão de marcas premium escandinavas, com estética clean e refinada."
    const out = stripStorageUrls(input)
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).not.toContain("supabase")
    expect(out).toContain("Referências visuais devem seguir o padrão")
    // Não deixa "disponível em:" coxo
    expect(out).not.toContain("disponível em")
  })

  it("remove URL de storage solta (sem pontuação de sentença)", () => {
    const out = stripStorageUrls(
      "Ver https://x.supabase.co/storage/v1/object/foo.png",
    )
    expect(out).not.toContain("supabase")
    expect(out).not.toMatch(/https?:\/\//)
  })

  it("preserva URLs públicas que NÃO são storage (ex: site da loja)", () => {
    const input = "Site oficial: https://mobilityrx-us.com/ para referência."
    expect(stripStorageUrls(input)).toContain("https://mobilityrx-us.com/")
  })

  it("não altera texto sem URLs e lida com vazio", () => {
    expect(stripStorageUrls("Paleta sóbria com tons neutros.")).toBe(
      "Paleta sóbria com tons neutros.",
    )
    expect(stripStorageUrls("")).toBe("")
  })
})

describe("sanitizeBriefingContent", () => {
  it("limpa todos os campos de texto, inclusive visual_identity.references", () => {
    const b: BriefingContent = {
      about_brand: "Marca de joias premium.",
      audience: "Público 40+.",
      language_tone: "Sofisticado.",
      visual_identity: {
        palette: "Tons neutros e rosé gold.",
        fonts: "Serifada para títulos.",
        references:
          "A logo está em https://x.supabase.co/storage/v1/object/logo.png. Seguir estética escandinava.",
      },
      offers_and_differentials: "Frete grátis acima de R$300.",
    }
    const out = sanitizeBriefingContent(b)
    expect(out.visual_identity.references).not.toContain("supabase")
    expect(out.visual_identity.references).toContain("estética escandinava")
    // Demais campos intactos
    expect(out.about_brand).toBe("Marca de joias premium.")
    expect(out.visual_identity.palette).toBe("Tons neutros e rosé gold.")
  })
})
