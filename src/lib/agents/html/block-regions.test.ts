import { describe, it, expect } from "vitest"
import { buildQaBlockViews } from "./qa-views"
import {
  BlockRegionsError,
  REGION_ATTR,
  annotateRegionsForEditing,
  moverIndice,
  parseBlockRegions,
  resolveDropTarget,
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

// ── Edição no próprio email ─────────────────────────────────────────────

describe("annotateRegionsForEditing", () => {
  it("dá um endereço a cada região, na tag certa", () => {
    const anotado = annotateRegionsForEditing(EMAIL)
    expect(anotado).toContain(`<tr ${REGION_ATTR}="0"><td>conteúdo de hero`)
    expect(anotado).toContain(`<tr ${REGION_ATTR}="3"><td>conteúdo de products`)
    expect(anotado.match(new RegExp(REGION_ATTR, "g"))).toHaveLength(6)
  })

  // O documento salvo nunca leva o atributo: a anotação existe só na cópia
  // do preview. Tirar o atributo tem de devolver exatamente o original.
  it("não altera mais nada no documento", () => {
    const anotado = annotateRegionsForEditing(EMAIL)
    const semAtributo = anotado.replace(new RegExp(` ${REGION_ATTR}="\\d+"`, "g"), "")
    expect(semAtributo).toBe(EMAIL)
  })

  it("documento sem marcador passa intacto", () => {
    const cru = "<html><body>sem marcas</body></html>"
    expect(annotateRegionsForEditing(cru)).toBe(cru)
  })

  it("a ordem do documento manda, não o número do marcador", () => {
    const reordenado = reorderRegions(EMAIL, [0, 1, 4, 2, 3, 5])
    const anotado = annotateRegionsForEditing(reordenado)
    // A 3ª região do documento é reviews e mantém o índice 4 do marcador —
    // é ele que o preview devolve, e é por ele que o pai traduz.
    expect(anotado).toContain(`<tr ${REGION_ATTR}="4"><td>conteúdo de reviews`)
  })
})

describe("resolveDropTarget", () => {
  // Compara com o MEIO da linha: com o topo, arrastar para baixo só engata
  // depois de passar a linha inteira, e uma hero de 600px fica impossível
  // de posicionar.
  const meios = [50, 150, 250]

  it("acima de tudo → primeira posição", () => {
    expect(resolveDropTarget(meios, 0)).toBe(0)
    expect(resolveDropTarget(meios, 49)).toBe(0)
  })

  it("passou o meio da linha → posição seguinte", () => {
    expect(resolveDropTarget(meios, 51)).toBe(1)
    expect(resolveDropTarget(meios, 151)).toBe(2)
  })

  it("abaixo de tudo → fim da lista", () => {
    expect(resolveDropTarget(meios, 9999)).toBe(3)
  })

  it("lista vazia → 0", () => {
    expect(resolveDropTarget([], 123)).toBe(0)
  })
})

describe("moverIndice", () => {
  const lista = ["a", "b", "c", "d"]

  // `para` é a posição de inserção ANTES da remoção: mover para baixo
  // desconta um. Errar isso desloca uma posição a mais — o bug clássico.
  it("move para baixo sem pular uma casa", () => {
    expect(moverIndice(lista, 0, 2)).toEqual(["b", "a", "c", "d"])
    expect(moverIndice(lista, 0, 4)).toEqual(["b", "c", "d", "a"])
  })

  it("move para cima", () => {
    expect(moverIndice(lista, 3, 1)).toEqual(["a", "d", "b", "c"])
    expect(moverIndice(lista, 2, 0)).toEqual(["c", "a", "b", "d"])
  })

  it("soltar no mesmo lugar não muda nada", () => {
    expect(moverIndice(lista, 1, 1)).toEqual(lista)
    expect(moverIndice(lista, 1, 2)).toEqual(lista)
  })

  it("índice fora da lista devolve cópia intacta", () => {
    expect(moverIndice(lista, 9, 0)).toEqual(lista)
  })
})

// ── Os dois caminhos precisam concordar ─────────────────────────────────
//
// A pessoa pode reordenar arrastando NO EMAIL (índices de região) ou pelo
// painel (ids de bloco). Os dois terminam na mesma `ordem` enviada à rota;
// se divergirem, a tela move um bloco e o servidor move outro.

describe("arrastar no email == arrastar no painel", () => {
  const blocos = [
    { id: "b-hero", position: 1, block_type: "hero" },
    { id: "b-body", position: 2, block_type: "body" },
    { id: "b-offer", position: 3, block_type: "offer" },
    { id: "b-reviews", position: 4, block_type: "reviews" },
  ]
  const documento = doc("hero", "body", "offer", "reviews")

  it("mover reviews para antes de offer dá a mesma ordem nos dois", () => {
    // Caminho do PAINEL: mexe direto na lista de ids.
    const idsAtuais = blocos.map((b) => b.id)
    const peloPainel = moverIndice(idsAtuais, 3, 2)

    // Caminho do EMAIL: mexe em índices de região e traduz pelo MESMO mapa
    // que a rota usa (buildQaBlockViews).
    const views = buildQaBlockViews(documento, blocos)
    const indices = views.map((v) => v.indice)
    const novaOrdemDeRegioes = moverIndice(indices, 3, 2)
    const blocoPorRegiao = new Map(
      views.filter((v) => v.block_id).map((v) => [v.indice, v.block_id as string]),
    )
    const peloEmail = novaOrdemDeRegioes.map((i) => blocoPorRegiao.get(i))

    expect(peloEmail).toEqual(peloPainel)
    expect(peloEmail).toEqual(["b-hero", "b-body", "b-reviews", "b-offer"])
  })

  it("o mapa casa toda região com um bloco", () => {
    const views = buildQaBlockViews(documento, blocos)
    expect(views.map((v) => v.block_id)).toEqual([
      "b-hero",
      "b-body",
      "b-offer",
      "b-reviews",
    ])
  })
})
