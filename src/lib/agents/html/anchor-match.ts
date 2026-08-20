/**
 * anchor-match — casamento de copy por EXAMPLE (endereçamento sem placeholder).
 *
 * A biblioteca real nunca adotou `{{TAG}}`: o `example` do schema é a própria
 * frase que está no HTML da variante. Este módulo encontra essa frase e
 * devolve o RANGE dela no source original, para o copy_merge trocar por
 * splice. Medido sobre as 38 variantes ativas (20/08): 73% casam literal,
 * ~87% com normalização (caixa, tabs/quebras, entidades `&rsquo;`/`&ldquo;`).
 *
 * Regras de desempate (na ordem, ver assignTextAnchors):
 *   1. example normalizado < 4 chars → sem_lugar:frase_curta (herda o
 *      MIN_EXAMPLE_LEN da régua antiga — "OFF" casaria em 6 lugares).
 *   2. example que é JSON array (howto_steps, compare_rows) →
 *      sem_lugar:example_e_json (D9 — partir o array é follow-up de cadastro).
 *   3. examples DISTINTOS do mais LONGO ao mais curto reivindicam ranges:
 *      "Use code CODECODE for XXXX% off" ancora antes de "Use code" e a
 *      contenção deixa de ser colisão (caso real da biblioteca).
 *   4. irmãos com example IDÊNTICO ("Name." em review_1/2/3): nº de
 *      ocorrências livres === nº de campos → ordem de ocorrência × ordem de
 *      declaração; sobrando ocorrência → todos ambíguos (nunca chutar).
 *   5. campo único com 2+ ocorrências livres → ambíguo.
 *
 * A frase casa em UM nó de texto OU num RUN costurado de nós irmãos
 * separados só por `<br>`/wrappers inline (ver STITCH_GAP_RE) — o caso
 * `Product<br>Name 1` que derrubava 23 campos da biblioteca. Âncora
 * costurada continua sendo um range CONTÍGUO do source (as tags do vão
 * saem no splice) e é sinalizada com `costurado: true` na telemetria.
 * Fronteira de bloco (`<td>`, `<div>`) e comentários nunca são cruzados.
 *
 * Puro (zero I/O) — client-safe.
 */

import { textNodes, type Range } from "./dom-locator"

const MIN_EXAMPLE_LEN = 4

// ── Normalização ───────────────────────────────────────────────────────

/**
 * Entidades nomeadas vistas no inventário real + as universais. Entidade
 * desconhecida fica literal (não casa — e não deve: o example é texto puro).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  aacute: "á",
  atilde: "ã",
  ccedil: "ç",
  oacute: "ó",
  otilde: "õ",
  iacute: "í",
  uacute: "ú",
  agrave: "à",
  ecirc: "ê",
  ocirc: "ô",
  acirc: "â",
}

const ENTITY_RE = /^&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/i

function decodeEntity(m: RegExpExecArray): string | null {
  if (m[1]) return String.fromCodePoint(parseInt(m[1], 16))
  if (m[2]) return String.fromCodePoint(parseInt(m[2], 10))
  return NAMED_ENTITIES[m[3].toLowerCase()] ?? null
}

/**
 * Dobra a tipografia "bonita" na forma simples que o example usa: aspas
 * curvas → retas, travessões → hífen, reticências → "...", nbsp → espaço.
 * O designer exporta do Figma com `&rsquo;` e quem cadastra o schema digita
 * apóstrofo reto — os dois lados precisam cair na mesma forma.
 */
function foldChar(ch: string): string {
  switch (ch) {
    case "‘":
    case "’":
    case "ʼ":
      return "'"
    case "“":
    case "”":
      return '"'
    case "–":
    case "—":
      return "-"
    case "…":
      return "..."
    case " ":
      return " "
    default:
      return ch
  }
}

/**
 * Forma canônica de comparação: entidades decodificadas, tipografia dobrada,
 * whitespace (\t \n múltiplos espaços) colapsado em um espaço, trim,
 * minúsculas. É a MESMA régua dos dois lados — example e HTML.
 */
export function normalizeForMatch(s: string): string {
  let out = ""
  let i = 0
  while (i < s.length) {
    if (s[i] === "&") {
      const m = ENTITY_RE.exec(s.slice(i))
      if (m) {
        const decoded = decodeEntity(m)
        if (decoded != null) {
          for (const ch of decoded) out += foldChar(ch)
          i += m[0].length
          continue
        }
      }
    }
    out += foldChar(s[i])
    i++
  }
  return out.replace(/\s+/g, " ").trim().toLowerCase()
}

// ── Índice de texto com projeção normalizada ──────────────────────────

interface NodeProjection {
  /** Texto normalizado do nó (ou do RUN costurado de nós irmãos). */
  norm: string
  /** Para cada char de `norm`: início no source original. */
  starts: number[]
  /** Para cada char de `norm`: fim (exclusivo) no source original. */
  ends: number[]
  /**
   * Índices em `norm` dos espaços SINTÉTICOS de costura (projeção de run).
   * Ocorrência cujo miolo atravessa um joint = âncora costurada — o range
   * devolvido engole as tags do vão (`<br>`, wrappers inline) e o splice
   * as remove junto. Ausente em projeção de nó único.
   */
  joints?: number[]
}

/**
 * Índice opaco: nós de texto (via parse5 do dom-locator) com a projeção
 * normalizada e o mapa char→offset de origem. Construir uma vez por
 * documento; as buscas depois são indexOf sobre strings.
 */
export interface TextIndex {
  projections: NodeProjection[]
}

function projectNode(text: string, base: number): NodeProjection {
  const norm: string[] = []
  const starts: number[] = []
  const ends: number[] = []

  // Run de whitespace pendente: vira UM espaço quando (e se) chegar conteúdo
  // depois dele — leading/trailing somem, como no normalizeForMatch.
  let wsStart = -1
  let wsEnd = -1

  const push = (ch: string, srcStart: number, srcEnd: number) => {
    if (/\s/.test(ch)) {
      if (wsStart < 0) wsStart = srcStart
      wsEnd = srcEnd
      return
    }
    if (wsStart >= 0 && norm.length > 0) {
      norm.push(" ")
      starts.push(wsStart)
      ends.push(wsEnd)
    }
    wsStart = -1
    norm.push(ch.toLowerCase())
    starts.push(srcStart)
    ends.push(srcEnd)
  }

  let i = 0
  while (i < text.length) {
    let consumed = 1
    let decoded: string | null = null
    if (text[i] === "&") {
      const m = ENTITY_RE.exec(text.slice(i))
      if (m) {
        const d = decodeEntity(m)
        if (d != null) {
          decoded = d
          consumed = m[0].length
        }
      }
    }
    const srcStart = base + i
    const srcEnd = base + i + consumed
    const chars = decoded ?? text[i]
    for (const raw of chars) {
      for (const ch of foldChar(raw)) push(ch, srcStart, srcEnd)
    }
    i += consumed
  }

  return { norm: norm.join(""), starts, ends }
}

// ── Costura de nós de texto (frase partida por markup) ─────────────────
//
// Caso real (Luxe Lift, produto 8): o HTML escreve `Product<br>Name 1` e o
// example "Product Name 1" nunca cabia num nó só — 23 campos da biblioteca
// caíam em sem_lugar por isso. Um RUN costura nós de texto consecutivos
// cujo VÃO no source contém apenas whitespace e tags "atravessáveis":
// quebras (`<br>`, `<wbr>`) e wrappers inline (span/strong/em/b/i/u/a/…).
// Como os segmentos são adjacentes no source, a âncora do run é um range
// CONTÍGUO (início do 1º char casado → fim do último) — o splice existente
// funciona sem mudança e as tags do vão saem junto com a frase antiga
// (a quebra visual volta a ser natural, por largura).
//
// O vão é julgado pelo SOURCE, não pela árvore: atravessar um `</td>`, um
// `<div>` ou um comentário reprova o regex e o run quebra ali — nunca se
// costura através de fronteira de bloco nem de conditional comment MSO.

const STITCH_GAP_RE =
  /^(?:\s|<\/?(?:br|wbr|span|strong|em|b|i|u|a|sup|sub|small|font)\b[^>]*>)*$/i

/** Teto de segmentos por run — rodapés com muitos `<br>` não viram mega-run. */
const MAX_RUN_SEGMENTS = 8

function stitchRuns(
  html: string,
  nodes: Array<{ range: Range; text: string }>,
  projections: NodeProjection[],
): NodeProjection[] {
  const runs: NodeProjection[] = []
  let i = 0
  while (i < nodes.length - 1) {
    // Estende a cadeia enquanto o vão até o próximo nó for atravessável.
    let end = i
    while (
      end < nodes.length - 1 &&
      end - i + 1 < MAX_RUN_SEGMENTS &&
      nodes[end + 1].range.start > nodes[end].range.end &&
      STITCH_GAP_RE.test(
        html.slice(nodes[end].range.end, nodes[end + 1].range.start),
      )
    ) {
      end++
    }
    if (end > i) {
      const norm: string[] = []
      const starts: number[] = []
      const ends: number[] = []
      const joints: number[] = []
      for (let s = i; s <= end; s++) {
        if (s > i) {
          // Espaço sintético mapeado no VÃO inteiro — se uma ocorrência
          // começasse/terminasse nele o range engordaria, mas frase
          // normalizada nunca começa nem termina em espaço (trim).
          joints.push(norm.length)
          norm.push(" ")
          starts.push(nodes[s - 1].range.end)
          ends.push(nodes[s].range.start)
        }
        const p = projections[s]
        for (let c = 0; c < p.norm.length; c++) {
          norm.push(p.norm[c])
          starts.push(p.starts[c])
          ends.push(p.ends[c])
        }
      }
      runs.push({ norm: norm.join(""), starts, ends, joints })
    }
    i = end > i ? end : i + 1
  }
  return runs
}

/**
 * Constrói o índice do documento (ou de um recorte dele — `scope` limita aos
 * nós de texto inteiramente dentro do range, ex.: só a região da hero).
 * Inclui as projeções por nó E os runs costurados (ver STITCH_GAP_RE);
 * ocorrências duplicadas entre as duas formas são deduplicadas na busca.
 */
export function buildTextIndex(html: string, scope?: Range): TextIndex {
  const nodes = textNodes(html).filter(
    (n) => !scope || (n.range.start >= scope.start && n.range.end <= scope.end),
  )
  const projections = nodes.map((n) => projectNode(n.text, n.range.start))
  return {
    projections: [...projections, ...stitchRuns(html, nodes, projections)],
  }
}

export interface PhraseOccurrence extends Range {
  /** true = a ocorrência atravessa um vão costurado (`<br>`/wrapper inline). */
  costurado: boolean
}

/**
 * Todas as ocorrências do example (normalizado) no índice, como ranges do
 * SOURCE original, em ordem de documento. Vale ocorrência em nó único E em
 * run costurado; frase inteira dentro de um segmento aparece nas duas
 * projeções com o MESMO range — dedup por (start,end), preferindo a forma
 * não-costurada.
 */
export function findPhraseOccurrencesDetailed(
  index: TextIndex,
  example: string,
): PhraseOccurrence[] {
  const phrase = normalizeForMatch(example)
  if (!phrase) return []
  const byRange = new Map<string, PhraseOccurrence>()
  for (const p of index.projections) {
    let from = 0
    while (true) {
      const at = p.norm.indexOf(phrase, from)
      if (at < 0) break
      const occ: PhraseOccurrence = {
        start: p.starts[at],
        end: p.ends[at + phrase.length - 1],
        costurado:
          p.joints != null &&
          p.joints.some((j) => j > at && j < at + phrase.length - 1),
      }
      const key = `${occ.start}-${occ.end}`
      const prev = byRange.get(key)
      if (!prev || (prev.costurado && !occ.costurado)) byRange.set(key, occ)
      from = at + 1
    }
  }
  return Array.from(byRange.values()).sort((a, b) => a.start - b.start)
}

export function findPhraseOccurrences(index: TextIndex, example: string): Range[] {
  return findPhraseOccurrencesDetailed(index, example).map(({ start, end }) => ({
    start,
    end,
  }))
}

// ── Atribuição campo → range ───────────────────────────────────────────

export interface AnchorField {
  block_id: string | null
  key: string
  example: string
  value: string
}

export type AnchorDesfecho = "ancorado_exemplo" | "ambiguo" | "sem_lugar"

export type AnchorMotivo =
  | "nao_encontrado"
  | "frase_curta"
  | "example_e_json"
  | "ocorrencias_excedem_campos"
  | "ocorrencias_insuficientes"
  | "range_ja_tomado"

export interface AnchorAssignment {
  field: AnchorField
  /** Range no source original — só quando ancorado. */
  range: Range | null
  desfecho: AnchorDesfecho
  motivo?: AnchorMotivo
  /** Trecho original que será substituído (trunc 120) — só quando ancorado. */
  de: string | null
  /** true = âncora costurada através de `<br>`/wrapper inline (telemetria). */
  costurado?: boolean
}

function isJsonArrayExample(example: string): boolean {
  const t = example.trim()
  if (!t.startsWith("[")) return false
  try {
    return Array.isArray(JSON.parse(t))
  } catch {
    return false
  }
}

function intersects(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Casa cada campo com um range do documento, aplicando as 5 regras do topo
 * do arquivo. Devolve NA ORDEM dos campos de entrada (o report do merge
 * preserva a ordem de declaração do schema). Fail-open por contrato: nenhum
 * desfecho aqui derruba nada — sem_lugar/ambiguo são telemetria e o campo
 * simplesmente não é escrito.
 */
export function assignTextAnchors(
  index: TextIndex,
  fields: AnchorField[],
): AnchorAssignment[] {
  const results = new Array<AnchorAssignment | null>(fields.length).fill(null)
  const claimed: Range[] = []

  // Grupos por example NORMALIZADO, preservando a ordem de declaração dos
  // membros (é ela que casa com a ordem de ocorrência nos irmãos idênticos).
  const groups = new Map<string, number[]>()
  const groupOrder: string[] = []

  fields.forEach((f, idx) => {
    if (isJsonArrayExample(f.example)) {
      results[idx] = {
        field: f,
        range: null,
        desfecho: "sem_lugar",
        motivo: "example_e_json",
        de: null,
      }
      return
    }
    const norm = normalizeForMatch(f.example)
    if (norm.length < MIN_EXAMPLE_LEN) {
      results[idx] = {
        field: f,
        range: null,
        desfecho: "sem_lugar",
        motivo: "frase_curta",
        de: null,
      }
      return
    }
    const list = groups.get(norm)
    if (list) list.push(idx)
    else {
      groups.set(norm, [idx])
      groupOrder.push(norm)
    }
  })

  // Mais longo primeiro; empate mantém a ordem de declaração (estável).
  const ordered = [...groupOrder].sort((a, b) => b.length - a.length)

  for (const norm of ordered) {
    const memberIdxs = groups.get(norm)!
    const occurrences = findPhraseOccurrencesDetailed(
      index,
      fields[memberIdxs[0]].example,
    )
    const free = occurrences.filter((o) => !claimed.some((c) => intersects(o, c)))

    const fail = (motivo: AnchorMotivo) => {
      for (const idx of memberIdxs) {
        results[idx] = {
          field: fields[idx],
          range: null,
          desfecho: motivo === "nao_encontrado" || motivo === "range_ja_tomado" ? "sem_lugar" : "ambiguo",
          motivo,
          de: null,
        }
      }
    }

    if (occurrences.length === 0) {
      fail("nao_encontrado")
      continue
    }
    if (free.length === 0) {
      // Existia no HTML, mas um example mais longo (que o contém) já levou.
      fail("range_ja_tomado")
      continue
    }
    if (free.length > memberIdxs.length) {
      // Mais lugares que campos — chutar escreveria a copy na frase errada.
      fail("ocorrencias_excedem_campos")
      continue
    }
    if (free.length < memberIdxs.length) {
      // Menos lugares que campos: impossível saber quais campos entram.
      fail("ocorrencias_insuficientes")
      continue
    }

    // free.length === memberIdxs.length: ordem de ocorrência × declaração.
    memberIdxs.forEach((idx, i) => {
      const occ = free[i]
      const range = { start: occ.start, end: occ.end }
      claimed.push(range)
      results[idx] = {
        field: fields[idx],
        range,
        desfecho: "ancorado_exemplo",
        motivo: undefined,
        de: null, // preenchido abaixo com o slice do source
        ...(occ.costurado ? { costurado: true } : {}),
      }
    })
  }

  return results.map((r) => r!) // todo índice foi preenchido acima
}

/**
 * Preenche o `de` (trecho original) dos ancorados — separado porque o
 * assign não precisa do html inteiro, só do índice.
 */
export function withOriginalSlices(
  html: string,
  assignments: AnchorAssignment[],
): AnchorAssignment[] {
  return assignments.map((a) =>
    a.range
      ? { ...a, de: html.slice(a.range.start, a.range.end).slice(0, 120) }
      : a,
  )
}
