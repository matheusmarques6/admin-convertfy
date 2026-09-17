import { describe, expect, it } from "vitest"
import type { FormBlock } from "@/types/forms-conversational"
import { aplicarRecall, escaparHtml, refsCitados, respostaComoTexto } from "../recall"

const BLOCKS: FormBlock[] = [
  { ref: "b1", type: "text", label: "Seu nome" },
  { ref: "b2", type: "multi_select", label: "Canais" },
]

describe("aplicarRecall", () => {
  it("troca a referência pela resposta", () => {
    expect(aplicarRecall("Prazer, {{b1}}!", { answers: { b1: "Bruno" } })).toBe("Prazer, Bruno!")
  })

  it("resolve pelo LABEL — é como quem escreve a pergunta digita", () => {
    const t = aplicarRecall("Oi, {{Seu nome}}", { answers: { b1: "Ana" }, blocks: BLOCKS })
    expect(t).toBe("Oi, Ana")
  })

  it("referência sem resposta vira o fallback, nunca o texto cru", () => {
    expect(aplicarRecall("Oi, {{b1|por aí}}", { answers: {} })).toBe("Oi, por aí")
    expect(aplicarRecall("Oi{{b1}}", { answers: {} })).toBe("Oi")
    expect(aplicarRecall("Oi {{b1}}", { answers: {} })).not.toContain("{{")
  })

  it("lista sai em português, com 'e' antes do último", () => {
    expect(respostaComoTexto(["Email", "SMS", "WhatsApp"])).toBe("Email, SMS e WhatsApp")
    expect(respostaComoTexto(["Email"])).toBe("Email")
    expect(respostaComoTexto([])).toBe("")
  })

  it("booleano vira Sim/Não", () => {
    expect(respostaComoTexto(true)).toBe("Sim")
    expect(respostaComoTexto(false)).toBe("Não")
  })

  it("campo oculto e variável também resolvem", () => {
    expect(aplicarRecall("{{plano}} / {{score}}", {
      answers: {},
      hidden: { plano: "anual" },
      variables: { score: 30 },
    })).toBe("anual / 30")
  })

  it("não re-expande: a resposta que contém {{x}} entra como texto", () => {
    const t = aplicarRecall("{{b1}}", { answers: { b1: "{{b2}}", b2: "vazou" } })
    expect(t).toBe("{{b2}}")
  })

  it("texto sem referência atravessa intacto", () => {
    expect(aplicarRecall("Qual seu faturamento?", { answers: {} })).toBe("Qual seu faturamento?")
    expect(aplicarRecall(null, { answers: {} })).toBe("")
  })
})

describe("escaparHtml", () => {
  it("neutraliza o que um visitante poderia digitar", () => {
    expect(escaparHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    )
  })
})

describe("refsCitados", () => {
  it("lista as referências para o editor avisar de ref quebrado", () => {
    expect(refsCitados("Oi {{b1}}, sobre {{b2|seus canais}}")).toEqual(["b1", "b2"])
    expect(refsCitados("sem nada")).toEqual([])
  })
})
