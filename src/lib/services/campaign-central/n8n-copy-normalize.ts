/**
 * Normalização defensiva do payload que o n8n posta no callback de copy de
 * campanha (`POST /api/webhooks/n8n/campaign-copy`), aplicada ANTES da
 * validação Zod (`campaignCopyCallbackSchema`).
 *
 * Porquê: o n8n é alimentado por um LLM cujo output varia em detalhes de
 * formato. Sem coerção, UM único campo fora do esperado (ex.: `type:"paragraph"`,
 * `columns:"2"`, `status:"completed"`, `price:199`) derruba o payload INTEIRO
 * com HTTP 400 no `safeParse`, e a copy do n8n nunca chega em `copy_results`
 * (a aba acaba mostrando o fallback genérico do watchdog).
 *
 * Princípio: coage TIPO e mapeia SINÔNIMOS óbvios; **não inventa conteúdo nem
 * mascara erro legítimo** — `subject` vazio e `blocks` vazio continuam inválidos
 * (a validação real segue valendo, esses casos viram 400/erro como antes).
 *
 * A função é pura e testável isoladamente (`n8n-copy-normalize.test.ts`).
 */

/** Os 8 tipos de bloco aceitos pelo `emailDraftBlockSchema`. */
const BLOCK_TYPES = [
  "image",
  "heading",
  "text",
  "offer",
  "button",
  "divider",
  "footer",
  "products",
] as const

type BlockType = (typeof BLOCK_TYPES)[number]

const BLOCK_TYPE_SET = new Set<string>(BLOCK_TYPES)

/** Sinônimos comuns que um LLM gera para os 8 tipos canônicos. */
const TYPE_SYNONYMS: Record<string, BlockType> = {
  // text
  paragraph: "text",
  p: "text",
  body: "text",
  copy: "text",
  richtext: "text",
  rich_text: "text",
  content: "text",
  // heading
  title: "heading",
  header: "heading",
  headline: "heading",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  subheading: "heading",
  subtitle: "heading",
  // image
  img: "image",
  picture: "image",
  photo: "image",
  banner: "image",
  hero: "image",
  // button
  cta: "button",
  link: "button",
  btn: "button",
  action: "button",
  // divider
  separator: "divider",
  hr: "divider",
  spacer: "divider",
  rule: "divider",
  line: "divider",
  // products
  product: "products",
  product_list: "products",
  productlist: "products",
  product_grid: "products",
  grid: "products",
  // offer
  coupon: "offer",
  discount: "offer",
  deal: "offer",
  promo: "offer",
  promotion: "offer",
  // footer
  foot: "footer",
  bottom: "footer",
}

/** type → canônico (enum direto > sinônimo > fallback `text`). */
function coerceType(raw: unknown): BlockType {
  if (typeof raw === "string") {
    const norm = raw.trim().toLowerCase()
    if (BLOCK_TYPE_SET.has(norm)) return norm as BlockType
    if (TYPE_SYNONYMS[norm]) return TYPE_SYNONYMS[norm]
  }
  return "text"
}

/** columns → `2 | 3` (aceita string "2"/"3"); inválido vira `undefined` (removido). */
function coerceColumns(raw: unknown): 2 | 3 | undefined {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw.trim(), 10)
        : Number.NaN
  if (n === 2) return 2
  if (n === 3) return 3
  return undefined
}

/** Campo de texto: mantém string; coage number/boolean → string; senão `undefined`. */
function coerceText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw)
  return undefined
}

const TEXT_FIELDS = ["headline", "sub", "value", "caption"] as const
const ITEM_FIELDS = ["name", "price", "image_caption"] as const

/** True se o valor é uma string com conteúdo (após trim). */
export function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0
}

/**
 * Sinônimos de NOME DE CAMPO (nível do bloco). O n8n/LLM às vezes nomeia o
 * conteúdo fora do canônico do `emailDraftBlockSchema` (ex.: `body`/`cta_text`
 * em vez de `value`, `title` em vez de `headline`). Sem mapear, o Zod stripa
 * esses campos e o bloco aparece VAZIO no preview ("diz 11, mostra menos").
 */
const FIELD_SYNONYMS: Record<string, string> = {
  body: "value",
  text: "value",
  content: "value",
  copy: "value",
  paragraph: "value",
  description: "value",
  desc: "value",
  cta_text: "value",
  button_text: "value",
  label: "value",
  title: "headline",
  header: "headline",
  subtitle: "sub",
  subheadline: "sub",
  subheading: "sub",
  subhead: "sub",
  alt: "caption",
  image_alt: "caption",
  image_description: "caption",
}

/** Sinônimos de campo dentro de cada item de `products`. */
const ITEM_FIELD_SYNONYMS: Record<string, string> = {
  title: "name",
  product_name: "name",
  product: "name",
  cost: "price",
  amount: "price",
}

/**
 * Move conteúdo de campos-sinônimo pro nome canônico, só quando o canônico
 * ainda está vazio (campo direto sempre vence). Coage o valor a string e
 * remove o alias pra não deixar lixo no objeto persistido.
 */
function applyFieldSynonyms(
  out: Record<string, unknown>,
  source: Record<string, unknown>,
  synonyms: Record<string, string>,
): void {
  for (const [alias, canonical] of Object.entries(synonyms)) {
    if (alias in source && !hasText(out[canonical])) {
      const v = coerceText(source[alias])
      if (v && v.trim()) out[canonical] = v
    }
    if (alias !== canonical && alias in out) delete out[alias]
  }
}

function normalizeItem(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {}
  const item = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...item }
  for (const k of ITEM_FIELDS) {
    if (k in item) {
      const v = coerceText(item[k])
      if (v === undefined) delete out[k]
      else out[k] = v
    }
  }
  applyFieldSynonyms(out, item, ITEM_FIELD_SYNONYMS)
  return out
}

function normalizeBlock(raw: unknown): Record<string, unknown> {
  // Bloco não-objeto (ex.: string solta) → vira um bloco de texto.
  if (typeof raw !== "object" || raw === null) {
    return { type: "text", value: coerceText(raw) ?? "" }
  }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...b, type: coerceType(b.type) }

  // id não-string → remove (o handler regenera com newBlockId()).
  if ("id" in b && typeof b.id !== "string") delete out.id

  for (const k of TEXT_FIELDS) {
    if (k in b) {
      const v = coerceText(b[k])
      if (v === undefined) delete out[k]
      else out[k] = v
    }
  }

  // Mapeia nomes de campo alternativos (body→value, title→headline…) pros
  // canônicos. Roda DEPOIS dos diretos pra que o campo canônico explícito vença.
  applyFieldSynonyms(out, b, FIELD_SYNONYMS)

  if ("columns" in b) {
    const c = coerceColumns(b.columns)
    if (c === undefined) delete out.columns
    else out.columns = c
  }

  if (Array.isArray(b.items)) {
    out.items = (b.items as unknown[]).map(normalizeItem)
  }

  return out
}

const STATUS_SUCCESS = new Set([
  "success",
  "succeeded",
  "ok",
  "complete",
  "completed",
  "done",
  "sucesso",
])
const STATUS_ERROR = new Set(["error", "errored", "fail", "failed", "failure", "erro"])

/** status → `success | error` quando reconhecível; senão mantém (deixa o schema decidir). */
function coerceStatus(raw: unknown): unknown {
  if (typeof raw !== "string") return raw
  const norm = raw.trim().toLowerCase()
  if (STATUS_SUCCESS.has(norm)) return "success"
  if (STATUS_ERROR.has(norm)) return "error"
  return raw
}

/**
 * Junta TODO o texto de um bloco do n8n num parágrafo — qualquer campo de texto
 * (canônico ou apelido) + os itens de produtos. Varre todas as strings do
 * objeto pra não perder conteúdo com nome inesperado; pula metadados e
 * links/imagens (que poluiriam o texto). Numbers/booleans viram string.
 */
function blockToPlainText(raw: unknown): string {
  const lines: string[] = []
  const seen = new Set<string>()
  const push = (v: unknown) => {
    const t = coerceText(v)?.trim()
    if (!t || seen.has(t)) return
    lines.push(t)
    seen.add(t)
  }

  if (typeof raw !== "object" || raw === null) {
    push(raw)
    return lines.join("\n")
  }
  const b = raw as Record<string, unknown>

  // Ordem de leitura natural (título → corpo → cta).
  const ORDER = [
    "headline", "title", "header", "heading",
    "sub", "subtitle", "subheadline", "subheading", "subhead",
    "value", "body", "text", "content", "copy", "paragraph", "description", "desc",
    "caption", "cta_text", "button_text", "label",
  ]
  for (const k of ORDER) push(b[k])

  // Qualquer outra string não-coberta (nome de campo inesperado), exceto
  // metadados e links/imagens.
  const SKIP = new Set<string>([
    ...ORDER, "type", "id", "section", "columns", "items",
    "url", "link", "href", "src", "image", "image_url", "image_src",
    "image_caption", "link_url", "button_url", "cta_url",
  ])
  for (const [k, v] of Object.entries(b)) {
    if (!SKIP.has(k) && typeof v === "string") push(v)
  }

  // Produtos: "Nome — Preço" por item.
  if (Array.isArray(b.items)) {
    for (const it of b.items) {
      if (typeof it !== "object" || it === null) continue
      const item = it as Record<string, unknown>
      const name = coerceText(item.name ?? item.title ?? item.product_name ?? item.product)?.trim()
      const price = coerceText(item.price ?? item.cost ?? item.amount)?.trim()
      const parts = [name, price].filter((p): p is string => !!p)
      if (parts.length) push(`• ${parts.join(" — ")}`)
    }
  }

  return lines.join("\n")
}

/**
 * Junta todos os blocos do n8n num texto único (a copy inteira). Exportado pra
 * reuso no DISPATCH (enviar a master como 1 bloco) e no fallback inline.
 */
export function collapseBlocksToText(blocks: unknown[]): string {
  return blocks
    .map(blockToPlainText)
    .filter((t) => t.length > 0)
    .join("\n\n")
}

// ── Fatiamento por seção (HERO/REVIEW/FOOTER…) ───────────────────────────

/**
 * Marcador de seção: heading markdown em linha própria (`## HERO`, `### Review`).
 * Usamos `#` (não `[SEÇÃO]`) de propósito — a copy é cheia de placeholders entre
 * colchetes (`[NÚMERO]`, `[NOME]`, `[LOGO]`); fatiar por `[...]` cortaria no
 * lugar errado. Exige espaço após os `#` pra não casar `#hashtag`.
 */
const SECTION_HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/

/** Comprimento-alvo do rótulo de seção (rótulos são curtos: HERO, REVIEW…). */
const SECTION_LABEL_MAX_LEN = 40

/** Rótulo de seção normalizado: trim, espaços colapsados, MAIÚSCULAS, truncado. */
function normalizeSectionLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ").toUpperCase()
  return t.length <= SECTION_LABEL_MAX_LEN ? t : t.slice(0, SECTION_LABEL_MAX_LEN).trimEnd()
}

/**
 * Lê o rótulo de seção de um bloco do n8n. Só o campo `section` — NÃO `label`,
 * que no `emailDraftBlockSchema`/sinônimos significa texto de botão/link
 * (`{type:"button", label:"Comprar"}`); usá-lo aqui confundiria conteúdo com
 * rótulo de seção.
 */
function readBlockSectionLabel(b: Record<string, unknown>): string | undefined {
  return hasText(b.section) ? normalizeSectionLabel(b.section as string) : undefined
}

interface RawSection {
  section?: string
  value: string
}

/**
 * Fatia um texto plano nas seções marcadas por `## SEÇÃO` (linha própria). O
 * texto ANTES do 1º marcador vira uma seção sem rótulo (preâmbulo). Seções
 * totalmente vazias (preâmbulo em branco) são descartadas; uma seção rotulada
 * sem corpo é mantida (sinaliza ao COO que aquela seção não foi preenchida).
 * Sem nenhum marcador, devolve uma única seção sem rótulo com o texto inteiro
 * (equivale ao comportamento antigo de 1 bloco).
 */
function splitTextBySectionMarkers(text: string): RawSection[] {
  const sections: Array<{ section?: string; lines: string[] }> = []
  let current: { section?: string; lines: string[] } | null = null
  for (const line of text.split("\n")) {
    const m = line.match(SECTION_HEADING_RE)
    if (m) {
      current = { section: normalizeSectionLabel(m[1]), lines: [] }
      sections.push(current)
    } else if (!current) {
      current = { lines: [line] }
      sections.push(current)
    } else {
      current.lines.push(line)
    }
  }
  return sections
    .map((s) => ({ section: s.section, value: s.lines.join("\n").trim() }))
    .filter((s) => s.value.length > 0 || s.section !== undefined)
}

/**
 * Agrupa blocos do n8n que já vêm rotulados (campo `section`) em 1 bloco de
 * texto por seção. Blocos sem rótulo herdam a seção corrente; blocos antes do
 * 1º rótulo viram preâmbulo sem rótulo.
 */
function groupBlocksBySectionLabel(blocks: unknown[]): RawSection[] {
  const groups: Array<{ section?: string; blocks: unknown[] }> = []
  let current: { section?: string; blocks: unknown[] } | null = null
  for (const b of blocks) {
    const section =
      typeof b === "object" && b !== null
        ? readBlockSectionLabel(b as Record<string, unknown>)
        : undefined
    if (section && (!current || current.section !== section)) {
      current = { section, blocks: [b] }
      groups.push(current)
    } else if (!current) {
      current = { blocks: [b] }
      groups.push(current)
    } else {
      current.blocks.push(b)
    }
  }
  return groups
    .map((g) => ({ section: g.section, value: collapseBlocksToText(g.blocks) }))
    .filter((s) => s.value.length > 0 || s.section !== undefined)
}

/** True se ALGUM bloco do n8n traz rótulo de seção (campo `section`). */
function blocksHaveSectionLabels(blocks: unknown[]): boolean {
  return blocks.some(
    (b) =>
      typeof b === "object" &&
      b !== null &&
      readBlockSectionLabel(b as Record<string, unknown>) !== undefined,
  )
}

/** RawSection[] → blocos de texto persistíveis (`{type:"text", section?, value}`). */
function sectionsToTextBlocks(sections: RawSection[]): Array<Record<string, unknown>> {
  return sections.map((s) =>
    s.section
      ? { type: "text", section: s.section, value: s.value }
      : { type: "text", value: s.value },
  )
}

/**
 * Fatia a copy do n8n em UM bloco de texto POR SEÇÃO (HERO/REVIEW/FOOTER…),
 * mantendo cada bloco como texto simples — robusto, sempre exibe completo
 * (herança da decisão jun/2026; não voltamos a blocos tipados frágeis).
 *
 * Precedência: (1) se o n8n já rotulou os blocos (campo `section`), agrupa por
 * rótulo; (2) senão, colapsa tudo em texto e fatia pelos marcadores `## SEÇÃO`;
 * (3) sem rótulo nem marcador, vira 1 bloco de texto único (idêntico ao antigo).
 *
 * Copy sem texto algum → `[]`; o schema (`blocks.min(1)`) rejeita com 400 — não
 * inventamos um bloco vazio (mesma filosofia do `deriveSubjectFromCopy`).
 */
function splitIntoSectionedTextBlocks(blocks: unknown[]): Array<Record<string, unknown>> {
  if (blocksHaveSectionLabels(blocks)) {
    const grouped = groupBlocksBySectionLabel(blocks)
    if (grouped.length > 0) return sectionsToTextBlocks(grouped)
  }
  return sectionsToTextBlocks(splitTextBySectionMarkers(collapseBlocksToText(blocks)))
}

/**
 * Extrai as seções declaradas numa "Estrutura & tom" do COO (`## SEÇÃO` + corpo).
 * Usado no dispatch pra mandar ao n8n um contrato explícito das seções esperadas.
 * Só retorna seções COM rótulo (ignora o preâmbulo sem marcador).
 */
export function parseStructureSections(
  text: string | null | undefined,
): Array<{ tag: string; instructions: string }> {
  if (!text || !text.trim()) return []
  return splitTextBySectionMarkers(text)
    .filter((s): s is { section: string; value: string } => s.section !== undefined)
    .map((s) => ({ tag: s.section, instructions: s.value }))
}

/** Tamanho-alvo do subject derivado (assunto de email curto recomendado). */
const DERIVED_SUBJECT_MAX_LEN = 60

/**
 * Deriva um subject de FALLBACK a partir da copy do n8n: a 1ª linha de texto
 * não-vazia dos blocks, truncada em ~60 chars.
 *
 * Rede de segurança: desde que o admin passou a mandar a estrutura do COO como
 * tema (`brief.structure`), ele envia `master.subject` vazio esperando que o n8n
 * gere o assunto. Quando o n8n NÃO gera, o callback chega com `copy.subject`
 * vazio e o schema (`subject.min(1)`) rejeitava o payload inteiro com 400 — a
 * campanha travava em "Gerando". Em vez de barrar, derivamos um assunto
 * provisório (o COO pode reescrever; o ideal é o n8n mandar pronto).
 *
 * Aceita o `copy` cru ou já normalizado (1 bloco de texto). Retorna "" quando
 * não há texto algum — aí o n8n não gerou copy de verdade e o erro de validação
 * segue valendo (não mascaramos payload vazio).
 */
export function deriveSubjectFromCopy(copy: unknown): string {
  if (!copy || typeof copy !== "object") return ""
  const blocks = (copy as Record<string, unknown>).blocks
  if (!Array.isArray(blocks)) return ""
  const firstLine = collapseBlocksToText(blocks)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !SECTION_HEADING_RE.test(l))
  if (!firstLine) return ""
  if (firstLine.length <= DERIVED_SUBJECT_MAX_LEN) return firstLine
  return firstLine.slice(0, DERIVED_SUBJECT_MAX_LEN - 1).trimEnd() + "…"
}

/**
 * Normaliza o corpo bruto do callback do n8n. Não muta a entrada.
 * Mantém intactos os campos que o schema valida por conta própria
 * (`job_id`/`suggestion_id`/`store_id`/`mode`) — coerção errada ali esconderia
 * mismatch real de job.
 */
export function sanitizeN8nCopyPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }

  if ("status" in raw) out.status = coerceStatus(raw.status)

  if (raw.copy && typeof raw.copy === "object" && !Array.isArray(raw.copy)) {
    const copy = raw.copy as Record<string, unknown>
    const copyOut: Record<string, unknown> = { ...copy }

    // subject/preheader: coage tipo, mas não inventa (vazio segue inválido).
    if ("subject" in copy) copyOut.subject = coerceText(copy.subject) ?? copy.subject
    if ("preheader" in copy) copyOut.preheader = coerceText(copy.preheader) ?? copy.preheader
    if ("strategy" in copy) {
      const s = coerceText(copy.strategy)
      if (s === undefined) delete copyOut.strategy
      else copyOut.strategy = s
    }

    if (Array.isArray(copy.blocks)) {
      // Fatia a copy em 1 bloco de texto POR SEÇÃO (## SEÇÃO ou section/label do
      // n8n). Sem marcação → 1 bloco único (comportamento antigo, sem regressão).
      copyOut.blocks = splitIntoSectionedTextBlocks(copy.blocks)
    }

    out.copy = copyOut
  }

  return out
}

/** Exportado para testes. */
export const __internal = {
  coerceType,
  coerceColumns,
  coerceStatus,
  normalizeBlock,
  splitIntoSectionedTextBlocks,
  splitTextBySectionMarkers,
  normalizeSectionLabel,
}
