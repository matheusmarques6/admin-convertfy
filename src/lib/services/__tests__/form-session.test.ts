import { describe, expect, it } from "vitest"
import { contatoDaSessao, statusAvancado, temContato } from "../form-session.service"
import { normalizarSchema } from "@/lib/forms/schema"
import type { FormSchema } from "@/types/forms-conversational"

const SCHEMA = normalizarSchema({
  blocks: [
    { ref: "n", type: "text", label: "Nome", map_to_lead_field: "name" },
    { ref: "e", type: "email", label: "Email", map_to_lead_field: "email" },
    { ref: "t", type: "phone", label: "WhatsApp", map_to_lead_field: "phone" },
    { ref: "f", type: "radio", label: "Faturamento" },
  ],
})

describe("statusAvancado", () => {
  it("só avança — save atrasado não desfaz o que já aconteceu", () => {
    expect(statusAvancado("completed", "in_progress")).toBe("completed")
    expect(statusAvancado("contact_captured", "started")).toBe("contact_captured")
  })

  it("avança quando é adiante de verdade", () => {
    expect(statusAvancado("viewed", "in_progress")).toBe("in_progress")
    expect(statusAvancado("in_progress", "contact_captured")).toBe("contact_captured")
  })

  it("desqualificado e concluído são desfechos, não um antes do outro", () => {
    expect(statusAvancado("completed", "disqualified")).toBe("completed")
    expect(statusAvancado("disqualified", "completed")).toBe("disqualified")
  })
})

describe("contatoDaSessao", () => {
  it("lê pelo map_to_lead_field, a mesma chave do submit", () => {
    const c = contatoDaSessao(SCHEMA, { n: "Bruno", e: "b@x.com", t: "11999999999" })
    expect(c).toEqual({ name: "Bruno", email: "b@x.com", phone: "11999999999" })
  })

  it("campo de email SEM mapeamento ainda conta — senão o abandono fica sem contato", () => {
    const semMapa = normalizarSchema({ blocks: [{ ref: "e", type: "email", label: "Seu email" }] })
    expect(contatoDaSessao(semMapa, { e: "b@x.com" }).email).toBe("b@x.com")
  })

  it("resposta em branco não vira contato", () => {
    expect(contatoDaSessao(SCHEMA, { e: "   " }).email).toBeNull()
  })

  it("temContato é email OU telefone — só o nome não é acionável", () => {
    expect(temContato(SCHEMA, { n: "Bruno" })).toBe(false)
    expect(temContato(SCHEMA, { t: "11999999999" })).toBe(true)
    expect(temContato(SCHEMA, { e: "b@x.com" })).toBe(true)
  })
})

describe("contato com nome e sobrenome separados", () => {
  const schema = {
    version: 1,
    blocks: [
      { ref: "n", type: "text", label: "Nome", options: [], map_to_lead_field: "first_name" },
      { ref: "s", type: "text", label: "Sobrenome", options: [], map_to_lead_field: "last_name" },
      { ref: "e", type: "email", label: "E-mail", options: [], map_to_lead_field: "email" },
    ],
    endings: [],
  } as unknown as FormSchema

  it("compõe o nome das duas metades", () => {
    // Sem isto o lead de abandono nasce "Sem nome" com o nome a um campo
    // de distância — e é o card que o vendedor abre para ligar.
    const c = contatoDaSessao(schema, { n: "João", s: "Pedro Silva", e: "j@x.com" })
    expect(c.name).toBe("João Pedro Silva")
  })

  it("só o primeiro nome já basta", () => {
    expect(contatoDaSessao(schema, { n: "João" }).name).toBe("João")
  })

  it("`name` explícito vence as metades", () => {
    const comNome = {
      ...schema,
      blocks: [...schema.blocks, { ref: "c", type: "text", label: "Completo", options: [], map_to_lead_field: "name" }],
    } as unknown as FormSchema
    const c = contatoDaSessao(comNome, { n: "João", s: "Silva", c: "João da Silva Completo" })
    expect(c.name).toBe("João da Silva Completo")
  })

  it("sem nenhuma metade continua sem nome, não com string vazia", () => {
    expect(contatoDaSessao(schema, { e: "j@x.com" }).name).toBeNull()
  })
})
