/**
 * Parser de nota do Obsidian para a base de conhecimento — PURO, testado.
 *
 * Extrai o que o grafo do Obsidian oferece: título (frontmatter → H1 →
 * nome do arquivo), pasta, tags (frontmatter + `#tag` inline),
 * wikilinks de saída (`[[Nota]]`, `[[Nota|alias]]`, `[[Nota#seção]]`,
 * `[[pasta/Nota]]`) normalizados por NOME (é assim que o Obsidian
 * resolve: pelo nome do arquivo, não pelo caminho), aliases do
 * frontmatter, excerto e hash do conteúdo (para só re-embedar o que
 * mudou).
 *
 * Aprovação: `status: aprovado` (aceita aprovada/approved). Advisor é a
 * PERSONA — `tipo: persona`/`tipo: advisor`, ou nota solta na raiz da
 * pasta de advisors —, e o nome dele vem da subpasta. O corpus ao redor
 * (`Advisors/Max/doutrina/...`) é nota comum: buscável, não é persona.
 */

import { parseFrontmatter } from "@/lib/vault/vault-parser"

export interface ParsedKnowledgeNote {
  path: string
  title: string
  folder: string
  kind: "nota" | "advisor"
  status: string
  isActive: boolean
  frontmatter: Record<string, unknown>
  tags: string[]
  links: string[]
  aliases: string[]
  body: string
  excerpt: string
  wordCount: number
  contentHash: string
}

const APPROVED = new Set(["aprovado", "aprovada", "approved", "publicado", "published"])

/** Nome normalizado para casar links: minúsculas, sem acento, sem .md. */
export function normalizeNoteName(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function fileTitle(path: string): string {
  const base = path.split("/").pop() ?? path
  return base.replace(/\.md$/i, "")
}

/**
 * Nome legível a partir do arquivo — `roubar-e-o-metodo.md` → "Roubar e o
 * metodo". No Obsidian o nome da nota É o arquivo; o H1 é conteúdo. Preferir
 * o H1 dava um catálogo inútil no corpus do Max: 20 notas chamadas "Aviso de
 * autoria" e 13 chamadas "O que é", porque essas são as primeiras SEÇÕES.
 * Acento perdido é o preço do slug — quem quiser nome bonito põe `title:`
 * no frontmatter, que continua vencendo.
 */
export function humanizeFileName(path: string): string {
  const s = fileTitle(path).replace(/^_+/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function extractWikilinks(body: string): string[] {
  const out = new Set<string>()
  const re = /\[\[([^\]\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const target = m[1].trim()
    if (!target) continue
    // "pasta/Nota" → "Nota" (resolução por nome, como o Obsidian)
    const name = target.split("/").pop() ?? target
    const norm = normalizeNoteName(name)
    if (norm) out.add(norm)
  }
  return [...out]
}

export function extractInlineTags(body: string): string[] {
  const out = new Set<string>()
  // fora de blocos de código; #tag com letras/números/-/_ e níveis "a/b"
  const noCode = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
  const re = /(^|[\s(])#([\p{L}\p{N}_\-/]+)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(noCode))) {
    const t = m[2].replace(/\/+$/, "")
    if (t && !/^\d+$/.test(t)) out.add(t.toLowerCase())
  }
  return [...out]
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === "string") {
    return v
      .split(/[,;]/)
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean)
  }
  return []
}

/** djb2 em hex — determinístico, barato, suficiente para "mudou?". */
export function contentHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  let h2 = 52711
  for (let i = s.length - 1; i >= 0; i--) h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`
}

export function makeExcerpt(body: string, max = 320): string {
  const flat = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s.*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, a: string, b?: string) => b || a)
    .replace(/[*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function parseKnowledgeNote(
  relPath: string,
  content: string,
  opts: { advisorsFolder: string },
): ParsedKnowledgeNote {
  const { data: fm, body } = parseFrontmatter(content)
  const folder = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : ""
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const status = typeof fm.status === "string" ? fm.status.trim().toLowerCase() : "pendente"
  const advisorsFolder = normalizeNoteName(opts.advisorsFolder)
  const inAdvisors =
    advisorsFolder.length > 0 &&
    (normalizeNoteName(folder) === advisorsFolder || normalizeNoteName(folder).startsWith(`${advisorsFolder}/`))
  // O advisor é a PERSONA, não cada nota do corpus dele. Um advisor bem
  // documentado tem uma pasta inteira (`Advisors/Max/` tem 123 notas —
  // doutrina, flows, copy, registro); marcar todas como advisor enchia o
  // menu do composer com 123 entradas em vez de um "Max", e o bloco de
  // persona do prompt viraria loteria. Regra: dentro da pasta de advisors,
  // é advisor a nota `tipo: persona`/`tipo: advisor` OU a que está solta na
  // raiz da pasta (`Advisors/Fulano.md`, o advisor de nota única). O resto
  // continua indexado e buscável como nota comum — só não é uma persona.
  const tipo = String(fm.tipo ?? fm.type ?? "").toLowerCase()
  const isPersonaTipo = tipo === "advisor" || tipo === "persona"
  const kind: "nota" | "advisor" =
    isPersonaTipo || (inAdvisors && normalizeNoteName(folder) === advisorsFolder) ? "advisor" : "nota"
  // O nome do advisor é o da PASTA dele, não o H1 do arquivo: a persona
  // costuma abrir com um heading de orientação ("# Onde esta nota entra"),
  // e era esse texto que ia parar no menu do composer no lugar de "Max".
  // `title:` no frontmatter continua vencendo tudo.
  // Só vale para a persona que mora numa SUBpasta (`Advisors/Max/persona.md`);
  // o advisor de nota única (`Advisors/Fulano.md`) já tem o nome no arquivo.
  const advisorName =
    kind === "advisor" && inAdvisors && normalizeNoteName(folder) !== advisorsFolder
      ? (folder.split("/").pop() ?? "")
      : ""
  // Ordem: `title:` explícito → nome do advisor (a pasta) → nome do arquivo →
  // H1. O H1 é o último recurso, não o primeiro: ver `humanizeFileName`.
  const title =
    (typeof fm.title === "string" && fm.title.trim()) ||
    advisorName ||
    humanizeFileName(relPath) ||
    h1 ||
    fileTitle(relPath)
  const tags = [...new Set([...toStringList(fm.tags).map((t) => t.toLowerCase()), ...extractInlineTags(body)])]
  const links = extractWikilinks(body)
  const aliases = toStringList(fm.aliases).map(normalizeNoteName).filter(Boolean)
  const wordCount = body.split(/\s+/).filter(Boolean).length
  return {
    path: relPath,
    title,
    folder,
    kind,
    status,
    isActive: APPROVED.has(status),
    frontmatter: fm,
    tags,
    links,
    aliases,
    body,
    excerpt: makeExcerpt(body),
    wordCount,
    contentHash: contentHash(`${title}\n${body}`),
  }
}
