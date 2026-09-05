import { describe, expect, it } from "vitest"
import { extrairJson } from "./service"
import { saidaChatSchema, saidaEstruturaSchema } from "./schemas"

describe("extrairJson", () => {
  it("aceita JSON puro", () => {
    expect(extrairJson('{"a":1}')).toEqual({ a: 1 })
  })
  it("tolera cerca de código e prosa em volta", () => {
    expect(extrairJson('Aqui está:\n```json\n{"texto":"ok","x":[1,2]}\n```\nfim')).toEqual({ texto: "ok", x: [1, 2] })
  })
  it("lança em texto sem objeto", () => {
    expect(() => extrairJson("nada aqui")).toThrow(/sem objeto JSON/)
  })
  it("lança em JSON quebrado", () => {
    expect(() => extrairJson('{"a": }')).toThrow(/JSON inválido/)
  })
})

describe("schemas de saída", () => {
  it("estrutura exige frames, legenda e palavraChave", () => {
    expect(saidaEstruturaSchema.safeParse({ frames: [{ frameId: "f1", textos: { titulo: "x" } }], legenda: "l", palavraChave: "K" }).success).toBe(true)
    expect(saidaEstruturaSchema.safeParse({ frames: [], legenda: "l", palavraChave: "K" }).success).toBe(false)
    expect(saidaEstruturaSchema.safeParse({ frames: [{ frameId: "f1", textos: { outro: "x" } }], legenda: "l", palavraChave: "K" }).success).toBe(false)
  })
  it("chat aceita ação opcional e rejeita tipo desconhecido", () => {
    expect(saidaChatSchema.safeParse({ texto: "oi" }).success).toBe(true)
    expect(saidaChatSchema.safeParse({ texto: "oi", acao: { tipo: "voar", label: "x" } }).success).toBe(false)
    expect(saidaChatSchema.safeParse({ texto: "oi", acao: { tipo: "estrutura", label: "Aplicar em 3 slides" }, props: [{ frameId: "f2", titulo: "t" }] }).success).toBe(true)
  })
})
