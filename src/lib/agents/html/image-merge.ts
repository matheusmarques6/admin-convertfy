/**
 * image-merge — escrita DETERMINÍSTICA das imagens nos tokens de atributo
 * (F3 do endereçamento sem placeholder). Substitui o LLM do image_format:
 * o slot se autodenuncia no próprio HTML (`src="URL_DA_IMAGEM_1"`) e o
 * casamento campo↔token é mecânico (slot-finder) — não há juízo a tomar.
 *
 * Regras:
 *   - campo `imagem_gerada` com URL → escreve em TODAS as ocorrências do
 *     token casado (espelho MSO, selo repetido);
 *   - campo SEM URL (geração falhou/limite) → remove a <tr> quando a linha
 *     é removível (sem outro token de imagem e sem copy preenchida — guard
 *     rowHasFilledCopy, o mesmo que salvou os depoimentos da Luxe Lift);
 *     senão o token vira "" e o pruneEmptyShells/strip limpa a casca;
 *   - `alt="ALT_X"` → `alt=""` (decisão 20/08: preencher alt fica para o
 *     próximo ciclo — nesta rodada só limpa o token cru);
 *   - a região da hero (sentinelas cfy:hero) é INTOCÁVEL — a imagem da
 *     hero é posse do agente de hero;
 *   - LEGADO: tokens `{{X_IMAGE}}` dos templates globais são trocados pela
 *     URL do imageMap por tag (o {{X_IMAGE_ALT}} companheiro vira "") —
 *     morre junto com o caminho full-doc.
 *
 * Puro (zero I/O) — testável.
 */

import { isAltToken } from "./attr-token-vocabulary"
import {
  applySplices,
  enclosingRow,
  rowHasFilledCopy,
  type Range,
  type Splice,
} from "./dom-locator"
import { extractHeroBySentinels } from "./hero-locator"
import {
  assignImageSlots,
  findAttrSlots,
  locateBlockRegions,
  type AttrSlot,
  type ImageField,
} from "./slot-finder"
import { deriveFieldNature } from "../shared/component-dimensions"
import type { CampoMergeLog, MergeBlock } from "./copy-merge"

export interface ImageMergeMapEntry {
  block_type: string
  url: string
  /** Tag legada ({{HERO_IMAGE}}) — só o caminho {{}} consome. */
  tag?: string | null
  /** email_blocks.position (1-based) — amarra a URL ao bloco certo. */
  position?: number | null
  /**
   * Key do campo `imagem_gerada` que esta URL preenche. É o endereço exato
   * desde que a geração passou a ser por slot; sem ele a entrada só resolve
   * no nível do bloco (caminho legado).
   */
  field_key?: string | null
}

export interface ImageMergeInput {
  html: string
  blocks: MergeBlock[]
  imageMap: ImageMergeMapEntry[]
}

export interface ImageMergeReport {
  /** Campos imagem_gerada processados. */
  slots_total: number
  /** Campos escritos no documento. */
  merged: number
  campos: CampoMergeLog[]
  /** Tokens ALT_* limpos (alt=""). */
  alts_limpos: number
  /** Keys cujas linhas foram removidas (campo sem URL, linha removível). */
  rows_removidas: string[]
}

const truncate = (s: string, max = 120): string =>
  s.length > max ? s.slice(0, max) : s

function inRange(offset: number, range: Range | null): boolean {
  return !!range && offset >= range.start && offset < range.end
}

/**
 * Mapa bloco → índice do marcador cfy:block, pela MESMA convenção
 * sequencial do qa-views: n-ésimo marcador do tipo T casa com o n-ésimo
 * bloco de block_type T.
 */
function markerIndiceByBlock(
  html: string,
  blocks: MergeBlock[],
): Map<MergeBlock, number> {
  const markers = locateBlockRegions(html)
  const nthSeen = new Map<string, number>()
  const out = new Map<MergeBlock, number>()
  for (const m of markers) {
    const nth = nthSeen.get(m.tipo) ?? 0
    nthSeen.set(m.tipo, nth + 1)
    const matches = blocks.filter((b) => b.block_type === m.tipo)
    const block = matches[nth]
    if (block) out.set(block, m.indice)
  }
  return out
}

/**
 * URL gerada para o bloco, sem distinguir campo. LEGADO: só serve a blocos
 * gerados antes da geração por slot (uma imagem, gravada em
 * `content.image_url`). Quando o imageMap traz `field_key`, quem manda é
 * `urlForField`.
 */
function urlForBlock(
  block: MergeBlock,
  imageMap: ImageMergeMapEntry[],
  nthOfType: number,
): string | null {
  const byPosition = imageMap.find(
    (e) => e.position != null && block.position != null && e.position === block.position,
  )
  if (byPosition) return byPosition.url || null
  const sameType = imageMap.filter((e) => e.block_type === block.block_type)
  return sameType[nthOfType]?.url || null
}

/**
 * URL do campo, quando o imageMap a endereça por `field_key`. Restringe ao
 * bloco (por `position`, ou pelo tipo quando o mapa não a carrega) para que
 * dois blocos com o mesmo nome de slot não roubem a imagem um do outro —
 * `product_1_photo` existe em mais de uma variante de produtos.
 */
function urlForField(
  block: MergeBlock,
  imageMap: ImageMergeMapEntry[],
  fieldKey: string,
): string | null {
  const hit = imageMap.find(
    (e) =>
      e.field_key === fieldKey &&
      (e.position != null && block.position != null
        ? e.position === block.position
        : e.block_type === block.block_type),
  )
  return hit?.url || null
}

// Token de imagem LEGADO ({{X_IMAGE}}) — templates globais full-doc.
const LEGACY_TAG_TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

export function imageMerge(input: ImageMergeInput): {
  html: string
  report: ImageMergeReport
} {
  const { html, blocks, imageMap } = input
  const hero = extractHeroBySentinels(html)
  const outsideHero = (offset: number) => !inRange(offset, hero)

  const allSlots = findAttrSlots(html).filter((s) =>
    outsideHero(s.valueRange.start),
  )
  const indiceByBlock = markerIndiceByBlock(html, blocks)

  // ── Campos imagem_gerada, cada um com a SUA URL ─────────────────────
  //
  // A geração é por slot (uma imagem por campo `imagem_gerada`), então cada
  // campo se endereça por `field_key` no imageMap. Até 22/08 só o PRIMEIRO
  // campo do bloco recebia URL e os demais viravam `imagem_sem_url` — foi
  // assim que o Welcome 1 da Luxe Lift saiu com 12 dos 18 `<img>` em
  // `src=""` (a variante `produtos 7` declara 8 slots e recebia 1).
  //
  // O fallback por BLOCO continua para o que foi gerado antes da mudança:
  // bloco cujo imageMap não traz `field_key` NENHUM mantém a regra antiga —
  // primeiro campo leva a imagem única, o resto fica sem URL.
  //
  // Os dois caminhos são EXCLUSIVOS de propósito. Misturá-los faria um slot
  // sem imagem própria herdar a URL do bloco só por ser o primeiro da lista
  // — e o primeiro pode ser justamente um que a geração pulou (lockup), que
  // então exibiria a foto da hero no lugar do wordmark.
  const fields: ImageField[] = []
  const nthOfTypeSeen = new Map<string, number>()
  for (const b of blocks) {
    const nth = nthOfTypeSeen.get(b.block_type ?? "") ?? 0
    nthOfTypeSeen.set(b.block_type ?? "", nth + 1)
    const perField = b.fields.some(
      (f) =>
        deriveFieldNature(f) === "imagem_gerada" &&
        urlForField(b, imageMap, f.key) != null,
    )
    const blockUrl = perField ? null : urlForBlock(b, imageMap, nth)
    let first = true
    for (const f of b.fields) {
      if (deriveFieldNature(f) !== "imagem_gerada") continue
      fields.push({
        block_id: b.block_id ?? null,
        blockIndice: indiceByBlock.get(b) ?? null,
        key: f.key,
        url: perField
          ? urlForField(b, imageMap, f.key)
          : first
            ? blockUrl
            : null,
      })
      first = false
    }
  }

  const assignments = assignImageSlots(allSlots, fields)

  const campos: CampoMergeLog[] = []
  const rowsRemovidas: string[] = []
  const splices: Splice[] = []
  const removedRows: Range[] = []
  let merged = 0

  const otherImageTokenInRow = (row: Range, token: string): boolean =>
    allSlots.some(
      (s) =>
        s.attr === "src" &&
        s.token !== token &&
        s.valueRange.start >= row.start &&
        s.valueRange.start < row.end,
    )

  for (const a of assignments) {
    const base: CampoMergeLog = {
      block_id: a.field.block_id,
      key: a.field.key,
      desfecho: a.desfecho,
      de: a.slot ? a.slot.token : null,
      para: null,
    }
    if (a.desfecho === "sem_lugar") {
      campos.push({ ...base, motivo: "token_nao_encontrado" })
      continue
    }
    if (a.desfecho === "ancorado_token" && a.field.url) {
      for (const s of a.groupSlots) {
        splices.push({ ...s.valueRange, replacement: a.field.url })
      }
      merged++
      campos.push({ ...base, para: truncate(a.field.url) })
      continue
    }
    // imagem_sem_url: remover a linha quando é seguro; senão limpar o token.
    const slot = a.slot as AttrSlot
    const row = slot.inMso ? null : enclosingRow(html, slot.valueRange.start)
    const removable =
      row &&
      outsideHero(row.start) &&
      !otherImageTokenInRow(row, slot.token) &&
      !rowHasFilledCopy(html.slice(row.start, row.end))
    if (removable && row) {
      splices.push({ ...row, replacement: "" })
      removedRows.push(row)
      rowsRemovidas.push(a.field.key)
      campos.push({ ...base, motivo: "linha_removida" })
    } else {
      for (const s of a.groupSlots) {
        splices.push({ ...s.valueRange, replacement: "" })
      }
      campos.push({ ...base, motivo: "token_limpo" })
    }
  }

  // ── alt="ALT_X" → alt="" (só limpar, decisão 20/08) ─────────────────
  let altsLimpos = 0
  for (const s of allSlots) {
    if (s.attr !== "alt" || !isAltToken(s.token)) continue
    splices.push({ ...s.valueRange, replacement: "" })
    altsLimpos++
  }

  // ── LEGADO: {{X_IMAGE}} por tag do imageMap ──────────────────────────
  const legacyByTag = new Map<string, string>()
  for (const e of imageMap) {
    if (e.tag && e.url) legacyByTag.set(e.tag.replace(/[{}\s]/g, ""), e.url)
  }
  if (legacyByTag.size > 0) {
    for (const m of html.matchAll(LEGACY_TAG_TOKEN)) {
      const start = m.index ?? 0
      if (!outsideHero(start)) continue
      const tag = m[1]
      const end = start + m[0].length
      if (legacyByTag.has(tag)) {
        splices.push({ start, end, replacement: legacyByTag.get(tag)! })
        merged++
        campos.push({
          block_id: null,
          key: tag,
          desfecho: "ancorado_token",
          de: tag,
          para: truncate(legacyByTag.get(tag)!),
        })
      } else if (tag.endsWith("_ALT") && legacyByTag.has(tag.slice(0, -4))) {
        splices.push({ start, end, replacement: "" })
      }
    }
  }

  // Splice dentro de linha REMOVIDA seria rejeitado por sobreposição — e a
  // rejeição derrubaria a REMOÇÃO (o applySplices aplica da direita pra
  // esquerda e o de dentro vem primeiro). Filtra antes.
  const survivors = splices.filter(
    (s) =>
      removedRows.some((r) => r.start === s.start && r.end === s.end) ||
      !removedRows.some((r) => s.start >= r.start && s.end <= r.end),
  )

  const res = applySplices(html, survivors)

  return {
    html: res.html,
    report: {
      slots_total: fields.length,
      merged,
      campos,
      alts_limpos: altsLimpos,
      rows_removidas: rowsRemovidas,
    },
  }
}
