import { describe, it, expect } from "vitest"
import { briefingContentToFullText } from "./briefing-text"
import type { BriefingContent } from "@/types/onboarding-pipeline"

describe("briefingContentToFullText", () => {
  it("renderiza todas as seções de um BriefingContent completo", () => {
    const b: BriefingContent = {
      about_brand: "Marca premium de roupas escandinavas.",
      audience: "Mulheres 30-45, alto poder aquisitivo.",
      language_tone: "Tom sofisticado e acolhedor. Idioma: Português (Brasil).",
      visual_identity: {
        palette: "Tons neutros, bege e preto.",
        fonts: "Serifada para títulos, sans-serif no corpo.",
        references: "Estética clean e refinada.",
      },
      offers_and_differentials: "Frete grátis acima de R$300.",
      client_additions: "Evitar emojis nos emails.",
    }
    const out = briefingContentToFullText(b)

    expect(out).toContain("## Sobre a marca")
    expect(out).toContain("Marca premium de roupas escandinavas.")
    expect(out).toContain("## Público-alvo")
    expect(out).toContain("## Tom de voz e idioma")
    expect(out).toContain("## Identidade visual")
    expect(out).toContain("Paleta: Tons neutros, bege e preto.")
    expect(out).toContain("Fontes: Serifada para títulos, sans-serif no corpo.")
    expect(out).toContain("Referências: Estética clean e refinada.")
    expect(out).toContain("## Ofertas e diferenciais")
    expect(out).toContain("## Observações do cliente")
    expect(out).toContain("Evitar emojis nos emails.")
  })

  it("omite seções e campos vazios", () => {
    const b: BriefingContent = {
      about_brand: "Só a marca.",
      audience: "",
      language_tone: "   ",
      visual_identity: { palette: "Azul.", fonts: "", references: "" },
      offers_and_differentials: "",
    }
    const out = briefingContentToFullText(b)

    expect(out).toContain("## Sobre a marca")
    expect(out).toContain("## Identidade visual")
    expect(out).toContain("Paleta: Azul.")
    // Seções vazias omitidas
    expect(out).not.toContain("## Público-alvo")
    expect(out).not.toContain("## Tom de voz e idioma")
    expect(out).not.toContain("## Ofertas e diferenciais")
    expect(out).not.toContain("## Observações do cliente")
    // Campos vazios da identidade visual omitidos
    expect(out).not.toContain("Fontes:")
    expect(out).not.toContain("Referências:")
  })

  it("retorna string vazia quando tudo está vazio", () => {
    const b: BriefingContent = {
      about_brand: "",
      audience: "",
      language_tone: "",
      visual_identity: { palette: "", fonts: "", references: "" },
      offers_and_differentials: "",
    }
    expect(briefingContentToFullText(b)).toBe("")
  })
})
