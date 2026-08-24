/**
 * slot-finder — slots de IMAGEM por token de atributo + regiões de bloco.
 *
 * Os HTMLs das variantes marcam onde cada imagem entra direto no atributo:
 * `src="URL_DA_IMAGEM_1"`, `src="URL_FOTO_PEQUENA_2B"`, `alt="ALT_PRODUTO_3"`.
 * Este módulo encontra esses slots (com range de origem, via regex sobre o
 * source + árvore do dom-locator para o elemento dono) e casa os campos
 * `imagem_gerada` do schema com eles:
 *
 *   - `tip_1_image` (ordinal 1 na key) → token de ordinal 1 do MESMO bloco;
 *   - key sem ordinal → ordem de aparição no bloco;
 *   - `URL_SELO_VERIFICADO` repetido ×3 (mesmo token em três lugares) é UM
 *     grupo — o valor casado preenche todas as ocorrências (groupSlots).
 *
 * O que nunca é slot se autodenuncia (attr-token-vocabulary): base64 é arte
 * fixa, URL http real é asset externo, URL_DO_LOGO_AQUI/NOME_DA_MARCA são
 * estruturais (a plataforma preenche, não o agente de imagem). Duas exceções
 * viram slot SINTÉTICO, porque a `<img>` está declarando placeholder e não
 * arte final: base64 com `alt` de token, e `src` de export de ferramenta de
 * design (que sequer carrega na caixa de entrada).
 *
 * Os limites de bloco vêm dos marcadores `<!-- cfy:block:{i}:{tipo}:start/end -->`
 * do Montador — MESMA gramática do qa-views (mudar lá exige mudar aqui).
 *
 * Puro (zero I/O) — client-safe.
 */

import { buildElementLookup, commentRanges, type Range } from "./dom-locator"
import {
  FIXED_ART_SRC,
  isAltToken,
  isAttrToken,
  isDesignExportUrl,
  isStructuralToken,
  parseAttrToken,
  srcTokenFromAltToken,
} from "./attr-token-vocabulary"

// ── Regiões de bloco (marcadores cfy:block) ────────────────────────────

export interface BlockRegion {
  /** Índice do marcador (ordem no documento). */
  indice: number
  /** Section do marcador (hero, beneficios, produtos...). */
  tipo: string
  /** Conteúdo ENTRE os marcadores, no source original. */
  range: Range
}

// SYNC: qa-views.ts usa a mesma gramática de marcador.
const MARKER_START = /<!--\s*cfy:block:(\d+):([a-z0-9_-]+):start\s*-->/gi

/**
 * Regiões dos blocos pelos marcadores do Montador. Marcador de start sem o
 * end correspondente é ignorado (documento truncado — melhor bloco a menos
 * que range até o fim do arquivo engolindo os vizinhos).
 */
export function locateBlockRegions(html: string): BlockRegion[] {
  const out: BlockRegion[] = []
  for (const m of html.matchAll(MARKER_START)) {
    const indice = Number(m[1])
    const tipo = m[2]
    const start = (m.index ?? 0) + m[0].length
    const endRe = new RegExp(`<!--\\s*cfy:block:${indice}:${tipo}:end\\s*-->`, "i")
    const endMatch = endRe.exec(html.slice(start))
    if (!endMatch) continue
    out.push({ indice, tipo, range: { start, end: start + endMatch.index } })
  }
  return out
}

/**
 * Índices dos blocos que INTERSECTAM o range dado (D5 — substitui a
 * detecção de blocos da hero por tags). Interseção, não continência: a
 * região da hero pode começar no meio de um bloco.
 */
export function blockIndexesInRange(html: string, range: Range): number[] {
  return locateBlockRegions(html)
    .filter((b) => b.range.start < range.end && range.start < b.range.end)
    .map((b) => b.indice)
}

// ── Slots de atributo ──────────────────────────────────────────────────

export interface AttrSlot {
  /** O token cru ("URL_DA_IMAGEM_1"). */
  token: string
  attr: "src" | "alt" | "href"
  /** Range do VALOR (entre as aspas) no source original. */
  valueRange: Range
  /** Range do elemento dono (a <img>/<a>) — null em comentário MSO. */
  imgRange: Range | null
  /** Índice do bloco (cfy:block) que contém o slot — null fora de bloco. */
  blockIndice: number | null
  /** Slot dentro de conditional comment do Outlook (espelho MSO). */
  inMso: boolean
  /**
   * Slot DERIVADO: o token não está no documento — a `<img>` declarou o slot
   * de outra forma (base64 com `alt` de token, ou `src` de export de design).
   * Quem limpa token cru (`stripUnresolvedAttrTokens`) tem de PULAR estes:
   * sem URL, o certo é o que o designer deixou ficar onde está, não virar
   * `src=""`.
   */
  synthetic?: boolean
}

const ATTR_RE = /\b(src|alt|href)\s*=\s*"([^"]*)"/gi

/**
 * Todos os slots de token do documento, em ordem de aparição. Arte fixa
 * (base64), URL real e valor fora da forma nem entram — o filtro é do
 * vocabulário, não daqui.
 */
export function findAttrSlots(html: string): AttrSlot[] {
  const blocks = locateBlockRegions(html)
  const comments = commentRanges(html)
  const elementLookup = buildElementLookup(html)
  const out: AttrSlot[] = []

  for (const m of html.matchAll(ATTR_RE)) {
    const value = m[2].trim()
    if (!isAttrToken(value)) continue
    const attr = m[1].toLowerCase() as AttrSlot["attr"]
    const matchStart = m.index ?? 0
    const valueStart = matchStart + m[0].indexOf('"') + 1
    const valueRange: Range = { start: valueStart, end: valueStart + m[2].length }
    const inMso = comments.some(
      (c) => matchStart >= c.start && matchStart < c.end,
    )
    const block = blocks.find(
      (b) => matchStart >= b.range.start && matchStart < b.range.end,
    )
    out.push({
      token: value,
      attr,
      valueRange,
      imgRange: inMso ? null : (elementLookup(matchStart)?.range ?? null),
      blockIndice: block?.indice ?? null,
      inMso,
    })
  }
  // Ordem de DOCUMENTO: `assignImageSlots` usa "o candidato mais cedo"
  // como 2º critério, e um sintético jogado no fim faria a foto do
  // produto 2 cair no card do 1 numa variante que mistura os dois tipos.
  const sinteticos = [
    ...slotsFromBase64Placeholder(html, out),
    ...slotsFromDesignExport(html, out, { blocks, comments, elementLookup }),
  ]
  return [...out, ...sinteticos].sort(
    (a, b) => a.valueRange.start - b.valueRange.start,
  )
}

/** `src="data:..."` da `<img>` que começa em `start` — range do VALOR. */
function base64SrcRange(html: string, imgRange: Range): Range | null {
  const openEnd = html.indexOf(">", imgRange.start)
  const end = openEnd === -1 || openEnd > imgRange.end ? imgRange.end : openEnd
  const openTag = html.slice(imgRange.start, end)
  const m = /\bsrc\s*=\s*"([^"]*)"/i.exec(openTag)
  if (!m || !FIXED_ART_SRC.test(m[1].trim())) return null
  const valueStart = imgRange.start + (m.index ?? 0) + m[0].indexOf('"') + 1
  return { start: valueStart, end: valueStart + m[1].length }
}

/**
 * `<img>` que declara o slot no `alt` e traz BASE64 no `src`.
 *
 * A regra "base64 é arte fixa" (attr-token-vocabulary) foi escrita para a
 * `<img>` SEM token nenhum — o ícone social, o selo, que têm de sair
 * exatamente como o designer desenhou. Uma `<img>` cujo `alt` É token de
 * slot se autodeclara: aquele base64 é o xadrez de placeholder, não a arte
 * final.
 *
 * Sem isto, `produtos 4 - um produto` gerava a imagem, pagava por ela, e o
 * merge não tinha onde escrever — `sem_lugar/token_nao_encontrado` — e o
 * xadrez cinza viajava até o e-mail entregue (Luxe Lift, 23/08). Seis
 * variantes ativas declaram `imagem_gerada` sem um único `src="URL_…"`.
 */
function slotsFromBase64Placeholder(
  html: string,
  slots: AttrSlot[],
): AttrSlot[] {
  const out: AttrSlot[] = []
  const jaTemSrc = new Set(
    slots.filter((s) => s.attr === "src").map((s) => s.token),
  )
  for (const alt of slots) {
    if (alt.attr !== "alt" || !alt.imgRange) continue
    if (isStructuralToken(alt.token)) continue
    // Só token de imagem: `alt="NOME_DA_MARCA"` no logo é da plataforma, e
    // um alt de texto qualquer não promove base64 a destino de foto.
    if (!isAltToken(alt.token)) continue
    const range = base64SrcRange(html, alt.imgRange)
    if (!range) continue
    const token = srcTokenFromAltToken(alt.token)
    if (jaTemSrc.has(token)) continue
    out.push({
      token,
      attr: "src",
      valueRange: range,
      imgRange: alt.imgRange,
      blockIndice: alt.blockIndice,
      inMso: alt.inMso,
      synthetic: true,
    })
  }
  return out
}

/** Contexto já indexado por `findAttrSlots`, para não reindexar o documento. */
interface DocIndex {
  blocks: BlockRegion[]
  comments: Range[]
  elementLookup: ReturnType<typeof buildElementLookup>
}

const SRC_RE = /\bsrc\s*=\s*"([^"]*)"/gi

/**
 * `<img>` cujo `src` é EXPORT de ferramenta de design.
 *
 * `isResidualUrl` recusava essas `<img>` por regra explícita — "o valor já
 * resolve para uma imagem real e não há o que casar". Na `body 2 - bridge
 * textos linha produtos` as duas molduras vêm com
 * `src="https://www.figma.com/api/mcp/asset/…"`: a imagem do bloco era
 * gerada, paga, e o merge não tinha onde escrever; o que chegava à caixa de
 * entrada era um endereço que não carrega.
 *
 * Diferente do caso base64, aqui o `alt` é vazio — não há nome de onde
 * derivar o token. Ele é sintético e numerado por ordem de aparição no
 * DOCUMENTO, não no bloco: numerar por bloco faria duas variantes com export
 * gerarem `URL_EXPORT_1` cada uma, e `assignImageSlots` agrupa por token —
 * os dois destinos virariam um grupo só, e o segundo bloco ficaria sem
 * candidato. O casamento com os campos cai no 2º critério (ordem de
 * aparição × ordem de declaração), que é o certo para molduras irmãs.
 */
function slotsFromDesignExport(
  html: string,
  slots: AttrSlot[],
  { blocks, comments, elementLookup }: DocIndex,
): AttrSlot[] {
  const usados = new Set(slots.map((s) => s.token))
  const out: AttrSlot[] = []
  let n = 0
  for (const m of html.matchAll(SRC_RE)) {
    const value = m[1].trim()
    if (!isDesignExportUrl(value)) continue
    const matchStart = m.index ?? 0
    const valueStart = matchStart + m[0].indexOf('"') + 1
    // Improvável, mas barato: um `URL_EXPORT_1` de verdade no documento não
    // pode ser sequestrado por um sintético de mesmo nome.
    let token = ""
    do {
      n += 1
      token = `URL_EXPORT_${n}`
    } while (usados.has(token))
    usados.add(token)
    const inMso = comments.some(
      (c) => matchStart >= c.start && matchStart < c.end,
    )
    const block = blocks.find(
      (b) => matchStart >= b.range.start && matchStart < b.range.end,
    )
    out.push({
      token,
      attr: "src",
      valueRange: { start: valueStart, end: valueStart + m[1].length },
      imgRange: inMso ? null : (elementLookup(matchStart)?.range ?? null),
      blockIndice: block?.indice ?? null,
      inMso,
      synthetic: true,
    })
  }
  return out
}

// ── Atribuição campo → slot ────────────────────────────────────────────

export interface ImageField {
  block_id: string | null
  /** Índice do bloco (cfy:block) onde o campo mora — null = documento todo. */
  blockIndice: number | null
  key: string
  /** URL gerada — null quando o agente de imagem não produziu. */
  url: string | null
}

export type ImageDesfecho = "ancorado_token" | "imagem_sem_url" | "sem_lugar"

export interface ImageAssignment {
  field: ImageField
  /** Slot principal (1ª ocorrência do token) — null quando sem_lugar. */
  slot: AttrSlot | null
  /** TODAS as ocorrências do mesmo token (espelhos MSO, selo repetido). */
  groupSlots: AttrSlot[]
  desfecho: ImageDesfecho
}

/** Ordinal da key do schema: "tip_1_image" → 1 (último grupo numérico). */
export function keyOrdinal(key: string): number | null {
  let last: number | null = null
  for (const m of key.matchAll(/_(\d+)(?=_|$)/g)) last = Number(m[1])
  return last
}

/**
 * Casa campos `imagem_gerada` com os slots de src. Regras:
 *   - só slots de `src` que NÃO são estruturais (logo/marca são da
 *     plataforma) e não são `alt` (nesta rodada alt só é limpo);
 *   - slots são agrupados por TOKEN: o mesmo token repetido (espelho MSO,
 *     selo ×3) é UM lugar — o casamento preenche o grupo inteiro;
 *   - campo com blockIndice só casa token do MESMO bloco;
 *   - key com ordinal → token com o MESMO ordinal; sem ordinal (ou sem
 *     token numerado) → ordem de aparição × ordem de declaração;
 *   - campo sem URL → `imagem_sem_url` (a decisão de remover a linha é do
 *     image-merge, que tem o guard rowHasFilledCopy);
 *   - campo sem token disponível → `sem_lugar` (fail-open: telemetria).
 */
export function assignImageSlots(
  slots: AttrSlot[],
  fields: ImageField[],
): ImageAssignment[] {
  // Grupos por token, restritos a src casável, na ordem da 1ª aparição.
  const groupsByToken = new Map<string, AttrSlot[]>()
  for (const s of slots) {
    if (s.attr !== "src" || isStructuralToken(s.token)) continue
    const g = groupsByToken.get(s.token)
    if (g) g.push(s)
    else groupsByToken.set(s.token, [s])
  }

  const taken = new Set<string>()

  const groupsForBlock = (blockIndice: number | null): string[] =>
    [...groupsByToken.entries()]
      .filter(
        ([token, g]) =>
          !taken.has(token) &&
          (blockIndice == null || g[0].blockIndice === blockIndice),
      )
      .map(([token]) => token)

  return fields.map((field) => {
    const candidates = groupsForBlock(field.blockIndice)

    // 1º critério: ordinal da key ↔ ordinal do token (tip_1_image → URL_*_1).
    const ord = keyOrdinal(field.key)
    let chosen: string | null = null
    if (ord != null) {
      chosen =
        candidates.find((t) => parseAttrToken(t)?.ordinal === ord) ?? null
    }
    // 2º critério: ordem de aparição (o candidato mais cedo no documento).
    if (!chosen) chosen = candidates[0] ?? null

    if (!chosen) {
      return { field, slot: null, groupSlots: [], desfecho: "sem_lugar" as const }
    }
    taken.add(chosen)
    const group = groupsByToken.get(chosen)!
    return {
      field,
      slot: group[0],
      groupSlots: group,
      desfecho: field.url ? ("ancorado_token" as const) : ("imagem_sem_url" as const),
    }
  })
}
