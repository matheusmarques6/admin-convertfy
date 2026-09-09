import { describe, expect, it } from "vitest"
import { chavesDe, mensagemCasaPalavra, normalizarTexto, rotuloDasChaves, tokens } from "./palavra-chave"

describe("comment gate: a palavra que abre o funil", () => {
  it("casa como a pessoa escreve: caixa, acento, pontuação e emoji em volta", () => {
    for (const texto of ["SEGMENTO", "segmento", "Segmento!", "quero SEGMENTO 🙏", "segmento.", "...segmento???", "eu quero  segmento  agora"]) {
      expect(mensagemCasaPalavra(texto, "SEGMENTO")).toBe(true)
    }
    expect(mensagemCasaPalavra("MÉTODO", "metodo")).toBe(true)
    expect(mensagemCasaPalavra("metodo", "MÉTODO")).toBe(true)
  })

  it("não dispara em pedaço de palavra — é o que mandaria mensagem a quem não pediu", () => {
    expect(mensagemCasaPalavra("meu pedido 3410 chegou", "41")).toBe(false)
    expect(mensagemCasaPalavra("eles me guiaram muito bem", "guia")).toBe(false)
    expect(mensagemCasaPalavra("segmentação é isso", "segmento")).toBe(false)
  })

  it("plural simples é o mesmo pedido", () => {
    expect(mensagemCasaPalavra("quero os segmentos", "segmento")).toBe(true)
    expect(mensagemCasaPalavra("quero o guia", "guia")).toBe(true)
  })

  it("aceita variantes separadas por vírgula", () => {
    expect(mensagemCasaPalavra("quero segmentar", "SEGMENTO, SEGMENTAR")).toBe(true)
    expect(mensagemCasaPalavra("segmento", "SEGMENTO, SEGMENTAR")).toBe(true)
    expect(mensagemCasaPalavra("nada disso", "SEGMENTO, SEGMENTAR")).toBe(false)
  })

  it("chave com duas palavras casa a sequência, não as palavras soltas", () => {
    expect(mensagemCasaPalavra("me manda o guia completo por favor", "guia completo")).toBe(true)
    expect(mensagemCasaPalavra("completo o guia depois", "guia completo")).toBe(false)
  })

  it("sem chave configurada o filtro não existe: dispara como antes", () => {
    expect(mensagemCasaPalavra("qualquer coisa", null)).toBe(true)
    expect(mensagemCasaPalavra("qualquer coisa", "")).toBe(true)
    expect(mensagemCasaPalavra("qualquer coisa", "  ,  ")).toBe(true)
  })

  it("com chave, comentário vazio ou só emoji não casa", () => {
    expect(mensagemCasaPalavra(null, "SEGMENTO")).toBe(false)
    expect(mensagemCasaPalavra("", "SEGMENTO")).toBe(false)
    expect(mensagemCasaPalavra("🔥🔥🔥", "SEGMENTO")).toBe(false)
  })

  it("utilitários: normalização, tokens e rótulo", () => {
    expect(normalizarTexto("Ação É ÓTIMA")).toBe("acao e otima")
    expect(tokens("quero, o guia!! 🙏")).toEqual(["quero", "o", "guia"])
    expect(chavesDe("SEGMENTO, guia completo")).toEqual([["segmento"], ["guia", "completo"]])
    expect(rotuloDasChaves("segmento, guia completo")).toBe("SEGMENTO · GUIA COMPLETO")
    expect(rotuloDasChaves(null)).toBe("")
  })
})
