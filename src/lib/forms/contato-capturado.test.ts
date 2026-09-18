import { describe, expect, it } from "vitest"
import { contatoCapturado } from "./contato-capturado"
import type { FormSchema } from "@/types/forms-conversational"

const schema: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "n", type: "text", label: "Nome", map_to_lead_field: "first_name" },
    { ref: "w", type: "phone", label: "WhatsApp", map_to_lead_field: "phone" },
    { ref: "e", type: "email", label: "E-mail", map_to_lead_field: "email" },
    { ref: "s", type: "url", label: "Site", map_to_lead_field: "URL da sua loja" },
  ],
}

describe("contatoCapturado", () => {
  it("um canal basta — o lead com só o WhatsApp é abordável", () => {
    expect(contatoCapturado(schema, { w: "+5511999998888" })).toBe(true)
    expect(contatoCapturado(schema, { e: "ana@lojinha.com" })).toBe(true)
  })

  it("nome e site não são contato", () => {
    expect(contatoCapturado(schema, { n: "Ana", s: "https://lojinha.com" })).toBe(false)
  })

  it("campo em branco não conta", () => {
    expect(contatoCapturado(schema, { w: "   ", e: "" })).toBe(false)
    expect(contatoCapturado(schema, {})).toBe(false)
    expect(contatoCapturado(null, { e: "a@b.c" })).toBe(false)
  })

  it("a régua é o MAPEAMENTO, não o texto da pergunta", () => {
    // Um formulário em inglês, ou com a pergunta escrita de outro jeito,
    // continua marcando o contato — e um campo chamado "e-mail" que não
    // vira e-mail do lead não marca.
    const outro: FormSchema = {
      ...schema,
      blocks: [
        { ref: "x", type: "email", label: "What is your e-mail?", map_to_lead_field: "email" },
        { ref: "y", type: "text", label: "Seu e-mail de trabalho", map_to_lead_field: null },
      ],
    }
    expect(contatoCapturado(outro, { y: "ana@x.com" })).toBe(false)
    expect(contatoCapturado(outro, { x: "ana@x.com" })).toBe(true)
  })
})
