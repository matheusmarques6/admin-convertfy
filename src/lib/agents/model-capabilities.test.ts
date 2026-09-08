/**
 * A régua que separa "pensa demais" de "não pode parar de pensar".
 *
 * Incidente de 08/09 (lote 902b757d): trocado o flow inteiro para
 * `anthropic/claude-fable-5.1`, as runs de `color_format` e `typography`
 * passaram a morrer em `400 Reasoning is mandatory for this endpoint and
 * cannot be disabled` — 90ms, zero token, recusa antes de gerar. Os cinco
 * chains da fase 2 mandavam `reasoning:{enabled:false}` sem perguntar a
 * quem.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  aceitaCorteDeRaciocinio,
  corteDeRaciocinio,
  modeloTemVisao,
} from "./model-capabilities"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("corte de raciocínio", () => {
  // O motivo de o corte existir: sem ele o Curador queimava ~160s e 27k
  // tokens pensando para devolver um JSON de escolhas.
  it("corta em quem pensa por padrão e aceita ser cortado", () => {
    for (const m of ["moonshotai/kimi-k3", "z-ai/glm-4.6", "MOONSHOTAI/KIMI-K3"]) {
      expect(aceitaCorteDeRaciocinio(m)).toBe(true)
      expect(corteDeRaciocinio(m)).toEqual({ reasoning: { enabled: false } })
    }
  })

  // O bug. Fable recusa a requisição INTEIRA se o raciocínio vier desligado.
  it("não corta o Fable — é o 400 que derrubou color_format e typography", () => {
    for (const m of ["anthropic/claude-fable-5.1", "anthropic/claude-mythos-5-1"]) {
      expect(aceitaCorteDeRaciocinio(m)).toBe(false)
      expect(corteDeRaciocinio(m)).toEqual({})
    }
  })

  // Assimetria: cortar quem não aceita derruba a chamada; não cortar quem
  // aceitaria só custa latência. Modelo desconhecido cai no lado barato.
  it("modelo fora do mapa não é cortado", () => {
    for (const m of [
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-5.4-mini",
      "modelo/que-ninguem-mapeou",
      "claude-opus-4-7",
    ]) {
      expect(corteDeRaciocinio(m)).toEqual({})
    }
  })

  it("FORMAT_OPS_REASONING=on devolve o raciocínio a todos, sem deploy", () => {
    vi.stubEnv("FORMAT_OPS_REASONING", "on")
    expect(corteDeRaciocinio("moonshotai/kimi-k3")).toEqual({})
    expect(corteDeRaciocinio("anthropic/claude-fable-5.1")).toEqual({})
  })
})

describe("visão", () => {
  it("famílias comprovadas enxergam", () => {
    for (const m of [
      "anthropic/claude-fable-5.1",
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-5.4-mini",
      "openai/gpt-4o",
      "google/gemini-3.1-flash-image",
    ]) {
      expect(modeloTemVisao(m)).toBe(true)
    }
  })

  // Aqui a assimetria inverte: anexar imagem a quem não enxerga faz o
  // provedor errar ou descartar em silêncio. Desconhecido = cego.
  it("modelo fora das famílias é tratado como cego", () => {
    for (const m of ["moonshotai/kimi-k3", "z-ai/glm-4.6", "modelo/desconhecido"]) {
      expect(modeloTemVisao(m)).toBe(false)
    }
  })

  // Sem "/" o modelo roteia pelo SDK da Anthropic, que LANÇA ao receber
  // anexo — por mais que o Claude enxergue.
  it("modelo sem barra não serve para visão, mesmo sendo capaz", () => {
    expect(modeloTemVisao("claude-opus-4-7")).toBe(false)
    expect(modeloTemVisao("claude-fable-5-1")).toBe(false)
  })
})
