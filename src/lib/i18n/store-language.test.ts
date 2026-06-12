import { describe, it, expect } from "vitest"
import {
  languageLabelToCode,
  languageCodeToLabel,
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
