import { describe, it, expect } from "vitest"
import {
  defaultPositions,
  layoutSignature,
  restoreLayout,
  serializeLayout,
} from "./studio-layout"
import { STUDIO_NODES } from "./studio-graph"

describe("layout do mapa do Estúdio", () => {
  it("respeita o arranjo salvo quando o mapa é o mesmo", () => {
    const meu = defaultPositions()
    meu.qa = { x: 1, y: 2 }
    expect(restoreLayout(serializeLayout(meu)).qa).toEqual({ x: 1, y: 2 })
  })

  // O incidente: ao acrescentar o Estruturador e o Dispatch, os nós
  // existentes deslocaram +256px, mas o layout salvo no navegador prendia
  // cada um na coordenada ANTIGA — e o nó novo, ausente do arranjo salvo,
  // ia para a coordenada nova, que era justamente a que o vizinho ocupava
  // antes. Os dois nasceram invisíveis, um em cima do outro.
  it("descarta o arranjo salvo quando o conjunto de nós mudou", () => {
    const antigo = defaultPositions()
    antigo.assembler_chooser = { x: 300, y: 452 } // onde o Curador ficava
    const salvo = JSON.stringify({
      sig: "mapa|sem|o|estruturador",
      pos: antigo,
    })
    expect(restoreLayout(salvo)).toEqual(defaultPositions())
  })

  it("formato antigo (posições soltas, sem assinatura) não é aproveitado", () => {
    const solto = JSON.stringify({ assembler_chooser: { x: 300, y: 452 } })
    expect(restoreLayout(solto)).toEqual(defaultPositions())
  })

  it("nada salvo, JSON quebrado ou posição inválida → layout padrão", () => {
    expect(restoreLayout(null)).toEqual(defaultPositions())
    expect(restoreLayout("{{{")).toEqual(defaultPositions())
    expect(
      restoreLayout(
        JSON.stringify({ sig: layoutSignature(), pos: { qa: { x: "a" } } }),
      ),
    ).toEqual(defaultPositions())
  })

  it("a assinatura muda quando um nó entra ou sai", () => {
    const atual = layoutSignature()
    expect(atual).toContain("estruturador")
    expect(atual).toContain("copy_dispatch")
    expect(atual.split("|")).toHaveLength(STUDIO_NODES.length)
  })

  // A outra metade da mesma falha: dois nós no MESMO ponto são
  // indistinguíveis na tela, e foi assim que o Estruturador "sumiu".
  it("nenhum par de nós compartilha coordenada no layout padrão", () => {
    const vistos = new Map<string, string>()
    for (const [key, { x, y }] of Object.entries(defaultPositions())) {
      const ponto = `${x},${y}`
      expect(
        vistos.has(ponto),
        `"${key}" está em cima de "${vistos.get(ponto)}" em ${ponto}`,
      ).toBe(false)
      vistos.set(ponto, key)
    }
  })
})
