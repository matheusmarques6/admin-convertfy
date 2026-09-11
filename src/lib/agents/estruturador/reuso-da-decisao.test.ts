import { describe, expect, it } from "vitest"

import { decidirPelaJanela } from "./reuso-da-decisao"

const TETO = 32_000 // ~371s com a latência base

describe("decidirPelaJanela", () => {
  it("o caso real de 11/09: não cabe com o Curador reservado, e reusa", () => {
    // Janela 770s, Seletor levou 65s → restam 705s. O Curador custa 442s
    // medidos, então sobram 255s para o Estruturador, que pede ~371s.
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: 705_000,
      reservaMs: 450_000,
      temVigente: true,
    })
    expect(d.acao).toBe("reusar")
    expect(d.motivo).toContain("reservados para as etapas seguintes")
  })

  it("com folga, roda — o reuso não é o caminho normal", () => {
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: 900_000,
      reservaMs: 450_000,
      temVigente: true,
    })
    expect(d.acao).toBe("rodar")
    expect(d.motivo).toBeUndefined()
  })

  it("sem janela aberta o comportamento é o de sempre", () => {
    // É o caminho de quem chama o serviço fora da fase 1 — nada muda.
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: null,
      reservaMs: 450_000,
      temVigente: false,
    })
    expect(d.acao).toBe("rodar")
  })

  it("não cabe e NÃO há o que reusar: roda assim mesmo, com o motivo", () => {
    // Pular aqui deixaria o Curador sem o papel de cada posição — o
    // fallback genérico é o pior dos três desfechos.
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: 705_000,
      reservaMs: 450_000,
      temVigente: false,
    })
    expect(d.acao).toBe("rodar")
    expect(d.motivo).toContain("não há decisão vigente")
  })
})
