/**
 * GET  /api/ai/memories?status=pending|approved|rejected&store_id=
 *      — memórias da org (ai_memories) para o painel de revisão.
 * POST /api/ai/memories — cria memória HUMANA já aprovada
 *      ({content, kind, store_id}).
 *
 * Memória proposta pela IA nasce pending (tool convertia_lembrar);
 * aprovar/rejeitar é o PATCH de /[id]. Só o que está approved entra no
 * prompt. Qualquer membro da org revisa (a memória é conhecimento da
 * casa, não do usuário).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { MEMORY_KINDS } from "@/lib/ai/convertia/memories"

export const dynamic = "force-dynamic"

const MISSING = new Set(["42P01", "PGRST205"])

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const status = request.nextUrl.searchParams.get("status")
    const storeId = request.nextUrl.searchParams.get("store_id")

    let q = admin
      .from("ai_memories")
      .select("id, store_id, content, kind, status, source, source_conversation_id, created_by, reviewed_by, reviewed_at, created_at, client_stores(store_name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(300)
    if (status && ["pending", "approved", "rejected"].includes(status)) q = q.eq("status", status)
    if (storeId) q = q.or(`store_id.is.null,store_id.eq.${storeId}`)
    const { data, error } = await q
    if (error) {
      if (MISSING.has(error.code ?? "")) return successResponse(request, { memories: [], schema_missing: true })
      throw error
    }
    const memories = (data ?? []).map((m) => {
      const { client_stores, ...rest } = m as typeof m & { client_stores?: { store_name?: string } | null }
      return { ...rest, store_name: client_stores?.store_name ?? null }
    })
    return successResponse(request, { memories, schema_missing: false })
  } catch (error) {
    return errorResponse(request, error, "ai-memories-list")
  }
}

const createSchema = z.object({
  content: z.string().min(3).max(600),
  kind: z.enum(MEMORY_KINDS).default("fato"),
  store_id: z.string().uuid().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = createSchema.parse(await request.json())
    if (body.store_id) {
      const { data: store } = await admin.from("client_stores").select("id").eq("id", body.store_id).eq("org_id", orgId).maybeSingle()
      if (!store) throw new AppError("Loja não encontrada nesta organização", 404, "not-found")
    }
    const { data, error } = await admin
      .from("ai_memories")
      .insert({
        org_id: orgId,
        store_id: body.store_id ?? null,
        content: body.content.replace(/\s+/g, " ").trim(),
        kind: body.kind,
        status: "approved",
        source: "human",
        created_by: user.id,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .select("id, store_id, content, kind, status, source, created_at")
      .single()
    if (error) {
      if (MISSING.has(error.code ?? "")) throw new AppError("Memórias indisponíveis — aplique a migration 20261114.", 503, "schema-missing")
      throw error
    }
    return successResponse(request, { memory: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ai-memories-create")
  }
}
