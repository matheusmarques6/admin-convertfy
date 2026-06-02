import { describe, it, expect } from "vitest"
import {
  languageLabelToCode,
  languageCodeToLabel,
  STORE_LANGUAGE_OPTIONS,
} from "./store-language"

describe("languageCodeToLabel", () => {
  it("converte código canônico para label amigável", () => {
    expect(languageCodeToLabel("pt-BR")).toBe("Português (Brasil)")
    expect(languageCodeToLabel("en")).toBe("English")
    expect(languageCodeToLabel("de")).toBe("Deutsch")
  })

  it("é case-insensitive e ignora espaços", () => {
    expect(languageCodeToLabel("  PT-br ")).toBe("Português (Brasil)")
  })

  it("retorna null para código fora da lista, vazio ou não-string", () => {
    expect(languageCodeToLabel("fr")).toBeNull()
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
})
