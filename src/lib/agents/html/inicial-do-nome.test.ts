import { describe, expect, it } from "vitest"

import {
  chaveDoNome,
  derivarIniciais,
  inicialDoNome,
} from "@/lib/agents/html/inicial-do-nome"

describe("chaveDoNome", () => {
  it("troca o sufixo mantendo o prefixo do cartão", () => {
    expect(chaveDoNome("review_1_initial")).toBe("review_1_name")
    expect(chaveDoNome("testimonial_3_initial")).toBe("testimonial_3_name")
  })

  it("devolve null para chave que não é de inicial", () => {
    expect(chaveDoNome("review_1_body")).toBeNull()
    expect(chaveDoNome("initial_review")).toBeNull()
  })
})

describe("inicialDoNome", () => {
  it("pega a primeira letra em maiúscula", () => {
    expect(inicialDoNome("Gabriela")).toBe("G")
    expect(inicialDoNome("ana paula")).toBe("A")
  })

  it("ignora o que vem antes da primeira letra", () => {
    // Os examples da biblioteca numeram o cartão ("1 Buyer Name"); um n8n
    // que ecoasse o número poria o dígito dentro do círculo.
    expect(inicialDoNome("1 Gabriela")).toBe("G")
    expect(inicialDoNome("   ana")).toBe("A")
    expect(inicialDoNome("@kelly")).toBe("K")
  })

  it("preserva o acento — é o nome da pessoa", () => {
    expect(inicialDoNome("Álvaro")).toBe("Á")
  })

  it("sem letra nenhuma devolve vazio, e o merge esvazia a âncora", () => {
    expect(inicialDoNome("")).toBe("")
    expect(inicialDoNome("   ")).toBe("")
    expect(inicialDoNome("123")).toBe("")
    expect(inicialDoNome(null)).toBe("")
    expect(inicialDoNome(undefined)).toBe("")
    expect(inicialDoNome(42)).toBe("")
  })
})

describe("derivarIniciais", () => {
  it("preenche cada inicial com a letra do nome do MESMO cartão", () => {
    const content: Record<string, unknown> = {
      review_1_name: "Gabriela",
      review_1_initial: "",
      review_2_name: "Kelly",
      review_2_initial: "",
      review_3_name: "Marcos",
      review_3_initial: "",
    }
    const feitos = derivarIniciais(content)

    expect(content.review_1_initial).toBe("G")
    expect(content.review_2_initial).toBe("K")
    expect(content.review_3_initial).toBe("M")
    expect(feitos).toHaveLength(3)
  })

  it("sobrescreve o que o n8n mandou — o campo é derivado por contrato", () => {
    const content: Record<string, unknown> = {
      review_1_name: "Gabriela",
      review_1_initial: "X",
    }
    derivarIniciais(content)
    expect(content.review_1_initial).toBe("G")
  })

  it("não registra o que já estava certo", () => {
    const content: Record<string, unknown> = {
      review_1_name: "Gabriela",
      review_1_initial: "G",
    }
    expect(derivarIniciais(content)).toEqual([])
  })

  it("inicial sem o nome irmão fica como está — não se inventa letra", () => {
    const content: Record<string, unknown> = { review_9_initial: "Z" }
    expect(derivarIniciais(content)).toEqual([])
    expect(content.review_9_initial).toBe("Z")
  })

  it("nome vazio zera a inicial", () => {
    const content: Record<string, unknown> = {
      review_1_name: "",
      review_1_initial: "G",
    }
    derivarIniciais(content)
    expect(content.review_1_initial).toBe("")
  })

  it("não toca em nenhum outro campo do bloco", () => {
    const content: Record<string, unknown> = {
      review_1_name: "Gabriela",
      review_1_initial: "",
      review_1_body: "texto",
      reviews_credential: "Compra verificada",
    }
    derivarIniciais(content)
    expect(content.review_1_body).toBe("texto")
    expect(content.reviews_credential).toBe("Compra verificada")
  })
})
