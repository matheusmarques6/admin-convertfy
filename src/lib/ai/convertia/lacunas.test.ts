import { describe, expect, it } from "vitest"
import { normalizarConsulta, textoSemResultado } from "./lacunas"

describe("normalizarConsulta", () => {
  it("colapsa acento, caixa e pontuação — é a chave de dedupe", () => {
    // Sem isto, "Como aumentar a lista?" e "como aumentar a lista" viram duas
    // lacunas, e a frequência (que ordena a pauta do vault) não significa nada.
    const a = normalizarConsulta("Como aumentar a lista?")
    const b = normalizarConsulta("  como   aumentar a LISTA  ")
    expect(a).toBe("como aumentar a lista")
    expect(a).toBe(b)
  })

  it("tira acento sem colar palavras", () => {
    expect(normalizarConsulta("segmentação e reengajamento")).toBe("segmentacao e reengajamento")
    expect(normalizarConsulta("e-mail / SMS")).toBe("e mail sms")
  })

  it("corta em 300 para caber na coluna", () => {
    expect(normalizarConsulta("a".repeat(500))).toHaveLength(300)
  })

  it("consulta só de pontuação vira vazio (não registra lixo)", () => {
    expect(normalizarConsulta("???")).toBe("")
    expect(normalizarConsulta("   ")).toBe("")
  })
})

describe("textoSemResultado", () => {
  it("proíbe explicitamente responder de memória", () => {
    // O texto é de COMPORTAMENTO, não de resultado: "0 resultados" sozinho o
    // modelo lê como permissão para preencher o vazio com o que ele acha.
    const t = textoSemResultado("conhecimento", "welcome flow")
    expect(t).toContain("NÃO autoriza responder de memória")
    expect(t).toContain("welcome flow")
    expect(t).toContain("DIGA ao usuário")
  })

  it("na base de conhecimento sugere outras palavras e a listagem", () => {
    const t = textoSemResultado("conhecimento", "x")
    expect(t).toContain("conhecimento_listar")
    // O corpus mistura PT e EN — a dica precisa dizer isso, senão o modelo
    // insiste em português e a nota em inglês nunca aparece.
    expect(t).toContain("opt-in")
  })

  it("nas transcrições não sugere tools da outra base", () => {
    const t = textoSemResultado("transcricoes", "x")
    expect(t).not.toContain("conhecimento_listar")
    expect(t).toContain("transcrições")
  })
})
