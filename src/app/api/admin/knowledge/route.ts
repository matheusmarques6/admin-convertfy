/**
 * GET  /api/admin/knowledge — estado da base de conhecimento do Obsidian
 *      (sync state, contagens, pastas, advisors, notas puladas).
 * POST /api/admin/knowledge — sincronização manual (`force: true`
 *      re-sincroniza mesmo sem commit novo).
 *
 * Auth: canManagePrompts (admin/owner OU tag `dev`) — mesmo gate do vault.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { syncKnowledge, readKnowledgeConfig } from "@/lib/ai/convertia/knowledge-sync"
import { embeddingsAvailable } from "@/lib/ai/convertia/knowledge-embeddings"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MISSING = new Set(["42P01", "PGRST205"])

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const [stateRes, notesRes] = await Promise.all([
      admin.from("ai_knowledge_sync_state").select("*").eq("id", "default").maybeSingle(),
      admin
        .from("ai_knowledge_notes")
        .select("path, title, folder, kind, status, is_active, tags, links, word_count, embedded_at, updated_at")
        .order("path")
        .limit(2000),
    ])
    if (stateRes.error && MISSING.has(stateRes.error.code ?? "")) {
      return successResponse(request, { schema_missing: true, config: describeConfig(), notes: [], state: null })
    }
    const notes = notesRes.data ?? []
    const folders = new Map<string, { total: number; active: number }>()
    for (const n of notes) {
      const f = n.folder || "(raiz)"
      const cur = folders.get(f) ?? { total: 0, active: 0 }
      cur.total += 1
      if (n.is_active) cur.active += 1
      folders.set(f, cur)
    }
    return successResponse(request, {
      schema_missing: false,
      config: describeConfig(),
      embeddings: embeddingsAvailable(),
      state: stateRes.data,
      folders: [...folders.entries()].map(([folder, c]) => ({ folder, ...c })),
      advisors: notes.filter((n) => n.kind === "advisor"),
      notes,
    })
  } catch (error) {
    return errorResponse(request, error, "admin-knowledge-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const body = (await request.json().catch(() => ({}))) as { force?: boolean }
    const result = await syncKnowledge({ trigger: "manual", force: body.force === true, admin })
    return successResponse(request, { result })
  } catch (error) {
    return errorResponse(request, error, "admin-knowledge-sync")
  }
}

function describeConfig() {
  const cfg = readKnowledgeConfig()
  if ("error" in cfg) return { ok: false, error: cfg.error }
  return { ok: true, repo: cfg.repo, branch: cfg.branch, base_path: cfg.basePath, advisors_folder: cfg.advisorsFolder }
}
