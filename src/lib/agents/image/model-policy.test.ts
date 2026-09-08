import { describe, expect, it } from "vitest"
import {
  ehFalhaDeProvedor,
  IMAGE_MODEL_PRIMARIO,
  IMAGE_MODEL_SECUNDARIO,
  modeloDeFallback,
  modelosParaVariacoes,
} from "./model-policy"

describe("modelosParaVariacoes", () => {
  it("uma imagem usa só o primário — pedir uma não é pedir um teste", () => {
    expect(modelosParaVariacoes(1)).toEqual([IMAGE_MODEL_PRIMARIO])
  })

  it("DUAS variações = uma de cada, na ordem pedida", () => {
    // É o pedido explícito: GPT Image 2 contra a melhor do Gemini, mesmo
    // prompt, para comparar lado a lado.
    expect(modelosParaVariacoes(2)).toEqual([IMAGE_MODEL_PRIMARIO, IMAGE_MODEL_SECUNDARIO])
  })

  it("acima de duas alterna começando pelo primário", () => {
    expect(modelosParaVariacoes(4)).toEqual([
      IMAGE_MODEL_PRIMARIO,
      IMAGE_MODEL_SECUNDARIO,
      IMAGE_MODEL_PRIMARIO,
      IMAGE_MODEL_SECUNDARIO,
    ])
  })

  it("número inválido nunca devolve lista vazia", () => {
    // Lista vazia viraria Promise.all([]) → zero imagem e sucesso aparente.
    for (const n of [0, -3, NaN, 0.4]) {
      expect(modelosParaVariacoes(n)).toEqual([IMAGE_MODEL_PRIMARIO])
    }
  })
})

describe("modeloDeFallback", () => {
  it("o primário cai no secundário", () => {
    expect(modeloDeFallback(IMAGE_MODEL_PRIMARIO)).toBe(IMAGE_MODEL_SECUNDARIO)
    expect(modeloDeFallback(` ${IMAGE_MODEL_PRIMARIO} `)).toBe(IMAGE_MODEL_SECUNDARIO)
  })

  it("o secundário NÃO volta para o primário", () => {
    // Dois modelos falhando no mesmo prompt é sinal de que o problema é o
    // pedido; insistir gasta orçamento para dizer a mesma coisa.
    expect(modeloDeFallback(IMAGE_MODEL_SECUNDARIO)).toBeNull()
  })

  it("modelo desconhecido não ganha substituto", () => {
    // Alguém trocou a config no banco: escolher um modelo que o operador
    // não pediu é pior que falhar claro.
    expect(modeloDeFallback("black-forest-labs/flux-2")).toBeNull()
  })
})

describe("ehFalhaDeProvedor", () => {
  it("reconhece o loop de whitespace — o caso que motivou tudo", () => {
    expect(ehFalhaDeProvedor(new Error("whitespace_body após 235s"))).toBe(true)
  })

  it("reconhece pelo NOME da classe, não só pelo texto", () => {
    // Casar texto é frágil: `OpenRouterEmptyBodyError` diz "empty body",
    // com ESPAÇO, e a primeira versão desta função procurava "empty_body"
    // — o fallback não disparava justamente no corpo vazio.
    const vazio = new Error("OpenRouter empty body (status=200, 0ms)")
    vazio.name = "OpenRouterEmptyBodyError"
    expect(ehFalhaDeProvedor(vazio)).toBe(true)

    const midStream = new Error("qualquer texto")
    midStream.name = "OpenRouterMidStreamError"
    expect(ehFalhaDeProvedor(midStream)).toBe(true)
  })

  it("reconhece timeout, abort e indisponibilidade", () => {
    expect(ehFalhaDeProvedor(new Error("image_timeout: OpenRouter excedeu 90s"))).toBe(true)
    expect(ehFalhaDeProvedor(new Error("The operation was aborted."))).toBe(true)
    expect(ehFalhaDeProvedor(new Error("OpenRouter 503 Service Unavailable"))).toBe(true)
    expect(ehFalhaDeProvedor(new Error("HTTP 429 rate limited"))).toBe(true)
  })

  it("recusa do MODELO não troca de modelo", () => {
    // O segundo recusaria igual, depois de cobrar o tempo — e a mensagem
    // que explicava o motivo real sumiria no caminho.
    const recusa = new Error(
      "Não foi possível extrair imagem da resposta do OpenRouter (status=200, " +
        "content-type=application/json, length=812). Resposta (truncada): I can't generate " +
        "images of real people's faces.",
    )
    expect(ehFalhaDeProvedor(recusa)).toBe(false)
  })

  it("erro sem mensagem não vira troca de modelo", () => {
    expect(ehFalhaDeProvedor(null)).toBe(false)
    expect(ehFalhaDeProvedor(new Error(""))).toBe(false)
  })

  it("não confunde número solto com código de status", () => {
    // "gerou 500 pixels" não é um 500 do provedor.
    expect(ehFalhaDeProvedor(new Error("prompt com 5000 caracteres"))).toBe(false)
  })
})
