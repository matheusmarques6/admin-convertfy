/**
 * Sync da base de conhecimento do Obsidian (GitHub → ai_knowledge_notes).
 *
 * Mesmo repositório/token/branch do vault de emails (VAULT_REPO,
 * VAULT_GITHUB_TOKEN, VAULT_BRANCH); pasta própria em
 * VAULT_KNOWLEDGE_BASE_PATH (default "Admin Convertfy/Conhecimento").
 * Advisors: VAULT_KNOWLEDGE_ADVISORS_FOLDER (default "Advisors").
 *
 * Gatilhos: webhook de push (junto do sync de emails), cron horário de
 * manutenção e botão manual. SHA do HEAD curto-circuita o no-op.
 * Fail-open por arquivo. Nota removida do repo → is_active=false.
 * Embeddings só para notas ATIVAS cujo conteúdo mudou (hash) — lote
 * de 32 por chamada.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { parseKnowledgeNote, type ParsedKnowledgeNote } from "./knowledge-parse"
import { EMBEDDING_MODEL, embedTexts, embeddingInput, embeddingsAvailable } from "./knowledge-embeddings"

const log = logger.child("KnowledgeSync")

const GITHUB_API = "https://api.github.com"

/**
 * Faxina da pasta de conhecimento: pastas ocultas (.obsidian, .trash),
 * templates e índices gerados. Diferente do vault de emails, nota na
 * RAIZ da base é nota válida (o Obsidian do usuário não tem hierarquia
 * obrigatória).
 */
export function isKnowledgeHousekeeping(relPath: string): boolean {
  const parts = relPath.split("/")
  if (parts.some((p) => p.startsWith(".") || p.toLowerCase() === "templates" || p.toLowerCase() === "_templates")) return true
  const file = parts[parts.length - 1].toLowerCase()
  return file === "_index.md" || file === "readme.md"
}
const MISSING = new Set(["42P01", "PGRST205"])

export interface KnowledgeSyncResult {
  status: "synced" | "noop" | "error" | "schema_missing"
  commitSha: string | null
  filesTotal: number
  upserted: number
  deactivated: number
  embedded: number
  skipped: Array<{ path: string; motivo: string }>
  durationMs: number
  error?: string
}

interface Config {
  repo: string
  branch: string
  basePath: string
  advisorsFolder: string
  token: string
}

export function readKnowledgeConfig(): Config | { error: string } {
  const repo = process.env.VAULT_REPO?.trim()
  const token = process.env.VAULT_GITHUB_TOKEN?.trim()
  if (!repo || !repo.includes("/")) return { error: "VAULT_REPO ausente ou inválido (esperado owner/repo)" }
  if (!token) return { error: "VAULT_GITHUB_TOKEN ausente" }
  return {
    repo,
    branch: process.env.VAULT_BRANCH?.trim() || "main",
    basePath: (process.env.VAULT_KNOWLEDGE_BASE_PATH?.trim() || "Admin Convertfy/Conhecimento").replace(/\/+$/, ""),
    advisorsFolder: process.env.VAULT_KNOWLEDGE_ADVISORS_FOLDER?.trim() || "Advisors",
    token,
  }
}

async function gh<T>(cfg: Config, path: string, raw = false): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`GitHub ${res.status} em ${path}: ${body.slice(0, 200)}`)
  }
  return (raw ? res.text() : res.json()) as Promise<T>
}

export async function syncKnowledge(opts: {
  trigger: "webhook" | "cron" | "manual"
  force?: boolean
  admin?: SupabaseClient
}): Promise<KnowledgeSyncResult> {
  const t0 = Date.now()
  const admin = opts.admin ?? createAdminClient()
  const cfg = readKnowledgeConfig()
  const done = (r: Omit<KnowledgeSyncResult, "durationMs">): KnowledgeSyncResult => ({ ...r, durationMs: Date.now() - t0 })
  const saveState = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("ai_knowledge_sync_state").upsert({ id: "default", ...patch, updated_at: new Date().toISOString() })
    if (error && !MISSING.has(error.code ?? "")) log.warn("estado do sync não gravado", { error: error.message })
  }

  if ("error" in cfg) {
    await saveState({ last_error: cfg.error })
    return done({ status: "error", commitSha: null, filesTotal: 0, upserted: 0, deactivated: 0, embedded: 0, skipped: [], error: cfg.error })
  }

  try {
    const head = await gh<{ sha: string }>(cfg, `/repos/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`)
    const sha = head.sha
    const stateRes = await admin.from("ai_knowledge_sync_state").select("last_commit_sha, base_path").eq("id", "default").maybeSingle()
    if (stateRes.error && MISSING.has(stateRes.error.code ?? "")) {
      return done({ status: "schema_missing", commitSha: sha, filesTotal: 0, upserted: 0, deactivated: 0, embedded: 0, skipped: [], error: "migration 20261115 não aplicada" })
    }
    const sameBase = stateRes.data?.base_path === cfg.basePath
    if (!opts.force && sameBase && stateRes.data?.last_commit_sha === sha) {
      // no-op de commit — mas embeddings pendentes (chave configurada
      // depois do sync) ainda podem ser feitos
      const embedded = await embedPending(admin)
      return done({ status: "noop", commitSha: sha, filesTotal: 0, upserted: 0, deactivated: 0, embedded, skipped: [] })
    }

    const tree = await gh<{ tree: Array<{ path: string; type: string }>; truncated: boolean }>(
      cfg,
      `/repos/${cfg.repo}/git/trees/${sha}?recursive=1`,
    )
    if (tree.truncated) log.warn("árvore truncada", { repo: cfg.repo })
    const prefix = `${cfg.basePath}/`
    const files = tree.tree.filter(
      (e) => e.type === "blob" && e.path.startsWith(prefix) && e.path.endsWith(".md") && !isKnowledgeHousekeeping(e.path.slice(prefix.length)),
    )

    const notes: ParsedKnowledgeNote[] = []
    const skipped: Array<{ path: string; motivo: string }> = []
    const seen = new Set<string>()
    const CONC = 8
    for (let i = 0; i < files.length; i += CONC) {
      await Promise.all(
        files.slice(i, i + CONC).map(async (f) => {
          const rel = f.path.slice(prefix.length)
          try {
            const content = await gh<string>(
              cfg,
              `/repos/${cfg.repo}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
              true,
            )
            notes.push(parseKnowledgeNote(rel, content, { advisorsFolder: cfg.advisorsFolder }))
          } catch (err) {
            skipped.push({ path: rel, motivo: `download falhou: ${err instanceof Error ? err.message : String(err)}` })
            // Falha transitória NÃO é remoção: a nota continua ativa com
            // a versão anterior (senão a varredura abaixo a desativaria e
            // o no-op de SHA nunca a traria de volta).
            seen.add(rel)
          }
        }),
      )
    }

    // hashes atuais — só re-embeda o que mudou
    const { data: existing } = await admin.from("ai_knowledge_notes").select("path, content_hash, embedding_model").limit(5000)
    const byPath = new Map((existing ?? []).map((e) => [e.path as string, e]))

    let upserted = 0
    for (const n of notes) {
      seen.add(n.path)
      const prev = byPath.get(n.path)
      const changed = !prev || prev.content_hash !== n.contentHash
      const { error } = await admin.from("ai_knowledge_notes").upsert(
        {
          path: n.path,
          title: n.title,
          folder: n.folder,
          kind: n.kind,
          status: n.status,
          is_active: n.isActive,
          frontmatter: n.frontmatter,
          tags: n.tags,
          links: n.links,
          aliases: n.aliases,
          body_md: n.body,
          excerpt: n.excerpt,
          word_count: n.wordCount,
          content_hash: n.contentHash,
          synced_commit_sha: sha,
          updated_at: new Date().toISOString(),
          // conteúdo mudou → embedding antigo não vale mais
          ...(changed ? { embedding: null, embedded_at: null } : {}),
        },
        { onConflict: "path" },
      )
      if (error) skipped.push({ path: n.path, motivo: `upsert falhou: ${error.message}` })
      else upserted++
    }

    // desativa o que sumiu (nunca DELETE)
    let deactivated = 0
    const { data: active } = await admin.from("ai_knowledge_notes").select("id, path").eq("is_active", true)
    for (const r of active ?? []) {
      if (seen.has(r.path)) continue
      const { error } = await admin
        .from("ai_knowledge_notes")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", r.id)
      if (!error) deactivated++
    }

    const embedded = await embedPending(admin)

    const { count: total } = await admin.from("ai_knowledge_notes").select("id", { count: "exact", head: true })
    const { count: activeCount } = await admin.from("ai_knowledge_notes").select("id", { count: "exact", head: true }).eq("is_active", true)
    const { count: embeddedCount } = await admin
      .from("ai_knowledge_notes")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("embedding", "is", null)
    await saveState({
      repo: cfg.repo,
      branch: cfg.branch,
      base_path: cfg.basePath,
      last_commit_sha: sha,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      notes_total: total ?? 0,
      notes_active: activeCount ?? 0,
      embedded_total: embeddedCount ?? 0,
      skipped,
    })
    log.info("knowledge sync done", { trigger: opts.trigger, sha: sha.slice(0, 8), files: files.length, upserted, deactivated, embedded })
    return done({ status: "synced", commitSha: sha, filesTotal: files.length, upserted, deactivated, embedded, skipped })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error("knowledge sync failed", { trigger: opts.trigger, error: msg })
    await saveState({ last_error: msg.slice(0, 500) })
    return done({ status: "error", commitSha: null, filesTotal: 0, upserted: 0, deactivated: 0, embedded: 0, skipped: [], error: msg })
  }
}

/** Embeda notas ativas sem vetor (ou com modelo antigo). Devolve quantas. */
export async function embedPending(admin: SupabaseClient, limit = 200): Promise<number> {
  if (!embeddingsAvailable()) return 0
  const { data, error } = await admin
    .from("ai_knowledge_notes")
    .select("id, title, tags, body_md, embedding_model")
    .eq("is_active", true)
    .or(`embedding.is.null,embedding_model.neq.${EMBEDDING_MODEL}`)
    .limit(limit)
  if (error || !data || data.length === 0) return 0
  let n = 0
  const BATCH = 32
  for (let i = 0; i < data.length; i += BATCH) {
    const slice = data.slice(i, i + BATCH)
    const vectors = await embedTexts(
      slice.map((r) => embeddingInput({ title: r.title, tags: (r.tags as string[]) ?? [], body: r.body_md })),
    )
    if (!vectors) break
    for (let j = 0; j < slice.length; j++) {
      const v = vectors[j]
      if (!v) continue
      const { error: e } = await admin
        .from("ai_knowledge_notes")
        .update({ embedding: JSON.stringify(v), embedding_model: EMBEDDING_MODEL, embedded_at: new Date().toISOString() })
        .eq("id", slice[j].id)
      if (!e) n++
    }
  }
  return n
}
