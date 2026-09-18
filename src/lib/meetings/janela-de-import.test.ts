import { describe, it, expect } from "vitest"
import { dentroDaJanela, janelaDeImport, IMPORT_JANELA_DIAS } from "./janela-de-import"

const AGORA = new Date("2026-09-18T12:00:00.000Z").getTime()
const j = janelaDeImport(AGORA)

const emDias = (d: number) => new Date(AGORA + d * 86_400_000).toISOString()

describe("janelaDeImport", () => {
  it("abre 7 dias atrás e 90 à frente", () => {
    expect(j.min).toBe(AGORA - 7 * 86_400_000)
    expect(j.max).toBe(AGORA + 90 * 86_400_000)
    expect(IMPORT_JANELA_DIAS).toEqual({ atras: 7, frente: 90 })
  })
})

describe("dentroDaJanela", () => {
  it("aceita o que está dentro, inclusive nas bordas", () => {
    expect(dentroDaJanela(emDias(0), j)).toBe(true)
    expect(dentroDaJanela(emDias(-7), j)).toBe(true)
    expect(dentroDaJanela(emDias(90), j)).toBe(true)
  })

  it("recusa o que passa das bordas", () => {
    expect(dentroDaJanela(emDias(-8), j)).toBe(false)
    expect(dentroDaJanela(emDias(91), j)).toBe(false)
  })

  it("recusa a recorrência distante que inundou a tabela em 18/09", () => {
    // "Bruno <> Inglês", semanal, instâncias até 2040.
    expect(dentroDaJanela("2040-08-08T13:00:00.000Z", j)).toBe(false)
    expect(dentroDaJanela("2027-01-06T13:00:00.000Z", j)).toBe(false)
  })

  it("evento de dia inteiro (sem dateTime) fica de fora", () => {
    // É o comportamento que a importação já tinha; a régua não o muda.
    expect(dentroDaJanela(undefined, j)).toBe(false)
    expect(dentroDaJanela(null, j)).toBe(false)
  })

  it("data ilegível não vira 'dentro' por acidente", () => {
    expect(dentroDaJanela("quinta que vem", j)).toBe(false)
    expect(dentroDaJanela("", j)).toBe(false)
  })
})
