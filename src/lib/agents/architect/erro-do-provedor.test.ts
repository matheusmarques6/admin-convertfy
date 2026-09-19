import { describe, expect, it } from "vitest"
import {
  PREFIXO_CHAMADA_FALHOU,
  codigoDaFalha,
  codigoDoErro,
  ehErroDeProvedor,
  rotularChamadaFalhou,
} from "./erro-do-provedor"

// A mensagem REAL do batch d2bd526b (18/09), copiada da run.
const IN_FLIGHT =
  'OpenRouter HTTP 402: {"error":{"message":"This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.","code":402'

describe("codigoDoErro", () => {
  it("o 402 in-flight NÃO é falta de crédito", () => {
    expect(codigoDoErro(new Error(IN_FLIGHT))).toBe("credits_in_flight")
  })

  it("o 402 sem in-flight é falta de crédito", () => {
    expect(codigoDoErro(new Error('OpenRouter HTTP 402: {"error":{"message":"Insufficient credits"}}'))).toBe(
      "no_credits",
    )
  })

  it("orçamento da fase 1 vem antes de tudo", () => {
    expect(codigoDoErro(new Error("sem orçamento: o que resta da janela da fase 1 não cobre nem o mínimo desta chamada"))).toBe(
      "orcamento_esgotado",
    )
  })

  it("corpo vazio do OpenRouter é reconhecido pelo NOME da classe", () => {
    const e = new Error("OpenRouter empty body (status=200, 1200ms)")
    e.name = "OpenRouterEmptyBodyError"
    expect(codigoDoErro(e)).toBe("empty_body")
  })

  it("timeout do AbortController", () => {
    expect(codigoDoErro(new Error("timeout"))).toBe("timeout")
  })

  // O SDK Anthropic não escreve "HTTP NNN" na mensagem: carrega `status`.
  it("erro do SDK Anthropic é classificado pelo status numérico", () => {
    const e = Object.assign(new Error("rate_limit_error"), { status: 429 })
    expect(codigoDoErro(e)).toBe("rate_limited")
    const s = Object.assign(new Error("overloaded"), { status: 529 })
    expect(codigoDoErro(s)).toBe("unavailable")
    const a = Object.assign(new Error("invalid x-api-key"), { status: 401 })
    expect(codigoDoErro(a)).toBe("unauthorized")
  })

  it("mensagem que não diz nada é unknown, e unknown não é provedor", () => {
    expect(codigoDoErro(new Error("JSON parse falhou"))).toBe("unknown")
    expect(ehErroDeProvedor("unknown")).toBe(false)
    expect(ehErroDeProvedor("credits_in_flight")).toBe(true)
    expect(ehErroDeProvedor("no_credits")).toBe(true)
  })
})

describe("rotularChamadaFalhou / codigoDaFalha", () => {
  it("o código vem primeiro e é lido de volta sem depender da mensagem", () => {
    const r = rotularChamadaFalhou(new Error(IN_FLIGHT))
    expect(r.codigo).toBe("credits_in_flight")
    expect(r.erro.startsWith(`${PREFIXO_CHAMADA_FALHOU}credits_in_flight: `)).toBe(true)
    expect(codigoDaFalha(r.erro)).toBe("credits_in_flight")
  })

  it("erro gravado antes de 19/09 (sem código) ainda é falha de chamada, com código unknown", () => {
    expect(codigoDaFalha(`${PREFIXO_CHAMADA_FALHOU}timeout do provedor`)).toBe("unknown")
  })

  it("veredito do modelo não é falha de chamada", () => {
    expect(codigoDaFalha("sem_escolha")).toBeNull()
    expect(codigoDaFalha(null)).toBeNull()
  })
})
