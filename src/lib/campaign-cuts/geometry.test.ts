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
  portPixelRect,
  portPixelRectWidthScaled,
  widthScaledPortsToStoreFractions,
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

describe("portPixelRect", () => {
  it("converte frações em pixels arredondados", () => {
    expect(portPixelRect({ y0: 0, y1: 0.5 }, 1000)).toEqual({ top: 0, height: 500 })
    expect(portPixelRect({ y0: 0.5, y1: 1 }, 1000)).toEqual({ top: 500, height: 500 })
  })

  it("porta finíssima nunca vira height 0", () => {
    expect(portPixelRect({ y0: 0.5, y1: 0.5001 }, 100).height).toBeGreaterThanOrEqual(1)
  })

  it("última porta nunca passa da altura da imagem", () => {
    const r = portPixelRect({ y0: 0.99, y1: 1 }, 333)
    expect(r.top + r.height).toBe(333)
  })

  it("clampa frações fora de 0..1", () => {
    const r = portPixelRect({ y0: -0.2, y1: 1.4 }, 200)
    expect(r).toEqual({ top: 0, height: 200 })
  })
})

describe("portPixelRectWidthScaled", () => {
  const model = { w: 600, h: 3000 }

  it("mesma resolução do modelo = pixels do modelo", () => {
    const r = portPixelRectWidthScaled({ y0: 0.1, y1: 0.3 }, model, { w: 600, h: 3000 })
    expect(r).toEqual({ top: 300, height: 600 })
  })

  it("export 2x: escala por largura, não pela altura da loja", () => {
    // Loja 1200 de largura e MAIS alta que 2x o modelo (6800 vs 6000):
    // os cortes ficam nos pixels do modelo × 2, não em % de 6800.
    const r = portPixelRectWidthScaled({ y0: 0.1, y1: 0.3 }, model, { w: 1200, h: 6800 })
    expect(r).toEqual({ top: 600, height: 1200 })
  })

  it("última porta absorve o resto da imagem da loja", () => {
    const r = portPixelRectWidthScaled({ y0: 0.9, y1: 1 }, model, { w: 1200, h: 6800 })
    expect(r.top).toBe(5400) // 0.9 × 3000 × 2
    expect(r.top + r.height).toBe(6800)
  })

  it("loja mais curta que o modelo escalado: clampa no fim da imagem", () => {
    const r = portPixelRectWidthScaled({ y0: 0.8, y1: 0.95 }, model, { w: 600, h: 2500 })
    expect(r.top + r.height).toBeLessThanOrEqual(2500)
    expect(r.height).toBeGreaterThanOrEqual(1)
  })

  it("sem dimensões do modelo cai na fração da altura (mapas antigos)", () => {
    const r = portPixelRectWidthScaled({ y0: 0, y1: 0.5 }, { w: null, h: null }, { w: 800, h: 1000 })
    expect(r).toEqual({ top: 0, height: 500 })
  })
})

describe("widthScaledPortsToStoreFractions", () => {
  const model = { w: 600, h: 3000 }

  it("mantém o invariante: contíguas cobrindo 0..1 da imagem da loja", () => {
    const ports: CutPort[] = [
      { id: "a", label: "Header", type: "header", y0: 0, y1: 0.1 },
      { id: "b", label: "Hero", type: "hero", y0: 0.1, y1: 0.6 },
      { id: "c", label: "Rodapé", type: "rodape", y0: 0.6, y1: 1 },
    ]
    const out = widthScaledPortsToStoreFractions(ports, model, { w: 1200, h: 6800 })
    expect(portsAreContiguous(out)).toBe(true)
    // Fronteira interna nas frações da LOJA: 0.1×3000×2 = 600px de 6800.
    expect(out[0].y1).toBeCloseTo(600 / 6800, 5)
    expect(out[1].y1).toBeCloseTo(3600 / 6800, 5)
  })

  it("preserva id/label/type de cada porta", () => {
    const ports: CutPort[] = [
      { id: "x", label: "Hero", type: "hero", y0: 0, y1: 1 },
    ]
    const out = widthScaledPortsToStoreFractions(ports, model, { w: 600, h: 3000 })
    expect(out[0]).toMatchObject({ id: "x", label: "Hero", type: "hero", y0: 0, y1: 1 })
  })
})
