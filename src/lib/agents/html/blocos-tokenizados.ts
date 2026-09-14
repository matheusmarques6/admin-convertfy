/**
 * Blocos que o Cores & Botões NÃO pode tocar (B5).
 *
 * Um bloco cuja variante usa tokens de identidade já saiu do encaixe com a
 * paleta da loja — reescrever a cor dele é desfazer trabalho certo. Mas o
 * `recolor` do agente é GLOBAL por valor: "todo #FFFFFF de fundo vira
 * #F2F2F2" alcança o bloco tokenizado tanto quanto o legado, e filtrar as
 * faixas servidas ao agente não impede a op de chegar lá. Daí dois
 * movimentos, ambos por código:
 *
 *   1. `htmlSemBlocos` — o que o agente VÊ: o inventário e as faixas são
 *      extraídos de um documento com as regiões tokenizadas em branco (mesmo
 *      comprimento, para os offsets do `contextOf` não mudarem).
 *   2. `preservarBlocos` — o que fica DEPOIS: as regiões tokenizadas são
 *      restauradas do documento de entrada sobre o resultado das ops, pelos
 *      marcadores `cfy:block`. Op que chegou lá é desfeita.
 *
 * Puro (zero I/O).
 */

import { locateBlockRegions } from "./slot-finder"

/** Regiões dos índices dados substituídas por espaço, preservando o comprimento. */
export function htmlSemBlocos(html: string, indices: readonly number[]): string {
  if (indices.length === 0) return html
  const alvo = new Set(indices)
  const regioes = locateBlockRegions(html).filter((r) => alvo.has(r.indice))
  if (regioes.length === 0) return html
  let out = html
  for (const r of regioes) {
    out = out.slice(0, r.range.start) + " ".repeat(r.range.end - r.range.start) + out.slice(r.range.end)
  }
  return out
}

export interface PreservacaoDeBlocos {
  html: string
  /** Índices cujo conteúdo foi restaurado porque o resultado divergia da entrada. */
  restaurados: number[]
  /** Índices pedidos que não existem (por marcador) em um dos dois documentos. */
  nao_localizados: number[]
}

/**
 * Restaura, no `modificado`, o conteúdo ORIGINAL das regiões dos índices
 * dados. Cada região é localizada nos DOIS documentos pelo marcador — o
 * offset não é reaproveitado, porque uma op noutro bloco pode ter mudado o
 * comprimento do documento.
 */
export function preservarBlocos(
  original: string,
  modificado: string,
  indices: readonly number[],
): PreservacaoDeBlocos {
  if (indices.length === 0) return { html: modificado, restaurados: [], nao_localizados: [] }
  const deOrigem = new Map(locateBlockRegions(original).map((r) => [r.indice, r]))
  const restaurados: number[] = []
  const naoLocalizados: number[] = []
  let out = modificado
  // Do fim para o começo: cada splice só mexe em offsets menores que ele.
  const ordenados = [...new Set(indices)].sort((a, b) => b - a)
  for (const i of ordenados) {
    const orig = deOrigem.get(i)
    const atual = locateBlockRegions(out).find((r) => r.indice === i)
    if (!orig || !atual) {
      naoLocalizados.push(i)
      continue
    }
    const conteudoOriginal = original.slice(orig.range.start, orig.range.end)
    const conteudoAtual = out.slice(atual.range.start, atual.range.end)
    if (conteudoOriginal === conteudoAtual) continue
    out = out.slice(0, atual.range.start) + conteudoOriginal + out.slice(atual.range.end)
    restaurados.push(i)
  }
  return { html: out, restaurados: restaurados.sort((a, b) => a - b), nao_localizados: naoLocalizados.sort((a, b) => a - b) }
}
