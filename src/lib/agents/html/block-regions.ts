/**
 * block-regions — as regiões de bloco do documento, endereçáveis por código.
 *
 * O Montador embrulha cada bloco em
 * `<!-- cfy:block:{i}:{section}:start -->` … `<!-- …:end -->`
 * (`architect/assemble-document.ts`), e cada região é uma `<tr>` da tabela
 * do email. Reordenar ou remover um bloco do email, portanto, é mover ou
 * apagar essas regiões — não redesenhar o documento.
 *
 * Este módulo é o que a edição manual de estrutura usa. Ele segue a regra
 * do `hero-graft`: **recusa em vez de consertar**. Documento sem marcador,
 * marcador órfão, ordem que não é permutação — tudo erro explícito. Um
 * documento remendado por heurística é pior que uma edição que não salvou,
 * porque ninguém percebe.
 *
 * Puro (zero I/O) — testável.
 */

/** Uma região de bloco, com os marcadores incluídos. */
export interface BlockRegion {
  /** Índice do marcador (o `{i}` — ordem de montagem, não de documento). */
  indice: number
  /** Categoria da biblioteca: hero, body, offer, products, reviews, footer… */
  section: string
  /** Offset do primeiro caractere do marcador `start`. */
  inicio: number
  /** Offset logo após o último caractere do marcador `end`. */
  fim: number
  /** O trecho completo, marcadores inclusive. */
  html: string
}

export type BlockRegionsErrorCode =
  | "sem_marcadores"
  | "marcador_orfao"
  | "ordem_invalida"
  | "indice_desconhecido"

export class BlockRegionsError extends Error {
  constructor(
    readonly code: BlockRegionsErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "BlockRegionsError"
  }
}

// SYNC: mesmo formato de BLOCK_MARKER_PATTERN (assemble-document),
// CFY_BLOCK_MARKER (post-process) e MARKER_START (qa-views).
const START = /<!--\s*cfy:block:(\d+):([A-Za-z0-9_-]+):start\s*-->/gi

function endMarkerRe(indice: number, section: string): RegExp {
  return new RegExp(`<!--\\s*cfy:block:${indice}:${section}:end\\s*-->`, "i")
}

/**
 * Lê as regiões na ordem em que aparecem no DOCUMENTO.
 *
 * `indice` vem do marcador e pode estar fora de ordem depois de uma edição
 * — por isso `renumberMarkers` existe. Nunca use o índice como posição.
 */
export function parseBlockRegions(html: string): BlockRegion[] {
  const regions: BlockRegion[] = []
  for (const m of html.matchAll(START)) {
    const inicio = m.index ?? 0
    const indice = Number(m[1])
    const section = m[2]
    const depoisDoStart = inicio + m[0].length
    const endMatch = endMarkerRe(indice, section).exec(html.slice(depoisDoStart))
    if (!endMatch) {
      throw new BlockRegionsError(
        "marcador_orfao",
        `bloco ${indice}:${section} abre e não fecha — documento não é editável`,
      )
    }
    const fim = depoisDoStart + endMatch.index + endMatch[0].length
    regions.push({ indice, section, inicio, fim, html: html.slice(inicio, fim) })
  }
  return regions
}

/** Recorta o documento em prefixo, regiões, separadores e sufixo. */
function split(html: string): {
  regions: BlockRegion[]
  prefixo: string
  separadores: string[]
  sufixo: string
} {
  const regions = parseBlockRegions(html)
  if (regions.length === 0) {
    throw new BlockRegionsError(
      "sem_marcadores",
      "documento sem marcadores de bloco — gerado antes da edição de estrutura",
    )
  }
  const separadores: string[] = []
  for (let i = 1; i < regions.length; i++) {
    separadores.push(html.slice(regions[i - 1].fim, regions[i].inicio))
  }
  return {
    regions,
    prefixo: html.slice(0, regions[0].inicio),
    separadores,
    sufixo: html.slice(regions[regions.length - 1].fim),
  }
}

/**
 * Remonta o documento com as regiões na ordem dada.
 *
 * Os separadores (indentação/quebra entre uma região e a próxima) são
 * reusados POR POSIÇÃO, não por região: o que estava entre a 1ª e a 2ª
 * continua entre a 1ª e a 2ª. É whitespace — reusar por posição mantém a
 * indentação do documento estável em vez de arrastá-la junto do bloco.
 */
function remontar(
  prefixo: string,
  pecas: string[],
  separadores: string[],
  sufixo: string,
): string {
  let out = prefixo
  pecas.forEach((peca, i) => {
    if (i > 0) out += separadores[i - 1] ?? "\n"
    out += peca
  })
  return out + sufixo
}

/**
 * Reordena as regiões. `novaOrdem` é a lista de `indice` na ordem desejada
 * e precisa ser uma PERMUTAÇÃO exata dos índices presentes — nem a mais,
 * nem a menos. Reordenar com lista parcial apagaria blocos em silêncio.
 */
export function reorderRegions(html: string, novaOrdem: number[]): string {
  const { regions, prefixo, separadores, sufixo } = split(html)

  const presentes = regions.map((r) => r.indice)
  const mesmoConjunto =
    novaOrdem.length === presentes.length &&
    new Set(novaOrdem).size === novaOrdem.length &&
    novaOrdem.every((i) => presentes.includes(i))
  if (!mesmoConjunto) {
    throw new BlockRegionsError(
      "ordem_invalida",
      `a ordem [${novaOrdem.join(", ")}] não é uma permutação de [${presentes.join(", ")}]`,
    )
  }

  const porIndice = new Map(regions.map((r) => [r.indice, r.html]))
  return remontar(
    prefixo,
    novaOrdem.map((i) => porIndice.get(i)!),
    separadores,
    sufixo,
  )
}

/** Remove as regiões dos índices dados. Índice ausente é erro, não no-op. */
export function removeRegions(html: string, indices: number[]): string {
  const { regions, prefixo, separadores, sufixo } = split(html)

  const presentes = new Set(regions.map((r) => r.indice))
  for (const i of indices) {
    if (!presentes.has(i)) {
      throw new BlockRegionsError(
        "indice_desconhecido",
        `bloco ${i} não existe no documento`,
      )
    }
  }

  const alvo = new Set(indices)
  const restantes = regions.filter((r) => !alvo.has(r.indice))
  if (restantes.length === 0) {
    // Documento sem nenhuma região é um email vazio: recusa.
    throw new BlockRegionsError(
      "ordem_invalida",
      "remover todos os blocos deixaria o email vazio",
    )
  }
  return remontar(
    prefixo,
    restantes.map((r) => r.html),
    separadores.slice(0, restantes.length - 1),
    sufixo,
  )
}

/**
 * Reescreve os índices dos marcadores para a ordem do DOCUMENTO (0..n-1).
 *
 * Depois de reordenar, os índices ficam fora de ordem (0,1,3,2,4). Consumidor
 * que casa bloco ↔ marcador por índice (`image-merge`) leria a posição
 * errada num resume da fase 2. Renumerar mantém verdadeira a suposição que
 * todo mundo já faz: índice do marcador = posição no email.
 */
export function renumberMarkers(html: string): string {
  const { regions, prefixo, separadores, sufixo } = split(html)
  const pecas = regions.map((r, novo) =>
    r.html
      .replace(
        new RegExp(`(<!--\\s*cfy:block:)${r.indice}(:${r.section}:start\\s*-->)`, "i"),
        `$1${novo}$2`,
      )
      .replace(
        new RegExp(`(<!--\\s*cfy:block:)${r.indice}(:${r.section}:end\\s*-->)`, "i"),
        `$1${novo}$2`,
      ),
  )
  return remontar(prefixo, pecas, separadores, sufixo)
}

/** As sections na ordem do documento — o "shape" do email, para a UI e o log. */
export function sequenceOf(html: string): string[] {
  return parseBlockRegions(html).map((r) => r.section)
}
