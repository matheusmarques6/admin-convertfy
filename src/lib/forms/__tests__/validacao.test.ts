import { describe, expect, it } from "vitest"
import type { FormBlock } from "@/types/forms-conversational"
import {
  cnpjValido,
  cpfValido,
  emailValido,
  respostaVazia,
  telefoneValido,
  urlValida,
  validarResposta,
} from "../validacao"

const bloco = (over: Partial<FormBlock>): FormBlock => ({
  ref: "f",
  type: "text",
  label: "Campo",
  ...over,
})

describe("respostaVazia", () => {
  it("cobre as formas de vazio que aparecem de verdade", () => {
    expect(respostaVazia(undefined)).toBe(true)
    expect(respostaVazia(null)).toBe(true)
    expect(respostaVazia("   ")).toBe(true)
    expect(respostaVazia([])).toBe(true)
    expect(respostaVazia(false)).toBe(true)
    expect(respostaVazia("a")).toBe(false)
    // Zero é resposta. Tratá-lo como vazio faria "0 funcionários" virar
    // campo obrigatório não preenchido.
    expect(respostaVazia(0)).toBe(false)
  })
})

describe("obrigatoriedade", () => {
  it("campo obrigatório vazio reprova com texto de gente", () => {
    const r = validarResposta(bloco({ required: true }), "")
    expect(r.valido).toBe(false)
    expect(r.erro).toBe("Preencha para continuar.")
  })

  it("a mensagem muda conforme o que se pede", () => {
    expect(validarResposta(bloco({ type: "radio", required: true }), null).erro).toBe(
      "Escolha uma opção para continuar.",
    )
    expect(validarResposta(bloco({ type: "checkbox", required: true }), false).erro).toBe(
      "Marque para continuar.",
    )
  })

  it("opcional vazio passa, e um vazio não é validado por formato", () => {
    expect(validarResposta(bloco({ type: "email" }), "").valido).toBe(true)
  })

  it("`statement` nunca reprova — não coleta resposta", () => {
    expect(validarResposta(bloco({ type: "statement", required: true }), null).valido).toBe(true)
  })
})

describe("email", () => {
  it("aceita o que é entregável, inclusive o incomum", () => {
    expect(emailValido("bruno@convertfy.me")).toBe(true)
    expect(emailValido("b+tag@sub.dominio.com.br")).toBe(true)
    expect(emailValido("a_b-c@x.io")).toBe(true)
  })

  it("recusa só o que não pode ser email", () => {
    expect(emailValido("bruno")).toBe(false)
    expect(emailValido("bruno@")).toBe(false)
    expect(emailValido("bruno@local")).toBe(false)
    expect(emailValido("a b@x.com")).toBe(false)
    expect(emailValido("a@x..com")).toBe(false)
  })
})

describe("telefone", () => {
  it("aceita BR com e sem máscara e internacional", () => {
    expect(telefoneValido("(11) 99999-9999")).toBe(true)
    expect(telefoneValido("+44 20 7946 0958")).toBe(true)
  })
  it("recusa o incompleto", () => {
    expect(telefoneValido("1199")).toBe(false)
  })
})

describe("documentos", () => {
  it("CPF: confere o dígito e recusa a sequência repetida", () => {
    expect(cpfValido("529.982.247-25")).toBe(true)
    expect(cpfValido("52998224726")).toBe(false)
    expect(cpfValido("111.111.111-11")).toBe(false)
    expect(cpfValido("123")).toBe(false)
  })

  it("CNPJ: idem", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true)
    expect(cnpjValido("11222333000182")).toBe(false)
    expect(cnpjValido("00.000.000/0000-00")).toBe(false)
  })

  it("o erro diz o que está errado", () => {
    expect(validarResposta(bloco({ type: "cpf" }), "111.111.111-11").erro).toBe("Esse CPF não confere.")
    expect(validarResposta(bloco({ type: "cep" }), "1234").erro).toBe("O CEP tem 8 dígitos.")
  })
})

describe("url", () => {
  it("aceita sem esquema — é como a pessoa digita", () => {
    expect(urlValida("convertfy.me")).toBe(true)
    expect(urlValida("https://loja.com.br/produto")).toBe(true)
  })
  it("recusa o que não tem domínio", () => {
    expect(urlValida("loja")).toBe(false)
  })
})

describe("número e data", () => {
  it("respeita min e max", () => {
    const b = bloco({ type: "number", validation: { min: 1, max: 10 } })
    expect(validarResposta(b, "5").valido).toBe(true)
    expect(validarResposta(b, "0").erro).toBe("O mínimo é 1.")
    expect(validarResposta(b, "11").erro).toBe("O máximo é 10.")
    expect(validarResposta(b, "abc").erro).toBe("Digite um número.")
  })

  it("aceita vírgula decimal — o teclado BR é esse", () => {
    expect(validarResposta(bloco({ type: "number" }), "3,5").valido).toBe(true)
  })

  it("31 de fevereiro não passa (o Date rola para março em silêncio)", () => {
    expect(validarResposta(bloco({ type: "date" }), "2026-02-31").erro).toBe("Essa data não existe.")
    expect(validarResposta(bloco({ type: "date" }), "2026-02-28").valido).toBe(true)
    expect(validarResposta(bloco({ type: "date" }), "28/02/2026").erro).toBe("Escolha uma data.")
  })
})

describe("múltipla escolha e tamanho", () => {
  it("mínimo e máximo de escolhas", () => {
    const b = bloco({ type: "multi_select", validation: { minEscolhas: 2, maxEscolhas: 3 } })
    expect(validarResposta(b, ["a"]).erro).toBe("Escolha pelo menos 2 opções.")
    expect(validarResposta(b, ["a", "b", "c", "d"]).erro).toBe("Escolha no máximo 3 opções.")
    expect(validarResposta(b, ["a", "b"]).valido).toBe(true)
  })

  it("min/maxLength em texto", () => {
    const b = bloco({ type: "textarea", validation: { minLength: 10 } })
    expect(validarResposta(b, "curto").erro).toBe("Escreva pelo menos 10 caracteres.")
  })

  it("padrão inválido no CADASTRO não barra quem responde", () => {
    const b = bloco({ validation: { pattern: "([" } })
    expect(validarResposta(b, "qualquer").valido).toBe(true)
  })
})
