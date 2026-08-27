import { describe, it, expect } from "vitest"
import {
  BlockRegionsError,
  parseBlockRegions,
  removeRegions,
  renumberMarkers,
  reorderRegions,
  sequenceOf,
} from "./block-regions"

/** Documento no formato real do Montador: uma `<tr>` por bloco marcado. */
function doc(...secoes: string[]): string {
  const rows = secoes
    .map(
      (s, i) =>
        `        <!-- cfy:block:${i}:${s}:start -->\n` +
        `<tr><td>conteúdo de ${s}</td></tr>\n` +
        `        <!-- cfy:block:${i}:${s}:end -->`,
    )
    .join("\n")
  return `<html><body><table>\n${rows}\n</table></body></html>`
}

const EMAIL = doc("hero", "body", "offer", "products", "reviews", "footer")

describe("parseBlockRegions", () => {
  it("lê índice, section e o trecho com os marcadores", () => {
    const r = parseBlockRegions(EMAIL)
    expect(r).toHaveLength(6)
    expect(r[0].section).toBe("hero")
    expect(r[0].indice).toBe(0)
    expect(r[2].html).toContain("conteúdo de offer")
    expect(r[2].html.startsWith("<!-- cfy:block:2:offer:start -->")).toBe(true)
    expect(r[2].html.endsWith("<!-- cfy:block:2:offer:end -->")).toBe(true)
  })

  it("documento sem marcador devolve lista vazia (não é erro aqui)", () => {
    expect(parseBlockRegions("<html><body>oi</body></html>")).toEqual([])
  })

  // Recusar em vez de consertar: um `end` faltando significa que alguém
  // mexeu no documento por fora, e adivinhar onde a região termina é como
  // se perde um bloco inteiro sem ninguém ver.
  it("start sem end é erro explícito", () => {
    const quebrado = EMAIL.replace("<!-- cfy:block:2:offer:end -->", "")
    expect(() => parseBlockRegions(quebrado)).toThrow(BlockRegionsError)
    expect(() => parseBlockRegions(quebrado)).toThrow(/abre e não fecha/)
  })
})

describe("reorderRegions", () => {
  it("move o bloco e preserva o conteúdo byte a byte", () => {
    // reviews (4) sobe para antes de offer (2).
    const novo = reorderRegions(EMAIL, [0, 1, 4, 2, 3, 5])
    expect(sequenceOf(novo)).toEqual([
      "hero",
      "body",
      "reviews",
      "offer",
      "products",
      "footer",
    ])
    const antes = parseBlockRegions(EMAIL)
    const depois = parseBlockRegions(novo)
    for (const r of antes) {
      const igual = depois.find((d) => d.indice === r.indice)
      expect(igual?.html).toBe(r.html)
    }
  })

  it("o que está fora das regiões não é tocado", () => {
    const novo = reorderRegions(EMAIL, [5, 4, 3, 2, 1, 0])
    expect(novo.startsWith("<html><body><table>")).toBe(true)
    expect(novo.endsWith("</table></body></html>")).toBe(true)
  })

  it("ordem sem todos os índices é recusada (apagaria bloco em silêncio)", () => {
    expect(() => reorderRegions(EMAIL, [0, 1, 2])).toThrow(/permutação/)
  })

  it("índice repetido ou inexistente é recusado", () => {
    expect(() => reorderRegions(EMAIL, [0, 0, 1, 2, 3, 4])).toThrow(/permutação/)
    expect(() => reorderRegions(EMAIL, [0, 1, 2, 3, 4, 9])).toThrow(/permutação/)
  })

  it("documento sem marcadores é recusado com o motivo certo", () => {
    expect(() => reorderRegions("<html>sem marcas</html>", [0])).toThrow(
      /antes da edição de estrutura/,
    )
  })
})

describe("removeRegions", () => {
  it("tira a região do documento e mantém as outras intactas", () => {
    const novo = removeRegions(EMAIL, [2])
    expect(sequenceOf(novo)).toEqual([
      "hero",
      "body",
      "products",
      "reviews",
      "footer",
    ])
    expect(novo).not.toContain("conteúdo de offer")
    expect(novo).toContain("conteúdo de products")
  })

  it("bloco que não existe é erro, não no-op", () => {
    expect(() => removeRegions(EMAIL, [42])).toThrow(/não existe/)
  })

  it("remover tudo é recusado", () => {
    expect(() => removeRegions(EMAIL, [0, 1, 2, 3, 4, 5])).toThrow(/vazio/)
  })
})

describe("renumberMarkers", () => {
  // image-merge casa bloco ↔ marcador por índice: depois de reordenar,
  // 0,1,4,2,3,5 faria um resume da fase 2 escrever no bloco errado.
  it("índice do marcador volta a ser a posição no documento", () => {
    const reordenado = reorderRegions(EMAIL, [0, 1, 4, 2, 3, 5])
    expect(parseBlockRegions(reordenado).map((r) => r.indice)).toEqual([
      0, 1, 4, 2, 3, 5,
    ])
    const novo = renumberMarkers(reordenado)
    expect(parseBlockRegions(novo).map((r) => r.indice)).toEqual([0, 1, 2, 3, 4, 5])
    // A section acompanha o bloco, não o número.
    expect(sequenceOf(novo)).toEqual([
      "hero",
      "body",
      "reviews",
      "offer",
      "products",
      "footer",
    ])
    expect(novo).toContain("<!-- cfy:block:2:reviews:start -->")
    expect(novo).toContain("<!-- cfy:block:2:reviews:end -->")
  })

  it("renumerar depois de remover fecha o buraco", () => {
    const novo = renumberMarkers(removeRegions(EMAIL, [1]))
    expect(parseBlockRegions(novo).map((r) => r.indice)).toEqual([0, 1, 2, 3, 4])
    expect(sequenceOf(novo)).toEqual([
      "hero",
      "offer",
      "products",
      "reviews",
      "footer",
    ])
  })

  it("documento já em ordem passa intacto", () => {
    expect(renumberMarkers(EMAIL)).toBe(EMAIL)
  })
})
