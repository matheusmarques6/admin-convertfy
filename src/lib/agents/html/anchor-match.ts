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
 * A frase precisa caber INTEIRA em UM nó de texto: frase que atravessa
 * markup (`Use <strong>code</strong>`) não tem range contíguo e cai em
 * sem_lugar:nao_encontrado — o desenho aceita perder esse caso a inventar
 * um splice que engole tags.
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
  /** Texto normalizado do nó. */
  norm: string
  /** Para cada char de `norm`: início no source original. */
  starts: number[]
  /** Para cada char de `norm`: fim (exclusivo) no source original. */
  ends: number[]
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

/**
 * Constrói o índice do documento (ou de um recorte dele — `scope` limita aos
 * nós de texto inteiramente dentro do range, ex.: só a região da hero).
 */
export function buildTextIndex(html: string, scope?: Range): TextIndex {
  const nodes = textNodes(html).filter(
    (n) => !scope || (n.range.start >= scope.start && n.range.end <= scope.end),
  )
  return {
    projections: nodes.map((n) => projectNode(n.text, n.range.start)),
  }
}

/**
 * Todas as ocorrências do example (normalizado) no índice, como ranges do
 * SOURCE original, em ordem de documento. Ocorrência só vale dentro de um
 * único nó de texto.
 */
export function findPhraseOccurrences(index: TextIndex, example: string): Range[] {
  const phrase = normalizeForMatch(example)
  if (!phrase) return []
  const out: Range[] = []
  for (const p of index.projections) {
    let from = 0
    while (true) {
      const at = p.norm.indexOf(phrase, from)
      if (at < 0) break
      out.push({ start: p.starts[at], end: p.ends[at + phrase.length - 1] })
      from = at + 1
    }
  }
  out.sort((a, b) => a.start - b.start)
  return out
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
    const occurrences = findPhraseOccurrences(index, fields[memberIdxs[0]].example)
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
      const range = free[i]
      claimed.push(range)
      results[idx] = {
        field: fields[idx],
        range,
        desfecho: "ancorado_exemplo",
        motivo: undefined,
        de: null, // preenchido abaixo com o slice do source
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
