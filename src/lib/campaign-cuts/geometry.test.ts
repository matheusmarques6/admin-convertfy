/**
 * Testes da geometria pura do mapa de cortes.
 * Invariante central: portas ordenadas, contíguas, cobrindo 0..1.
 */

import { describe, it, expect } from "vitest"
import {
  clamp01,
  splitPortAt,
  movePortBoundary,
  mergePortWithPrevious,
  initialPorts,
  portsAreContiguous,
  MIN_PORT_FRACTION,
} from "./geometry"
import type { CutPort } from "@/types/campaign-cuts"

const MIN_GAP = 0.02

function threePorts(): CutPort[] {
  return [
    { id: "a", label: "Cabeçalho", type: "header", y0: 0, y1: 0.2 },
    { id: "b", label: "Hero", type: "hero", y0: 0.2, y1: 0.7 },
    { id: "c", label: "Rodapé", type: "rodape", y0: 0.7, y1: 1 },
  ]
}

describe("clamp01", () => {
  it("clampa fora de [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.42)).toBe(0.42)
  })
})

describe("initialPorts", () => {
  it("1 porta cobrindo 0..1", () => {
    const ports = initialPorts()
    expect(ports).toHaveLength(1)
    expect(ports[0].y0).toBe(0)
    expect(ports[0].y1).toBe(1)
    expect(portsAreContiguous(ports)).toBe(true)
  })
})

describe("splitPortAt", () => {
  it("divide a porta que contém y e mantém contiguidade", () => {
    const out = splitPortAt(threePorts(), 0.5, MIN_GAP)
    expect(out).not.toBeNull()
    expect(out!).toHaveLength(4)
    expect(out![1].y1).toBe(0.5)
    expect(out![2].y0).toBe(0.5)
    expect(out![2].y1).toBe(0.7)
    expect(out![2].type).toBe("texto")
    expect(portsAreContiguous(out!)).toBe(true)
  })

  it("não muta o array original", () => {
    const ports = threePorts()
    splitPortAt(ports, 0.5, MIN_GAP)
    expect(ports).toHaveLength(3)
    expect(ports[1].y1).toBe(0.7)
  })

  it("retorna null quando y viola o gap mínimo (perto de fronteira)", () => {
    expect(splitPortAt(threePorts(), 0.2 + MIN_GAP / 2, MIN_GAP)).toBeNull()
    expect(splitPortAt(threePorts(), 0.7 - MIN_GAP / 2, MIN_GAP)).toBeNull()
  })

  it("retorna null fora de qualquer porta válida (y exatamente na fronteira)", () => {
    expect(splitPortAt(threePorts(), 0.2, MIN_GAP)).toBeNull()
  })
})

describe("movePortBoundary", () => {
  it("move a fronteira e mantém contiguidade", () => {
    const out = movePortBoundary(threePorts(), 0, 0.3, MIN_GAP)
    expect(out[0].y1).toBe(0.3)
    expect(out[1].y0).toBe(0.3)
    expect(portsAreContiguous(out)).toBe(true)
  })

  it("clampa para preservar o gap mínimo dos dois lados", () => {
    const tooLow = movePortBoundary(threePorts(), 0, 0, MIN_GAP)
    expect(tooLow[0].y1).toBeCloseTo(0 + MIN_GAP, 10)
    const tooHigh = movePortBoundary(threePorts(), 0, 0.99, MIN_GAP)
    expect(tooHigh[0].y1).toBeCloseTo(0.7 - MIN_GAP, 10)
  })

  it("idx inválido é no-op (mesma referência)", () => {
    const ports = threePorts()
    expect(movePortBoundary(ports, -1, 0.5, MIN_GAP)).toBe(ports)
    expect(movePortBoundary(ports, 2, 0.5, MIN_GAP)).toBe(ports)
  })
})

describe("mergePortWithPrevious", () => {
  it("anterior absorve o y1 da removida", () => {
    const out = mergePortWithPrevious(threePorts(), "b")
    expect(out).toHaveLength(2)
    expect(out[0].y1).toBe(0.7)
    expect(portsAreContiguous(out)).toBe(true)
  })

  it("primeira porta mescla com a seguinte (seguinte absorve y0)", () => {
    const out = mergePortWithPrevious(threePorts(), "a")
    expect(out).toHaveLength(2)
    expect(out[0].y0).toBe(0)
    expect(out[0].id).toBe("b")
    expect(portsAreContiguous(out)).toBe(true)
  })

  it("com 1 porta só é no-op", () => {
    const ports = initialPorts()
    expect(mergePortWithPrevious(ports, ports[0].id)).toBe(ports)
  })

  it("id inexistente é no-op", () => {
    const ports = threePorts()
    expect(mergePortWithPrevious(ports, "zzz")).toBe(ports)
  })
})

describe("invariante em sequências de operações", () => {
  it("split + move + merge preservam contiguidade 0..1", () => {
    let ports = initialPorts()
    for (const y of [0.5, 0.25, 0.75, 0.6]) {
      const out = splitPortAt(ports, y, MIN_PORT_FRACTION)
      if (out) ports = out
    }
    expect(ports.length).toBeGreaterThan(3)
    expect(portsAreContiguous(ports)).toBe(true)

    ports = movePortBoundary(ports, 1, 0.4, MIN_PORT_FRACTION)
    expect(portsAreContiguous(ports)).toBe(true)

    while (ports.length > 1) {
      ports = mergePortWithPrevious(ports, ports[ports.length - 1].id)
      expect(portsAreContiguous(ports)).toBe(true)
    }
    expect(ports[0].y0).toBe(0)
    expect(ports[0].y1).toBe(1)
  })
})
