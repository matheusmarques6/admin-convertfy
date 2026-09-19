import { describe, expect, it } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import { filtrarRecall, gatilhoDeRecall, inserirRecall, opcoesDeRecall } from "../recall-menu"

const schema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "a", type: "text", label: "Seu nome", alias: "nome" },
    { ref: "b", type: "email", label: "E-mail" },
    { ref: "c", type: "statement", label: "Só um aviso" },
    { ref: "d", type: "text", label: "Loja" },
    { ref: "e", type: "text", label: "Loja" },
    { ref: "f", type: "radio", label: "Faturamento", options: ["a", "b"] },
    { ref: "h", type: "hidden", label: "utm" },
  ],
  endings: [],
  hidden_fields: ["utm_source"],
  settings: {},
} as unknown as FormSchema

describe("opcoesDeRecall", () => {
  it("só oferece o que vem ANTES da pergunta atual; declaração e oculto ficam fora", () => {
    const op = opcoesDeRecall(schema, "d")
    expect(op.filter((o) => o.origem === "pergunta").map((o) => o.chave)).toEqual(["nome", "E-mail"])
  })
  it("alias vence rótulo; rótulo repetido cai para o ref", () => {
    const op = opcoesDeRecall(schema, "f").filter((o) => o.origem === "pergunta")
    expect(op.map((o) => o.chave)).toEqual(["nome", "E-mail", "d", "e"])
    expect(op[2].rotulo).toBe("Loja")
  })
  it("campo oculto vale em toda pergunta, inclusive na primeira", () => {
    const op = opcoesDeRecall(schema, "a")
    expect(op).toEqual([{ chave: "utm_source", rotulo: "utm_source", origem: "oculto" }])
  })
  it("ref desconhecido devolve só os ocultos — nunca a lista inteira", () => {
    expect(opcoesDeRecall(schema, "zzz").every((o) => o.origem === "oculto")).toBe(true)
  })
})

describe("gatilhoDeRecall", () => {
  it("abre no @ solto e traz o que foi digitado depois", () => {
    expect(gatilhoDeRecall("Oi @no", 6)).toEqual({ inicio: 3, busca: "no" })
    expect(gatilhoDeRecall("@", 1)).toEqual({ inicio: 0, busca: "" })
  })
  it("não abre no meio de um e-mail nem depois de espaço", () => {
    expect(gatilhoDeRecall("joao@loja", 9)).toBeNull()
    expect(gatilhoDeRecall("Oi @nome já", 11)).toBeNull()
  })
})

describe("inserirRecall", () => {
  it("troca o @busca pelo token e deixa o cursor depois do espaço", () => {
    const r = inserirRecall("Oi @no, tudo bem?", 6, "nome")
    expect(r.texto).toBe("Oi {{nome}} , tudo bem?")
    expect(r.cursor).toBe("Oi {{nome}} ".length)
  })
  it("sem gatilho insere no cursor", () => {
    expect(inserirRecall("Oi ", 3, "nome").texto).toBe("Oi {{nome}} ")
  })
})

describe("filtrarRecall", () => {
  it("filtra sem acento nem caixa, por rótulo ou chave", () => {
    const op = opcoesDeRecall(schema, "f")
    expect(filtrarRecall(op, "EMAIL").map((o) => o.chave)).toEqual(["E-mail"])
    expect(filtrarRecall(op, "nom").map((o) => o.chave)).toEqual(["nome"])
  })
})
