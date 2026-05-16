/**
 * GET  /api/admin/stores/[id]/events  — proximos eventos da loja
 * POST /api/admin/stores/[id]/events  — agenda novo evento (feedback, auditoria, etc)
 *
 * Tabela cs_events.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  kind: z.enum(["feedback_30d", "feedback_weekly", "auditoria", "kickoff", "outro"]),
  title: z.string().trim().min(1).max(240),
  scheduled_at: z.string(),
  attendees: z.array(z.string()).optional(),
  notes: z.string().optional(),
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
    const upcoming = sp.get("upcoming") === "true"

    let q = admin
      .from("cs_events")
      .select("id, kind, title, scheduled_at, attendees, notes, status")
      .eq("store_id", storeId)
      .order("scheduled_at", { ascending: upcoming })
      .limit(20)
    if (upcoming) {
      q = q.gte("scheduled_at", new Date().toISOString()).eq("status", "scheduled")
    }
    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { events: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-events-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
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
      .from("cs_events")
      .insert({
        store_id: storeId,
        kind: body.kind,
        title: body.title.trim(),
        scheduled_at: body.scheduled_at,
        attendees: body.attendees ?? [],
        notes: body.notes?.trim() || null,
      })
      .select("id")
      .single()
    if (error) throw error
    return successResponse(request, { id: data.id })
  } catch (error) {
    return errorResponse(request, error, "store-events-create")
  }
}
