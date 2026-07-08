/**
 * Testes do service do mapa de cortes — foco na validação estrita
 * (validateCutMap) que protege o approve.
 */

import { describe, it, expect } from "vitest"
import { validateCutMap } from "./campaign-cut-map.service"
import type { CutPort, CutSpecialArea } from "@/types/campaign-cuts"

function port(over: Partial<CutPort> & { id: string }): CutPort {
  return { label: `Porta ${over.id}`, type: "texto", y0: 0, y1: 1, ...over }
}

const OK_PORTS: CutPort[] = [
  port({ id: "a", type: "header", y0: 0, y1: 0.1 }),
  port({ id: "b", type: "hero", y0: 0.1, y1: 0.6 }),
  port({ id: "c", type: "rodape", y0: 0.6, y1: 1 }),
]

const OK_AREA: CutSpecialArea = { id: "r1", label: "Área", x: 0.1, y: 0.2, w: 0.5, h: 0.1 }

describe("validateCutMap", () => {
  it("aceita mapa válido (com e sem áreas)", () => {
    expect(() => validateCutMap(OK_PORTS, [])).not.toThrow()
    expect(() => validateCutMap(OK_PORTS, [OK_AREA])).not.toThrow()
  })

  it("rejeita mapa vazio", () => {
    expect(() => validateCutMap([], [])).toThrow(/ao menos 1 porta/)
  })

  it("rejeita buraco entre portas", () => {
    const ports = [
      port({ id: "a", y0: 0, y1: 0.4 }),
      port({ id: "b", y0: 0.5, y1: 1 }),
    ]
    expect(() => validateCutMap(ports, [])).toThrow(/Buraco/)
  })

  it("rejeita sobreposição entre portas", () => {
    const ports = [
      port({ id: "a", y0: 0, y1: 0.6 }),
      port({ id: "b", y0: 0.5, y1: 1 }),
    ]
    expect(() => validateCutMap(ports, [])).toThrow(/Sobreposição/)
  })

  it("rejeita primeira porta que não começa em 0", () => {
    const ports = [port({ id: "a", y0: 0.05, y1: 1 })]
    expect(() => validateCutMap(ports, [])).toThrow(/começar no topo/)
  })

  it("rejeita última porta que não termina em 1", () => {
    const ports = [port({ id: "a", y0: 0, y1: 0.9 })]
    expect(() => validateCutMap(ports, [])).toThrow(/terminar no fim/)
  })

  it("rejeita porta abaixo da altura mínima", () => {
    const ports = [
      port({ id: "a", y0: 0, y1: 0.001 }),
      port({ id: "b", y0: 0.001, y1: 1 }),
    ]
    expect(() => validateCutMap(ports, [])).toThrow(/altura abaixo do mínimo/)
  })

  it("rejeita área fora dos limites", () => {
    const bad: CutSpecialArea = { ...OK_AREA, x: 0.8, w: 0.5 }
    expect(() => validateCutMap(OK_PORTS, [bad])).toThrow(/fora dos limites/)
  })

  it("rejeita área com dimensão inválida", () => {
    const bad: CutSpecialArea = { ...OK_AREA, w: 0 }
    expect(() => validateCutMap(OK_PORTS, [bad])).toThrow(/dimensão inválida/)
  })

  it("rejeita type inválido", () => {
    const ports = [port({ id: "a", type: "banner" as CutPort["type"], y0: 0, y1: 1 })]
    expect(() => validateCutMap(ports, [])).toThrow(/Tipo de porta inválido/)
  })

  it("rejeita ids duplicados (portas e áreas)", () => {
    const ports = [
      port({ id: "a", y0: 0, y1: 0.5 }),
      port({ id: "a", y0: 0.5, y1: 1 }),
    ]
    expect(() => validateCutMap(ports, [])).toThrow(/id duplicado/)
    expect(() =>
      validateCutMap(OK_PORTS, [OK_AREA, { ...OK_AREA }]),
    ).toThrow(/id duplicado/)
  })

  it("rejeita mais de 40 portas", () => {
    const many: CutPort[] = Array.from({ length: 41 }, (_, i) =>
      port({ id: `p${i}`, y0: i / 41, y1: (i + 1) / 41 }),
    )
    expect(() => validateCutMap(many, [])).toThrow(/Máximo de 40 portas/)
  })

  it("tolera eps de contiguidade (float)", () => {
    const ports = [
      port({ id: "a", y0: 0.00005, y1: 0.5 }),
      port({ id: "b", y0: 0.50002, y1: 0.99998 }),
    ]
    expect(() => validateCutMap(ports, [])).not.toThrow()
  })
})
