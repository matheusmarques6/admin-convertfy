/**
 * block-scope — de que REGIÃO do documento cada bloco é dono.
 *
 * O documento carrega os marcadores `cfy:block:{i}:{tipo}` desde a
 * montagem, mas até 01/09 só o image-merge os usava, e por dentro. O
 * copy-merge ancorava sobre o documento INTEIRO — qualquer campo podia
 * escrever em qualquer lugar.
 *
 * Foi assim que o botão do segundo produto saiu "1 SEE HOW IT WORKS": o
 * campo `cta_label` do bloco 3 (example "SHOP NOW") achou duas ocorrências
 * livres — a sua e o miolo do "1 SHOP NOW", que é do bloco 4 e não tinha
 * campo nenhum — e a regra 5 do anchor-match ("campo único com N
 * ocorrências escreve em todas") escreveu nas duas, trocando só o pedaço
 * "SHOP NOW" e deixando o "1 " órfão na frente. A regra 5 nasceu para a
 * fita repetida DENTRO da mesma arte; nunca deveria cruzar a fronteira do
 * bloco.
 *
 * Este módulo é a régua ÚNICA desse casamento, usada pelos dois merges.
 *
 * Puro (zero I/O) — testável.
 */

import { locateBlockRegions } from "./slot-finder"
import type { Range } from "./dom-locator"

/** O mínimo que os dois merges conhecem de um bloco. */
export interface ScopableBlock {
  block_type?: string | null
}

export interface BlockScope<B> {
  block: B
  /** Índice do marcador (`cfy:block:{indice}`). */
  indice: number
  /** Range do CONTEÚDO da região (entre os marcadores). */
  range: Range
}

/**
 * Casa cada bloco com a região do marcador.
 *
 * Caminho normal: **ordem do documento** — o n-ésimo marcador é o n-ésimo
 * bloco. Os dois vêm do mesmo blueprint, na mesma ordem, e o marcador é
 * escrito na montagem: a posição é a informação confiável.
 *
 * O tipo serve de DESEMPATE, não de guarda. Quando as listas têm tamanhos
 * diferentes (bloco estrutural sem marcador, por exemplo), a contagem por
 * tipo desfaz o desalinhamento — e o que sobrar sem par fica de fora, que
 * é melhor que casar errado. Casar por `block_type` como REGRA foi o que
 * fez a imagem sumir quando `sanitizeBlockType` degradava o tipo para
 * 'text' (incidente 28/08, migration 20261090).
 */
export function scopeBlocks<B extends ScopableBlock>(
  html: string,
  blocks: B[],
): Map<B, BlockScope<B>> {
  const markers = locateBlockRegions(html)
  const out = new Map<B, BlockScope<B>>()

  if (markers.length === blocks.length) {
    markers.forEach((m, i) =>
      out.set(blocks[i], { block: blocks[i], indice: m.indice, range: m.range }),
    )
    return out
  }

  const nthSeen = new Map<string, number>()
  for (const m of markers) {
    const nth = nthSeen.get(m.tipo) ?? 0
    nthSeen.set(m.tipo, nth + 1)
    const block = blocks.filter((b) => b.block_type === m.tipo)[nth]
    if (block) out.set(block, { block, indice: m.indice, range: m.range })
  }
  return out
}

/** Só os índices, para quem não precisa do range (image-merge legado). */
export function blockMarkerIndices<B extends ScopableBlock>(
  html: string,
  blocks: B[],
): Map<B, number> {
  const out = new Map<B, number>()
  for (const [block, scope] of scopeBlocks(html, blocks)) {
    out.set(block, scope.indice)
  }
  return out
}
