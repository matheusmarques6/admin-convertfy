import { describe, it, expect } from "vitest"

import { attachUsage, usageOf, withUsage } from "./step-usage"
import { HeroOutputInvalidError, parseHeroFragment } from "./hero.chain"

const USAGE = {
  tokensInput: 4200,
  tokensOutput: 1100,
  costUsd: 0.031,
  renderedPrompt: "<store>…</store>",
}

describe("step-usage", () => {
  it("o consumo atravessa o throw", () => {
    const err = attachUsage(new Error("parse falhou"), USAGE)
    expect(usageOf(err)).toEqual(USAGE)
  })

  it("não troca o tipo do erro — instanceof a jusante continua valendo", () => {
    const err = attachUsage(new HeroOutputInvalidError("x", "<html>"), USAGE)
    expect(err).toBeInstanceOf(HeroOutputInvalidError)
    expect(err.raw).toBe("<html>")
  })

  it("erro sem consumo grudado devolve null (comportamento de antes)", () => {
    expect(usageOf(new Error("qualquer"))).toBeNull()
    expect(usageOf(null)).toBeNull()
    expect(usageOf("string")).toBeNull()
  })

  it("consumo malformado não passa por consumo válido", () => {
    const err = new Error("x")
    Object.assign(err, { __cfyStepUsage: { tokensInput: "muitos" } })
    expect(usageOf(err)).toBeNull()
  })

  it("a chave é não-enumerável: não vaza em JSON.stringify de erro", () => {
    const err = attachUsage(new Error("x"), USAGE)
    expect(Object.keys(err)).not.toContain("__cfyStepUsage")
  })

  // O caso real: dois runs de hero com 81s de Kimi cada, gravados 0/0 e
  // $0.000 porque o throw do parser acontece depois da chamada paga.
  it("withUsage: parse que rejeita o output leva o consumo junto", () => {
    const documento = `<CFY_HERO_OUTPUT><!DOCTYPE html><html><body><table><tr><td>x</td></tr></table></body></html></CFY_HERO_OUTPUT>`
    try {
      withUsage(USAGE, () => parseHeroFragment(documento))
      throw new Error("deveria ter lançado")
    } catch (err) {
      expect((err as Error).message).toContain("fragmento contém documento")
      expect(usageOf(err)).toEqual(USAGE)
    }
  })

  it("withUsage devolve o valor quando o parse passa", () => {
    const ok = "<CFY_HERO_OUTPUT><table><tr><td>hero</td></tr></table></CFY_HERO_OUTPUT>"
    expect(withUsage(USAGE, () => parseHeroFragment(ok))).toContain("<table>")
  })
})
