import { describe, it, expect } from "vitest"
import {
  languageLabelToCode,
  languageCodeToLabel,
  resolveStoreLanguage,
  STORE_LANGUAGE_OPTIONS,
} from "./store-language"

describe("languageCodeToLabel", () => {
  it("converte código canônico para label amigável", () => {
    expect(languageCodeToLabel("pt-BR")).toBe("Português (Brasil)")
    expect(languageCodeToLabel("en")).toBe("Inglês")
    expect(languageCodeToLabel("de")).toBe("Alemão")
  })

  it("é case-insensitive e ignora espaços", () => {
    expect(languageCodeToLabel("  PT-br ")).toBe("Português (Brasil)")
  })

  it("retorna null para código fora da lista, vazio ou não-string", () => {
    expect(languageCodeToLabel("ru")).toBeNull()
    expect(languageCodeToLabel("")).toBeNull()
    expect(languageCodeToLabel(null)).toBeNull()
    expect(languageCodeToLabel(undefined)).toBeNull()
    expect(languageCodeToLabel(42)).toBeNull()
  })

  it("é o inverso de languageLabelToCode para todas as opções", () => {
    for (const opt of STORE_LANGUAGE_OPTIONS) {
      expect(languageCodeToLabel(opt.value)).toBe(opt.label)
      expect(languageLabelToCode(opt.label)).toBe(opt.value)
    }
  })

  it("código legado 'en-US' (wizard antigo do portal) resolve via alias", () => {
    // O select do wizard gravava "en-US" em client_stores.language. Sem o
    // alias, a badge mostrava "Sem idioma" e o dispatch mandava "en-us" cru.
    expect(languageCodeToLabel("en-US")).toBe("Inglês")
    expect(languageLabelToCode("en-US")).toBe("en")
    const r = resolveStoreLanguage(null, "en-US")
    expect(r.code).toBe("en")
    expect(r.label).toBe("Inglês")
    expect(r.source).toBe("store")
  })

  it("labels nativos antigos (pré-tradução PT) ainda resolvem via alias", () => {
    // Lojas cadastradas antes de traduzir o dropdown guardaram o nome nativo.
    expect(languageLabelToCode("Polski")).toBe("pl")
    expect(languageLabelToCode("日本語")).toBe("ja")
    expect(languageLabelToCode("中文")).toBe("zh")
    expect(languageLabelToCode("한국어")).toBe("ko")
    expect(languageLabelToCode("Deutsch")).toBe("de")
    expect(languageLabelToCode("Español")).toBe("es")
    expect(languageLabelToCode("Norsk")).toBe("nb")
  })
})

describe("resolveStoreLanguage", () => {
  it("coluna client_stores.language vence o formulário (bug Livara)", () => {
    // Cenário real: admin trocou pra inglês (store='en') mas o formulário
    // ainda diz "Português (Brasil)". A edição do admin vence.
    const r = resolveStoreLanguage(
      { store_language: "Português (Brasil)" },
      "en",
    )
    expect(r.code).toBe("en")
    expect(r.label).toBe("Inglês")
    expect(r.source).toBe("store")
  })

  it("coluna com label cru resolve pra código canônico", () => {
    const r = resolveStoreLanguage(null, "Inglês")
    expect(r.code).toBe("en")
    expect(r.source).toBe("store")
  })

  it("sem coluna (form-only): usa o store_language do formulário", () => {
    // confirmBriefing e o upgrade do dispatch chamam assim (sem fallback).
    const r = resolveStoreLanguage({ store_language: "Português (Brasil)" })
    expect(r.code).toBe("pt-BR")
    expect(r.source).toBe("form_main")
  })

  it("sem coluna: caminho 'Outro' + texto livre", () => {
    const r = resolveStoreLanguage({
      store_language: "Outro",
      store_language_other: "Norsk",
    })
    expect(r.code).toBe("nb")
    expect(r.source).toBe("form_other")
  })

  it("sem coluna nem formulário útil: default pt-BR", () => {
    const r = resolveStoreLanguage(null, null)
    expect(r.code).toBe("pt-BR")
    expect(r.source).toBe("default")
  })
})
