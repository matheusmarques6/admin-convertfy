import { describe, it, expect } from "vitest"
import { buildCopyLanguageDirective } from "./copy-language-directive"

describe("buildCopyLanguageDirective", () => {
  // O caso real: Innova Bay, loja `en`, copy misturada dentro do mesmo bloco
  // porque a pesquisa inteira ia em PT-BR com frases-exemplo para imitar.
  it("loja em inglês: nomeia o idioma e desarma a pesquisa em português", () => {
    const out = buildCopyLanguageDirective({
      code: "en",
      label: "Inglês",
      currency: "USD",
    })
    expect(out).toContain("Write every word of this email in English (en)")
    expect(out).toContain("Brazilian Portuguese")
    // O ponto todo: dizer o que a pesquisa É e o que ela NÃO é.
    expect(out).toContain("reference about the voice")
    expect(out).toContain("never their actual words")
    expect(out).toContain("tone.use_words")
    // A ordem sai em inglês — escrevê-la em português repetiria o erro que
    // ela existe para corrigir.
    expect(out).not.toContain("INEGOCIÁVEL")
  })

  it("nomeia a moeda real da loja e nega a da pesquisa", () => {
    const out = buildCopyLanguageDirective({ code: "en", currency: "USD" })
    expect(out).toContain("this store sells in USD")
    expect(out).toContain("Brazilian reais (R$)")
  })

  it("sem moeda conhecida, aponta os produtos em vez de inventar uma", () => {
    const out = buildCopyLanguageDirective({ code: "en", currency: null })
    expect(out).toContain("currency of the store's own products")
    expect(out).not.toContain("this store sells in")
  })

  it("loja pt-BR: ordem em português e sem o parágrafo do conflito", () => {
    const out = buildCopyLanguageDirective({
      code: "pt-BR",
      label: "Português (Brasil)",
      currency: "BRL",
    })
    expect(out).toContain("IDIOMA — INEGOCIÁVEL")
    expect(out).toContain("Brazilian Portuguese (pt-BR)")
    expect(out).toContain("esta loja vende em BRL")
    // Pesquisa e loja no mesmo idioma: não há do que se defender.
    expect(out).not.toContain("reference about the voice")
  })

  it("idioma fora da lista canônica ('Outro' do formulário) usa o rótulo cru", () => {
    const out = buildCopyLanguageDirective({
      code: "af",
      label: "Africâner",
      currency: "ZAR",
    })
    expect(out).toContain("Africâner (af)")
  })

  it("sem código conhecido nem rótulo, o código ainda aparece", () => {
    expect(buildCopyLanguageDirective({ code: "xx" })).toContain("xx (xx)")
  })

  it("cobre os demais idiomas da lista com o nome em inglês", () => {
    expect(buildCopyLanguageDirective({ code: "ja" })).toContain("Japanese (ja)")
    expect(buildCopyLanguageDirective({ code: "nb" })).toContain(
      "Norwegian Bokmål (nb)",
    )
  })

  // A pesquisa é PT-BR hoje porque os agentes rodam no n8n em português. Se
  // um dia mudar, a ordem tem de acompanhar sozinha.
  it("pesquisa em outro idioma é nomeada como tal", () => {
    const out = buildCopyLanguageDirective({ code: "de" }, "en")
    expect(out).toContain("Write every word of this email in German (de)")
    expect(out).toContain("is written in English")
    expect(out).not.toContain("Brazilian Portuguese")
  })
})
