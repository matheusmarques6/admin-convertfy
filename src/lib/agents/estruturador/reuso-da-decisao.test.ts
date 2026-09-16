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

describe("decidirPelaJanela — pin da execução manual", () => {
  // O defeito: `gateFor` devolve `disabled: true` para pinado E para
  // desativado, e o `generate.service` lia só `.disabled`. Pinar o
  // Estruturador — que declara "a decisão gravada vale" — caía no ramo de
  // desativado e a estrutura vinha do OUTLINE. É o que tornava a bancada
  // ("rodar só o Curador") uma medição sobre entrada que a produção nunca
  // usa.
  it("pinado com decisão vigente reusa, mesmo com a janela folgada", () => {
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: 900_000,
      reservaMs: 450_000,
      temVigente: true,
      pinado: true,
    })
    expect(d.acao).toBe("reusar")
    expect(d.motivo).toContain("pinado")
  })

  // Pedido explícito de quem está na tela vence a conta de tempo — inclusive
  // quando a janela nem está aberta (a bancada roda fora do cron).
  it("pinado vale sem janela aberta", () => {
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: null,
      reservaMs: 450_000,
      temVigente: true,
      pinado: true,
    })
    expect(d.acao).toBe("reusar")
  })

  // Pin sem artefato não vira reuso aqui: esta função é pura e só sabe que a
  // decisão não existe. Quem recusa ANTES de gastar é `verificarPins`.
  it("pinado sem decisão vigente roda, e diz por quê", () => {
    const d = decidirPelaJanela({
      maxTokens: TETO,
      restanteMs: 900_000,
      reservaMs: 450_000,
      temVigente: false,
      pinado: true,
    })
    expect(d.acao).toBe("rodar")
    expect(d.motivo).toContain("não há decisão vigente")
  })

  // Sem o pin nada muda: o parâmetro é opcional e o caminho de produção é o
  // de antes.
  it("sem pin o comportamento é idêntico ao de antes", () => {
    const base = { maxTokens: TETO, restanteMs: 705_000, reservaMs: 450_000, temVigente: true }
    expect(decidirPelaJanela(base)).toEqual(decidirPelaJanela({ ...base, pinado: false }))
  })
})
