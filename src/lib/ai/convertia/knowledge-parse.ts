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
 * Aprovação: `status: aprovado` (aceita aprovada/approved). Advisor:
 * pasta de advisors OU `tipo: advisor`.
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
  const title = (typeof fm.title === "string" && fm.title.trim()) || h1 || fileTitle(relPath)
  const status = typeof fm.status === "string" ? fm.status.trim().toLowerCase() : "pendente"
  const advisorsFolder = normalizeNoteName(opts.advisorsFolder)
  const inAdvisors =
    advisorsFolder.length > 0 &&
    (normalizeNoteName(folder) === advisorsFolder || normalizeNoteName(folder).startsWith(`${advisorsFolder}/`))
  const kind: "nota" | "advisor" =
    inAdvisors || String(fm.tipo ?? fm.type ?? "").toLowerCase() === "advisor" ? "advisor" : "nota"
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
