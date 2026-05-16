/**
 * GET  /api/admin/stores/[id]/activity?kind=...&limit=...
 * POST /api/admin/stores/[id]/activity      — registra entrada manual
 *
 * Tabela `store_activity` (criada na migration store_detail_redesign_2026):
 *  - kind: feedback | teste | otim | entrega | integracao | call | outro
 *  - metadata: jsonb (ex: { winner: 'B', metric: 'open_rate', delta: 0.18 })
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  kind: z.enum(["feedback", "teste", "otim", "entrega", "integracao", "call", "outro"]),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurred_at: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const kind = sp.get("kind")
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200)

    let q = admin
      .from("store_activity")
      .select(
        "id, kind, title, summary, tags, author_user_id, metadata, occurred_at, " +
          "author:profiles!store_activity_author_user_id_fkey(name, avatar_url)",
      )
      .eq("store_id", storeId)
      .order("occurred_at", { ascending: false })
      .limit(limit)
    if (kind && kind !== "tudo") q = q.eq("kind", kind)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { items: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-activity-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    const { data, error } = await admin
      .from("store_activity")
      .insert({
        store_id: storeId,
        kind: body.kind,
        title: body.title.trim(),
        summary: body.summary?.trim() || null,
        tags: body.tags ?? [],
        author_user_id: user.id,
        metadata: body.metadata ?? {},
        occurred_at: body.occurred_at || new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error) throw error
    return successResponse(request, { id: data.id })
  } catch (error) {
    return errorResponse(request, error, "store-activity-create")
  }
}
