import { describe, expect, it } from "vitest"

import { campoDaPendencia, mesclarPendencias, normalizarPendencias, type PendenciaDaFicha } from "./pendencia-da-contradicao"

// Textos REAIS das runs de 18/09 (contradição do código + alertas do modelo).
const CONTRADICAO_TROCA =
  'o tratamento pede política de troca/devolução e este toque proíbe afirmá-la ("Policy described in brand thesis as a goal, not confirmed as live on site. Verif") — falta o dado na loja (ficha operacional)'
const ALERTA_SUPORTE = "No support channel, response time, or support policy documented in the research. Cannot claim support quality without evidence."
const ALERTA_ENVIO = "Shipping and fulfillment reliability not documented. Frete personalizado por região is mentioned but no delivery guarantee, carrier SLA, or tracking commitment is stated."
const ALERTA_PROVA = "No verified product authenticity claim or quality control process found."

describe("campoDaPendencia", () => {
  it("mapeia contradição e alerta para o campo da ficha", () => {
    expect(campoDaPendencia(CONTRADICAO_TROCA)).toBe("troca")
    expect(campoDaPendencia(ALERTA_SUPORTE)).toBe("suporte")
    expect(campoDaPendencia(ALERTA_ENVIO)).toBe("envio")
    expect(campoDaPendencia(ALERTA_PROVA)).toBe("prova")
  })
  it("'prazo de devolução' é troca, não envio", () => {
    expect(campoDaPendencia("não prometer prazo de devolução que a política não cita")).toBe("troca")
  })
  it("texto sem família conhecida NÃO vira pendência", () => {
    expect(campoDaPendencia("Do not use the Amazon comparison")).toBeNull()
  })
})

describe("mesclarPendencias", () => {
  const ctx = { runId: "run-1", flow: "welcome", agora: "2026-09-19T10:00:00.000Z" }

  it("cria uma linha por campo, mesmo com três frases para o mesmo campo", () => {
    const r = mesclarPendencias([], [{ texto: ALERTA_ENVIO }, { texto: "Do not promise delivery times" }, { texto: ALERTA_SUPORTE }], ctx)
    expect(r.mudou).toBe(true)
    expect(r.pendencias.map((p) => p.campo)).toEqual(["envio", "suporte"])
    expect(r.pendencias[0]).toMatchObject({ frequencia: 1, primeira_run: "run-1", ultima_run: "run-1", flows: ["welcome"] })
  })

  it("mesmo campo em run nova soma frequência e acrescenta o flow", () => {
    const base = mesclarPendencias([], [{ texto: ALERTA_SUPORTE }], ctx).pendencias
    const r = mesclarPendencias(base, [{ texto: "Do not name a support channel" }], { runId: "run-2", flow: "cart", agora: "2026-09-20T10:00:00.000Z" })
    expect(r.mudou).toBe(true)
    expect(r.pendencias[0]).toMatchObject({ campo: "suporte", frequencia: 2, primeira_run: "run-1", ultima_run: "run-2", flows: ["welcome", "cart"] })
  })

  it("a mesma run reprocessada não conta duas vezes e não marca mudança", () => {
    const base = mesclarPendencias([], [{ texto: ALERTA_SUPORTE }], ctx).pendencias
    const r = mesclarPendencias(base, [{ texto: ALERTA_SUPORTE }], ctx)
    expect(r.mudou).toBe(false)
    expect(r.pendencias[0].frequencia).toBe(1)
  })

  it("ordena pela frequência — é o que diz o que preencher primeiro", () => {
    let p: PendenciaDaFicha[] = []
    p = mesclarPendencias(p, [{ texto: ALERTA_ENVIO }, { texto: ALERTA_SUPORTE }], ctx).pendencias
    p = mesclarPendencias(p, [{ texto: ALERTA_SUPORTE }], { ...ctx, runId: "run-2" }).pendencias
    expect(p.map((x) => x.campo)).toEqual(["suporte", "envio"])
  })
})

describe("normalizarPendencias", () => {
  it("lixo some, campo desconhecido some", () => {
    expect(normalizarPendencias(null)).toEqual([])
    expect(normalizarPendencias([{ campo: "xyz", motivo: "a" }, 3, { campo: "troca", motivo: "b", frequencia: 2 }])).toMatchObject([
      { campo: "troca", motivo: "b", frequencia: 2, flows: [] },
    ])
  })
})
