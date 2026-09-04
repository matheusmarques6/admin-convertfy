/**
 * Parser do vault de conhecimento (Obsidian → tabelas) — módulo PURO.
 *
 * O vault (`All-for-Eficiencia/Admin Convertfy/Emails/`) é a fonte de
 * autoria do Estruturador (ADR adr-estruturador-adaptativo). Este módulo
 * transforma um arquivo markdown em linha sincronizável:
 *
 *   - frontmatter YAML *simples* (escalares + arrays inline — é o que o
 *     vault usa; sem dependência de lib YAML de propósito: uma lib inteira
 *     para `chave: valor` é superfície de ataque e de versão à toa);
 *   - slug = nome do arquivo (o MESMO identificador dos wikilinks e o que
 *     o output do agente cita — bloqueador #1 do review do vault);
 *   - wikilinks resolvidos para texto estável;
 *   - `secoes` normalizadas pelo mapa de absorção (header → 1ª posição,
 *     cta → anterior) — a versão SERVÍVEL ao prompt; a original também é
 *     preservada (o vault descreve o email completo, a normalização é da
 *     ponte, não da curadoria).
 *
 * Validação é por tipo e NUNCA derruba o sync: nota inválida vira entrada
 * em `skipped_invalid` com o motivo (fail-open, regra da casa).
 */

export type VaultNoteTipo =
  | "intencao"
  | "progressao"
  | "estrutura"
  | "aprendizado"
  | "componente_doc"

/**
 * Categoria das notas de `componentes/**` (vault do Curador, 31/08).
 * Espelha a árvore do Obsidian; 'outro' cobre nota nova na raiz antes de o
 * código conhecê-la (sincroniza, não some).
 */
export type VaultDocKind =
  | "protocolo"
  | "catalogo"
  | "inventario"
  | "parametros"
  | "casos"
  | "secao"
  | "variante"
  | "eixo"
  | "requisito"
  | "convivencia"
  | "lacuna"
  | "outro"

export interface ParsedNote {
  tipo: VaultNoteTipo
  /** Flow do caminho; null para aprendizados `_global` e componentes. */
  flowType: string | null
  /** Nome do arquivo sem extensão — o identificador canônico. */
  slug: string
  filePath: string
  frontmatter: Record<string, unknown>
  /** Corpo com wikilinks resolvidos. */
  body: string
  /** Só componente_doc: categoria da nota. */
  docKind?: VaultDocKind
  /** Só componente_doc: subgrupo (seção da variante/nota, eixo). */
  docGrupo?: string | null
}

export interface SkippedNote {
  path: string
  motivo: string
}

// ── Frontmatter ─────────────────────────────────────────────────────────

/** Converte um escalar do YAML simples: número, boolean, null ou string. */
function scalar(raw: string): unknown {
  const v = raw.trim()
  if (v === "" || v === "null" || v === "~") return null
  if (v === "true") return true
  if (v === "false") return false
  if (/^-?\d+$/.test(v)) return parseInt(v, 10)
  // Aspas envolventes caem fora; o resto fica literal.
  const m = v.match(/^"(.*)"$/) ?? v.match(/^'(.*)'$/)
  return m ? m[1] : v
}

/**
 * Divide o miolo de um array inline por vírgula RESPEITANDO aspas. O split
 * ingênuo partia `["prazo com hora fechada", "repetir a tese, no mesmo
 * registro"]` em três itens — e o frontmatter das intenções (set/2026)
 * carrega proibições escritas em prosa, com vírgula dentro.
 */
function splitInline(inner: string): string[] {
  const out: string[] = []
  let cur = ""
  let quote: string | null = null
  for (const ch of inner) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/** Array inline `[a, b, c]` (o formato de lista mais comum do vault). */
function inlineArray(raw: string): unknown[] | null {
  const m = raw.trim().match(/^\[(.*)\]$/)
  if (!m) return null
  const inner = m[1].trim()
  if (!inner) return []
  return splitInline(inner).map((s) => scalar(s))
}

/** Item de lista em bloco (`- item`), com a indentação que o Obsidian usa. */
const BLOCK_ITEM = /^\s*-\s+(.*)$/

export interface Frontmatter {
  data: Record<string, unknown>
  body: string
  /** true quando o documento tinha o bloco `---` de abertura. */
  hasFrontmatter: boolean
}

export function parseFrontmatter(md: string): Frontmatter {
  // Normaliza EOL — Obsidian no Windows grava CRLF.
  const text = md.replace(/\r\n/g, "\n")
  if (!text.startsWith("---\n")) {
    return { data: {}, body: text, hasFrontmatter: false }
  }
  const end = text.indexOf("\n---", 4)
  if (end < 0) return { data: {}, body: text, hasFrontmatter: false }

  const raw = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n/, "")
  const data: Record<string, unknown> = {}
  const lines = raw.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith("#")) continue
    // Item de bloco fora de uma chave (ou depois de uma chave com valor
    // inline) é ruído — pula em vez de virar chave vazia.
    if (BLOCK_ITEM.test(line)) continue
    const idx = line.indexOf(":")
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1)
    if (!key) continue
    // Lista em bloco: `chave:` sem valor seguida de linhas `- item`. Vale
    // até a primeira linha que não é item. `chave:` sem itens continua null.
    if (!value.trim()) {
      const items: unknown[] = []
      let j = i + 1
      while (j < lines.length) {
        const m = lines[j].match(BLOCK_ITEM)
        if (!m) break
        items.push(scalar(m[1]))
        j++
      }
      if (items.length > 0) {
        data[key] = items
        i = j - 1
        continue
      }
    }
    data[key] = inlineArray(value) ?? scalar(value)
  }
  return { data, body, hasFrontmatter: true }
}

// ── Caminho → tipo/flow/slug ────────────────────────────────────────────

export interface ClassifiedPath {
  tipo: VaultNoteTipo
  flowType: string | null
  slug: string
  docKind?: VaultDocKind
  docGrupo?: string | null
}

/** `componentes/<arquivo>.md` → categoria (as notas de topo têm nome fixo). */
const COMPONENTES_ROOT_KIND: Record<string, VaultDocKind> = {
  "_protocolo-de-selecao": "protocolo",
  _catalogo: "catalogo",
  _inventario: "inventario",
  "_parametros-da-loja": "parametros",
  "_casos-de-teste": "casos",
}

/**
 * Faxina do vault: arquivo que ESTRUTURALMENTE não é área de nota.
 *
 * O `_INDEX.md` é o MOC do Obsidian — navegação, nunca foi para ser nota —
 * e caía em `skipped_invalid` com "caminho fora do padrão do vault" toda
 * vez, aparecendo no card "Notas puladas" da aba Conhecimento. Esse card
 * responde a "editei uma nota e não valeu": listar ali um arquivo que
 * nunca seria nota treina a pessoa a ignorar o card, e aviso que se ignora
 * não é aviso.
 *
 * Só o que é inequivocamente faxina entra aqui. Caminho errado DENTRO das
 * três pastas de nota (`estruturas/x.md` sem a pasta do flow,
 * `estruturas/welcome/sub/x.md`) e pasta com nome errado (`intencao/`, no
 * singular) continuam sendo reportados — é exatamente para eles que o card
 * existe.
 */
export function isVaultHousekeeping(relPath: string): boolean {
  const parts = relPath.split("/")
  // Raiz da base: _INDEX.md, README.md. Nota de verdade sempre mora em
  // {pasta}/{flow}/{arquivo}.
  if (parts.length === 1) return true
  const topo = parts[0].toLowerCase()
  if (topo.startsWith(".")) return true // .obsidian/, .trash/
  return topo === "templates" || topo === "_templates"
}

/**
 * Classifica um caminho relativo à BASE do vault
 * (`intencoes/{flow}/{n|_flow|_progressao}.md`, `estruturas/{flow}/{slug}.md`,
 * `aprendizados/{flow|_global}/{slug}.md`, `componentes/**`). Fora do
 * padrão → null.
 */
export function classifyPath(relPath: string): ClassifiedPath | null {
  const allParts = relPath.split("/")
  const lastFile = allParts[allParts.length - 1]
  if (!lastFile || !lastFile.endsWith(".md")) return null

  // ── Vault de componentes (Curador, 31/08) ─────────────────────────────
  // componentes/<arquivo>.md · componentes/<categoria>/<slug>.md ·
  // componentes/{variantes|eixos}/<grupo>/<slug>.md. `_html/` fica fora
  // por não ser .md (o HTML canônico já vive no banco).
  if (allParts[0] === "componentes") {
    const slug = lastFile.slice(0, -3)
    if (allParts.length === 2) {
      return {
        tipo: "componente_doc",
        flowType: null,
        slug,
        docKind: COMPONENTES_ROOT_KIND[slug] ?? "outro",
        docGrupo: null,
      }
    }
    if (allParts.length === 3) {
      const dir = allParts[1]
      if (dir === "secoes")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "secao", docGrupo: slug.replace(/^_/, "") }
      if (dir === "requisitos")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "requisito", docGrupo: null }
      if (dir === "convivencia")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "convivencia", docGrupo: null }
      if (dir === "lacunas")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "lacuna", docGrupo: null }
      return null
    }
    if (allParts.length === 4) {
      const dir = allParts[1]
      const grupo = allParts[2]
      if (dir === "variantes")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "variante", docGrupo: grupo }
      if (dir === "eixos")
        return { tipo: "componente_doc", flowType: null, slug, docKind: "eixo", docGrupo: grupo }
      return null
    }
    return null
  }

  const parts = allParts
  if (parts.length !== 3) return null
  const [dir, flow, file] = parts
  if (!file.endsWith(".md")) return null
  const slug = file.slice(0, -3)

  if (dir === "intencoes") {
    if (slug === "_flow") return { tipo: "intencao", flowType: flow, slug }
    if (slug === "_progressao") return { tipo: "progressao", flowType: flow, slug }
    return { tipo: "intencao", flowType: flow, slug }
  }
  if (dir === "estruturas") return { tipo: "estrutura", flowType: flow, slug }
  if (dir === "aprendizados") {
    return {
      tipo: "aprendizado",
      flowType: flow === "_global" ? null : flow,
      slug,
    }
  }
  return null
}

// ── Wikilinks ───────────────────────────────────────────────────────────

/**
 * `[[slug]]` → `slug` · `[[slug|rótulo]]` → `rótulo (→slug)` quando o rótulo
 * difere do slug. O slug fica SEMPRE visível — é o identificador que o
 * agente precisa citar no output.
 */
export function resolveWikilinks(body: string): string {
  return body.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, label) => {
    const slug = String(target).trim()
    const lab = label != null ? String(label).trim() : ""
    if (!lab || lab === slug) return slug
    return `${lab} (→${slug})`
  })
}

// ── Normalização de secoes (absorção) ───────────────────────────────────

export interface NormalizedSecoes {
  /** Sequência servível ao prompt (sem header/cta). */
  secoes: string[]
  /** O que foi absorvido e para qual índice PÓS-normalização o papel vai. */
  absorcoes: Array<{ secao: "header" | "cta"; destinoIndex: number }>
}

/**
 * Mapa de absorção (decisões 25-26/08): `header` → primeira posição da
 * sequência normalizada (a hero quando existe; 3/8 referências do welcome
 * não têm hero); `cta` → posição ANTERIOR (por índice — dois `body` na
 * mesma referência tornariam "vizinha" ambíguo). `offer` NÃO é absorvido
 * aqui: a re-projeção é decisão do agente, com o mecanismo preservado.
 */
export function normalizeSecoes(secoes: string[]): NormalizedSecoes {
  const out: string[] = []
  const absorcoes: NormalizedSecoes["absorcoes"] = []
  let pendingHeader = false

  for (const s of secoes) {
    if (s === "header") {
      pendingHeader = true
      continue
    }
    if (s === "cta") {
      // Anterior na sequência normalizada; cta antes de qualquer posição
      // construível cai na próxima que existir (índice 0).
      absorcoes.push({ secao: "cta", destinoIndex: Math.max(0, out.length - 1) })
      continue
    }
    out.push(s)
  }
  if (pendingHeader) absorcoes.unshift({ secao: "header", destinoIndex: 0 })
  return { secoes: out, absorcoes }
}

// ── Validação por tipo ──────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/**
 * Contrato mínimo por tipo. Devolve a lista de problemas — vazia = válida.
 * Deliberadamente permissivo no que é prosa (o corpo é conhecimento livre)
 * e estrito no que o runtime indexa.
 */
export function validateNote(
  tipo: VaultNoteTipo,
  fm: Record<string, unknown>,
  opts: { slug: string },
): string[] {
  const errs: string[] = []
  const status = str(fm.status)
  if (!status) errs.push("frontmatter sem `status`")

  if (tipo === "intencao") {
    if (str(fm.tipo) !== "intencao") errs.push("`tipo` deveria ser 'intencao'")
    const isFlow = str(fm.escopo) === "flow" || opts.slug === "_flow"
    if (!isFlow && typeof fm.email_number !== "number")
      errs.push("intenção de email sem `email_number` numérico")
  }
  if (tipo === "progressao") {
    if (str(fm.tipo) !== "progressao") errs.push("`tipo` deveria ser 'progressao'")
  }
  if (tipo === "estrutura") {
    if (str(fm.tipo) !== "estrutura") errs.push("`tipo` deveria ser 'estrutura'")
    if (!Array.isArray(fm.secoes) || fm.secoes.length === 0)
      errs.push("estrutura sem `secoes`")
    if (!Array.isArray(fm.emails) || fm.emails.length === 0)
      errs.push("estrutura sem `emails`")
    const fmSlug = str(fm.slug)
    if (fmSlug && fmSlug !== opts.slug)
      errs.push(`\`slug\` do frontmatter ('${fmSlug}') difere do nome do arquivo ('${opts.slug}')`)
  }
  if (tipo === "aprendizado") {
    if (str(fm.tipo) !== "aprendizado") errs.push("`tipo` deveria ser 'aprendizado'")
    if (str(fm.escopo) === "cross-flow" && !Array.isArray(fm.aplica_a))
      errs.push("aprendizado cross-flow sem `aplica_a`")
  }
  // componente_doc: deliberadamente permissivo — o vault de componentes tem
  // frontmatters heterogêneos por categoria (variante ≠ eixo ≠ lacuna) e o
  // corpo é conhecimento livre. Só o `status` (checado acima) é contrato.
  return errs
}

// ── Nota completa ───────────────────────────────────────────────────────

export interface ParseResult {
  note: ParsedNote | null
  skipped: SkippedNote | null
}

export function parseVaultFile(relPath: string, content: string): ParseResult {
  const cls = classifyPath(relPath)
  if (!cls) return { note: null, skipped: { path: relPath, motivo: "caminho fora do padrão do vault" } }

  const { data, body, hasFrontmatter } = parseFrontmatter(content)
  if (!hasFrontmatter)
    return { note: null, skipped: { path: relPath, motivo: "sem bloco de frontmatter" } }

  const errs = validateNote(cls.tipo, data, { slug: cls.slug })
  if (errs.length > 0)
    return { note: null, skipped: { path: relPath, motivo: errs.join("; ") } }

  return {
    note: {
      tipo: cls.tipo,
      flowType: cls.flowType,
      slug: cls.slug,
      filePath: relPath,
      frontmatter: data,
      body: resolveWikilinks(body),
      ...(cls.tipo === "componente_doc"
        ? { docKind: cls.docKind ?? "outro", docGrupo: cls.docGrupo ?? null }
        : {}),
    },
    skipped: null,
  }
}

/** `status: aprovada` é o único que ativa a nota para o runtime. */
export function isApproved(fm: Record<string, unknown>): boolean {
  return str(fm.status) === "aprovada"
}

/**
 * Ativação das notas de componentes: `aprovada` como as demais, com uma
 * exceção — `_catalogo.md` é GERADO por script (`status: gerado`) e é
 * legítimo servi-lo assim. Lacunas são cidadãs de primeira classe do vault
 * (`status: aberta`) mas NÃO entram no runtime: são worklist humana.
 */
export function isDocActive(kind: VaultDocKind, fm: Record<string, unknown>): boolean {
  if (isApproved(fm)) return true
  return kind === "catalogo" && str(fm.status) === "gerado"
}

/** `variant_id` do frontmatter quando é um UUID plausível; senão null. */
export function docVariantId(fm: Record<string, unknown>): string | null {
  const v = typeof fm.variant_id === "string" ? fm.variant_id.trim() : ""
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : null
}
