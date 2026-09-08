/**
 * O erro que a run grava tem de dizer a causa.
 *
 * Duas vezes o mesmo desfecho chegou à tela como `Unexpected end of JSON
 * input`: copy_fit 5d7396b5 (02/09, GPT-5.4 mini com effort medium e teto
 * 1500) e subject (08/09, Fable com os 400 tokens do Sonnet). O provedor não
 * erra — o orçamento acaba antes da primeira letra.
 */
import { describe, expect, it } from "vitest"

import { motivoDeRespostaVazia } from "./resposta-vazia"

describe("motivoDeRespostaVazia", () => {
  // O caso do subject: teto dimensionado para um modelo que não pensa.
  it("aponta o teto quando o raciocínio comeu o orçamento", () => {
    const msg = motivoDeRespostaVazia({
      model: "anthropic/claude-fable-5.1",
      maxTokens: 400,
      tokensOutput: 400,
      finishReason: "length",
      reasoningTokens: 400,
    })
    expect(msg).toContain("anthropic/claude-fable-5.1")
    expect(msg).toContain("400 dos 400 tokens foram para o raciocínio")
    expect(msg).toContain("finish_reason=length")
    expect(msg).toContain("aumente max_tokens")
  })

  // Sem `reasoning_tokens` do provedor, o teto batido ainda se denuncia
  // pelo consumo igual ao limite.
  it("consumo igual ao teto basta, mesmo sem reasoning_tokens", () => {
    const msg = motivoDeRespostaVazia({
      model: "openai/gpt-5.4-mini",
      maxTokens: 1500,
      tokensOutput: 1500,
    })
    expect(msg).toContain("1500 de 1500 tokens consumidos")
    expect(msg).toContain("aumente max_tokens")
  })

  // Vazio COM orçamento sobrando é outro problema — não mandar o operador
  // subir um teto que não é o gargalo.
  it("vazio com orçamento sobrando não culpa o teto", () => {
    const msg = motivoDeRespostaVazia({
      model: "anthropic/claude-sonnet-4.6",
      maxTokens: 8192,
      tokensOutput: 12,
      finishReason: "stop",
    })
    expect(msg).toContain("não escreveu nada")
    expect(msg).not.toContain("aumente max_tokens")
  })

  // Provedor que não reporta usage nenhum: a mensagem ainda tem de sair
  // legível, com o teto que estava valendo.
  it("sem usage nenhum, ainda diz o teto que estava valendo", () => {
    const msg = motivoDeRespostaVazia({
      model: "moonshotai/kimi-k3",
      maxTokens: 2048,
    })
    expect(msg).toContain("max_tokens=2048")
    expect(msg).toContain("resposta vazia")
  })
})
