import { describe, expect, it } from "vitest"

import {
  aceitaCorteDeRaciocinio,
  corteDeRaciocinio,
  corteParaStepMecanico,
} from "./model-capabilities"
import { truncou } from "./chains/format-invoke"

describe("corte de raciocínio no STEP MECÂNICO", () => {
  it("corta o Claude com thinking OPCIONAL — foi ele que estourou o teto", () => {
    // 10/09, color_format na Boxer Shop: 16.384 tokens de saída (o teto
    // exato) para 4.417 chars de texto. Na média de 14 dias, 4.995 tokens
    // de saída para ~350 de texto: 93% raciocínio num step que emite ops.
    for (const m of [
      "anthropic/claude-sonnet-5",
      "anthropic/claude-opus-5",
      "anthropic/claude-haiku-4-5",
    ]) {
      expect(corteParaStepMecanico(m)).toEqual({ reasoning: { enabled: false } })
    }
  })

  it("NÃO corta quem tem raciocínio obrigatório — é o 400 que o módulo evita", () => {
    // A regex nomeia as três famílias de Claude em vez de casar
    // `anthropic/` inteiro justamente por causa destes dois.
    expect(corteParaStepMecanico("anthropic/claude-fable-5.1")).toEqual({})
    expect(corteParaStepMecanico("anthropic/claude-mythos-1")).toEqual({})
  })

  it("segue cortando quem já era cortado", () => {
    expect(corteParaStepMecanico("moonshotai/kimi-k3")).toEqual({
      reasoning: { enabled: false },
    })
    expect(corteParaStepMecanico("z-ai/glm-5.2")).toEqual({
      reasoning: { enabled: false },
    })
  })

  it("modelo desconhecido não é cortado — o pior caso vira lentidão, nunca 400", () => {
    expect(corteParaStepMecanico("openai/gpt-5.4")).toEqual({})
    expect(corteParaStepMecanico("mistral/qualquer-coisa")).toEqual({})
  })
})

describe("a régua do MODELO não mudou — o Architect segue pensando", () => {
  it("Claude continua fora de aceitaCorteDeRaciocinio", () => {
    // Curador e Estruturador rodam em Claude e PRECISAM deliberar. Cortá-los
    // junto com os steps de ops seria pagar um bug com outro: é a diferença
    // entre "o modelo aceita corte" e "este trabalho deve ser cortado".
    expect(aceitaCorteDeRaciocinio("anthropic/claude-sonnet-4.6")).toBe(false)
    expect(corteDeRaciocinio("anthropic/claude-sonnet-4.6")).toEqual({})
    expect(aceitaCorteDeRaciocinio("moonshotai/kimi-k3")).toBe(true)
  })
})

describe("truncou", () => {
  it("reconhece o corte no teto nos dois dialetos", () => {
    // OpenRouter diz "length"; a Anthropic direta diz "max_tokens". Os dois
    // significam "não coube", e nenhum é erro do parser.
    expect(truncou("length")).toBe(true)
    expect(truncou("max_tokens")).toBe(true)
  })

  it("resposta que terminou não é truncamento", () => {
    expect(truncou("stop")).toBe(false)
    expect(truncou("end_turn")).toBe(false)
    expect(truncou(undefined)).toBe(false)
  })
})
