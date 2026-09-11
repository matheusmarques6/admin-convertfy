import { describe, expect, it } from "vitest"

import {
  CODIGO_DUPLICADA,
  CODIGO_ON_CONFLICT_INCOMPATIVEL,
  descreverErro,
  ehDuplicada,
  ehOnConflictIncompativel,
  resumirEnqueue,
} from "../erro-de-fila"

describe("classificação do erro da fila", () => {
  it("só o 23505 conta como linha que já existia", () => {
    expect(ehDuplicada({ code: CODIGO_DUPLICADA })).toBe(true)
    expect(ehDuplicada({ code: "23503" })).toBe(false)
    expect(ehDuplicada({ code: CODIGO_ON_CONFLICT_INCOMPATIVEL })).toBe(false)
    expect(ehDuplicada(null)).toBe(false)
  })

  it("reconhece o 42P10 — o erro que sumiu com um mês de eventos", () => {
    expect(
      ehOnConflictIncompativel({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      }),
    ).toBe(true)
    expect(ehOnConflictIncompativel({ code: "23505" })).toBe(false)
  })

  it("a descrição começa pelo código, que é por onde se procura", () => {
    expect(descreverErro({ code: "42P10", message: "no unique constraint" })).toBe(
      "42P10: no unique constraint",
    )
  })

  it("erro sem mensagem ainda diz o código", () => {
    expect(descreverErro({ code: "42P10", message: "" })).toBe("42P10: sem mensagem")
    expect(descreverErro({ code: "42P10", details: "detalhe" })).toBe("42P10: detalhe")
  })

  it("erro ausente não vira string vazia", () => {
    expect(descreverErro(undefined)).toBe("erro desconhecido")
  })
})

describe("resumo do enqueue", () => {
  it("separa inserida, já existia e falha", () => {
    const r = resumirEnqueue([
      { desfecho: "inserida" },
      { desfecho: "ja_existia" },
      { desfecho: "falhou", erro: "42P10: x" },
    ])
    expect(r).toEqual({ inseridas: 1, jaExistiam: 1, falhas: ["42P10: x"] })
  })

  it("uma linha que falha não impede a outra de contar — é o ponto do módulo", () => {
    const r = resumirEnqueue([
      { desfecho: "falhou", erro: "42P10: x" },
      { desfecho: "inserida" },
    ])
    expect(r.inseridas).toBe(1)
    expect(r.falhas).toHaveLength(1)
  })

  it("falha sem mensagem não some do resumo", () => {
    expect(resumirEnqueue([{ desfecho: "falhou" }]).falhas).toEqual(["erro desconhecido"])
  })
})
